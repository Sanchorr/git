"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { getExistingMenus, getPatternDays, saveMenus } from "@/app/actions/menus";
import { shortLabel, isWeekend } from "@/lib/dates";
import { createClient } from "@/lib/supabase/client";
import { MENU_TYPES, type MenuType } from "@/lib/model/types";
import type { ParsedDay } from "@/lib/menus/schema";
import { Badge, btn, Card, CardTitle } from "@/components/ui";

type PhotoStatus = "대기" | "줄이는 중" | "올리는 중" | "인식 중" | "완료" | "실패";

interface Photo {
  id: string;
  file: File;
  preview: string;
  status: PhotoStatus;
  error?: string;
  path?: string;
  days?: number;
}

interface EditRow extends ParsedDay {
  photo_path: string | null;
  overwrite: boolean;
}

interface Existing {
  date: string;
  main_dish: string;
  menu_type: MenuType;
  is_theme_day: boolean;
  theme_label: string | null;
}

const MAX_PHOTOS = 6;
const LONG_SIDE = 2000;

/** 긴 변 2000px JPEG로 줄인다. 브라우저가 못 여는 형식(일부 HEIC)은 원본을 쓴다. */
async function shrink(file: File): Promise<File> {
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, LONG_SIDE / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.88));
    if (!blob) return file;
    const base = file.name.replace(/\.[^.]+$/, "");
    return new File([blob], `${base}.jpg`, { type: "image/jpeg" });
  } catch {
    return file;
  }
}

function safeName(name: string, i: number): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "jpg";
  const base = name
    .replace(/\.[^.]+$/, "")
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return `${base || `photo${i + 1}`}.${ext}`;
}

