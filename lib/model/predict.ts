// 예상 인원과 권장 준비량 (정의서 5.1, 5.4, 5.5)
import { DOW_NAMES, dayOfWeek } from "@/lib/dates";
import { DEFAULT_MARGIN, DEFAULT_RAIN_RATIO } from "./priors";
import { effectiveFlags } from "./fit";
import {
  FLAG_KEYS,
  FLAG_LABELS,
  type Contribution,
  type Effect,
  type FittedModel,
  type Margin,
  type Prediction,
  type PredictInput,
} from "./types";

const source = (e: Effect): Contribution["source"] => (e.n >= 3 ? "data" : "prior");

/** 그 달 과거 비·눈 비율 (관측 15일 미만이면 0.25) */
export function rainRatio(observed: { category: string }[]): number {
  if (observed.length < 15) return DEFAULT_RAIN_RATIO;
  return observed.filter((o) => o.category === "비" || o.category === "눈").length / observed.length;
}

export function predict(model: FittedModel, input: PredictInput, margin: Margin = DEFAULT_MARGIN): Prediction {
  const { effects } = model;
  const contributions: Contribution[] = [
    { key: "base", label: "평균", value: model.overall, source: "base", n: model.nDays },
  ];

  const dow = dayOfWeek(input.date);
  const d = effects.dow[String(dow)];
  if (d) contributions.push({ key: "dow", label: `${DOW_NAMES[dow]}요일`, value: d.eff, source: source(d), n: d.n });

  const m = effects.menu[input.menuType];
  contributions.push({ key: "menu", label: `메뉴: ${input.menuType}`, value: m.eff, source: source(m), n: m.n });

  if (input.isTheme) {
    const t = effects.theme;
    contributions.push({ key: "theme", label: "테마DAY", value: t.eff, source: source(t), n: t.n });
  }

  const flags = effectiveFlags(input.flags);
  for (const k of FLAG_KEYS) {
    if (!flags[k]) continue;
    const f = effects.flags[k];
    contributions.push({ key: `flag:${k}`, label: FLAG_LABELS[k], value: f.eff, source: source(f), n: f.n });
  }

  // 날씨
  let vw = 0;
  const w = input.weather;
  if (w.basis === "none") {
    const p = w.rainRatio ?? DEFAULT_RAIN_RATIO;
    const r = effects.weather["비"];
    vw = r.eff ** 2 * p * (1 - p);
    contributions.push({
      key: "weather",
      label: `날씨: 미반영 (비 확률 ${Math.round(p * 100)}%)`,
      value: r.eff * p,
      source: source(r),
      n: r.n,
    });
  } else if (w.category && w.category !== "맑음") {
    const e = effects.weather[w.category];
    const basisLabel = w.basis === "short" ? "단기예보" : "중기예보";
    const value = w.category === "흐림" ? e.eff : (e.eff * (w.pop ?? 100)) / 100;
    const popText = w.category === "흐림" ? "" : ` ${w.pop ?? 100}%`;
    contributions.push({
      key: "weather",
      label: `날씨: ${w.category}${popText} (${basisLabel})`,
      value,
      source: source(e),
      n: e.n,
    });
  }

  const raw = contributions.reduce((s, c) => s + c.value, 0);
  const expected = Math.max(0, raw);
  const sigmaEff = Math.sqrt(model.sigma ** 2 + vw);
  const half = Math.max(margin.z * sigmaEff, margin.min);

  return {
    expected,
    recommended: Math.ceil(expected + half),
    low: Math.max(0, Math.round(expected - half)),
    high: Math.round(expected + half),
    sigmaEff,
    weatherBasis: w.basis,
    contributions,
  };
}
