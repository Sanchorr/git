"use client";

import { useState, useTransition } from "react";
import {
  createStaffUser,
  recomputeNow,
  setCompanyClosed,
  setUserActive,
  updateSettings,
} from "@/app/actions/settings";
import { shortLabel } from "@/lib/dates";
import type { AppSettings } from "@/lib/model/priors";
import { FLAG_KEYS, FLAG_LABELS, MENU_TYPES, type Priors } from "@/lib/model/types";
import { Badge, btn, Card, CardTitle, input } from "@/components/ui";

type Result = { ok: boolean; message: string };

function useAction() {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<Result | null>(null);
  const run = (fn: () => Promise<Result>, onOk?: () => void) =>
    start(async () => {
      const r = await fn();
      setMsg(r);
      if (r.ok) onOk?.();
    });
  const Msg = () => (msg ? <p className={`text-sm ${msg.ok ? "text-good" : "text-bad"}`}>{msg.message}</p> : null);
  return { pending, run, Msg };
}

const small = "w-24 rounded-lg border border-line bg-surface px-2 py-1.5 text-right text-sm text-ink tabular";

interface User {
  id: string;
  name: string;
  email: string | null;
  role: string;
  active: boolean;
}

export default function SettingsClient({
  settings,
  users,
  closedDays,
  today,
}: {
  settings: AppSettings;
  users: User[];
  closedDays: { date: string; note: string | null }[];
  today: string;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <PriorsCard priors={settings.priors} />
      <div className="flex flex-col gap-4">
        <MarginCard settings={settings} />
        <PeriodCard settings={settings} />
        <RecomputeCard />
      </div>
      <UsersCard users={users} />
      <ClosedCard closedDays={closedDays} today={today} />
    </div>
  );
}

function Row({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  const [text, setText] = useState(String(value));
  return (
    <label className="flex items-center justify-between gap-3 py-1.5 text-sm">
      <span className="text-ink">{label}</span>
      <span className="flex items-center gap-1">
        <input
          type="number"
          step="1"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            const v = Number(e.target.value);
            if (e.target.value !== "" && Number.isFinite(v)) onChange(v);
          }}
          className={small}
        />
        <span className="text-xs text-muted">명</span>
      </span>
    </label>
  );
}

function PriorsCard({ priors }: { priors: Priors }) {
  const [p, setP] = useState<Priors>(priors);
  const { pending, run, Msg } = useAction();
  return (
    <Card>
      <CardTitle>기본값 계수</CardTitle>
      <p className="mb-2 text-xs text-muted">데이터가 적은 요인은 이 값 쪽으로 당겨서 추정해요. 요일은 항상 0에서 시작해요.</p>
      <div className="divide-y divide-line">
        <div className="pb-2">
          <div className="mb-1 text-xs font-medium text-muted">메뉴 유형</div>
          {MENU_TYPES.map((t) => (
            <Row key={t} label={t} value={p.menu[t] ?? 0} onChange={(v) => setP({ ...p, menu: { ...p.menu, [t]: v } })} />
          ))}
        </div>
        <div className="py-2">
          <Row label="테마DAY" value={p.theme} onChange={(v) => setP({ ...p, theme: v })} />
        </div>
        <div className="py-2">
          <div className="mb-1 text-xs font-medium text-muted">날씨 (맑음은 0)</div>
          {(["흐림", "비", "눈"] as const).map((w) => (
            <Row key={w} label={w} value={p.weather[w]} onChange={(v) => setP({ ...p, weather: { ...p.weather, [w]: v } })} />
          ))}
        </div>
        <div className="pt-2">
          <div className="mb-1 text-xs font-medium text-muted">달력 패턴</div>
          {FLAG_KEYS.map((k) => (
            <Row key={k} label={FLAG_LABELS[k]} value={p.flags[k]} onChange={(v) => setP({ ...p, flags: { ...p.flags, [k]: v } })} />
          ))}
        </div>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <button
          className={btn.primary}
          disabled={pending}
          onClick={() => run(() => updateSettings("priors", { ...p, weather: { ...p.weather, 맑음: 0 } }))}
        >
          {pending ? "저장·재계산 중…" : "저장하고 다시 계산"}
        </button>
        <Msg />
      </div>
    </Card>
  );
}

