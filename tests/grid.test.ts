import { describe, expect, it } from "vitest";
import { latLonToGrid } from "@/lib/kma/grid";
import { latestBaseTime, parsePrecip, summarizeDay, type ShortItem } from "@/lib/kma/shortTerm";
import { classifyMidText, latestTmFc, summarizeMid } from "@/lib/kma/midTerm";
import { classifyDaily } from "@/lib/kma/asos";

describe("격자 변환", () => {
  it("좌동사옥(해운대구) → nx=99, ny=75 근처", () => {
    const g = latLonToGrid(35.17, 129.18);
    expect(Math.abs(g.nx - 99)).toBeLessThanOrEqual(1);
    expect(Math.abs(g.ny - 75)).toBeLessThanOrEqual(1);
    expect(g).toEqual({ nx: 100, ny: 76 }); // 좌동은 해운대 중심보다 동쪽이라 한 칸씩 크다
  });
  it("서울시청 → 60, 127", () => {
    expect(latLonToGrid(37.5665, 126.978)).toEqual({ nx: 60, ny: 127 });
  });
});

describe("PCP·SNO 문자열 변환", () => {
  it.each([
    ["강수없음", 0],
    ["적설없음", 0],
    ["1mm 미만", 0.5],
    ["1.0mm", 1.0],
    ["30.0~50.0mm", 30.0],
    ["50.0mm 이상", 50.0],
  ])("%s → %d", (s, v) => {
    expect(parsePrecip(s)).toBe(v);
  });
});

describe("단기예보 하루 요약", () => {
  const mk = (time: string, cat: string, v: string): ShortItem => ({
    category: cat,
    fcstDate: "20261022",
    fcstTime: time,
    fcstValue: v,
  });
  it("06~13시만 보고, POP 60 이상이면 비", () => {
    const items = [
      mk("0500", "POP", "90"),
      mk("0600", "POP", "30"),
      mk("0900", "POP", "60"),
      mk("0900", "PTY", "0"),
      mk("0900", "SKY", "4"),
      mk("0900", "PCP", "1mm 미만"),
      mk("1000", "PCP", "2.0mm"),
      mk("1400", "POP", "100"),
      mk("0600", "TMN", "12.0"),
      mk("1500", "TMX", "21.0"),
    ];
    const s = summarizeDay("2026-10-22", items)!;
    expect(s.pop).toBe(60);
    expect(s.category).toBe("비");
    expect(s.rain_mm).toBe(2.5);
    expect(s.tmin).toBe(12);
    expect(s.tmax).toBe(21);
  });
  it("눈 > 비 > 흐림 > 맑음", () => {
    expect(summarizeDay("2026-10-22", [mk("0700", "PTY", "3"), mk("0700", "POP", "20")])!.category).toBe("눈");
    expect(summarizeDay("2026-10-22", [mk("0700", "PTY", "4"), mk("0700", "POP", "20")])!.category).toBe("비");
    expect(
      summarizeDay("2026-10-22", [mk("0700", "SKY", "4"), mk("0800", "SKY", "1"), mk("0700", "POP", "20")])!.category,
    ).toBe("흐림");
    expect(summarizeDay("2026-10-22", [mk("0700", "SKY", "1"), mk("0800", "SKY", "3")])!.category).toBe("맑음");
  });
  it("발표 시각 선택", () => {
    // KST 05:09 → 전날 2300 아닌 0200, 05:10 → 0500
    expect(latestBaseTime(new Date("2026-10-20T05:09:00+09:00"))).toEqual({ base_date: "20261020", base_time: "0200" });
    expect(latestBaseTime(new Date("2026-10-20T05:20:00+09:00"))).toEqual({ base_date: "20261020", base_time: "0500" });
    expect(latestBaseTime(new Date("2026-10-20T02:05:00+09:00"))).toEqual({ base_date: "20261019", base_time: "2300" });
  });
});

describe("중기예보·관측 분류", () => {
  it("문구 분류", () => {
    expect(classifyMidText("흐리고 비/눈")).toBe("눈");
    expect(classifyMidText("구름많고 소나기")).toBe("비");
    expect(classifyMidText("흐림")).toBe("흐림");
    expect(classifyMidText("구름많음")).toBe("맑음");
  });
  it("발표 시각과 날짜 매핑", () => {
    expect(latestTmFc(new Date("2026-10-20T06:20:00+09:00"))).toBe("202610200600");
    expect(latestTmFc(new Date("2026-10-20T05:00:00+09:00"))).toBe("202610191800");
    const s = summarizeMid("202610200600", { wf4Am: "흐리고 비", rnSt4Am: 70, wf8: "맑음", rnSt8: 10 });
    expect(s).toEqual([
      { target_date: "2026-10-24", category: "비", pop: 70, wf: "흐리고 비" },
      { target_date: "2026-10-28", category: "맑음", pop: 10, wf: "맑음" },
    ]);
  });
  it("ASOS 일자료 분류", () => {
    expect(classifyDaily({ rain: 0, snow: 0.3, cloud: 2 })).toBe("눈");
    expect(classifyDaily({ rain: 1.0, snow: null, cloud: 2 })).toBe("비");
    expect(classifyDaily({ rain: 0.5, snow: null, cloud: 7.5 })).toBe("흐림");
    expect(classifyDaily({ rain: null, snow: null, cloud: 3 })).toBe("맑음");
  });
});
