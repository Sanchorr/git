"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function signIn(_: { message: string } | null, form: FormData): Promise<{ message: string } | null> {
  const email = String(form.get("email") ?? "").trim();
  const password = String(form.get("password") ?? "");
  if (!email || !password) return { message: "이메일과 비밀번호를 입력해 주세요" };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) return { message: "이메일 또는 비밀번호가 맞지 않아요" };

  const { data: profile } = await supabase.from("profiles").select("role, active").eq("id", data.user.id).maybeSingle();
  if (!profile || !profile.active) {
    await supabase.auth.signOut();
    return { message: "사용할 수 없는 계정이에요. 관리자에게 문의해 주세요" };
  }
  redirect(profile.role === "admin" ? "/" : "/input");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
