"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { useChartTheme } from "@/hooks/useChartTheme";

interface DataPoint {
  date: string;
  count: number;
}

/**
 * PatientGrowthChart — new patients over time (area line chart).
 */
export function PatientGrowthChart({ data }: { data: DataPoint[] }) {
  const chart = useChartTheme();

  if (!data.length) {
    return (
      <div className="h-48 flex items-center justify-center text-sm text-text-disabled">
        No patient data for selected period
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="patientGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={chart.semantic.info} stopOpacity={0.2} />
            <stop offset="95%" stopColor={chart.semantic.info} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={chart.grid} />
        <XAxis dataKey="date" tick={chart.axisProps.tick}
          stroke={chart.axisProps.stroke} tickFormatter={(v) => v.slice(5)} />
        <YAxis tick={chart.axisProps.tick}
          stroke={chart.axisProps.stroke} allowDecimals={false} />
        <Tooltip {...chart.tooltip} formatter={(v: number) => [v, "New Patients"]} />
        <Area
          type="monotone"
          dataKey="count"
          stroke={chart.semantic.info}
          strokeWidth={2}
          fill="url(#patientGradient)"
          dot={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
