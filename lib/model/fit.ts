// 덧셈 모델 학습 (정의서 5.3): 평균 + 요인별 가감, 기본값 쪽으로 축소 추정한 백피팅.
import { dayOfWeek } from "@/lib/dates";
import {
  BACKFIT_ITERATIONS,
  DEFAULT_MU,
  DEFAULT_SIGMA,
  DEFAULT_SHRINKAGE,
  MIN_SIGMA,
} from "./priors";
import {
  FLAG_KEYS,
  MENU_TYPES,
  type Effect,
  type FittedModel,
  type FlagKey,
  type Flags,
  type ModelEffects,
  type Priors,
  type Shrinkage,
  type TrainingDay,
} from "./types";

/** 징검다리이면서 연휴 앞뒤인 날은 징검다리만 적용한다 (5.6) */
export function effectiveFlags(flags: Flags): Flags {
  return flags.bridge_day ? { ...flags, holiday_adjacent: false } : flags;
}

interface Factor {
  name: string;
  levelOf: (d: TrainingDay) => string | null;
  prior: (level: string) => number;
  k: number;
  levels: string[];
}

function buildFactors(priors: Priors, shrink: Shrinkage): Factor[] {
  const factors: Factor[] = [
    {
      name: "dow",
      levelOf: (d) => String(dayOfWeek(d.date)),
      prior: () => 0,
      k: shrink.dow,
      levels: ["1", "2", "3", "4", "5"],
    },
    {
      name: "menu",
      levelOf: (d) => d.menuType,
      prior: (l) => priors.menu[l as keyof Priors["menu"]] ?? 0,
      k: shrink.other,
      levels: [...MENU_TYPES],
    },
    {
      name: "theme",
      levelOf: (d) => (d.isTheme ? "on" : null),
      prior: () => priors.theme,
      k: shrink.other,
      levels: ["on"],
    },
  ];
  for (const key of FLAG_KEYS) {
    factors.push({
      name: `flag:${key}`,
      levelOf: (d) => (effectiveFlags(d.flags)[key] ? "on" : null),
      prior: () => priors.flags[key],
      k: shrink.other,
      levels: ["on"],
    });
  }
  factors.push({
    name: "weather",
    // 맑음은 0으로 고정, 관측이 없으면 날씨 항을 뺀다
    levelOf: (d) => (d.weather && d.weather !== "맑음" ? d.weather : null),
    prior: (l) => priors.weather[l as "흐림" | "비" | "눈"],
    k: shrink.other,
    levels: ["흐림", "비", "눈"],
  });
  return factors;
}

export function fitModel(
  days: TrainingDay[],
  priors: Priors,
  shrink: Shrinkage = DEFAULT_SHRINKAGE,
): FittedModel {
  // 입력 순서와 무관하게 같은 결과가 나오도록 날짜순으로 정렬
  const data = [...days].sort((a, b) => a.date.localeCompare(b.date));
  const n = data.length;
  const mu = n === 0 ? DEFAULT_MU : data.reduce((s, d) => s + d.y, 0) / n;

  const factors = buildFactors(priors, shrink);
  const eff: Record<string, Record<string, number>> = {};
  const counts: Record<string, Record<string, number>> = {};
  for (const f of factors) {
    eff[f.name] = {};
    counts[f.name] = {};
    for (const l of f.levels) {
      eff[f.name][l] = f.prior(l);
      counts[f.name][l] = 0;
    }
  }
  // 날짜별 수준 미리 계산
  const levels = data.map((d) => factors.map((f) => f.levelOf(d)));
  for (const row of levels)
    row.forEach((l, fi) => {
      if (l !== null) counts[factors[fi].name][l] += 1;
    });

  const fitted = (i: number, skip: number) => {
    let v = mu;
    levels[i].forEach((l, fi) => {
      if (fi !== skip && l !== null) v += eff[factors[fi].name][l];
    });
    return v;
  };

  for (let iter = 0; iter < BACKFIT_ITERATIONS; iter++) {
    factors.forEach((f, fi) => {
      const sums: Record<string, number> = {};
      for (let i = 0; i < n; i++) {
        const l = levels[i][fi];
        if (l === null) continue;
        sums[l] = (sums[l] ?? 0) + (data[i].y - fitted(i, fi));
      }
      for (const l of f.levels) {
        eff[f.name][l] = ((sums[l] ?? 0) + f.k * f.prior(l)) / (counts[f.name][l] + f.k);
      }
    });
  }

  let sigma = DEFAULT_SIGMA;
  if (n >= 8) {
    let ss = 0;
    for (let i = 0; i < n; i++) ss += (data[i].y - fitted(i, -1)) ** 2;
    sigma = Math.max(Math.sqrt(ss / Math.max(n - 6, 1)), MIN_SIGMA);
  }

  const pack = (name: string, l: string): Effect => ({ eff: eff[name][l], n: counts[name][l] });
  const effects: ModelEffects = {
    dow: Object.fromEntries(["1", "2", "3", "4", "5"].map((l) => [l, pack("dow", l)])),
    menu: Object.fromEntries(MENU_TYPES.map((l) => [l, pack("menu", l)])) as ModelEffects["menu"],
    theme: pack("theme", "on"),
    flags: Object.fromEntries(FLAG_KEYS.map((k) => [k, pack(`flag:${k}`, "on")])) as Record<FlagKey, Effect>,
    weather: { 흐림: pack("weather", "흐림"), 비: pack("weather", "비"), 눈: pack("weather", "눈") },
  };

  return { version: "additive-v1", nDays: n, overall: mu, sigma, effects };
}