export default function UploadClient({ defaultMonth, monthOptions }: { defaultMonth: string; monthOptions: string[] }) {
  const [month, setMonth] = useState(defaultMonth);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [rows, setRows] = useState<EditRow[] | null>(null);
  const [existing, setExisting] = useState<Map<string, Existing>>(new Map());
  const [patterns, setPatterns] = useState<Awaited<ReturnType<typeof getPatternDays>>>([]);
  const [busy, setBusy] = useState(false);
  const [saving, startSave] = useTransition();
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getPatternDays(month).then(setPatterns).catch(() => setPatterns([]));
    getExistingMenus(month)
      .then((d) => setExisting(new Map((d as Existing[]).map((e) => [e.date, e]))))
      .catch(() => setExisting(new Map()));
    setRows(null);
    setDone(null);
  }, [month]);

  const addFiles = (files: FileList | File[]) => {
    const list = [...files].filter((f) => /\.(jpe?g|png|heic|heif)$/i.test(f.name) || f.type.startsWith("image/"));
    setPhotos((cur) =>
      [
        ...cur,
        ...list.map((file) => ({ id: crypto.randomUUID(), file, preview: URL.createObjectURL(file), status: "대기" as const })),
      ].slice(0, MAX_PHOTOS),
    );
  };

  const update = (id: string, patch: Partial<Photo>) =>
    setPhotos((cur) => cur.map((p) => (p.id === id ? { ...p, ...patch } : p)));

  const recognize = async () => {
    setBusy(true);
    setError(null);
    setDone(null);
    const supabase = createClient();
    const results = await Promise.all(
      photos.map(async (p, i) => {
        try {
          update(p.id, { status: "줄이는 중", error: undefined });
          const small = await shrink(p.file);
          update(p.id, { status: "올리는 중" });
          const path = `${month}/${safeName(small.name, i)}`;
          const up = await supabase.storage.from("menu-photos").upload(path, small, { upsert: true, contentType: small.type });
          if (up.error) throw new Error(`업로드 실패: ${up.error.message}`);
          update(p.id, { status: "인식 중", path });
          const res = await fetch("/api/menus/parse", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ month, photoPaths: [path] }),
          });
          const json = await res.json();
          if (!res.ok) throw new Error(json.error ?? "인식 실패");
          const ph = json.photos?.[0];
          if (!ph?.ok) throw new Error(ph?.error ?? "이 사진을 읽지 못했어요");
          update(p.id, { status: "완료", days: ph.days.length });
          return (json.days as (ParsedDay & { photo_path: string })[]) ?? [];
        } catch (e) {
          update(p.id, { status: "실패", error: e instanceof Error ? e.message : String(e) });
          return [];
        }
      }),
    );
    const byDate = new Map<string, EditRow>();
    for (const list of results)
      for (const d of list)
        if (!byDate.has(d.date)) byDate.set(d.date, { ...d, photo_path: d.photo_path ?? null, overwrite: false });
    const merged = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
    setRows(merged);
    if (merged.length === 0) setError("인식된 날짜가 없어요. 사진을 확인해 주세요.");
    setBusy(false);
  };

  const inMonth = (d: string) => d.startsWith(month);
  const excluded = (r: EditRow) => r.no_service || !inMonth(r.date) || isWeekend(r.date);
  const willSave = (r: EditRow) => !excluded(r) && r.main_dish.trim() !== "" && (!existing.has(r.date) || r.overwrite);
  const saveCount = rows?.filter(willSave).length ?? 0;
  const monthNum = Number(month.slice(5, 7));

  const patch = (date: string, p: Partial<EditRow>) =>
    setRows((cur) => cur?.map((r) => (r.date === date ? { ...r, ...p } : r)) ?? null);

  const save = () =>
    startSave(async () => {
      setError(null);
      const days = rows!.filter(willSave).map((r) => ({
        date: r.date,
        main_dish: r.main_dish,
        sides: r.sides,
        menu_type: r.menu_type,
        is_theme_day: r.is_theme_day,
        theme_label: r.theme_label,
        photo_path: r.photo_path,
      }));
      const res = await saveMenus({ month, days });
      if (!res.ok) return setError(res.message);
      setDone(`${monthNum}월 주간 예측이 만들어졌어요 (메뉴 ${res.saved}일, 예측 ${res.predicted}일)`);
      getExistingMenus(month).then((d) => setExisting(new Map((d as Existing[]).map((e) => [e.date, e]))));
    });

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="flex min-w-0 flex-col gap-4">
        <Card>
          <CardTitle>1. 연월과 사진</CardTitle>
          <div className="flex flex-wrap items-center gap-3">
            <label className="text-sm text-muted">
              연월{" "}
              <select
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                className="ml-1 rounded-lg border border-line bg-surface px-2 py-1.5 text-ink"
              >
                {monthOptions.map((m) => (
                  <option key={m} value={m}>
                    {m.slice(0, 4)}년 {Number(m.slice(5))}월
                  </option>
                ))}
              </select>
            </label>
            <span className="text-xs text-muted">최대 {MAX_PHOTOS}장 · jpg·png·heic · 긴 변 2000px로 줄여서 올려요</span>
          </div>

          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDrag(true);
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDrag(false);
              addFiles(e.dataTransfer.files);
            }}
            onClick={() => fileRef.current?.click()}
            className={`mt-3 flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-4 py-8 text-center text-sm ${
              drag ? "border-flame bg-flame-soft" : "border-line bg-surface-2"
            }`}
          >
            <span className="text-2xl">📷</span>
            <span className="mt-1 font-medium text-ink">사진을 끌어다 놓거나 눌러서 고르세요</span>
            <span className="text-xs text-muted">{photos.length}/{MAX_PHOTOS}장</span>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/heic,image/heif,.heic,.heif"
              multiple
              hidden
              onChange={(e) => {
                if (e.target.files) addFiles(e.target.files);
                e.target.value = "";
              }}
            />
          </div>

          {photos.length > 0 && (
            <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {photos.map((p) => (
                <li key={p.id} className="overflow-hidden rounded-xl border border-line">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.preview} alt={p.file.name} className="h-24 w-full object-cover" />
                  <div className="flex items-center justify-between gap-1 px-2 py-1.5 text-xs">
                    <span className="truncate text-muted">{p.file.name}</span>
                    <span
                      className={
                        p.status === "완료" ? "text-good" : p.status === "실패" ? "text-bad" : p.status === "대기" ? "text-muted" : "text-flame"
                      }
                    >
                      {p.status}
                      {p.days !== undefined && ` ${p.days}일`}
                    </span>
                  </div>
                  {p.error && <div className="px-2 pb-1.5 text-xs text-bad">{p.error}</div>}
                  {!busy && p.status !== "완료" && (
                    <button
                      type="button"
                      onClick={() => setPhotos((cur) => cur.filter((x) => x.id !== p.id))}
                      className="w-full border-t border-line py-1 text-xs text-muted hover:bg-surface-2"
                    >
                      빼기
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}

          <div className="mt-4 flex gap-2">
            <button type="button" onClick={recognize} disabled={busy || photos.length === 0} className={btn.primary}>
              {busy ? "인식하는 중…" : "인식하기"}
            </button>
            {photos.length > 0 && !busy && (
              <button type="button" onClick={() => setPhotos([])} className={btn.secondary}>
                모두 지우기
              </button>
            )}
          </div>
        </Card>

        {rows && rows.length > 0 && (
          <Card>
            <CardTitle aside={<span className="text-xs text-muted">회색 행은 저장하지 않아요</span>}>2. 인식 결과 확인</CardTitle>
            <div className="-mx-5 overflow-x-auto px-5">
              <table className="w-full min-w-[680px] text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs text-muted">
                    <th className="py-2 pr-2 font-medium">날짜</th>
                    <th className="py-2 pr-2 font-medium">메인 메뉴</th>
                    <th className="py-2 pr-2 font-medium">유형</th>
                    <th className="py-2 pr-2 font-medium">테마DAY</th>
                    <th className="py-2 font-medium">테마 문구</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const ex = existing.get(r.date);
                    const off = excluded(r);
                    return (
                      <tr key={r.date} className={`border-b border-line/70 align-top ${off ? "opacity-45" : ""}`}>
                        <td className="whitespace-nowrap py-2 pr-2 font-medium">
                          {shortLabel(r.date)}
                          {r.no_service && <div className="text-xs text-muted">운영 안 함</div>}
                          {!inMonth(r.date) && <div className="text-xs text-muted">다른 달</div>}
                        </td>
                        <td className="py-2 pr-2">
                          <input
                            value={r.main_dish}
                            disabled={off}
                            onChange={(e) => patch(r.date, { main_dish: e.target.value })}
                            className="w-full rounded-lg border border-line bg-surface px-2 py-1 text-ink"
                          />
                          {ex && !off && (
                            <label className="mt-1 flex items-center gap-1.5 text-xs text-warn">
                              <input
                                type="checkbox"
                                checked={r.overwrite}
                                onChange={(e) => patch(r.date, { overwrite: e.target.checked })}
                              />
                              기존 값 덮어쓰기: {ex.main_dish} ({ex.menu_type}) → {r.main_dish} ({r.menu_type})
                            </label>
                          )}
                        </td>
                        <td className="py-2 pr-2">
                          <select
                            value={r.menu_type}
                            disabled={off}
                            onChange={(e) => patch(r.date, { menu_type: e.target.value as MenuType })}
                            className="rounded-lg border border-line bg-surface px-2 py-1 text-ink"
                          >
                            {MENU_TYPES.map((t) => (
                              <option key={t}>{t}</option>
                            ))}
                          </select>
                        </td>
                        <td className="py-2 pr-2 text-center">
                          <input
                            type="checkbox"
                            disabled={off}
                            checked={r.is_theme_day}
                            onChange={(e) => patch(r.date, { is_theme_day: e.target.checked })}
                          />
                        </td>
                        <td className="py-2">
                          <input
                            value={r.theme_label ?? ""}
                            disabled={off || !r.is_theme_day}
                            onChange={(e) => patch(r.date, { theme_label: e.target.value || null })}
                            className="w-full rounded-lg border border-line bg-surface px-2 py-1 text-ink"
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {error && <p className="mt-3 text-sm text-bad">{error}</p>}
            {done ? (
              <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl bg-flame-soft px-4 py-3 text-sm">
                <span className="font-medium text-navy">✓ {done}</span>
                <Link href="/" className={btn.secondary}>
                  주간 예측 보기
                </Link>
              </div>
            ) : (
              <button type="button" onClick={save} disabled={saving || saveCount === 0} className={`${btn.primary} mt-4`}>
                {saving ? "저장하고 예측 계산 중…" : `${monthNum}월 식단 저장 (${saveCount}일)`}
              </button>
            )}
          </Card>
        )}
        {error && !rows?.length && <p className="text-sm text-bad">{error}</p>}
      </div>

      <Card className="h-fit">
        <CardTitle>자동 표시된 패턴 일정</CardTitle>
        <p className="mb-2 text-xs text-muted">
          {monthNum}월과 다음 달의 공휴일·연휴 앞뒤·징검다리·연말·휴가철. 예측에 자동 반영돼요.
        </p>
        {patterns.length === 0 ? (
          <p className="text-sm text-muted">해당하는 날이 없거나 달력이 아직 없어요.</p>
        ) : (
          <ul className="space-y-1.5 text-sm">
            {patterns.map((p) => (
              <li key={p.date} className="flex flex-wrap items-center gap-1.5">
                <span className="tabular w-16 text-muted">{shortLabel(p.date)}</span>
                {p.holiday_name && <Badge tone="warn">{p.holiday_name}</Badge>}
                {p.company_closed && <Badge tone="warn">사내 휴무</Badge>}
                {p.holiday_adjacent && <Badge tone="navy">연휴 앞뒤</Badge>}
                {p.bridge_day && <Badge tone="navy">징검다리</Badge>}
                {p.year_end && <Badge>연말</Badge>}
                {p.summer_vacation && <Badge>여름 휴가철</Badge>}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
