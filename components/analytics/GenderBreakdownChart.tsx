"use client";

import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { useChartTheme } from "@/hooks/useChartTheme";

interface DataPoint {
  gender: string;
  count: number;
}

const GENDER_LABELS: Record<string, string> = {
  male: "Male",
  female: "Female",
  other: "Other",
  unknown: "Unknown",
};

/**
 * GenderBreakdownChart — patient gender distribution (donut).
 */
export function GenderBreakdownChart({ data }: { data: DataPoint[] }) {
  const chart = useChartTheme();

  if (!data.length || data.every((d) => d.count === 0)) {
    return (
      <div className="h-48 flex items-center justify-center text-sm text-text-disabled">
        No patient data available
      </div>
    );
  }

  const chartData = data
    .filter((d) => d.count > 0)
    .map((d) => ({ name: GENDER_LABELS[d.gender] ?? d.gender, value: d.count }));

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
          {chartData.map((_, i) => (
            <Cell key={i} fill={chart.series[i % chart.series.length]} />
          ))}
        </Pie>
        <Tooltip {...chart.tooltip} formatter={(v: number) => [v, "Patients"]} />
        <Legend wrapperStyle={{ fontSize: 12, color: chart.axis }} />
      </PieChart>
    </ResponsiveContainer>
  );
}
