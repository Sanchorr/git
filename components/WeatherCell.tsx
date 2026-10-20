import type { WeekRow } from "@/lib/views/weekly";

const ICON: Record<string, string> = { 맑음: "☀️", 흐림: "☁️", 비: "🌧️", 눈: "❄️" };
const BASIS: Record<string, string> = { short: "단기", mid: "중기", none: "미반영" };

export default function WeatherCell({ weather }: { weather: WeekRow["weather"] }) {
  if (!weather) return <span className="text-muted">—</span>;
  const wet = weather.category === "비" || weather.category === "눈";
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      {weather.category ? (
        <>
          <span aria-hidden>{ICON[weather.category]}</span>
          <span className={wet ? "font-medium text-rain" : ""}>{weather.category}</span>
          {weather.pop !== null && <span className={`text-xs ${wet ? "text-rain" : "text-muted"}`}>{weather.pop}%</span>}
        </>
      ) : (
        <span className="text-muted">—</span>
      )}
      <span className="rounded bg-surface-2 px-1 text-[10px] text-muted">{BASIS[weather.basis]}</span>
    </span>
  );
}
