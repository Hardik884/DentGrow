"use client";

import {
  LineChart,
  Line,
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
 * FollowUpAnalyticsChart — completed follow-ups over time (line chart).
 */
export function FollowUpAnalyticsChart({ data }: { data: DataPoint[] }) {
  const chart = useChartTheme();

  if (!data.length) {
    return (
      <div className="h-48 flex items-center justify-center text-sm text-text-disabled">
        No completed follow-ups in selected period
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={chart.grid} />
        <XAxis dataKey="date" tick={chart.axisProps.tick}
          stroke={chart.axisProps.stroke} tickFormatter={(v) => v.slice(5)} />
        <YAxis tick={chart.axisProps.tick}
          stroke={chart.axisProps.stroke} allowDecimals={false} />
        <Tooltip {...chart.tooltip} formatter={(v: number) => [v, "Completed Follow-ups"]} />
        <Line
          type="monotone"
          dataKey="count"
          stroke={chart.semantic.success}
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
