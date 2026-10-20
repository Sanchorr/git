"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { DailyPoint } from "@/lib/views/analysis";

const AXIS = { fontSize: 11, fill: "var(--muted)" };

function DailyTooltip({ active, payload }: { active?: boolean; payload?: { payload: DailyPoint }[] }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-xl border border-line bg-surface px-3 py-2 text-xs shadow-lg">
      <div className="font-semibold text-ink">{p.date}</div>
      {p.menu && <div className="text-muted">{p.menu}</div>}
      {p.weather && <div className="text-muted">날씨: {p.weather}</div>}
      <div className="tabular mt-1 text-ink">
        실제 <b>{p.actual}</b>명{p.predicted !== null && ` · 2일 전 예측 ${p.predicted}명`}
      </div>
    </div>
  );
}

export function DailyChart({ data, guarantee }: { data: DailyPoint[]; guarantee: number }) {
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
          <CartesianGrid stroke="var(--line)" vertical={false} />
          <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={{ stroke: "var(--line)" }} minTickGap={16} />
          <YAxis tick={AXIS} tickLine={false} axisLine={false} domain={["dataMin - 10", "dataMax + 10"]} allowDecimals={false} />
          <Tooltip content={<DailyTooltip />} />
          <ReferenceLine
            y={guarantee}
            stroke="var(--warn)"
            strokeDasharray="4 4"
            label={{ value: `보장 ${guarantee}`, position: "insideTopRight", fontSize: 11, fill: "var(--warn)" }}
          />
          <Line
            type="monotone"
            dataKey="predicted"
            name="2일 전 예측"
            stroke="var(--muted)"
            strokeDasharray="5 4"
            strokeWidth={1.5}
            dot={false}
            connectNulls
          />
          <Line
            type="monotone"
            dataKey="actual"
            name="실적"
            stroke="var(--flame)"
            strokeWidth={2.2}
            dot={(props: { cx?: number; cy?: number; payload?: DailyPoint; index?: number }) => (
              <circle
                key={props.index}
                cx={props.cx}
                cy={props.cy}
                r={props.payload?.friday ? 4.5 : 3}
                fill={props.payload?.friday ? "var(--warn)" : "var(--flame)"}
                stroke="var(--surface)"
                strokeWidth={1.5}
              />
            )}
            activeDot={{ r: 5 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function DowChart({ data }: { data: { dow: string; avg: number; n: number }[] }) {
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 20, right: 8, left: -16, bottom: 0 }}>
          <CartesianGrid stroke="var(--line)" vertical={false} />
          <XAxis dataKey="dow" tick={AXIS} tickLine={false} axisLine={{ stroke: "var(--line)" }} />
          <YAxis tick={AXIS} tickLine={false} axisLine={false} />
          <Tooltip
            cursor={{ fill: "var(--surface-2)" }}
            formatter={(v) => [`${v}명`, "평균"]}
            contentStyle={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 12, fontSize: 12 }}
          />
          <Bar dataKey="avg" fill="var(--navy)" radius={[6, 6, 0, 0]} maxBarSize={44}>
            <LabelList dataKey="avg" position="top" style={{ fontSize: 11, fill: "var(--ink)" }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
