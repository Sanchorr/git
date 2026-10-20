import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type Role = "admin" | "nutritionist";

export interface SessionProfile {
  id: string;
  name: string;
  role: Role;
}

export async function getProfile(): Promise<SessionProfile | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from("profiles").select("id, name, role, active").eq("id", user.id).maybeSingle();
  if (!data || !data.active) return null;
  return { id: data.id, name: data.name, role: data.role as Role };
}

/** 페이지용: 로그인 안 했으면 /login, 관리자가 아니면 /input */
export async function requireAdminPage(): Promise<SessionProfile> {
  const p = await getProfile();
  if (!p) redirect("/login");
  if (p.role !== "admin") redirect("/input");
  return p;
}

export async function requireStaffPage(): Promise<SessionProfile> {
  const p = await getProfile();
  if (!p) redirect("/login");
  return p;
}

/** 서버 액션·API용: 권한이 없으면 예외 */
export async function assertAdmin(): Promise<SessionProfile> {
  const p = await getProfile();
  if (!p || p.role !== "admin") throw new Error("관리자만 할 수 있어요");
  return p;
}

export async function assertStaff(): Promise<SessionProfile> {
  const p = await getProfile();
  if (!p) throw new Error("로그인이 필요해요");
  return p;
}
