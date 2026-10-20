// 근무일 여부와 패턴 플래그 계산 (정의서 5.6)
import { addDays, dateRange, isWeekend, type ISODate } from "@/lib/dates";

export interface CalendarDay {
  date: ISODate;
  is_workday: boolean;
  holiday_name: string | null;
  holiday_adjacent: boolean;
  bridge_day: boolean;
  year_end: boolean;
  summer_vacation: boolean;
  company_closed: boolean;
  note: string | null;
}

export interface CalendarOptions {
  /** 'MM-DD' */
  summerVacation: { start: string; end: string };
  /** 'MM-DD', 12/31까지 */
  yearEndStart: string;
}

export interface CalendarInput {
  /** 공휴일(isHoliday=Y) 날짜 → 이름 */
  holidays: Map<ISODate, string>;
  /** 사내 휴무일 → 메모 */
  companyClosed: Map<ISODate, string | null>;
  /** 공휴일이 아닌 날의 기존 메모 보존용 */
  notes?: Map<ISODate, string | null>;
}

/** 연휴 판정을 위해 범위 앞뒤로 더 보는 일수 */
const PAD = 14;

export function computeCalendar(
  from: ISODate,
  to: ISODate,
  input: CalendarInput,
  opts: CalendarOptions,
): CalendarDay[] {
  const all = dateRange(addDays(from, -PAD), addDays(to, PAD));
  const nonWork = new Map<ISODate, boolean>();
  for (const d of all) nonWork.set(d, isWeekend(d) || input.holidays.has(d) || input.companyClosed.has(d));
  const off = (d: ISODate) => nonWork.get(d) ?? isWeekend(d);

  // 3일 이상 이어지는 비근무일 블록의 바로 앞뒤 근무일
  const adjacent = new Set<ISODate>();
  let i = 0;
  while (i < all.length) {
    if (!off(all[i])) {
      i++;
      continue;
    }
    let j = i;
    while (j + 1 < all.length && off(all[j + 1])) j++;
    if (j - i + 1 >= 3) {
      adjacent.add(addDays(all[i], -1));
      adjacent.add(addDays(all[j], 1));
    }
    i = j + 1;
  }

  const inMMDD = (d: ISODate, start: string, end: string) => {
    const md = d.slice(5);
    return start <= end ? md >= start && md <= end : md >= start || md <= end;
  };

  return dateRange(from, to).map((date) => {
    const workday = !off(date);
    const bridge = workday && off(addDays(date, -1)) && off(addDays(date, 1));
    const closedNote = input.companyClosed.get(date);
    return {
      date,
      is_workday: workday,
      holiday_name: input.holidays.get(date) ?? null,
      // 징검다리이면서 연휴 앞뒤면 징검다리만
      holiday_adjacent: workday && !bridge && adjacent.has(date),
      bridge_day: bridge,
      year_end: workday && inMMDD(date, opts.yearEndStart, "12-31"),
      summer_vacation: workday && inMMDD(date, opts.summerVacation.start, opts.summerVacation.end),
      company_closed: input.companyClosed.has(date),
      note: closedNote ?? input.notes?.get(date) ?? null,
    };
  });
}

/** 저장된 calendar_days 행에서 공휴일·사내휴무 입력을 되살린다 */
export function inputFromRows(rows: Pick<CalendarDay, "date" | "holiday_name" | "company_closed" | "note">[]): CalendarInput {
  const holidays = new Map<ISODate, string>();
  const companyClosed = new Map<ISODate, string | null>();
  const notes = new Map<ISODate, string | null>();
  for (const r of rows) {
    if (r.holiday_name) holidays.set(r.date, r.holiday_name);
    if (r.company_closed) companyClosed.set(r.date, r.note);
    else if (r.note) notes.set(r.date, r.note);
  }
  return { holidays, companyClosed, notes };
}

/** 저장된 달력이 없을 때 주말만으로 근무일 판정 */
export function isWorkdayFallback(d: ISODate): boolean {
  return !isWeekend(d);
}
