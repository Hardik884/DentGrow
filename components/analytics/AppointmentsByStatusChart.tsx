"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import type { AppointmentStatus } from "@/types";

interface DataPoint {
  date: string;
  status: AppointmentStatus;
  count: number;
}

interface AppointmentsByStatusChartProps {
  data: DataPoint[];
}

const STATUS_COLORS: Record<string, string> = {
  completed: "#22c55e",
  scheduled: "#3b82f6",
  checked_in: "#f59e0b",
  in_progress: "#8b5cf6",
  cancelled: "#ef4444",
  no_show: "#f97316",
};

const STATUS_LABELS: Record<string, string> = {
  completed: "Completed",
  scheduled: "Scheduled",
  checked_in: "Checked In",
  in_progress: "In Progress",
  cancelled: "Cancelled",
  no_show: "No Show",
};

/**
 * AppointmentsByStatusChart — stacked bar chart by status per day.
 */
export function AppointmentsByStatusChart({ data }: AppointmentsByStatusChartProps) {
  if (!data.length) {
    return (
      <div className="h-48 flex items-center justify-center text-sm text-gray-400">
        No data for selected period
      </div>
    );
  }

  // Pivot: date → { [status]: count }
  const pivotMap: Record<string, Record<string, number>> = {};
  const statuses = new Set<string>();
  for (const d of data) {
    if (!pivotMap[d.date]) pivotMap[d.date] = {};
    pivotMap[d.date][d.status] = d.count;
    statuses.add(d.status);
  }
  const chartData = Object.entries(pivotMap)
    .map(([date, counts]) => ({ date, ...counts }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
        <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(v) => v.slice(5)} />
        <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
        <Tooltip />
        <Legend formatter={(v) => STATUS_LABELS[v] ?? v} />
        {Array.from(statuses).map((status) => (
          <Bar
            key={status}
            dataKey={status}
            stackId="a"
            fill={STATUS_COLORS[status] ?? "#94a3b8"}
            name={STATUS_LABELS[status] ?? status}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
