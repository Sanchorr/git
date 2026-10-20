import type { Margin, Priors, Shrinkage } from "./types";

export const DEFAULT_PRIORS: Priors = {
  menu: { 생선: -12, "국·찌개·탕": -6 },
  theme: 0,
  weather: { 맑음: 0, 흐림: 3, 비: 15, 눈: 20 },
  flags: { holiday_adjacent: 0, bridge_day: -15, year_end: -12, summer_vacation: -10 },
};

export const DEFAULT_SHRINKAGE: Shrinkage = { dow: 1, other: 3 };
export const DEFAULT_MARGIN: Margin = { z: 1.28, min: 6 };
export const DEFAULT_GUARANTEE = 105;
export const DEFAULT_MU = 115;
export const DEFAULT_SIGMA = 15;
export const MIN_SIGMA = 6;
export const BACKFIT_ITERATIONS = 8;
/** 관측이 15일 미만일 때 쓰는 비·눈 비율 */
export const DEFAULT_RAIN_RATIO = 0.25;

export interface AppSettings {
  guarantee_min: number;
  margin: Margin;
  priors: Priors;
  shrinkage: Shrinkage;
  summer_vacation: { start: string; end: string };
  year_end: { start: string };
  site: { lat: number; lon: number; asosStn: number; midRegId: string };
}

export const DEFAULT_SETTINGS: AppSettings = {
  guarantee_min: DEFAULT_GUARANTEE,
  margin: DEFAULT_MARGIN,
  priors: DEFAULT_PRIORS,
  shrinkage: DEFAULT_SHRINKAGE,
  summer_vacation: { start: "07-25", end: "08-14" },
  year_end: { start: "12-22" },
  site: { lat: 35.17, lon: 129.18, asosStn: 159, midRegId: "11H20000" },
};

/** settings 테이블 행 → 설정 객체 (없는 키는 기본값) */
export function settingsFromRows(rows: { key: string; value: unknown }[]): AppSettings {
  const s: AppSettings = structuredClone(DEFAULT_SETTINGS);
  for (const { key, value } of rows) {
    if (key === "priors" && value && typeof value === "object") {
      const p = value as Partial<Priors>;
      s.priors = {
        menu: { ...p.menu },
        theme: p.theme ?? 0,
        weather: { ...DEFAULT_PRIORS.weather, ...p.weather },
        flags: { ...DEFAULT_PRIORS.flags, ...p.flags },
      };
    } else if (key in s) {
      (s as unknown as Record<string, unknown>)[key] = value;
    }
  }
  s.guarantee_min = Number(s.guarantee_min);
  return s;
}
