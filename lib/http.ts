// 외부 API 호출: 실패 시 2초 뒤 1회 재시도 (정의서 7장)

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function fetchJsonWithRetry<T = unknown>(url: string, retryDelayMs = 2000): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      // 공공데이터포털은 오류를 XML로 돌려주는 경우가 있다
      if (text.trimStart().startsWith("<")) {
        const msg = text.match(/<returnAuthMsg>(.*?)<\/returnAuthMsg>|<resultMsg>(.*?)<\/resultMsg>/);
        throw new Error(`XML 응답: ${msg?.[1] ?? msg?.[2] ?? text.slice(0, 120)}`);
      }
      return JSON.parse(text) as T;
    } catch (e) {
      lastErr = e;
      if (attempt === 0) await sleep(retryDelayMs);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

/** 공공데이터포털 공통 응답에서 item 배열 꺼내기 */
export function dataGoKrItems<T>(json: unknown): { items: T[]; totalCount: number } {
  const body = (json as { response?: { header?: { resultCode?: string; resultMsg?: string }; body?: unknown } })
    ?.response;
  const code = body?.header?.resultCode;
  if (code && code !== "00" && code !== "03") throw new Error(`API 오류 ${code}: ${body?.header?.resultMsg}`);
  const b = body?.body as { items?: { item?: T | T[] } | ""; totalCount?: number } | undefined;
  const raw = b?.items && typeof b.items === "object" ? b.items.item : undefined;
  const items = raw === undefined ? [] : Array.isArray(raw) ? raw : [raw];
  return { items, totalCount: Number(b?.totalCount ?? items.length) };
}

export function serviceKey(): string {
  const k = process.env.KMA_SERVICE_KEY;
  if (!k) throw new Error("KMA_SERVICE_KEY 환경변수가 없습니다");
  return k;
}
