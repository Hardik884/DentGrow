"use client";

import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
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

const COLORS = ["#3b82f6", "#22c55e", "#f59e0b", "#8b5cf6", "#94a3b8"];

/**
 * AcquisitionSourceChart — appointment source breakdown (donut chart).
 */
export function AcquisitionSourceChart({ data }: { data: DataPoint[] }) {
  if (!data.length || data.every((d) => d.count === 0)) {
    return (
      <div className="h-48 flex items-center justify-center text-sm text-gray-400">
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
            <Cell key={index} fill={COLORS[index % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip formatter={(v: number) => [v, "Appointments"]} />
        <Legend />
      </PieChart>
    </ResponsiveContainer>
  );
}
