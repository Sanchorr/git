// 분석 화면 계산 (정의서 6.5, 5.7)
import { dayOfWeek, DOW_NAMES, type ISODate } from "@/lib/dates";
import type { MealCountRow, MenuRow, ObservedRowDb, PredictionRow } from "@/lib/db";
import { totalMeals } from "@/lib/meals";
import { FLAG_KEYS, FLAG_LABELS, MENU_TYPES, type ModelEffects } from "@/lib/model/types";

export interface DailyPoint {
  date: ISODate;
  label: string;
  actual: number;
  predicted: number | null;
  recommended: number | null;
  friday: boolean;
  menu: string | null;
  weather: string | null;
}

export function buildAnalysis(args: {
  counts: MealCountRow[];
  menus: Map<ISODate, MenuRow>;
  observed: Map<ISODate, ObservedRowDb>;
  ahead2: Map<ISODate, PredictionRow>;
  guarantee: number;
}) {
  const counts = [...args.counts].sort((a, b) => a.date.localeCompare(b.date));
  const ys = counts.map((c) => c.regular_count);
  const n = ys.length;

  const points: DailyPoint[] = counts.map((c) => {
    const p = args.ahead2.get(c.date);
    return {
      date: c.date,
      label: `${Number(c.date.slice(5, 7))}/${Number(c.date.slice(8, 10))}`,
      actual: c.regular_count,
      predicted: p ? Math.round(Number(p.expected) * 10) / 10 : null,
      recommended: p ? p.recommended : null,
      friday: dayOfWeek(c.date) === 5,
      menu: args.menus.get(c.date)?.main_dish ?? null,
      weather: args.observed.get(c.date)?.category ?? null,
    };
  });

  const withPred = points.filter((p) => p.predicted !== null);
  const meanAbsErr = withPred.length
    ? withPred.reduce((s, p) => s + Math.abs(p.actual - p.predicted!), 0) / withPred.length
    : null;
  const overRecommended = points.filter((p) => p.recommended !== null && p.actual > p.recommended);

  const byDow = [1, 2, 3, 4, 5].map((d) => {
    const v = counts.filter((c) => dayOfWeek(c.date) === d).map((c) => c.regular_count);
    return { dow: DOW_NAMES[d], avg: v.length ? Math.round((v.reduce((s, x) => s + x, 0) / v.length) * 10) / 10 : 0, n: v.length };
  });

  return {
    n,
    avg: n ? ys.reduce((s, y) => s + y, 0) / n : null,
    max: n ? Math.max(...ys) : null,
    min: n ? Math.min(...ys) : null,
    belowGuarantee: counts.filter((c) => totalMeals(c.regular_count, c.takeout_count) < args.guarantee).map((c) => c.date),
    meanAbsErr,
    errDays: withPred.length,
    overRecommended,
    points,
    byDow,
    missingObserved: counts.filter((c) => !args.observed.has(c.date)).length,
  };
}

export interface EffectRow {
  group: string;
  label: string;
  eff: number;
  n: number;
}

export function effectRows(e: ModelEffects): EffectRow[] {
  const rows: EffectRow[] = [];
  for (const d of ["1", "2", "3", "4", "5"]) rows.push({ group: "요일", label: `${DOW_NAMES[Number(d)]}요일`, ...e.dow[d] });
  for (const m of MENU_TYPES) rows.push({ group: "메뉴", label: m, ...e.menu[m] });
  rows.push({ group: "테마", label: "테마DAY", ...e.theme });
  for (const k of FLAG_KEYS) rows.push({ group: "달력", label: FLAG_LABELS[k], ...e.flags[k] });
  for (const w of ["흐림", "비", "눈"] as const) rows.push({ group: "날씨", label: w, ...e.weather[w] });
  return rows;
}
