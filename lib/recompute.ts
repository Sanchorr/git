// recomputePredictions (정의서 6.7): 학습 1회 → model_runs 저장 → 범위 내 근무일 예측 → predictions upsert
import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays, dateRange, todayKST, type ISODate } from "@/lib/dates";
import { isWorkdayFallback } from "@/lib/holidays/flags";
import { fitModel } from "@/lib/model/fit";
import { predict, rainRatio } from "@/lib/model/predict";
import type { Flags, TrainingDay, WeatherInput } from "@/lib/model/types";
import {
  check,
  latestForecasts,
  loadSettings,
  selectAll,
  type CalendarDay,
  type ForecastRow,
  type MealCountRow,
  type MenuRow,
  type ObservedRowDb,
} from "@/lib/db";

const NO_FLAGS: Flags = { holiday_adjacent: false, bridge_day: false, year_end: false, summer_vacation: false };

const flagsOf = (c: CalendarDay | undefined): Flags =>
  c
    ? {
        holiday_adjacent: c.holiday_adjacent,
        bridge_day: c.bridge_day,
        year_end: c.year_end,
        summer_vacation: c.summer_vacation,
      }
    : NO_FLAGS;

/** 계산한 날부터 대상 날짜까지의 근무일 수 (5.7). 지난 날짜는 음수. */
export function leadDays(runDate: ISODate, target: ISODate, isWorkday: (d: ISODate) => boolean): number {
  if (target === runDate) return 0;
  if (target > runDate) return dateRange(addDays(runDate, 1), target).filter(isWorkday).length;
  return -dateRange(addDays(target, 1), runDate).filter(isWorkday).length;
}

export interface RecomputeResult {
  modelRunId: number;
  nDays: number;
  predicted: number;
  skippedPast: number;
}

export async function recomputePredictions(
  db: SupabaseClient,
  range: { from: ISODate; to: ISODate },
  now: Date = new Date(),
): Promise<RecomputeResult> {
  const runDate = todayKST(now);
  const settings = await loadSettings(db);

  const [counts, menus, calendar, observed] = await Promise.all([
    selectAll<MealCountRow>(() => db.from("meal_counts").select("date, regular_count").order("date")),
    selectAll<MenuRow>(() => db.from("menus").select("date, menu_type, is_theme_day").order("date")),
    selectAll<CalendarDay>(() => db.from("calendar_days").select("*").order("date")),
    selectAll<ObservedRowDb>(() => db.from("weather_observed").select("date, category").order("date")),
  ]);
  const menuBy = new Map(menus.map((m) => [m.date, m]));
  const calBy = new Map(calendar.map((c) => [c.date, c]));
  const obsBy = new Map(observed.map((o) => [o.date, o]));
  const isWorkday = (d: ISODate) => {
    const c = calBy.get(d);
    return c ? c.is_workday : isWorkdayFallback(d);
  };

  // 1. 학습
  const training: TrainingDay[] = counts
    .filter((c) => isWorkday(c.date))
    .map((c) => ({
      date: c.date,
      y: c.regular_count,
      menuType: menuBy.get(c.date)?.menu_type ?? "기타",
      isTheme: menuBy.get(c.date)?.is_theme_day ?? false,
      flags: flagsOf(calBy.get(c.date)),
      weather: obsBy.get(c.date)?.category ?? null,
    }));
  const model = fitModel(training, settings.priors, settings.shrinkage);

  const run = check(
    await db
      .from("model_runs")
      .insert({
        n_days: model.nDays,
        overall: model.overall,
        sigma: model.sigma,
        effects: model.effects,
        version: model.version,
      })
      .select("id")
      .single(),
  ) as { id: number };

  // 2. 대상 날짜: 범위 안 메뉴가 있는 근무일
  const targets = menus.map((m) => m.date).filter((d) => d >= range.from && d <= range.to && isWorkday(d));

  // 지난 날짜는 예측이 아직 없을 때만 만든다 (실적을 본 뒤의 예측으로 덮지 않도록)
  const past = targets.filter((d) => d < runDate);
  const havePast = new Set<string>();
  if (past.length) {
    const rows = await selectAll<{ target_date: string }>(() =>
      db.from("predictions").select("target_date").gte("target_date", past[0]).lte("target_date", past[past.length - 1]),
    );
    rows.forEach((r) => havePast.add(r.target_date));
  }
  const finalTargets = targets.filter((d) => d >= runDate || !havePast.has(d));

  const forecasts = finalTargets.length
    ? await selectAll<ForecastRow>(() =>
        db
          .from("weather_forecasts")
          .select("target_date, source, issued_at, category, pop")
          .gte("target_date", finalTargets[0])
          .lte("target_date", finalTargets[finalTargets.length - 1]),
      )
    : [];
  const fc = latestForecasts(forecasts);

  // 달별 과거 비·눈 비율
  const ratioByMonth = new Map<string, number>();
  const monthRatio = (d: ISODate) => {
    const mm = d.slice(5, 7);
    if (!ratioByMonth.has(mm)) ratioByMonth.set(mm, rainRatio(observed.filter((o) => o.date.slice(5, 7) === mm)));
    return ratioByMonth.get(mm)!;
  };

  const rows = finalTargets.map((date) => {
    const menu = menuBy.get(date)!;
    const f = fc.get(date);
    let weather: WeatherInput;
    if (f?.short) weather = { basis: "short", category: f.short.category, pop: f.short.pop };
    else if (f?.mid) weather = { basis: "mid", category: f.mid.category, pop: f.mid.pop };
    else weather = { basis: "none", rainRatio: monthRatio(date) };

    const p = predict(
      model,
      { date, menuType: menu.menu_type, isTheme: menu.is_theme_day, flags: flagsOf(calBy.get(date)), weather },
      settings.margin,
    );
    return {
      target_date: date,
      run_date: runDate,
      run_at: now.toISOString(),
      lead_days: leadDays(runDate, date, isWorkday),
      expected: Math.round(p.expected * 100) / 100,
      recommended: p.recommended,
      low: p.low,
      high: p.high,
      weather_basis: p.weatherBasis,
      contributions: p.contributions.map((c) => ({ ...c, value: Math.round(c.value * 100) / 100 })),
      model_run_id: run.id,
    };
  });

  for (let i = 0; i < rows.length; i += 500) {
    check(await db.from("predictions").upsert(rows.slice(i, i + 500), { onConflict: "target_date,run_date" }));
  }

  return { modelRunId: run.id, nDays: model.nDays, predicted: rows.length, skippedPast: targets.length - finalTargets.length };
}

/** 오늘부터 메뉴가 있는 마지막 날까지 */
export async function recomputeFromToday(db: SupabaseClient, now: Date = new Date()) {
  const { data } = await db.from("menus").select("date").order("date", { ascending: false }).limit(1);
  const today = todayKST(now);
  const last = data?.[0]?.date ?? today;
  return recomputePredictions(db, { from: today, to: last < today ? today : last }, now);
}
