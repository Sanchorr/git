import Link from "next/link";
import { requireStaffPage } from "@/lib/auth";
import { addDays, todayKST } from "@/lib/dates";
import type { MealCountRow } from "@/lib/db";
import { isoDate } from "@/lib/menus/schema";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/actions/auth";
import InputForm from "./InputForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "식수 입력 · 좌동사옥 식수 예측" };

export default async function InputPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const profile = await requireStaffPage();
  const sp = await searchParams;
  const today = todayKST();
  const minDate = profile.role === "admin" ? null : addDays(today, -7);
  let date = isoDate.safeParse(sp.date).success ? sp.date! : today;
  if (date > today) date = today;
  if (minDate && date < minDate) date = minDate;

  const supabase = await createClient();
  const [menuRes, predRes, countRes, recentRes, predRecentRes] = await Promise.all([
    supabase.from("menus").select("main_dish, menu_type, theme_label, is_theme_day").eq("date", date).maybeSingle(),
    supabase
      .from("predictions")
      .select("expected, recommended")
      .eq("target_date", date)
      .order("run_date", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.from("meal_counts").select("*").eq("date", date).maybeSingle(),
    supabase.from("meal_counts").select("date, regular_count").order("date", { ascending: false }).limit(5),
    supabase
      .from("predictions")
      .select("target_date, expected, run_date")
      .gte("target_date", addDays(today, -60))
      .lte("target_date", today)
      .order("run_date", { ascending: false })
      .limit(1000),
  ]);

  const latestExpected = new Map<string, number>();
  for (const p of predRecentRes.data ?? [])
    if (!latestExpected.has(p.target_date)) latestExpected.set(p.target_date, Math.round(Number(p.expected)));

  const recent = (recentRes.data ?? []).map((r) => ({
    date: r.date as string,
    actual: r.regular_count as number,
    expected: latestExpected.get(r.date) ?? null,
  }));

  return (
    <div className="mx-auto min-h-dvh max-w-md px-4 pb-6 pt-3">
      <header className="mb-3 flex items-center justify-between text-sm">
        <span className="font-bold text-ink">🍚 식수 입력</span>
        <div className="flex items-center gap-1 text-muted">
          <Link href="/" className="rounded-lg px-2 py-1 hover:bg-surface-2">
            주간 예측
          </Link>
          <span className="px-1">{profile.name} 님</span>
          <form action={signOut}>
            <button className="rounded-lg px-2 py-1 hover:bg-surface-2">로그아웃</button>
          </form>
        </div>
      </header>
      <InputForm
        key={date}
        date={date}
        today={today}
        minDate={minDate}
        menu={menuRes.data ?? null}
        prediction={predRes.data ? { expected: Math.round(Number(predRes.data.expected)), recommended: predRes.data.recommended } : null}
        existing={(countRes.data as MealCountRow | null) ?? null}
        recent={recent}
      />
    </div>
  );
}
