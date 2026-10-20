// 주간 예측 화면의 표·카드·알림 계산 (정의서 6.2). DB 없이 테스트할 수 있게 순수 함수로 둔다.
import { addDays, dateRange, isWeekend, mondayOf, shortLabel, type ISODate } from "@/lib/dates";
import type { CalendarDay, ForecastRow, MealCountRow, MenuRow, PredictionRow } from "@/lib/db";
import type { WeatherCat } from "@/lib/model/types";

export interface WeekRow {
  date: ISODate;
  label: string;
  isToday: boolean;
  isD2: boolean;
  workday: boolean;
  holidayName: string | null;
  menu: Pick<MenuRow, "main_dish" | "menu_type" | "is_theme_day" | "theme_label"> | null;
  weather: { category: WeatherCat | null; pop: number | null; basis: "short" | "mid" | "none" } | null;
  expected: number | null;
  recommended: number | null;
  low: number | null;
  high: number | null;
  actual: number | null;
  error: number | null;
}

export interface WeekTotals {
  expected: number;
  recommended: number;
  actual: number;
  error: number;
  actualDays: number;
}

export function makeIsWorkday(calendar: Map<ISODate, CalendarDay>) {
  return (d: ISODate) => calendar.get(d)?.is_workday ?? !isWeekend(d);
}

/** 오늘부터 근무일 n일 뒤 */
export function nthWorkdayAfter(today: ISODate, n: number, isWorkday: (d: ISODate) => boolean): ISODate {
  let d = today;
  let k = 0;
  for (let guard = 0; guard < 60 && k < n; guard++) {
    d = addDays(d, 1);
    if (isWorkday(d)) k++;
  }
  return d;
}

/** 오늘 이전 가장 가까운 근무일 */
export function prevWorkday(today: ISODate, isWorkday: (d: ISODate) => boolean): ISODate {
  let d = addDays(today, -1);
  for (let guard = 0; guard < 30 && !isWorkday(d); guard++) d = addDays(d, -1);
  return d;
}

/** 이번 주부터 메뉴가 있는 마지막 날짜가 속한 주까지의 월요일들 */
export function weekStarts(today: ISODate, lastMenuDate: ISODate | null): ISODate[] {
  const first = mondayOf(today);
  const last = lastMenuDate && lastMenuDate > first ? mondayOf(lastMenuDate) : first;
  const out: ISODate[] = [];
  for (let d = first; d <= last; d = addDays(d, 7)) out.push(d);
  return out;
}

export function weekButtonLabel(monday: ISODate, thisMonday: ISODate): string {
  if (monday === thisMonday) return "이번 주";
  if (monday === addDays(thisMonday, 7)) return "다음 주";
  return `${Number(monday.slice(5, 7))}/${Number(monday.slice(8, 10))} 주`;
}

export function buildWeekRows(args: {
  monday: ISODate;
  today: ISODate;
  d2: ISODate;
  calendar: Map<ISODate, CalendarDay>;
  menus: Map<ISODate, MenuRow>;
  predictions: Map<ISODate, PredictionRow>;
  counts: Map<ISODate, MealCountRow>;
  forecasts: Map<ISODate, { short?: ForecastRow; mid?: ForecastRow }>;
}): { rows: WeekRow[]; totals: WeekTotals } {
  const isWorkday = makeIsWorkday(args.calendar);
  const rows: WeekRow[] = dateRange(args.monday, addDays(args.monday, 4)).map((date) => {
    const p = args.predictions.get(date);
    const c = args.counts.get(date);
    const m = args.menus.get(date);
    const f = args.forecasts.get(date);
    const fc = f?.short ?? f?.mid;
    const expected = p ? Math.round(Number(p.expected)) : null;
    const actual = c ? c.regular_count : null;
    return {
      date,
      label: shortLabel(date),
      isToday: date === args.today,
      isD2: date === args.d2,
      workday: isWorkday(date),
      holidayName: args.calendar.get(date)?.holiday_name ?? (args.calendar.get(date)?.company_closed ? "사내 휴무" : null),
      menu: m ? { main_dish: m.main_dish, menu_type: m.menu_type, is_theme_day: m.is_theme_day, theme_label: m.theme_label } : null,
      weather: p
        ? {
            basis: p.weather_basis,
            category: p.weather_basis === "none" ? null : (fc?.category ?? null),
            pop: p.weather_basis === "none" ? null : (fc?.pop ?? null),
          }
        : fc
          ? { basis: f?.short ? "short" : "mid", category: fc.category, pop: fc.pop }
          : null,
      expected,
      recommended: p ? p.recommended : null,
      low: p ? p.low : null,
      high: p ? p.high : null,
      actual,
      error: actual !== null && expected !== null ? actual - expected : null,
    };
  });

  const totals: WeekTotals = { expected: 0, recommended: 0, actual: 0, error: 0, actualDays: 0 };
  for (const r of rows) {
    totals.expected += r.expected ?? 0;
    totals.recommended += r.recommended ?? 0;
    totals.actual += r.actual ?? 0;
    totals.error += r.error ?? 0;
    if (r.actual !== null) totals.actualDays++;
  }
  return { rows, totals };
}

export interface Alert {
  tone: "rain" | "warn";
  text: string;
}

export function buildAlerts(args: {
  today: ISODate;
  isWorkday: (d: ISODate) => boolean;
  upcoming: PredictionRow[]; // 오늘 이후 대상 날짜별 최신 예측
  forecasts: Map<ISODate, { short?: ForecastRow; mid?: ForecastRow }>;
  guarantee: number;
  hasNextMonthMenus: boolean;
  prevWorkdayHasCount: boolean;
}): Alert[] {
  const alerts: Alert[] = [];
  const in3 = addDays(args.today, 3);
  for (const p of args.upcoming) {
    if (p.target_date > in3) continue;
    const w = p.contributions.find((c) => c.key === "weather");
    const f = args.forecasts.get(p.target_date);
    const cat = (f?.short ?? f?.mid)?.category;
    if (w && w.value >= 10 && (cat === "비" || cat === "눈"))
      alerts.push({
        tone: "rain",
        text: `${shortLabel(p.target_date)} ${cat} 예보로 외근 취소 가능성 — 날씨 영향 +${Math.round(w.value)}명, 권장 ${p.recommended}명`,
      });
  }
  const low = args.upcoming.filter((p) => p.recommended < args.guarantee);
  if (low.length)
    alerts.push({
      tone: "warn",
      text: `권장 준비량이 보장인원(${args.guarantee}명) 미만인 날: ${low.map((p) => `${shortLabel(p.target_date)} ${p.recommended}명`).join(", ")}`,
    });
  if (Number(args.today.slice(8, 10)) >= 25 && !args.hasNextMonthMenus)
    alerts.push({ tone: "warn", text: "다음 달 식단이 아직 없어요. 식단표 사진을 올려 주세요." });
  if (!args.prevWorkdayHasCount) {
    const d = prevWorkday(args.today, args.isWorkday);
    alerts.push({ tone: "warn", text: `${shortLabel(d)} 식수 입력이 없어요.` });
  }
  return alerts;
}
