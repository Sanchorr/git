import { todayKST } from "@/lib/dates";
import { loadSettings } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui";
import SettingsClient from "./SettingsClient";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const supabase = await createClient();
  const [settings, usersRes, closedRes] = await Promise.all([
    loadSettings(supabase),
    supabase.from("profiles").select("id, name, email, role, active, created_at").order("created_at"),
    supabase
      .from("calendar_days")
      .select("date, note")
      .eq("company_closed", true)
      .gte("date", `${Number(todayKST().slice(0, 4)) - 1}-01-01`)
      .order("date"),
  ]);
  return (
    <>
      <PageHeader title="설정" sub="계수와 기간을 바꾸면 오늘 이후 예측을 다시 계산해요." />
      <SettingsClient settings={settings} users={usersRes.data ?? []} closedDays={closedRes.data ?? []} today={todayKST()} />
    </>
  );
}
