import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/** 서비스 롤 클라이언트 (RLS 우회). 크론·서버 작업·스크립트 전용. */
export function createAdminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase 서비스 롤 환경변수가 없습니다");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
