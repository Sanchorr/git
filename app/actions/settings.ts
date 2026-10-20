"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertAdmin } from "@/lib/auth";
import { addDays, addMonths, monthBounds, todayKST } from "@/lib/dates";
import { recalcCalendarFlags } from "@/lib/jobs";
import { isoDate } from "@/lib/menus/schema";
import { FLAG_KEYS, MENU_TYPES } from "@/lib/model/types";
import { recomputeFromToday } from "@/lib/recompute";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

type Result = { ok: true; message: string } | { ok: false; message: string };
const fail = (e: unknown): Result => ({ ok: false, message: e instanceof Error ? e.message : String(e) });

const num = z.coerce.number().finite();
const mmdd = z.string().regex(/^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/, "MM-DD 형식");

const settingSchemas = {
  guarantee_min: z.coerce.number().int().min(0),
  margin: z.object({ z: num.min(0), min: z.coerce.number().int().min(0) }),
  shrinkage: z.object({ dow: num.min(0), other: num.min(0) }),
  summer_vacation: z.object({ start: mmdd, end: mmdd }),
  year_end: z.object({ start: mmdd }),
  priors: z.object({
    menu: z.record(z.enum(MENU_TYPES), num),
    theme: num,
    weather: z.object({ 맑음: num, 흐림: num, 비: num, 눈: num }),
    flags: z.object(Object.fromEntries(FLAG_KEYS.map((k) => [k, num])) as Record<(typeof FLAG_KEYS)[number], typeof num>),
  }),
} as const;

type SettingKey = keyof typeof settingSchemas;

/** 설정 1건 갱신 후 필요 시 재계산 */
export async function updateSettings(key: SettingKey, value: unknown): Promise<Result> {
  try {
    await assertAdmin();
    const schema = settingSchemas[key];
    if (!schema) return { ok: false, message: "알 수 없는 설정이에요" };
    const parsed = schema.safeParse(value);
    if (!parsed.success) return { ok: false, message: `값을 확인해 주세요: ${parsed.error.issues[0]?.message}` };

    const supabase = await createClient();
    const { error } = await supabase
      .from("settings")
      .upsert({ key, value: parsed.data, updated_at: new Date().toISOString() }, { onConflict: "key" });
    if (error) return { ok: false, message: error.message };

    const db = createAdminClient();
    if (key === "summer_vacation" || key === "year_end") {
      const today = todayKST();
      await recalcCalendarFlags(db, addDays(today, -400), monthBounds(addMonths(today.slice(0, 7), 3)).to);
    }
    if (key !== "guarantee_min") await recomputeFromToday(db);
    revalidatePath("/", "layout");
    return { ok: true, message: "저장했어요" };
  } catch (e) {
    return fail(e);
  }
}

export async function recomputeNow(): Promise<Result> {
  try {
    await assertAdmin();
    const r = await recomputeFromToday(createAdminClient());
    revalidatePath("/", "layout");
    return { ok: true, message: `${r.predicted}일 예측을 다시 계산했어요 (학습 ${r.nDays}일)` };
  } catch (e) {
    return fail(e);
  }
}

const closedInput = z.object({ date: isoDate, closed: z.boolean(), note: z.string().max(200).nullable().optional() });

export async function setCompanyClosed(raw: z.input<typeof closedInput>): Promise<Result> {
  try {
    await assertAdmin();
    const v = closedInput.parse(raw);
    const db = createAdminClient();
    const { data: row } = await db.from("calendar_days").select("date").eq("date", v.date).maybeSingle();
    if (row) {
      const supabase = await createClient();
      const { error } = await supabase
        .from("calendar_days")
        .update({ company_closed: v.closed, note: v.closed ? v.note?.trim() || "사내 휴무" : null })
        .eq("date", v.date);
      if (error) return { ok: false, message: error.message };
    } else {
      // 아직 달력에 없는 날짜: 서비스 롤로 행을 만든다
      const { error } = await db.from("calendar_days").insert({
        date: v.date,
        is_workday: !v.closed,
        company_closed: v.closed,
        note: v.closed ? v.note?.trim() || "사내 휴무" : null,
      });
      if (error) return { ok: false, message: error.message };
    }
    await recalcCalendarFlags(db, addDays(v.date, -20), addDays(v.date, 20));
    await recomputeFromToday(db);
    revalidatePath("/", "layout");
    return { ok: true, message: v.closed ? "사내 휴무일로 지정했어요" : "사내 휴무를 해제했어요" };
  } catch (e) {
    return fail(e);
  }
}

const staffInput = z.object({
  name: z.string().trim().min(1, "이름을 입력해 주세요"),
  email: z.string().trim().email("이메일 형식이 아니에요"),
  tempPassword: z.string().min(8, "임시 비밀번호는 8자 이상"),
});

export async function createStaffUser(raw: z.input<typeof staffInput>): Promise<Result> {
  try {
    await assertAdmin();
    const parsed = staffInput.safeParse(raw);
    if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "입력값을 확인해 주세요" };
    const v = parsed.data;
    const db = createAdminClient();
    const { data, error } = await db.auth.admin.createUser({
      email: v.email,
      password: v.tempPassword,
      email_confirm: true,
      user_metadata: { name: v.name },
    });
    if (error || !data.user) return { ok: false, message: `계정을 만들지 못했어요: ${error?.message}` };
    const { error: pErr } = await db
      .from("profiles")
      .insert({ id: data.user.id, name: v.name, email: v.email, role: "nutritionist" });
    if (pErr) {
      await db.auth.admin.deleteUser(data.user.id);
      return { ok: false, message: pErr.message };
    }
    revalidatePath("/settings");
    return { ok: true, message: `${v.name} 님 계정을 만들었어요` };
  } catch (e) {
    return fail(e);
  }
}

export async function setUserActive(userId: string, active: boolean): Promise<Result> {
  try {
    const me = await assertAdmin();
    if (me.id === userId) return { ok: false, message: "본인 계정은 비활성화할 수 없어요" };
    const db = createAdminClient();
    const { error } = await db.from("profiles").update({ active }).eq("id", userId);
    if (error) return { ok: false, message: error.message };
    // 로그인도 막는다
    await db.auth.admin.updateUserById(userId, { ban_duration: active ? "none" : "876000h" });
    revalidatePath("/settings");
    return { ok: true, message: active ? "다시 활성화했어요" : "비활성화했어요" };
  } catch (e) {
    return fail(e);
  }
}
