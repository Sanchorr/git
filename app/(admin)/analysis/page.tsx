import Link from "next/link";
import { addMonths, shortLabel, todayKST } from "@/lib/dates";
import {
  loadSettings,
  selectAll,
  twoDayAhead,
  type MealCountRow,
  type MenuRow,
  type ObservedRowDb,
  type PredictionRow,
} from "@/lib/db";
import type { ModelEffects } from "@/lib/model/types";
import { createClient } from "@/lib/supabase/server";
import { buildAnalysis, effectRows } from "@/lib/views/analysis";
import { Card, CardTitle, PageHeader, Stat, signed } from "@/components/ui";
import { DailyChart, DowChart } from "./Charts";

export const dynamic = "force-dynamic";

const PERIODS = { "3m": "최근 3개월", year: "올해", all: "전체" } as const;
type Period = keyof typeof PERIODS;

export default async function AnalysisPage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const sp = await searchParams;
  const period: Period = sp.period && sp.period in PERIODS ? (sp.period as Period) : "3m";
  const today = todayKST();
  const from =
    period === "3m" ? `${addMonths(today.slice(0, 7), -2)}-01` : period === "year" ? `${today.slice(0, 4)}-01-01` : "2000-01-01";

  const supabase = await createClient();
  const [settings, counts, menus, observed, preds, runRes] = await Promise.all([
    loadSettings(supabase),
    selectAll<MealCountRow>(() => supabase.from("meal_counts").select("*").gte("date", from).lte("date", today).order("date")),
    selectAll<MenuRow>(() => supabase.from("menus").select("date, main_dish, menu_type").gte("date", from).lte("date", today)),
    selectAll<ObservedRowDb>(() => supabase.from("weather_observed").select("*").gte("date", from).lte("date", today)),
    selectAll<PredictionRow>(() =>
      supabase
        .from("predictions")
        .select("target_date, run_date, lead_days, expected, recommended")
        .gte("target_date", from)
        .lte("target_date", today)
        .gte("lead_days", 2),
    ),
    supabase.from("model_runs").select("*").order("id", { ascending: false }).limit(1).maybeSingle(),
  ]);

  const a = buildAnalysis({
    counts,
    menus: new Map(menus.map((m) => [m.date, m])),
    observed: new Map(observed.map((o) => [o.date, o])),
    ahead2: twoDayAhead(preds),
    guarantee: settings.guarantee_min,
  });
  const run = runRes.data as { run_at: string; n_days: number; overall: number; sigma: number; effects: ModelEffects } | null;
  const effects = run ? effectRows(run.effects) : [];

  return (
    <>
      <PageHeader
        title="분석"
        actions={
          <div className="flex gap-1">
            {(Object.keys(PERIODS) as Period[]).map((p) => (
              <Link
                key={p}
                href={p === "3m" ? "/analysis" : `/analysis?period=${p}`}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                  p === period ? "bg-navy text-white dark:text-[#0b1320]" : "bg-surface-2 text-muted hover:text-ink"
                }`}
              >
                {PERIODS[p]}
              </Link>
            ))}
          </div>
        }
      />

      {a.missingObserved > 0 && (
        <p className="mb-4 rounded-xl bg-warn-soft px-4 py-2 text-sm text-ink">
          ⚠️ 실적이 있는 날 중 {a.missingObserved}일은 관측 날씨가 비어 있어 날씨 효과 학습에서 빠졌어요.
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="평균 배식 인원" value={a.avg === null ? "—" : `${a.avg.toFixed(1)}명`} sub={`${a.n}일`} />
        <Stat label="최대 · 최소" value={a.max === null ? "—" : `${a.max} · ${a.min}`} sub="명" />
        <Stat
          label={`보장인원(${settings.guarantee_min}) 미달일`}
          value={`${a.belowGuarantee.length}일`}
          sub="총식수(일반식+간편식) 기준"
        />
        <Stat
          label="2일 전 예측 평균 오차"
          value={a.meanAbsErr === null ? "—" : `±${a.meanAbsErr.toFixed(1)}명`}
          sub={`${a.errDays}일 비교`}
        />
      </div>

      <Card className="mt-4">
        <CardTitle aside={<span className="text-xs text-muted">금요일 점은 주황색</span>}>일별 배식 인원</CardTitle>
        {a.points.length ? (
          <DailyChart data={a.points} guarantee={settings.guarantee_min} />
        ) : (
          <p className="py-10 text-center text-sm text-muted">이 기간에 실적이 없어요</p>
        )}
      </Card>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardTitle>요일별 평균</CardTitle>
          <DowChart data={a.byDow} />
        </Card>

        <Card>
          <CardTitle>정확도</CardTitle>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-surface-2 p-3">
              <div className="text-xs text-muted">2일 전 예측 평균 오차</div>
              <div className="tabular mt-1 text-xl font-bold">{a.meanAbsErr === null ? "—" : `±${a.meanAbsErr.toFixed(1)}명`}</div>
            </div>
            <div className="rounded-xl bg-surface-2 p-3">
              <div className="text-xs text-muted">실제가 권장량을 넘은 날</div>
              <div className="tabular mt-1 text-xl font-bold">
                {a.overRecommended.length}일
                {a.errDays > 0 && (
                  <span className="ml-1 text-sm font-medium text-muted">
                    / {a.errDays}일 ({Math.round((a.overRecommended.length / a.errDays) * 100)}%)
                  </span>
                )}
              </div>
            </div>
          </div>
          {a.overRecommended.length > 0 && (
            <ul className="tabular mt-3 divide-y divide-line text-sm">
              {a.overRecommended.map((p) => (
                <li key={p.date} className="flex justify-between py-1.5">
                  <span>
                    {shortLabel(p.date)} <span className="text-muted">{p.menu}</span>
                  </span>
                  <span>
                    실제 <b className="text-bad">{p.actual}</b> · 권장 {p.recommended}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card className="mt-4">
        <CardTitle
          aside={
            run && (
              <span className="text-xs text-muted">
                최근 학습 {run.n_days}일 · 평균 {Number(run.overall).toFixed(1)}명 · σ {Number(run.sigma).toFixed(1)}
              </span>
            )
          }
        >
          요인별 영향
        </CardTitle>
        {effects.length === 0 ? (
          <p className="text-sm text-muted">아직 학습 결과가 없어요</p>
        ) : (
          <div className="-mx-5 overflow-x-auto px-5">
            <table className="tabular w-full min-w-[480px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-muted">
                  <th className="py-2 pr-3 font-medium">구분</th>
                  <th className="py-2 pr-3 font-medium">요인</th>
                  <th className="py-2 pr-3 text-right font-medium">효과</th>
                  <th className="py-2 text-right font-medium">근거 일수</th>
                </tr>
              </thead>
              <tbody>
                {effects.map((e) => (
                  <tr key={`${e.group}-${e.label}`} className="border-b border-line/70">
                    <td className="py-2 pr-3 text-muted">{e.group}</td>
                    <td className="py-2 pr-3">{e.label}</td>
                    <td className={`py-2 pr-3 text-right font-semibold ${e.eff > 0.5 ? "text-flame" : e.eff < -0.5 ? "text-warn" : ""}`}>
                      {signed(Number(e.eff), 1)}명
                    </td>
                    <td className="py-2 text-right">
                      {e.n < 3 ? <span className="text-muted">기본값 보정 ({e.n}일)</span> : `${e.n}일`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
