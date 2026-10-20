// 기상청 중기예보 (정의서 4.2)
import { addDays, compact, fromCompact, kstToUtcIso, nowKSTParts, type ISODate } from "@/lib/dates";
import { dataGoKrItems, fetchJsonWithRetry, serviceKey } from "@/lib/http";
import type { WeatherCat } from "@/lib/model/types";

const ENDPOINT = "https://apis.data.go.kr/1360000/MidFcstInfoService/getMidLandFcst";

export interface MidSummary {
  target_date: ISODate;
  category: WeatherCat;
  pop: number | null;
  wf: string;
}

export function classifyMidText(wf: string): WeatherCat {
  if (wf.includes("눈")) return "눈";
  if (wf.includes("비") || wf.includes("소나기")) return "비";
  if (wf.includes("흐림") || wf.includes("흐리")) return "흐림";
  return "맑음";
}

/** 조회 가능한 가장 최근 발표 (06:00, 18:00 발표, 10분 뒤 조회) */
export function latestTmFc(now: Date = new Date()): string {
  const { date, hour, minute } = nowKSTParts(now);
  const m = hour * 60 + minute;
  if (m >= 18 * 60 + 10) return `${compact(date)}1800`;
  if (m >= 6 * 60 + 10) return `${compact(date)}0600`;
  return `${compact(addDays(date, -1))}1800`;
}

/** 응답 item 하나 → 날짜별 요약. 오전 필드가 있으면 오전, 없으면 단일 필드 */
export function summarizeMid(tmFc: string, item: Record<string, unknown>): MidSummary[] {
  const issued = fromCompact(tmFc.slice(0, 8));
  const out: MidSummary[] = [];
  for (let n = 4; n <= 10; n++) {
    const wf = (item[`wf${n}Am`] ?? item[`wf${n}`]) as string | undefined;
    const pop = (item[`rnSt${n}Am`] ?? item[`rnSt${n}`]) as number | string | undefined;
    if (!wf) continue;
    out.push({
      target_date: addDays(issued, n),
      category: classifyMidText(wf),
      pop: pop === undefined || pop === "" ? null : Number(pop),
      wf,
    });
  }
  return out;
}

export async function fetchMidTerm(regId: string, now: Date = new Date()) {
  const tmFc = latestTmFc(now);
  const qs = new URLSearchParams({
    serviceKey: serviceKey(),
    dataType: "JSON",
    numOfRows: "10",
    pageNo: "1",
    regId,
    tmFc,
  });
  const json = await fetchJsonWithRetry(`${ENDPOINT}?${qs}`);
  const { items } = dataGoKrItems<Record<string, unknown>>(json);
  if (items.length === 0) throw new Error("중기예보 응답에 항목이 없습니다");
  return {
    issuedAt: kstToUtcIso(tmFc.slice(0, 8), tmFc.slice(8)),
    tmFc,
    summaries: summarizeMid(tmFc, items[0]),
    raw: items[0],
  };
}
