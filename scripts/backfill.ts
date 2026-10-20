// 시드 후 1회 실행 (정의서 8장): 관측 날씨·특일정보를 채운 뒤 예측을 계산한다.
// 사용법: npx tsx --env-file=.env.local scripts/backfill.ts
import { addDays, todayKST } from "@/lib/dates";
import { runCalendar, runWeatherObserved } from "@/lib/jobs";
import { recomputePredictions } from "@/lib/recompute";
import { createAdminClient } from "@/lib/supabase/admin";

async function main() {
  const db = createAdminClient();
  const now = new Date();
  const yesterday = addDays(todayKST(now), -1);

  // 공공데이터포털 키가 없으면 달력·관측 날씨는 건너뛰고 예측만 계산한다 (키를 넣고 다시 실행하면 채워진다)
  const hasKey = Boolean(process.env.KMA_SERVICE_KEY);
  if (!hasKey) console.warn("⚠ KMA_SERVICE_KEY가 없어 공휴일·관측 날씨는 건너뜁니다. 키를 넣은 뒤 다시 실행하세요.");

  // 1. 특일정보 2026~2027년
  const months: string[] = [];
  for (const y of [2026, 2027]) for (let m = 1; m <= 12; m++) months.push(`${y}-${String(m).padStart(2, "0")}`);
  if (hasKey) {
    const cal = await runCalendar(db, now, months);
    console.log(`달력: ${cal.count}일`, cal.errors.length ? cal.errors : "");
  }

  // 2. 관측 날씨 2026-09-01 ~ 어제 (한 번에 최대 약 1년씩)
  let from = "2026-09-01";
  while (hasKey && from <= yesterday) {
    const to = addDays(from, 300) < yesterday ? addDays(from, 300) : yesterday;
    const obs = await runWeatherObserved(db, now, { from, to });
    console.log(`관측 날씨 ${from}~${to}: ${obs.count}일`);
    from = addDays(to, 1);
  }

  // 3. 확인: 9/23, 9/28 연휴 앞뒤
  const { data: check } = await db
    .from("calendar_days")
    .select("date, holiday_adjacent")
    .in("date", ["2026-09-23", "2026-09-28"]);
  console.log("연휴 앞뒤 확인:", check);

  // 4. 예측: 시드 기간부터 메뉴가 있는 마지막 날까지
  const { data: last } = await db.from("menus").select("date").order("date", { ascending: false }).limit(1);
  const r = await recomputePredictions(db, { from: "2026-09-01", to: last?.[0]?.date ?? todayKST(now) }, now);
  console.log(`예측: ${r.predicted}일, 학습 ${r.nDays}일, model_run ${r.modelRunId}`);

  const { data: run } = await db.from("model_runs").select("*").eq("id", r.modelRunId).single();
  console.log(`μ=${Number(run.overall).toFixed(1)}, σ=${Number(run.sigma).toFixed(1)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
