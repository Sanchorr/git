import { describe, expect, it } from "vitest";
import { isWeekend } from "@/lib/dates";
import type { CalendarDay, MealCountRow, MenuRow, PredictionRow } from "@/lib/db";
import { twoDayAhead } from "@/lib/db";
import { fitModel } from "@/lib/model/fit";
import { predict } from "@/lib/model/predict";
import { DEFAULT_PRIORS } from "@/lib/model/priors";
import { leadDays } from "@/lib/recompute";
import { buildAlerts, buildWeekRows, nthWorkdayAfter, weekButtonLabel, weekStarts } from "@/lib/views/weekly";
import { NO_FLAGS, SEPTEMBER } from "./fixtures/september";

const workday = (d: string) => !isWeekend(d) && d !== "2026-10-09";

const pred = (target: string, expected: number, recommended: number, run = "2026-10-20", lead = 2): PredictionRow => ({
  target_date: target,
  run_date: run,
  run_at: "",
  lead_days: lead,
  expected,
  recommended,
  low: 0,
  high: 0,
  weather_basis: "short",
  contributions: [],
  model_run_id: 1,
});

describe("lead_days와 D+2", () => {
  it("근무일 기준으로 센다", () => {
    expect(leadDays("2026-10-20", "2026-10-22", workday)).toBe(2);
    expect(leadDays("2026-10-22", "2026-10-26", workday)).toBe(2); // 금 건너 주말
    expect(leadDays("2026-10-07", "2026-10-12", workday)).toBe(2); // 10/9 한글날
    expect(leadDays("2026-10-20", "2026-10-20", workday)).toBe(0);
    expect(leadDays("2026-10-22", "2026-10-20", workday)).toBe(-2);
    expect(nthWorkdayAfter("2026-10-22", 2, workday)).toBe("2026-10-26");
  });

  it("2일 전 예측: lead=2, 없으면 2 이상 중 가장 작은 것", () => {
    const m = twoDayAhead([
      pred("2026-10-22", 100, 110, "2026-10-15", 5),
      pred("2026-10-22", 101, 111, "2026-10-19", 3),
      pred("2026-10-22", 102, 112, "2026-10-21", 1),
      pred("2026-10-23", 90, 100, "2026-10-21", 2),
      pred("2026-10-23", 91, 101, "2026-10-19", 4),
    ]);
    expect(m.get("2026-10-22")!.lead_days).toBe(3);
    expect(m.get("2026-10-23")!.lead_days).toBe(2);
  });
});

describe("주간 예측표 (6.2)", () => {
  it("합계 행 = 각 행의 합", () => {
    const predictions = new Map<string, PredictionRow>([
      ["2026-10-19", pred("2026-10-19", 127.6, 148)],
      ["2026-10-20", pred("2026-10-20", 118.4, 139)],
      ["2026-10-21", pred("2026-10-21", 111.5, 132)],
      ["2026-10-22", pred("2026-10-22", 115.49, 136)],
      ["2026-10-23", pred("2026-10-23", 92.2, 113)],
    ]);
    const counts = new Map<string, MealCountRow>([
      ["2026-10-19", { date: "2026-10-19", regular_count: 131 } as MealCountRow],
      ["2026-10-20", { date: "2026-10-20", regular_count: 110 } as MealCountRow],
    ]);
    const { rows, totals } = buildWeekRows({
      monday: "2026-10-19",
      today: "2026-10-20",
      d2: "2026-10-22",
      calendar: new Map<string, CalendarDay>(),
      menus: new Map<string, MenuRow>(),
      predictions,
      counts,
      forecasts: new Map(),
    });
    expect(rows).toHaveLength(5);
    expect(totals.expected).toBe(rows.reduce((s, r) => s + (r.expected ?? 0), 0));
    expect(totals.recommended).toBe(rows.reduce((s, r) => s + (r.recommended ?? 0), 0));
    expect(totals.actual).toBe(241);
    expect(totals.error).toBe(rows.reduce((s, r) => s + (r.error ?? 0), 0));
    expect(rows[0].error).toBe(131 - 128);
    expect(rows.find((r) => r.isD2)!.date).toBe("2026-10-22");
    expect(rows.find((r) => r.isToday)!.date).toBe("2026-10-20");
  });

  it("D+2 카드의 요인별 기여 합 = 예상 인원 (반올림 ±1)", () => {
    const model = fitModel(SEPTEMBER, DEFAULT_PRIORS);
    const p = predict(model, {
      date: "2026-10-22",
      menuType: "국·찌개·탕",
      isTheme: true,
      flags: NO_FLAGS,
      weather: { basis: "short", category: "비", pop: 70 },
    });
    // 저장할 때처럼 소수 둘째 자리로 반올림해도 ±1 안
    const stored = p.contributions.map((c) => Math.round(c.value * 100) / 100);
    expect(Math.abs(stored.reduce((s, v) => s + v, 0) - Math.round(p.expected))).toBeLessThanOrEqual(1);
  });

  it("주 버튼: 메뉴가 있는 마지막 주까지", () => {
    const weeks = weekStarts("2026-10-21", "2026-11-04");
    expect(weeks).toEqual(["2026-10-19", "2026-10-26", "2026-11-02"]);
    expect(weeks.map((w) => weekButtonLabel(w, "2026-10-19"))).toEqual(["이번 주", "다음 주", "11/2 주"]);
  });

  it("알림", () => {
    const rainy = { ...pred("2026-10-22", 130, 150), contributions: [{ key: "weather", label: "", value: 10.5, source: "prior" as const, n: 0 }] };
    const alerts = buildAlerts({
      today: "2026-10-26",
      isWorkday: workday,
      upcoming: [{ ...rainy, target_date: "2026-10-27" }, pred("2026-10-30", 90, 100)],
      forecasts: new Map([["2026-10-27", { short: { category: "비" } as never }]]),
      guarantee: 105,
      hasNextMonthMenus: false,
      prevWorkdayHasCount: false,
    });
    expect(alerts.map((a) => a.tone)).toEqual(["rain", "warn", "warn", "warn"]);
    expect(alerts[1].text).toContain("10/30(금) 100명");
    expect(alerts[3].text).toContain("10/23(금)");
  });
});
