"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { saveMealCount } from "@/app/actions/meals";
import { shortLabel } from "@/lib/dates";
import type { MealCountRow } from "@/lib/db";

type Result = "부족" | "적정" | "남음";

interface Props {
  date: string;
  today: string;
  minDate: string | null;
  menu: { main_dish: string; menu_type: string; theme_label: string | null; is_theme_day: boolean } | null;
  prediction: { expected: number; recommended: number } | null;
  existing: MealCountRow | null;
  recent: { date: string; actual: number; expected: number | null }[];
}

export default function InputForm({ date, today, minDate, menu, prediction, existing, recent }: Props) {
  const router = useRouter();
  const [regular, setRegular] = useState(existing ? String(existing.regular_count) : "");
  const [takeout, setTakeout] = useState(existing?.takeout_count != null ? String(existing.takeout_count) : "");
  const [result, setResult] = useState<Result | null>(existing?.result ?? null);
  const [note, setNote] = useState(existing?.note ?? "");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  const go = (d: string) => router.push(`/input?date=${d}`);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (regular === "") return setMsg({ ok: false, text: "배식 인원을 입력해 주세요" });
    start(async () => {
      const r = await saveMealCount({
        date,
        regular_count: Number(regular),
        takeout_count: takeout === "" ? null : Number(takeout),
        result,
        note: note || null,
      });
      if (!r.ok) return setMsg({ ok: false, text: r.message });
      setMsg({
        ok: true,
        text:
          r.expected === null
            ? `저장했어요. 실제 ${r.actual}명이에요.`
            : `저장했어요. 예측 ${r.expected}명, 실제 ${r.actual}명으로 오차 ${r.error! >= 0 ? "+" : "−"}${Math.abs(r.error!)}명이에요.`,
      });
      router.refresh();
    });
  };

  const numInput =
    "tabular w-full rounded-xl border border-line bg-surface px-3 py-2 text-center text-3xl font-bold text-ink outline-none focus:border-flame focus:ring-2 focus:ring-flame/30";

  return (
    <>
      <form onSubmit={submit} className="space-y-3 rounded-2xl border border-line bg-surface p-4 shadow-sm">
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={date}
            max={today}
            min={minDate ?? undefined}
            onChange={(e) => e.target.value && go(e.target.value)}
            className="rounded-lg border border-line bg-surface px-2 py-1.5 text-sm text-ink"
            aria-label="날짜"
          />
          <span className="text-sm text-muted">{shortLabel(date)}</span>
          {existing && <span className="ml-auto rounded-full bg-surface-2 px-2 py-0.5 text-xs text-muted">입력됨</span>}
        </div>

        <div className="rounded-xl bg-surface-2 px-3 py-2 text-sm">
          <div className="truncate font-medium text-ink">
            {menu ? menu.main_dish : "등록된 메뉴 없음"}
            {menu && <span className="ml-1 text-xs font-normal text-muted">· {menu.menu_type}</span>}
          </div>
          <div className="tabular mt-0.5 text-muted">
            {prediction ? (
              <>
                예상 <b className="text-ink">{prediction.expected}</b>명 · 권장 준비량{" "}
                <b className="text-navy">{prediction.recommended}</b>명
              </>
            ) : (
              "예측 없음"
            )}
          </div>
        </div>

        <div className="grid grid-cols-[1.4fr_1fr] gap-2">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted">배식 인원 (일반식) *</span>
            <input
              inputMode="numeric"
              pattern="[0-9]*"
              value={regular}
              onChange={(e) => setRegular(e.target.value.replace(/\D/g, ""))}
              className={numInput}
              placeholder="0"
              aria-required
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted">간편식</span>
            <input
              inputMode="numeric"
              pattern="[0-9]*"
              value={takeout}
              onChange={(e) => setTakeout(e.target.value.replace(/\D/g, ""))}
              className={numInput}
              placeholder="0"
            />
          </label>
        </div>

        <div>
          <span className="mb-1 block text-xs font-medium text-muted">준비량 대비</span>
          <div className="grid grid-cols-3 gap-2">
            {(["부족", "적정", "남음"] as const).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setResult(result === r ? null : r)}
                className={`rounded-xl border py-2 text-sm font-semibold ${
                  result === r
                    ? r === "부족"
                      ? "border-bad bg-bad text-white"
                      : r === "남음"
                        ? "border-warn bg-warn text-white"
                        : "border-good bg-good text-white"
                    : "border-line bg-surface text-ink"
                }`}
              >
                {r}
              </button>
            ))}
          </div>
        </div>

        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="특이사항 (선택)"
          className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-flame"
        />

        {msg && <p className={`text-sm ${msg.ok ? "text-good" : "text-bad"}`}>{msg.text}</p>}

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-xl bg-navy py-3 text-base font-bold text-white disabled:opacity-50 dark:text-[#0b1320]"
        >
          {pending ? "저장 중…" : existing ? "수정 저장" : "저장"}
        </button>
      </form>

      <section className="mt-4">
        <h2 className="mb-2 text-xs font-medium text-muted">최근 입력</h2>
        <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
          {recent.length === 0 && <li className="px-4 py-3 text-sm text-muted">아직 입력이 없어요</li>}
          {recent.map((r) => {
            const editable = !minDate || r.date >= minDate;
            return (
              <li key={r.date}>
                <button
                  type="button"
                  disabled={!editable}
                  onClick={() => go(r.date)}
                  className="tabular flex w-full items-center justify-between px-4 py-2.5 text-left text-sm disabled:opacity-60"
                >
                  <span className="text-ink">{shortLabel(r.date)}</span>
                  <span className="text-muted">
                    <b className="text-ink">{r.actual}</b>명 · 예측 {r.expected ?? "—"}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>
    </>
  );
}
