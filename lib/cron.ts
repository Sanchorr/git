import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { JobResult } from "@/lib/jobs";
import type { SupabaseClient } from "@supabase/supabase-js";

/** CRON_SECRET 확인 → 작업 실행 → 처리 건수·오류를 JSON으로 */
export function cronHandler(name: string, job: (db: SupabaseClient) => Promise<JobResult | JobResult[]>) {
  return async function GET(req: NextRequest) {
    const secret = process.env.CRON_SECRET;
    if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    const started = Date.now();
    try {
      const result = await job(createAdminClient());
      const body = { ok: true, job: name, ms: Date.now() - started, result };
      console.log(JSON.stringify(body));
      return NextResponse.json(body);
    } catch (e) {
      const body = { ok: false, job: name, ms: Date.now() - started, error: e instanceof Error ? e.message : String(e) };
      console.log(JSON.stringify(body));
      return NextResponse.json(body, { status: 500 });
    }
  };
}
