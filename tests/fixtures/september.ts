import type { MenuType, TrainingDay } from "@/lib/model/types";

// supabase/seed.sql 과 같은 9월 정산자료
const rows: [string, number, MenuType, boolean][] = [
  ["2026-09-01", 147, "고기", true],
  ["2026-09-02", 139, "고기", false],
  ["2026-09-03", 135, "고기", false],
  ["2026-09-04", 96, "고기", false],
  ["2026-09-07", 138, "밥·덮밥", false],
  ["2026-09-08", 114, "고기", true],
  ["2026-09-09", 87, "면", true],
  ["2026-09-10", 110, "고기", true],
  ["2026-09-11", 75, "고기", false],
  ["2026-09-14", 132, "국·찌개·탕", false],
  ["2026-09-15", 122, "면", true],
  ["2026-09-16", 87, "국·찌개·탕", false],
  ["2026-09-17", 116, "고기", true],
  ["2026-09-18", 96, "국·찌개·탕", false],
  ["2026-09-21", 110, "고기", false],
  ["2026-09-22", 119, "밥·덮밥", true],
  ["2026-09-23", 134, "국·찌개·탕", false],
  ["2026-09-28", 131, "국·찌개·탕", false],
  ["2026-09-29", 104, "밥·덮밥", false],
  ["2026-09-30", 118, "면", true],
];

const noFlags = { holiday_adjacent: false, bridge_day: false, year_end: false, summer_vacation: false };

export const SEPTEMBER: TrainingDay[] = rows.map(([date, y, menuType, isTheme]) => ({
  date,
  y,
  menuType,
  isTheme,
  flags: { ...noFlags, holiday_adjacent: date === "2026-09-23" || date === "2026-09-28" },
  weather: null,
}));

export const NO_FLAGS = noFlags;

// 간편식 인원 (seed.sql)
export const TAKEOUT: Record<string, number> = {
  "2026-09-01": 0, "2026-09-02": 0, "2026-09-03": 0, "2026-09-04": 0, "2026-09-07": 5,
  "2026-09-08": 8, "2026-09-09": 8, "2026-09-10": 5, "2026-09-11": 8, "2026-09-14": 6,
  "2026-09-15": 8, "2026-09-16": 8, "2026-09-17": 8, "2026-09-18": 5, "2026-09-21": 11,
  "2026-09-22": 8, "2026-09-23": 9, "2026-09-28": 8, "2026-09-29": 9, "2026-09-30": 9,
};
