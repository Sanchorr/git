"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertStaff } from "@/lib/auth";
import { addDays, todayKST } from "@/lib/dates";
import { isoDate } from "@/lib/menus/schema";
import { createClient } from "@/lib/supabase/server";

const count = z.coerce.number().int().min(0);

const mealInput = z.object({
  date: isoDate,
  regular_count: count,
  takeout_count: count.nullable().optional(),
  result: z.enum(["부족", "적정", "남음"]).nullable().optional(),
  note: z.string().max(500).nullable().optional(),
});

export type SaveMealResult =
  | { ok: true; actual: number; expected: number | null; error: number | null }
  | { ok: false; message: string };

export async function saveMealCount(raw: z.input<typeof mealInput>): Promise<SaveMealResult> {
  let profile;
  try {
    profile = await assertStaff();
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
  const parsed = mealInput.safeParse(raw);
  if (!parsed.success) return { ok: false, message: "입력값을 확인해 주세요 (인원은 0 이상 정수)" };
  const v = parsed.data;

  const today = todayKST();
  if (v.date > today) return { ok: false, message: "앞으로의 날짜는 입력할 수 없어요" };
  if (profile.role !== "admin" && v.date < addDays(today, -7))
    return { ok: false, message: "최근 7일까지만 입력·수정할 수 있어요" };

  const supabase = await createClient();
  const { error } = await supabase.from("meal_counts").upsert(
    {
      date: v.date,
      regular_count: v.regular_count,
      takeout_count: v.takeout_count ?? null,
      result: v.result ?? null,
      note: v.note?.trim() || null,
      entered_by: profile.id,
      entered_at: new Date().toISOString(),
    },
    { onConflict: "date" },
  );
  if (error) return { ok: false, message: `저장하지 못했어요: ${error.message}` };

  const { data: pred } = await supabase
    .from("predictions")
    .select("expected")
    .eq("target_date", v.date)
    .order("run_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  const expected = pred ? Math.round(Number(pred.expected)) : null;

  revalidatePath("/input");
  revalidatePath("/");
  return { ok: true, actual: v.regular_count, expected, error: expected === null ? null : v.regular_count - expected };
}
