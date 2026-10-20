import { cronHandler } from "@/lib/cron";
import { runWeatherShort } from "@/lib/jobs";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const GET = cronHandler("weather-short", (db) => runWeatherShort(db));
