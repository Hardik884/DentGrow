"use client";

import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { useChartTheme } from "@/hooks/useChartTheme";
import type { AppointmentSource } from "@/types";

interface DataPoint {
  source: AppointmentSource;
  count: number;
}

const SOURCE_LABELS: Record<string, string> = {
  walk_in: "Walk-in",
  phone_call: "Phone Call",
  website: "Website",
  referral: "Referral",
  other: "Other",
};

/**
 * AcquisitionSourceChart — appointment source breakdown (donut chart).
 */
export function AcquisitionSourceChart({ data }: { data: DataPoint[] }) {
  const chart = useChartTheme();

  if (!data.length || data.every((d) => d.count === 0)) {
    return (
      <div className="h-48 flex items-center justify-center text-sm text-text-disabled">
        No source data for selected period
      </div>
    );
  }

  const chartData = data
    .filter((d) => d.count > 0)
    .map((d) => ({ name: SOURCE_LABELS[d.source] ?? d.source, value: d.count }));

  return (
    <ResponsiveContainer width="100%" height={220}>
      <PieChart>
        <Pie
          data={chartData}
          cx="50%"
          cy="50%"
          innerRadius={55}
          outerRadius={90}
          paddingAngle={2}
          dataKey="value"
        >
          {chartData.map((_, index) => (
            <Cell key={index} fill={chart.series[index % chart.series.length]} />
          ))}
        </Pie>
        <Tooltip {...chart.tooltip} formatter={(v: number) => [v, "Appointments"]} />
        <Legend wrapperStyle={{ fontSize: 12, color: chart.axis }} />
      </PieChart>
    </ResponsiveContainer>
  );
}
