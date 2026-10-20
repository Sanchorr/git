import { cronHandler } from "@/lib/cron";
import { runDaily } from "@/lib/jobs";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const GET = cronHandler("daily", (db) => runDaily(db));
