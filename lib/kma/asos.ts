// 기상청 ASOS 일자료 (정의서 4.3). 분류 함수는 시간자료로 바꿀 수 있게 따로 둔다.
import { compact, fromCompact, type ISODate } from "@/lib/dates";
import { dataGoKrItems, fetchJsonWithRetry, serviceKey } from "@/lib/http";
import type { WeatherCat } from "@/lib/model/types";

const ENDPOINT = "https://apis.data.go.kr/1360000/AsosDalyInfoService/getWthrDataList";

export interface AsosDay {
  tm: string; // 'YYYY-MM-DD'
  sumRn?: string;
  ddMes?: string;
  avgTa?: string;
  avgTca?: string;
  [k: string]: unknown;
}

export interface ObservedRow {
  date: ISODate;
  rain_mm: number | null;
  snow_cm: number | null;
  avg_temp: number | null;
  category: WeatherCat;
  raw: unknown;
}

const num = (v: unknown): number | null => {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
};

export function classifyDaily(v: { rain: number | null; snow: number | null; cloud: number | null }): WeatherCat {
  if ((v.snow ?? 0) > 0) return "눈";
  if ((v.rain ?? 0) >= 1.0) return "비";
  if ((v.cloud ?? 0) >= 7) return "흐림";
  return "맑음";
}

export function toObserved(d: AsosDay): ObservedRow {
  const rain = num(d.sumRn);
  const snow = num(d.ddMes);
  const date = d.tm.includes("-") ? d.tm.slice(0, 10) : fromCompact(d.tm);
  return {
    date,
    rain_mm: rain,
    snow_cm: snow,
    avg_temp: num(d.avgTa),
    category: classifyDaily({ rain, snow, cloud: num(d.avgTca) }),
    raw: d,
  };
}

export async function fetchAsosDaily(stnId: number, from: ISODate, to: ISODate): Promise<ObservedRow[]> {
  const qs = new URLSearchParams({
    serviceKey: serviceKey(),
    dataType: "JSON",
    pageNo: "1",
    numOfRows: "400",
    dataCd: "ASOS",
    dateCd: "DAY",
    startDt: compact(from),
    endDt: compact(to),
    stnIds: String(stnId),
  });
  const json = await fetchJsonWithRetry(`${ENDPOINT}?${qs}`);
  return dataGoKrItems<AsosDay>(json).items.map(toObserved);
}
