"use client";

import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from "recharts";

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

const COLORS = ["#3b82f6", "#ec4899", "#94a3b8", "#f59e0b"];

/**
 * GenderBreakdownChart — patient gender distribution (donut).
 */
export function GenderBreakdownChart({ data }: { data: DataPoint[] }) {
  if (!data.length || data.every((d) => d.count === 0)) {
    return (
      <div className="h-48 flex items-center justify-center text-sm text-gray-400">
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
            <Cell key={i} fill={COLORS[i % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip formatter={(v: number) => [v, "Patients"]} />
        <Legend />
      </PieChart>
    </ResponsiveContainer>
  );
}
