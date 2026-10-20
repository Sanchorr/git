// 한국천문연구원 특일정보 (정의서 4.4)
import { fromCompact, type ISODate } from "@/lib/dates";
import { dataGoKrItems, fetchJsonWithRetry, serviceKey } from "@/lib/http";

const ENDPOINT = "https://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService/getRestDeInfo";

interface RestDeItem {
  locdate: number | string;
  dateName: string;
  isHoliday: "Y" | "N";
}

/** 한 달의 공휴일(isHoliday=Y) */
export async function fetchHolidays(year: number, month: number): Promise<Map<ISODate, string>> {
  const qs = new URLSearchParams({
    serviceKey: serviceKey(),
    solYear: String(year),
    solMonth: String(month).padStart(2, "0"),
    _type: "json",
    numOfRows: "50",
  });
  const json = await fetchJsonWithRetry(`${ENDPOINT}?${qs}`);
  const out = new Map<ISODate, string>();
  for (const it of dataGoKrItems<RestDeItem>(json).items) {
    if (it.isHoliday !== "Y") continue;
    const d = fromCompact(String(it.locdate));
    out.set(d, out.has(d) ? `${out.get(d)}·${it.dateName}` : it.dateName);
  }
  return out;
}
