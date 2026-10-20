"use server";

import { revalidatePath } from "next/cache";
import { assertStaff } from "@/lib/auth";
import { monthBounds } from "@/lib/dates";
import { saveMenusInput, type SaveMenusInput } from "@/lib/menus/schema";
import { recomputePredictions } from "@/lib/recompute";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type SaveMenusResult = { ok: true; saved: number; predicted: number } | { ok: false; message: string };

export async function saveMenus(raw: SaveMenusInput): Promise<SaveMenusResult> {
  let profile;
  try {
    profile = await assertStaff();
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
  const parsed = saveMenusInput.safeParse(raw);
  if (!parsed.success) return { ok: false, message: "저장할 메뉴를 확인해 주세요" };
  const { month, days } = parsed.data;
  const bounds = monthBounds(month);
  const rows = days
    .filter((d) => d.date >= bounds.from && d.date <= bounds.to)
    .map((d) => ({
      date: d.date,
      main_dish: d.main_dish.trim(),
      sides: d.sides,
      menu_type: d.menu_type,
      is_theme_day: d.is_theme_day,
      theme_label: d.is_theme_day ? d.theme_label?.trim() || null : null,
      photo_path: d.photo_path ?? null,
      updated_by: profile.id,
      updated_at: new Date().toISOString(),
    }));
  if (rows.length === 0) return { ok: false, message: "선택한 달의 메뉴가 없어요" };

  const supabase = await createClient();
  const { error } = await supabase.from("menus").upsert(rows, { onConflict: "date" });
  if (error) return { ok: false, message: `저장하지 못했어요: ${error.message}` };

  try {
    const r = await recomputePredictions(createAdminClient(), bounds);
    revalidatePath("/", "layout");
    return { ok: true, saved: rows.length, predicted: r.predicted };
  } catch (e) {
    return { ok: false, message: `메뉴는 저장했지만 예측 계산에 실패했어요: ${(e as Error).message}` };
  }
}

/** 확인 표에서 '기존 값 → 새 값'을 보여 주기 위한 기존 메뉴 */
export async function getExistingMenus(month: string) {
  await assertStaff();
  const { from, to } = monthBounds(month);
  const supabase = await createClient();
  const { data } = await supabase
    .from("menus")
    .select("date, main_dish, menu_type, is_theme_day, theme_label")
    .gte("date", from)
    .lte("date", to);
  return data ?? [];
}

/** 그 달과 다음 달의 패턴 일정 */
export async function getPatternDays(month: string) {
  await assertStaff();
  const { from } = monthBounds(month);
  const [y, m] = month.split("-").map(Number);
  const next = new Date(Date.UTC(y, m + 1, 0)).toISOString().slice(0, 10);
  const supabase = await createClient();
  const { data } = await supabase
    .from("calendar_days")
    .select("*")
    .gte("date", from)
    .lte("date", next)
    .or("holiday_name.not.is.null,holiday_adjacent.eq.true,bridge_day.eq.true,year_end.eq.true,summer_vacation.eq.true,company_closed.eq.true")
    .order("date");
  return data ?? [];
}
