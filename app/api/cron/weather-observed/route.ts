import { cronHandler } from "@/lib/cron";
import { runWeatherObserved } from "@/lib/jobs";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const GET = cronHandler("weather-observed", (db) => runWeatherObserved(db));
