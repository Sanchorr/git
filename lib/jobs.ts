// 예약 작업 본체 (정의서 7장). 라우트와 백필 스크립트는 이 함수를 호출만 한다.
import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays, addMonths, monthBounds, todayKST, type ISODate } from "@/lib/dates";
import { computeCalendar, inputFromRows } from "@/lib/holidays/flags";
import { fetchHolidays } from "@/lib/holidays/specialDays";
import { fetchAsosDaily } from "@/lib/kma/asos";
import { latLonToGrid } from "@/lib/kma/grid";
import { fetchMidTerm } from "@/lib/kma/midTerm";
import { fetchShortTerm } from "@/lib/kma/shortTerm";
import { check, loadSettings, selectAll, type CalendarDay } from "@/lib/db";
import { recomputeFromToday } from "@/lib/recompute";

export interface JobResult {
  job: string;
  count: number;
  errors: string[];
  detail?: unknown;
}

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** 저장된 달력과 새 공휴일로 범위의 플래그를 다시 계산해 upsert */
async function writeCalendar(
  db: SupabaseClient,
  from: ISODate,
  to: ISODate,
  freshHolidays?: { months: Set<string>; holidays: Map<ISODate, string> },
): Promise<number> {
  const settings = await loadSettings(db);
  const existing = await selectAll<CalendarDay>(() =>
    db.from("calendar_days").select("*").gte("date", addDays(from, -31)).lte("date", addDays(to, 31)),
  );
  const input = inputFromRows(existing);
  if (freshHolidays) {
    // 새로 받은 달은 API 값으로 교체
    for (const d of [...input.holidays.keys()]) if (freshHolidays.months.has(d.slice(0, 7))) input.holidays.delete(d);
    freshHolidays.holidays.forEach((name, d) => input.holidays.set(d, name));
  }
  const rows = computeCalendar(from, to, input, {
    summerVacation: settings.summer_vacation,
    yearEndStart: settings.year_end.start,
  });
  check(await db.from("calendar_days").upsert(rows, { onConflict: "date" }));
  return rows.length;
}

/** 특일정보를 받아 달력 재계산 (이번 달 ~ 3개월 뒤, 또는 지정한 달들) */
export async function runCalendar(db: SupabaseClient, now: Date = new Date(), months?: string[]): Promise<JobResult> {
  const thisMonth = todayKST(now).slice(0, 7);
  const list = months ?? [0, 1, 2, 3].map((n) => addMonths(thisMonth, n));
  const errors: string[] = [];
  const fetched = new Map<ISODate, string>();
  const okMonths = new Set<string>();
  for (const m of list) {
    try {
      const [y, mo] = m.split("-").map(Number);
      (await fetchHolidays(y, mo)).forEach((name, d) => fetched.set(d, name));
      okMonths.add(m);
    } catch (e) {
      errors.push(`${m} 특일정보: ${msg(e)}`); // 실패한 달은 기존 데이터를 유지
    }
  }
  const from = monthBounds(list[0]).from;
  const to = monthBounds(list[list.length - 1]).to;
  const count = await writeCalendar(db, from, to, { months: okMonths, holidays: fetched });
  return { job: "calendar", count, errors };
}

/** 사내 휴무·설정 변경 후 저장된 공휴일로 플래그만 다시 계산 */
export async function recalcCalendarFlags(db: SupabaseClient, from: ISODate, to: ISODate): Promise<number> {
  // 공휴일 정보가 없는 날짜에 행을 새로 만들지 않도록 저장된 범위로 좁힌다
  const first = await db.from("calendar_days").select("date").order("date").limit(1);
  const last = await db.from("calendar_days").select("date").order("date", { ascending: false }).limit(1);
  const min = first.data?.[0]?.date as ISODate | undefined;
  const max = last.data?.[0]?.date as ISODate | undefined;
  if (!min || !max) return 0;
  const f = from < min ? min : from;
  const t = to > max ? max : to;
  return f <= t ? writeCalendar(db, f, t) : 0;
}

export async function runWeatherShort(db: SupabaseClient, now: Date = new Date()): Promise<JobResult> {
  const { site } = await loadSettings(db);
  const { nx, ny } = latLonToGrid(site.lat, site.lon);
  const { issuedAt, base, summaries } = await fetchShortTerm(nx, ny, now);
  const rows = summaries.map((s) => ({ ...s, source: "short", issued_at: issuedAt, raw: { base, nx, ny } }));
  if (rows.length) check(await db.from("weather_forecasts").upsert(rows, { onConflict: "target_date,source,issued_at" }));
  return { job: "weather-short", count: rows.length, errors: [], detail: { base, nx, ny } };
}

export async function runWeatherMid(db: SupabaseClient, now: Date = new Date()): Promise<JobResult> {
  const { site } = await loadSettings(db);
  const { issuedAt, tmFc, summaries } = await fetchMidTerm(site.midRegId, now);
  const rows = summaries.map((s) => ({
    target_date: s.target_date,
    source: "mid",
    issued_at: issuedAt,
    category: s.category,
    pop: s.pop,
    raw: { tmFc, wf: s.wf },
  }));
  if (rows.length) check(await db.from("weather_forecasts").upsert(rows, { onConflict: "target_date,source,issued_at" }));
  return { job: "weather-mid", count: rows.length, errors: [], detail: { tmFc } };
}

/** 관측 날씨 (기본: 최근 7일, 어제까지) */
export async function runWeatherObserved(
  db: SupabaseClient,
  now: Date = new Date(),
  range?: { from: ISODate; to: ISODate },
): Promise<JobResult> {
  const { site } = await loadSettings(db);
  const yesterday = addDays(todayKST(now), -1);
  const from = range?.from ?? addDays(yesterday, -6);
  const to = range?.to ?? yesterday;
  const rows = await fetchAsosDaily(site.asosStn, from, to);
  if (rows.length) check(await db.from("weather_observed").upsert(rows, { onConflict: "date" }));
  return { job: "weather-observed", count: rows.length, errors: [], detail: { from, to } };
}

export async function runPredict(db: SupabaseClient, now: Date = new Date()): Promise<JobResult> {
  const r = await recomputeFromToday(db, now);
  return { job: "predict", count: r.predicted, errors: [], detail: r };
}

/** 크론 횟수가 부족한 요금제용: 달력 → 단기 → 중기 → 관측 → 예측 */
export async function runDaily(db: SupabaseClient, now: Date = new Date()): Promise<JobResult[]> {
  const steps = [runCalendar, runWeatherShort, runWeatherMid, runWeatherObserved, runPredict];
  const out: JobResult[] = [];
  for (const step of steps) {
    try {
      out.push(await step(db, now));
    } catch (e) {
      out.push({ job: step.name, count: 0, errors: [msg(e)] });
    }
  }
  return out;
}
