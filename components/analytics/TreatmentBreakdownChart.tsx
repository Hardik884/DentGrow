"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

interface DataPoint {
  treatmentType: string;
  count: number;
}

const COLORS = ["#3b82f6", "#22c55e", "#f59e0b", "#8b5cf6", "#ef4444", "#f97316", "#14b8a6"];

/**
 * TreatmentBreakdownChart — most common treatment types (horizontal bar chart).
 */
export function TreatmentBreakdownChart({ data }: { data: DataPoint[] }) {
  if (!data.length) {
    return (
      <div className="h-48 flex items-center justify-center text-sm text-gray-400">
        No treatment data for selected period
      </div>
    );
  }

  const chartData = data.slice(0, 7);

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart
        data={chartData}
        layout="vertical"
        margin={{ top: 4, right: 16, left: 8, bottom: 0 }}
      >
        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f0f0f0" />
        <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
        <YAxis
          type="category"
          dataKey="treatmentType"
          tick={{ fontSize: 10 }}
          width={90}
        />
        <Tooltip formatter={(v: number) => [v, "Treatments"]} />
        <Bar dataKey="count" radius={[0, 4, 4, 0]}>
          {chartData.map((_, i) => (
            <Cell key={i} fill={COLORS[i % COLORS.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
