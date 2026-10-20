import { describe, expect, it } from "vitest";
import { fitModel } from "@/lib/model/fit";
import { predict, rainRatio } from "@/lib/model/predict";
import { DEFAULT_PRIORS, DEFAULT_SHRINKAGE } from "@/lib/model/priors";
import { dayOfWeek } from "@/lib/dates";
import { totalMeals } from "@/lib/meals";
import { NO_FLAGS, SEPTEMBER, TAKEOUT } from "./fixtures/september";

const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;

describe("시드 데이터 기대값 (8장)", () => {
  it("학습 일수·평균·요일 원평균·보장인원 미달일", () => {
    const m = fitModel(SEPTEMBER, DEFAULT_PRIORS, DEFAULT_SHRINKAGE);
    expect(m.nDays).toBe(20);
    expect(m.overall).toBeCloseTo(115.5, 5);
    const fri = SEPTEMBER.filter((d) => dayOfWeek(d.date) === 5).map((d) => d.y);
    const mon = SEPTEMBER.filter((d) => dayOfWeek(d.date) === 1).map((d) => d.y);
    expect(fri).toEqual([96, 75, 96]);
    expect(mean(fri)).toBeCloseTo(89.0, 1);
    expect(mean(mon)).toBeCloseTo(127.8, 1);
    // 보장인원은 정산 총식수(일반식+간편식) 기준
    expect(SEPTEMBER.filter((d) => totalMeals(d.y, TAKEOUT[d.date]) < 105).map((d) => d.date)).toEqual([
      "2026-09-04",
      "2026-09-09",
      "2026-09-11",
      "2026-09-16",
      "2026-09-18",
    ]);
  });

  it("요일 효과가 학습된다 (금요일 감소, 월요일 증가)", () => {
    const m = fitModel(SEPTEMBER, DEFAULT_PRIORS);
    expect(m.effects.dow["5"].eff).toBeLessThan(-15);
    expect(m.effects.dow["1"].eff).toBeGreaterThan(5);
    expect(m.effects.dow["5"].n).toBe(3);
    expect(m.sigma).toBeGreaterThanOrEqual(6);
  });
});

describe("예측 엔진 (5장)", () => {
  it("데이터 0일이면 μ=115, σ=15", () => {
    const m = fitModel([], DEFAULT_PRIORS);
    expect(m.overall).toBe(115);
    expect(m.sigma).toBe(15);
    expect(m.effects.menu["생선"].eff).toBe(-12);
    const p = predict(m, {
      date: "2026-11-04",
      menuType: "고기",
      isTheme: false,
      flags: NO_FLAGS,
      weather: { basis: "short", category: "맑음", pop: 0 },
    });
    expect(p.expected).toBe(115);
    // 115 + max(1.28*15, 6) = 134.2 → 135
    expect(p.recommended).toBe(135);
    expect(p.low).toBe(96);
    expect(p.high).toBe(134);
  });

  it("같은 입력이면 같은 결과 (순서 무관)", () => {
    const a = fitModel(SEPTEMBER, DEFAULT_PRIORS);
    const b = fitModel([...SEPTEMBER].reverse(), DEFAULT_PRIORS);
    expect(b).toEqual(a);
  });

  it("비 70%일 때 날씨 기여 = 비 효과 × 0.7", () => {
    const m = fitModel(SEPTEMBER, DEFAULT_PRIORS);
    const p = predict(m, {
      date: "2026-10-21",
      menuType: "고기",
      isTheme: false,
      flags: NO_FLAGS,
      weather: { basis: "short", category: "비", pop: 70 },
    });
    const w = p.contributions.find((c) => c.key === "weather")!;
    expect(w.value).toBeCloseTo(m.effects.weather["비"].eff * 0.7, 10);
    expect(m.effects.weather["비"].eff).toBe(15); // 관측 없음 → 기본값 그대로
  });

  it("요인별 기여 합계 = 예상 인원", () => {
    const m = fitModel(SEPTEMBER, DEFAULT_PRIORS);
    const p = predict(m, {
      date: "2026-10-23",
      menuType: "생선",
      isTheme: true,
      flags: { ...NO_FLAGS, bridge_day: true, holiday_adjacent: true },
      weather: { basis: "mid", category: "흐림", pop: 30 },
    });
    const sum = p.contributions.reduce((s, c) => s + c.value, 0);
    expect(sum).toBeCloseTo(p.expected, 10);
    // 징검다리이면서 연휴 앞뒤면 징검다리만
    expect(p.contributions.some((c) => c.key === "flag:holiday_adjacent")).toBe(false);
    expect(p.contributions.some((c) => c.key === "flag:bridge_day")).toBe(true);
  });

  it("날씨 미반영이면 비 효과×p 와 불확실성 v_w 를 더한다", () => {
    const m = fitModel([], DEFAULT_PRIORS);
    const p = predict(m, {
      date: "2026-12-02",
      menuType: "고기",
      isTheme: false,
      flags: NO_FLAGS,
      weather: { basis: "none", rainRatio: 0.25 },
    });
    expect(p.contributions.find((c) => c.key === "weather")!.value).toBeCloseTo(3.75, 10);
    expect(p.sigmaEff).toBeCloseTo(Math.sqrt(15 ** 2 + 15 ** 2 * 0.25 * 0.75), 10);
  });

  it("관측 15일 미만이면 비 비율 0.25", () => {
    expect(rainRatio([{ category: "비" }])).toBe(0.25);
    const obs = Array.from({ length: 20 }, (_, i) => ({ category: i < 5 ? "비" : "맑음" }));
    expect(rainRatio(obs)).toBe(0.25);
    const obs2 = Array.from({ length: 20 }, (_, i) => ({ category: i < 8 ? "눈" : "맑음" }));
    expect(rainRatio(obs2)).toBe(0.4);
  });

  it("예상이 음수면 0", () => {
    const m = fitModel([], { ...DEFAULT_PRIORS, menu: { 생선: -500 } });
    const p = predict(m, {
      date: "2026-11-04",
      menuType: "생선",
      isTheme: false,
      flags: NO_FLAGS,
      weather: { basis: "short", category: "맑음" },
    });
    expect(p.expected).toBe(0);
    expect(p.low).toBe(0);
  });
});