function MarginCard({ settings }: { settings: AppSettings }) {
  const [g, setG] = useState(String(settings.guarantee_min));
  const [z, setZ] = useState(String(settings.margin.z));
  const [min, setMin] = useState(String(settings.margin.min));
  const [kd, setKd] = useState(String(settings.shrinkage.dow));
  const [ko, setKo] = useState(String(settings.shrinkage.other));
  const { pending, run, Msg } = useAction();
  return (
    <Card>
      <CardTitle>보장인원과 여유분</CardTitle>
      <div className="space-y-2 text-sm">
        <label className="flex items-center justify-between">
          <span>급식 계약 보장인원</span>
          <input type="number" value={g} onChange={(e) => setG(e.target.value)} className={small} />
        </label>
        <label className="flex items-center justify-between">
          <span>
            여유분 z <span className="text-xs text-muted">(1.28 = 10번 중 9번)</span>
          </span>
          <input type="number" step="0.01" value={z} onChange={(e) => setZ(e.target.value)} className={small} />
        </label>
        <label className="flex items-center justify-between">
          <span>최소 여유분 (명)</span>
          <input type="number" value={min} onChange={(e) => setMin(e.target.value)} className={small} />
        </label>
        <label className="flex items-center justify-between">
          <span>
            축소 강도 k <span className="text-xs text-muted">(요일 / 그 외)</span>
          </span>
          <span className="flex gap-1">
            <input type="number" step="0.5" value={kd} onChange={(e) => setKd(e.target.value)} className={`${small} w-16`} />
            <input type="number" step="0.5" value={ko} onChange={(e) => setKo(e.target.value)} className={`${small} w-16`} />
          </span>
        </label>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <button
          className={btn.primary}
          disabled={pending}
          onClick={() =>
            run(async () => {
              for (const [key, value] of [
                ["guarantee_min", Number(g)],
                ["margin", { z: Number(z), min: Number(min) }],
                ["shrinkage", { dow: Number(kd), other: Number(ko) }],
              ] as const) {
                const r = await updateSettings(key, value);
                if (!r.ok) return r;
              }
              return { ok: true, message: "저장했어요" };
            })
          }
        >
          {pending ? "저장 중…" : "저장"}
        </button>
        <Msg />
      </div>
    </Card>
  );
}

function PeriodCard({ settings }: { settings: AppSettings }) {
  const [ss, setSs] = useState(settings.summer_vacation.start);
  const [se, setSe] = useState(settings.summer_vacation.end);
  const [ye, setYe] = useState(settings.year_end.start);
  const { pending, run, Msg } = useAction();
  const mmdd = "w-20 rounded-lg border border-line bg-surface px-2 py-1.5 text-center text-sm text-ink tabular";
  return (
    <Card>
      <CardTitle>기간</CardTitle>
      <div className="space-y-2 text-sm">
        <label className="flex items-center justify-between">
          <span>여름 휴가철 (MM-DD)</span>
          <span className="flex items-center gap-1">
            <input value={ss} onChange={(e) => setSs(e.target.value)} className={mmdd} placeholder="07-25" />~
            <input value={se} onChange={(e) => setSe(e.target.value)} className={mmdd} placeholder="08-14" />
          </span>
        </label>
        <label className="flex items-center justify-between">
          <span>연말 기간 시작 (12/31까지)</span>
          <input value={ye} onChange={(e) => setYe(e.target.value)} className={mmdd} placeholder="12-22" />
        </label>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <button
          className={btn.primary}
          disabled={pending}
          onClick={() =>
            run(async () => {
              const a = await updateSettings("summer_vacation", { start: ss, end: se });
              if (!a.ok) return a;
              return updateSettings("year_end", { start: ye });
            })
          }
        >
          {pending ? "달력·예측 재계산 중…" : "저장"}
        </button>
        <Msg />
      </div>
    </Card>
  );
}

