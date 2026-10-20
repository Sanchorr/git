// 기상청 단기예보 (정의서 4.1)
import { compact, fromCompact, kstToUtcIso, nowKSTParts, addDays, type ISODate } from "@/lib/dates";
import { dataGoKrItems, fetchJsonWithRetry, serviceKey } from "@/lib/http";
import type { WeatherCat } from "@/lib/model/types";

const ENDPOINT = "https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst";
const BASE_TIMES = ["0200", "0500", "0800", "1100", "1400", "1700", "2000", "2300"];

export interface ShortItem {
  category: string;
  fcstDate: string;
  fcstTime: string;
  fcstValue: string;
}

export interface DaySummary {
  target_date: ISODate;
  category: WeatherCat;
  pop: number | null;
  rain_mm: number;
  snow_cm: number;
  tmin: number | null;
  tmax: number | null;
}

/** PCP·SNO 문자열 → 숫자 */
export function parsePrecip(s: string | null | undefined): number {
  if (!s) return 0;
  const t = s.trim();
  if (t === "" || t.includes("없음") || t === "-" || t === "0") return 0;
  if (t.includes("미만")) return 0.5;
  const m = t.match(/[\d.]+/);
  return m ? parseFloat(m[0]) : 0;
}

/** 지금 조회할 수 있는 가장 최근 발표 시각 (발표 10분 뒤부터 조회 가능) */
export function latestBaseTime(now: Date = new Date()): { base_date: string; base_time: string } {
  const { date, hour, minute } = nowKSTParts(now);
  const minutes = hour * 60 + minute;
  for (let i = BASE_TIMES.length - 1; i >= 0; i--) {
    const t = BASE_TIMES[i];
    const m = Number(t.slice(0, 2)) * 60 + Number(t.slice(2)) + 10;
    if (minutes >= m) return { base_date: compact(date), base_time: t };
  }
  return { base_date: compact(addDays(date, -1)), base_time: "2300" };
}

/** 대상 날짜의 06~13시 예보로 하루 요약 */
export function summarizeDay(date: ISODate, items: ShortItem[]): DaySummary | null {
  const day = items.filter((i) => i.fcstDate === compact(date));
  const win = day.filter((i) => i.fcstTime >= "0600" && i.fcstTime <= "1300");
  if (win.length === 0) return null;

  const vals = (cat: string) => win.filter((i) => i.category === cat).map((i) => i.fcstValue);
  const pops = vals("POP").map(Number).filter((n) => !Number.isNaN(n));
  const pty = vals("PTY").map(Number);
  const sky = vals("SKY").map(Number);
  const pop = pops.length ? Math.max(...pops) : null;
  const rain = vals("PCP").reduce((s, v) => s + parsePrecip(v), 0);
  const snow = vals("SNO").reduce((s, v) => s + parsePrecip(v), 0);
  const tmnItem = day.find((i) => i.category === "TMN");
  const tmxItem = day.find((i) => i.category === "TMX");

  let category: WeatherCat;
  if (pty.some((p) => p === 2 || p === 3) || snow > 0) category = "눈";
  else if (pty.some((p) => p === 1 || p === 4) || (pop ?? 0) >= 60) category = "비";
  else if (sky.length > 0 && sky.filter((s) => s === 4).length >= sky.length / 2) category = "흐림";
  else category = "맑음";

  return {
    target_date: date,
    category,
    pop,
    rain_mm: Math.round(rain * 10) / 10,
    snow_cm: Math.round(snow * 10) / 10,
    tmin: tmnItem ? parseFloat(tmnItem.fcstValue) : null,
    tmax: tmxItem ? parseFloat(tmxItem.fcstValue) : null,
  };
}

export async function fetchShortTerm(nx: number, ny: number, now: Date = new Date()) {
  const base = latestBaseTime(now);
  const items: ShortItem[] = [];
  const perPage = 1000;
  for (let page = 1; page <= 5; page++) {
    const qs = new URLSearchParams({
      serviceKey: serviceKey(),
      dataType: "JSON",
      numOfRows: String(perPage),
      pageNo: String(page),
      base_date: base.base_date,
      base_time: base.base_time,
      nx: String(nx),
      ny: String(ny),
    });
    const json = await fetchJsonWithRetry(`${ENDPOINT}?${qs}`);
    const { items: got, totalCount } = dataGoKrItems<ShortItem>(json);
    items.push(...got);
    if (items.length >= totalCount || got.length === 0) break;
  }
  const dates = [...new Set(items.map((i) => i.fcstDate))].sort().map(fromCompact);
  const summaries = dates.map((d) => summarizeDay(d, items)).filter((s): s is DaySummary => s !== null);
  return { issuedAt: kstToUtcIso(base.base_date, base.base_time), base, summaries };
}
