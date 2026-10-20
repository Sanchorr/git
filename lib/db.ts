// 공용 DB 읽기 함수. 서비스 롤·사용자 세션 클라이언트 모두에서 쓴다.
import type { SupabaseClient } from "@supabase/supabase-js";
import { settingsFromRows, type AppSettings } from "@/lib/model/priors";
import type { CalendarDay } from "@/lib/holidays/flags";
import type { Contribution, MenuType, WeatherCat } from "@/lib/model/types";

export interface MenuRow {
  date: string;
  main_dish: string;
  sides: string[];
  menu_type: MenuType;
  is_theme_day: boolean;
  theme_label: string | null;
  photo_path: string | null;
}

export interface MealCountRow {
  date: string;
  regular_count: number;
  takeout_count: number | null;
  prepared_count: number | null;
  result: "부족" | "적정" | "남음" | null;
  note: string | null;
  entered_at: string;
}

export interface ForecastRow {
  target_date: string;
  source: "short" | "mid";
  issued_at: string;
  category: WeatherCat;
  pop: number | null;
  rain_mm: number | null;
  snow_cm: number | null;
  tmin: number | null;
  tmax: number | null;
}

export interface ObservedRowDb {
  date: string;
  rain_mm: number | null;
  snow_cm: number | null;
  avg_temp: number | null;
  category: WeatherCat;
}

export interface PredictionRow {
  target_date: string;
  run_date: string;
  run_at: string;
  lead_days: number;
  expected: number;
  recommended: number;
  low: number;
  high: number;
  weather_basis: "short" | "mid" | "none";
  contributions: Contribution[];
  model_run_id: number | null;
}

export type { CalendarDay };

type Query = { range: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }> };

/** 1000행 제한을 넘어 모두 읽기 */
export async function selectAll<T>(build: () => Query): Promise<T[]> {
  const out: T[] = [];
  const size = 1000;
  for (let page = 0; ; page++) {
    const { data, error } = await build().range(page * size, page * size + size - 1);
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < size) break;
  }
  return out;
}

export async function loadSettings(db: SupabaseClient): Promise<AppSettings> {
  const { data, error } = await db.from("settings").select("key, value");
  if (error) throw new Error(error.message);
  return settingsFromRows(data ?? []);
}

export function check<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data;
}

/** 대상 날짜마다 가장 최근 예측 */
export function latestByTarget(rows: PredictionRow[]): Map<string, PredictionRow> {
  const m = new Map<string, PredictionRow>();
  for (const r of rows) {
    const cur = m.get(r.target_date);
    if (!cur || r.run_date > cur.run_date) m.set(r.target_date, r);
  }
  return m;
}

/** 대상 날짜마다 "2일 전 예측": lead_days=2, 없으면 2 이상 중 가장 작은 것 (5.7) */
export function twoDayAhead(rows: PredictionRow[]): Map<string, PredictionRow> {
  const m = new Map<string, PredictionRow>();
  for (const r of rows) {
    if (r.lead_days < 2) continue;
    const cur = m.get(r.target_date);
    if (!cur || r.lead_days < cur.lead_days || (r.lead_days === cur.lead_days && r.run_date > cur.run_date))
      m.set(r.target_date, r);
  }
  return m;
}

/** 대상 날짜·출처별 가장 최근 예보 */
export function latestForecasts(rows: ForecastRow[]): Map<string, { short?: ForecastRow; mid?: ForecastRow }> {
  const m = new Map<string, { short?: ForecastRow; mid?: ForecastRow }>();
  for (const r of rows) {
    const e = m.get(r.target_date) ?? {};
    const cur = e[r.source];
    if (!cur || r.issued_at > cur.issued_at) e[r.source] = r;
    m.set(r.target_date, e);
  }
  return m;
}
