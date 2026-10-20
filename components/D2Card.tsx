import { shortLabel } from "@/lib/dates";
import type { MenuRow, PredictionRow } from "@/lib/db";
import { Badge, signed } from "@/components/ui";

function Dial({ value }: { value: number }) {
  return (
    <span className="inline-flex" aria-label={`${value}명`}>
      {String(value)
        .padStart(3, "0")
        .split("")
        .map((d, i) => (
          <span key={i} className="dial-digit">
            {d}
          </span>
        ))}
    </span>
  );
}

export default function D2Card({
  date,
  prediction,
  menu,
  guarantee,
}: {
  date: string;
  prediction: PredictionRow | null;
  menu: MenuRow | null;
  guarantee: number;
}) {
  const expected = prediction ? Number(prediction.expected) : null;
  return (
    <section className="overflow-hidden rounded-2xl border border-line bg-surface shadow-sm">
      <div className="bg-dial px-5 pb-5 pt-4 text-dial-ink">
        <div className="flex items-center justify-between text-sm opacity-80">
          <span>D+2 권장 준비량</span>
          <span>{shortLabel(date)}</span>
        </div>
        {prediction ? (
          <>
            <div className="mt-3 flex items-end gap-3">
              <span className="text-6xl font-bold leading-none tracking-tight">
                <Dial value={prediction.recommended} />
              </span>
              <span className="pb-1 text-lg opacity-80">명</span>
            </div>
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm">
              <span>
                예상 <b className="tabular text-base">{Math.round(expected!)}</b>명
              </span>
              <span className="opacity-80">
                범위 {prediction.low}~{prediction.high}명
              </span>
              {prediction.recommended < guarantee && (
                <span className="rounded bg-[#C7700A] px-1.5 text-white">보장인원 {guarantee}명 미만</span>
              )}
            </div>
            {menu && (
              <div className="mt-2 text-sm opacity-90">
                🍽 {menu.main_dish} <span className="opacity-70">· {menu.menu_type}</span>
              </div>
            )}
          </>
        ) : (
          <p className="mt-4 text-sm opacity-80">이 날짜의 예측이 아직 없어요. 식단이 등록되면 계산돼요.</p>
        )}
      </div>

      {prediction && (
        <div className="p-5">
          <div className="mb-2 text-xs font-medium text-muted">요인별 기여</div>
          <ul className="tabular divide-y divide-line text-sm">
            {prediction.contributions.map((c) => (
              <li key={c.key} className="flex items-center justify-between gap-3 py-1.5">
                <span className="text-ink">
                  {c.label}
                  <span className="ml-1.5 text-xs text-muted">
                    ·{" "}
                    {c.source === "base"
                      ? `${c.n}일 평균`
                      : c.source === "data"
                        ? `근거 ${c.n}일`
                        : c.n > 0
                          ? `기본값 보정 (${c.n}일)`
                          : "기본값"}
                  </span>
                </span>
                <span
                  className={`font-semibold ${
                    c.key === "base" ? "text-ink" : c.value > 0.5 ? "text-flame" : c.value < -0.5 ? "text-warn" : "text-muted"
                  }`}
                >
                  {c.key === "base" ? `${c.value.toFixed(1)}명` : `${signed(c.value, 1)}명`}
                </span>
              </li>
            ))}
            <li className="flex items-center justify-between py-1.5 font-semibold">
              <span>예상 인원</span>
              <span>{expected!.toFixed(1)}명</span>
            </li>
          </ul>
          {prediction.weather_basis === "none" && (
            <Badge tone="muted">날씨 예보 전 — 불확실성만큼 여유분을 늘렸어요</Badge>
          )}
        </div>
      )}
    </section>
  );
}
