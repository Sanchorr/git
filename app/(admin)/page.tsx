import Link from "next/link";
import { addDays, addMonths, mondayOf, monthBounds, shortLabel, todayKST } from "@/lib/dates";
import {
  latestByTarget,
  latestForecasts,
  loadSettings,
  twoDayAhead,
  type CalendarDay,
  type ForecastRow,
  type MealCountRow,
  type MenuRow,
  type PredictionRow,
} from "@/lib/db";
import { createClient } from "@/lib/supabase/server";
import {
  buildAlerts,
  buildWeekRows,
  makeIsWorkday,
  nthWorkdayAfter,
  prevWorkday,
  weekButtonLabel,
  weekStarts,
} from "@/lib/views/weekly";
import { Badge, btn, Card, CardTitle, PageHeader } from "@/components/ui";
import D2Card from "@/components/D2Card";
import WeatherCell from "@/components/WeatherCell";

export const dynamic = "force-dynamic";

export default async function WeeklyPage({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  const sp = await searchParams;
  const supabase = await createClient();
  const today = todayKST();
  const thisMonday = mondayOf(today);

  const { data: lastMenu } = await supabase.from("menus").select("date").order("date", { ascending: false }).limit(1);
  const lastMenuDate: string | null = lastMenu?.[0]?.date ?? null;

  if (!lastMenuDate) {
    return (
      <>
        <PageHeader title="주간 예측" />
        <Card className="py-14 text-center">
          <p className="text-lg font-semibold text-ink">다음 달 식단을 올리면 예측이 시작돼요</p>
          <p className="mt-1 text-sm text-muted">식단표 사진에서 날짜별 메인 메뉴를 읽어 예측을 만듭니다.</p>
          <Link href="/menus/upload" className={`${btn.primary} mt-5`}>
            식단 업로드
          </Link>
        </Card>
      </>
    );
  }

  const weeks = weekStarts(today, lastMenuDate);
  const monday = sp.week && weeks.includes(sp.week) ? sp.week : weeks[0];
  const rangeFrom = addDays(thisMonday, -14);
  const rangeTo = addDays(weeks[weeks.length - 1], 13);

  const [settings, calRes, menuRes, predRes, countRes, fcRes] = await Promise.all([
    loadSettings(supabase),
    supabase.from("calendar_days").select("*").gte("date", rangeFrom).lte("date", rangeTo),
    supabase.from("menus").select("*").gte("date", rangeFrom).lte("date", rangeTo),
    supabase.from("predictions").select("*").gte("target_date", rangeFrom).lte("target_date", rangeTo).limit(5000),
    supabase.from("meal_counts").select("*").gte("date", rangeFrom).lte("date", rangeTo),
    supabase
      .from("weather_forecasts")
      .select("target_date, source, issued_at, category, pop, rain_mm, snow_cm, tmin, tmax")
      .gte("target_date", today)
      .lte("target_date", addDays(today, 11))
      .limit(2000),
  ]);

  const calendar = new Map(((calRes.data ?? []) as CalendarDay[]).map((c) => [c.date, c]));
  const menus = new Map(((menuRes.data ?? []) as MenuRow[]).map((m) => [m.date, m]));
  const predRows = (predRes.data ?? []) as PredictionRow[];
  const latest = latestByTarget(predRows);
  const ahead2 = twoDayAhead(predRows);
  const counts = new Map(((countRes.data ?? []) as MealCountRow[]).map((c) => [c.date, c]));
  const forecasts = latestForecasts((fcRes.data ?? []) as ForecastRow[]);
  const isWorkday = makeIsWorkday(calendar);

  const d2 = nthWorkdayAfter(today, 2, isWorkday);
  const d2Pred = latest.get(d2) ?? null;
  const d2Menu = menus.get(d2) ?? null;

  const { rows, totals } = buildWeekRows({ monday, today, d2, calendar, menus, predictions: latest, counts, forecasts });

  // 이번 주 요약
  const thisWeek = monday === thisMonday ? { rows, totals } : buildWeekRows({ monday: thisMonday, today, d2, calendar, menus, predictions: latest, counts, forecasts });
  const errs = thisWeek.rows
    .filter((r) => r.actual !== null)
    .map((r) => {
      const p = ahead2.get(r.date) ?? latest.get(r.date);
      return p ? Math.abs(r.actual! - Number(p.expected)) : null;
    })
    .filter((e): e is number => e !== null);
  const meanErr = errs.length ? errs.reduce((s, e) => s + e, 0) / errs.length : null;

  // 알림
  const nextMonth = addMonths(today.slice(0, 7), 1);
  const nb = monthBounds(nextMonth);
  const { count: nextMonthMenus } = await supabase
    .from("menus")
    .select("date", { count: "exact", head: true })
    .gte("date", nb.from)
    .lte("date", nb.to);
  const pw = prevWorkday(today, isWorkday);
  const upcoming = [...latest.values()].filter((p) => p.target_date >= today).sort((a, b) => a.target_date.localeCompare(b.target_date));
  const alerts = buildAlerts({
    today,
    isWorkday,
    upcoming,
    forecasts,
    guarantee: settings.guarantee_min,
    hasNextMonthMenus: (nextMonthMenus ?? 0) > 0,
    prevWorkdayHasCount: !menus.has(pw) || counts.has(pw),
  });

  const bases = new Set(rows.map((r) => r.weather?.basis).filter(Boolean));

  return (
    <>
      <PageHeader
        title="주간 예측"
        sub={`오늘 ${shortLabel(today)} · 권장 준비량은 10번 중 9번 실제 인원이 그 안에 들도록 잡은 값이에요`}
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <D2Card date={d2} prediction={d2Pred} menu={d2Menu} guarantee={settings.guarantee_min} />

        <div className="flex flex-col gap-4">
          <Card>
            <CardTitle>이번 주 요약</CardTitle>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-surface-2 p-3">
                <div className="text-xs text-muted">주간 예상 합계</div>
                <div className="tabular mt-1 text-2xl font-bold">
                  {thisWeek.totals.expected.toLocaleString()}
                  <span className="ml-0.5 text-sm font-medium text-muted">명</span>
                </div>
              </div>
              <div className="rounded-xl bg-surface-2 p-3">
                <div className="text-xs text-muted">입력된 실적 평균 오차</div>
                <div className="tabular mt-1 text-2xl font-bold">
                  {meanErr === null ? "—" : `±${meanErr.toFixed(1)}`}
                  {meanErr !== null && <span className="ml-0.5 text-sm font-medium text-muted">명</span>}
                </div>
                <div className="text-xs text-muted">{errs.length}일 입력</div>
              </div>
            </div>
          </Card>

          {alerts.length > 0 && (
            <Card>
              <CardTitle>알림</CardTitle>
              <ul className="space-y-2">
                {alerts.map((a, i) => (
                  <li
                    key={i}
                    className={`flex gap-2 rounded-xl px-3 py-2 text-sm ${a.tone === "rain" ? "bg-rain-soft text-rain" : "bg-warn-soft text-warn"}`}
                  >
                    <span aria-hidden>{a.tone === "rain" ? "☔" : "⚠️"}</span>
                    <span className="text-ink">{a.text}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>

      <Card className="mt-4">
        <CardTitle
          aside={
            <div className="flex flex-wrap gap-1">
              {weeks.map((w) => (
                <Link
                  key={w}
                  href={w === weeks[0] ? "/" : `/?week=${w}`}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                    w === monday ? "bg-navy text-white dark:text-[#0b1320]" : "bg-surface-2 text-muted hover:text-ink"
                  }`}
                >
                  {weekButtonLabel(w, thisMonday)}
                </Link>
              ))}
            </div>
          }
        >
          주간 예측표
        </CardTitle>

        <div className="-mx-5 overflow-x-auto px-5">
          <table className="tabular w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-muted">
                <th className="py-2 pr-3 font-medium">날짜</th>
                <th className="py-2 pr-3 font-medium">메인 메뉴</th>
                <th className="py-2 pr-3 font-medium">날씨</th>
                <th className="py-2 pr-3 text-right font-medium">예상</th>
                <th className="py-2 pr-3 text-right font-medium">권장 준비량</th>
                <th className="py-2 pr-3 text-right font-medium">실적</th>
                <th className="py-2 text-right font-medium">오차</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.date}
                  className={`border-b border-line/70 ${r.isD2 ? "bg-flame-soft" : r.isToday ? "bg-surface-2" : ""} ${
                    r.workday ? "" : "text-muted"
                  }`}
                >
                  <td className="whitespace-nowrap py-2.5 pr-3 font-medium">
                    {r.label}
                    {r.isToday && (
                      <span className="ml-1">
                        <Badge>오늘</Badge>
                      </span>
                    )}
                    {r.isD2 && (
                      <span className="ml-1">
                        <Badge tone="navy">D+2</Badge>
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 pr-3">
                    {!r.workday ? (
                      <span>{r.holidayName ?? "휴무"}</span>
                    ) : r.menu ? (
                      <span className="flex flex-wrap items-center gap-1">
                        {r.menu.main_dish}
                        <span className="text-xs text-muted">· {r.menu.menu_type}</span>
                        {r.menu.is_theme_day && <Badge tone="warn">{r.menu.theme_label ?? "테마DAY"}</Badge>}
                      </span>
                    ) : (
                      <span className="text-muted">메뉴 없음</span>
                    )}
                  </td>
                  <td className="py-2.5 pr-3">{r.workday && <WeatherCell weather={r.weather} />}</td>
                  <td className="py-2.5 pr-3 text-right">{r.expected ?? "—"}</td>
                  <td className="py-2.5 pr-3 text-right font-semibold text-navy">{r.recommended ?? "—"}</td>
                  <td className="py-2.5 pr-3 text-right">{r.actual ?? "—"}</td>
                  <td
                    className={`py-2.5 text-right ${
                      r.error === null ? "" : r.recommended !== null && r.actual! > r.recommended ? "font-semibold text-bad" : ""
                    }`}
                  >
                    {r.error === null ? "—" : r.error > 0 ? `+${r.error}` : r.error === 0 ? "0" : `−${Math.abs(r.error)}`}
                  </td>
                </tr>
              ))}
              <tr className="font-semibold">
                <td className="py-2.5 pr-3">합계</td>
                <td />
                <td />
                <td className="py-2.5 pr-3 text-right">{totals.expected}</td>
                <td className="py-2.5 pr-3 text-right text-navy">{totals.recommended}</td>
                <td className="py-2.5 pr-3 text-right">{totals.actualDays ? totals.actual : "—"}</td>
                <td className="py-2.5 text-right">
                  {totals.actualDays ? (totals.error > 0 ? `+${totals.error}` : totals.error === 0 ? "0" : `−${Math.abs(totals.error)}`) : "—"}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <p className="mt-3 text-xs leading-relaxed text-muted">
          날씨 근거 — <b>단기</b>: 기상청 단기예보(약 3일 뒤까지, 06~13시 최대 강수확률)로 반영.{" "}
          <b>중기</b>: 중기예보(4~10일 뒤 오전 예보)로 반영. <b>미반영</b>: 예보가 아직 없어 그 달 과거 비·눈 비율로
          평균을 잡고 불확실성만큼 권장량을 늘렸어요.
          {bases.size > 0 && ` 이 주는 ${[...bases].map((b) => (b === "short" ? "단기" : b === "mid" ? "중기" : "미반영")).join("·")} 근거를 썼어요.`}
        </p>
      </Card>
    </>
  );
}
