// 한국 시간(Asia/Seoul) 날짜 유틸. 날짜는 모두 'YYYY-MM-DD' 문자열로 다룬다.

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

export type ISODate = string;

/** 주어진 시각(기본 지금)의 한국 날짜 */
export function todayKST(now: Date = new Date()): ISODate {
  return new Date(now.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);
}

/** 주어진 시각의 한국 시·분 */
export function nowKSTParts(now: Date = new Date()) {
  const k = new Date(now.getTime() + KST_OFFSET_MS);
  return { date: k.toISOString().slice(0, 10), hour: k.getUTCHours(), minute: k.getUTCMinutes() };
}

function toUTC(d: ISODate): Date {
  return new Date(`${d}T00:00:00Z`);
}

function fromUTC(d: Date): ISODate {
  return d.toISOString().slice(0, 10);
}

export function addDays(d: ISODate, n: number): ISODate {
  const t = toUTC(d);
  t.setUTCDate(t.getUTCDate() + n);
  return fromUTC(t);
}

/** 0=일 … 6=토 */
export function dayOfWeek(d: ISODate): number {
  return toUTC(d).getUTCDay();
}

export function isWeekend(d: ISODate): boolean {
  const w = dayOfWeek(d);
  return w === 0 || w === 6;
}

export function diffDays(a: ISODate, b: ISODate): number {
  return Math.round((toUTC(b).getTime() - toUTC(a).getTime()) / 86400000);
}

/** from부터 to까지(양끝 포함) 날짜 목록 */
export function dateRange(from: ISODate, to: ISODate): ISODate[] {
  const out: ISODate[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

export function compact(d: ISODate): string {
  return d.replaceAll("-", "");
}

export function fromCompact(s: string): ISODate {
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
}

/** 'YYYY-MM' → 그 달 첫날·마지막 날 */
export function monthBounds(month: string): { from: ISODate; to: ISODate } {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, "0")}` };
}

export function addMonths(month: string, n: number): string {
  const [y, m] = month.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1 + n, 1));
  return t.toISOString().slice(0, 7);
}

/** 그 주의 월요일 */
export function mondayOf(d: ISODate): ISODate {
  const w = dayOfWeek(d);
  return addDays(d, w === 0 ? -6 : 1 - w);
}

/** KST 'YYYYMMDD' + 'HHmm' → UTC ISO 타임스탬프 */
export function kstToUtcIso(yyyymmdd: string, hhmm: string): string {
  const iso = `${fromCompact(yyyymmdd)}T${hhmm.slice(0, 2)}:${hhmm.slice(2, 4)}:00+09:00`;
  return new Date(iso).toISOString();
}

const DOW_KO = ["일", "월", "화", "수", "목", "금", "토"];
export function dowLabel(d: ISODate): string {
  return DOW_KO[dayOfWeek(d)];
}

/** '10/22(목)' */
export function shortLabel(d: ISODate): string {
  return `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}(${dowLabel(d)})`;
}

export const DOW_NAMES = DOW_KO;
