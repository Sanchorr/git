import { cronHandler } from "@/lib/cron";
import { runPredict } from "@/lib/jobs";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const GET = cronHandler("predict", (db) => runPredict(db));
