import { cronHandler } from "@/lib/cron";
import { runCalendar } from "@/lib/jobs";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const GET = cronHandler("calendar", (db) => runCalendar(db));
