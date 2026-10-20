import { describe, expect, it } from "vitest";
import { computeCalendar, inputFromRows } from "@/lib/holidays/flags";

const opts = { summerVacation: { start: "07-25", end: "08-14" }, yearEndStart: "12-22" };
const byDate = (rows: ReturnType<typeof computeCalendar>) => new Map(rows.map((r) => [r.date, r]));

describe("달력 플래그 (5.6)", () => {
  it("2026 추석 연휴: 9/23, 9/28이 연휴 앞뒤", () => {
    const holidays = new Map([
      ["2026-09-24", "추석"],
      ["2026-09-25", "추석"],
      ["2026-09-26", "추석"],
    ]);
    const cal = byDate(computeCalendar("2026-09-01", "2026-09-30", { holidays, companyClosed: new Map() }, opts));
    expect(cal.get("2026-09-23")!.holiday_adjacent).toBe(true);
    expect(cal.get("2026-09-28")!.holiday_adjacent).toBe(true);
    expect(cal.get("2026-09-24")!.is_workday).toBe(false);
    expect(cal.get("2026-09-24")!.holiday_name).toBe("추석");
    // 평범한 주말 앞뒤는 아니다
    expect(cal.get("2026-09-18")!.holiday_adjacent).toBe(false);
    expect(cal.get("2026-09-21")!.holiday_adjacent).toBe(false);
    expect([...cal.values()].filter((d) => d.is_workday)).toHaveLength(20);
  });

  it("징검다리: 일요일과 화요일 공휴일 사이 월요일", () => {
    const holidays = new Map([["2026-05-05", "어린이날"]]);
    const cal = byDate(computeCalendar("2026-05-01", "2026-05-31", { holidays, companyClosed: new Map() }, opts));
    expect(cal.get("2026-05-04")!.bridge_day).toBe(true);
    expect(cal.get("2026-05-06")!.bridge_day).toBe(false);
  });

  it("징검다리이면서 연휴 앞뒤인 날은 징검다리만", () => {
    // 토·일·월(공휴일) 연휴 → 화 근무 → 수 공휴일
    const holidays = new Map([
      ["2026-06-01", "가상휴일1"],
      ["2026-06-03", "가상휴일2"],
    ]);
    const cal = byDate(computeCalendar("2026-06-01", "2026-06-10", { holidays, companyClosed: new Map() }, opts));
    expect(cal.get("2026-06-02")!.bridge_day).toBe(true);
    expect(cal.get("2026-06-02")!.holiday_adjacent).toBe(false);
  });

  it("사내 휴무일도 비근무일로 본다", () => {
    const closed = new Map<string, string | null>([["2026-10-16", "창립기념일"]]);
    const cal = byDate(computeCalendar("2026-10-12", "2026-10-23", { holidays: new Map(), companyClosed: closed }, opts));
    expect(cal.get("2026-10-16")!.is_workday).toBe(false);
    expect(cal.get("2026-10-16")!.company_closed).toBe(true);
    expect(cal.get("2026-10-16")!.note).toBe("창립기념일");
    // 금·토·일 3일 → 목, 다음 월이 연휴 앞뒤
    expect(cal.get("2026-10-15")!.holiday_adjacent).toBe(true);
    expect(cal.get("2026-10-19")!.holiday_adjacent).toBe(true);
  });

  it("연말·여름 휴가철 플래그는 근무일에만", () => {
    const cal = byDate(
      computeCalendar("2026-12-20", "2026-12-31", { holidays: new Map([["2026-12-25", "성탄절"]]), companyClosed: new Map() }, opts),
    );
    expect(cal.get("2026-12-21")!.year_end).toBe(false);
    expect(cal.get("2026-12-22")!.year_end).toBe(true);
    expect(cal.get("2026-12-25")!.year_end).toBe(false);
    expect(cal.get("2026-12-27")!.year_end).toBe(false); // 일요일
    const summer = byDate(computeCalendar("2026-07-24", "2026-08-17", { holidays: new Map(), companyClosed: new Map() }, opts));
    expect(summer.get("2026-07-24")!.summer_vacation).toBe(false);
    expect(summer.get("2026-07-27")!.summer_vacation).toBe(true);
    expect(summer.get("2026-08-14")!.summer_vacation).toBe(true);
    expect(summer.get("2026-08-17")!.summer_vacation).toBe(false);
  });

  it("저장된 행에서 입력 복원", () => {
    const input = inputFromRows([
      { date: "2026-10-09", holiday_name: "한글날", company_closed: false, note: null },
      { date: "2026-10-16", holiday_name: null, company_closed: true, note: "창립기념일" },
    ]);
    expect(input.holidays.get("2026-10-09")).toBe("한글날");
    expect(input.companyClosed.get("2026-10-16")).toBe("창립기념일");
  });
});
