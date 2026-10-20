import { cronHandler } from "@/lib/cron";
import { runWeatherMid } from "@/lib/jobs";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const GET = cronHandler("weather-mid", (db) => runWeatherMid(db));
