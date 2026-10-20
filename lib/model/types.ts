import type { ISODate } from "@/lib/dates";

export const MENU_TYPES = ["고기", "국·찌개·탕", "면", "생선", "밥·덮밥", "기타"] as const;
export type MenuType = (typeof MENU_TYPES)[number];

export const WEATHER_CATS = ["맑음", "흐림", "비", "눈"] as const;
export type WeatherCat = (typeof WEATHER_CATS)[number];

export const FLAG_KEYS = ["holiday_adjacent", "bridge_day", "year_end", "summer_vacation"] as const;
export type FlagKey = (typeof FLAG_KEYS)[number];

export const FLAG_LABELS: Record<FlagKey, string> = {
  holiday_adjacent: "연휴 바로 앞뒤",
  bridge_day: "징검다리 근무일",
  year_end: "연말 연차 소진 기간",
  summer_vacation: "여름 휴가철",
};

export type Flags = Record<FlagKey, boolean>;

export interface Priors {
  menu: Partial<Record<MenuType, number>>;
  theme: number;
  weather: Record<WeatherCat, number>;
  flags: Record<FlagKey, number>;
}

export interface Shrinkage {
  dow: number;
  other: number;
}

export interface Margin {
  z: number;
  min: number;
}

/** 학습에 쓰는 하루 */
export interface TrainingDay {
  date: ISODate;
  y: number;
  menuType: MenuType;
  isTheme: boolean;
  flags: Flags;
  /** 관측 날씨. 없으면 날씨 항을 빼고 학습 */
  weather: WeatherCat | null;
}

export interface Effect {
  eff: number;
  n: number;
}

export interface ModelEffects {
  dow: Record<string, Effect>; // '1'..'5'
  menu: Record<MenuType, Effect>;
  theme: Effect;
  flags: Record<FlagKey, Effect>;
  weather: Record<Exclude<WeatherCat, "맑음">, Effect>;
}

export interface FittedModel {
  version: "additive-v1";
  nDays: number;
  overall: number;
  sigma: number;
  effects: ModelEffects;
}

export type WeatherBasis = "short" | "mid" | "none";

export interface WeatherInput {
  basis: WeatherBasis;
  category?: WeatherCat;
  pop?: number | null;
  /** basis='none'일 때: 그 달 과거 비·눈 비율 */
  rainRatio?: number;
}

export interface PredictInput {
  date: ISODate;
  menuType: MenuType;
  isTheme: boolean;
  flags: Flags;
  weather: WeatherInput;
}

export interface Contribution {
  key: string;
  label: string;
  value: number;
  /** data: 근거 일수 3일 이상, prior: 기본값 보정, base: 평균 */
  source: "base" | "data" | "prior";
  n: number;
}

export interface Prediction {
  expected: number;
  recommended: number;
  low: number;
  high: number;
  sigmaEff: number;
  weatherBasis: WeatherBasis;
  contributions: Contribution[];
}