function RecomputeCard() {
  const { pending, run, Msg } = useAction();
  return (
    <Card>
      <CardTitle>예측 다시 계산</CardTitle>
      <p className="mb-3 text-sm text-muted">모든 실적으로 다시 학습하고 오늘부터 메뉴가 있는 날까지 예측을 새로 만들어요.</p>
      <div className="flex items-center gap-3">
        <button className={btn.secondary} disabled={pending} onClick={() => run(recomputeNow)}>
          {pending ? "계산 중…" : "지금 예측 다시 계산"}
        </button>
        <Msg />
      </div>
    </Card>
  );
}

function UsersCard({ users }: { users: User[] }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const create = useAction();
  const toggle = useAction();
  return (
    <Card>
      <CardTitle>사용자</CardTitle>
      <ul className="mb-4 divide-y divide-line text-sm">
        {users.map((u) => (
          <li key={u.id} className="flex items-center justify-between gap-2 py-2">
            <span className={u.active ? "" : "text-muted line-through"}>
              {u.name} <span className="text-xs text-muted">{u.email}</span>
            </span>
            <span className="flex items-center gap-2">
              <Badge tone={u.role === "admin" ? "navy" : "muted"}>{u.role === "admin" ? "관리자" : "영양사"}</Badge>
              {u.role !== "admin" && (
                <button
                  className={btn.ghost}
                  disabled={toggle.pending}
                  onClick={() => toggle.run(() => setUserActive(u.id, !u.active))}
                >
                  {u.active ? "비활성화" : "활성화"}
                </button>
              )}
            </span>
          </li>
        ))}
      </ul>
      <toggle.Msg />
      <form
        className="space-y-2 rounded-xl bg-surface-2 p-3"
        onSubmit={(e) => {
          e.preventDefault();
          create.run(
            () => createStaffUser({ name, email, tempPassword: pw }),
            () => {
              setName("");
              setEmail("");
              setPw("");
            },
          );
        }}
      >
        <div className="text-xs font-medium text-muted">영양사 계정 만들기</div>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="이름" className={input} />
        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="이메일" type="email" className={input} />
        <input
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          placeholder="임시 비밀번호 (8자 이상)"
          type="text"
          autoComplete="off"
          className={input}
        />
        <div className="flex items-center gap-3">
          <button className={btn.primary} disabled={create.pending}>
            {create.pending ? "만드는 중…" : "계정 만들기"}
          </button>
          <create.Msg />
        </div>
      </form>
    </Card>
  );
}

function ClosedCard({ closedDays, today }: { closedDays: { date: string; note: string | null }[]; today: string }) {
  const [date, setDate] = useState(today);
  const [note, setNote] = useState("");
  const { pending, run, Msg } = useAction();
  return (
    <Card>
      <CardTitle>사내 휴무일</CardTitle>
      <p className="mb-3 text-xs text-muted">추가·삭제하면 달력 플래그와 예측을 다시 계산해요.</p>
      <div className="flex flex-wrap gap-2">
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={`${input} w-auto`} />
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="메모 (예: 창립기념일)" className={`${input} min-w-0 flex-1`} />
        <button
          className={btn.primary}
          disabled={pending || !date}
          onClick={() => run(() => setCompanyClosed({ date, closed: true, note }), () => setNote(""))}
        >
          추가
        </button>
      </div>
      <div className="mt-2">
        <Msg />
      </div>
      <ul className="mt-3 divide-y divide-line text-sm">
        {closedDays.length === 0 && <li className="py-2 text-muted">지정된 휴무일이 없어요</li>}
        {closedDays.map((d) => (
          <li key={d.date} className="flex items-center justify-between py-2">
            <span>
              <span className="tabular">{shortLabel(d.date)}</span> <span className="text-muted">{d.date.slice(0, 4)}</span>{" "}
              {d.note}
            </span>
            <button className={btn.ghost} disabled={pending} onClick={() => run(() => setCompanyClosed({ date: d.date, closed: false }))}>
              삭제
            </button>
          </li>
        ))}
      </ul>
    </Card>
  );
}
