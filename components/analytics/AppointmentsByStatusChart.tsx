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
import { useChartTheme, type ChartTheme } from "@/hooks/useChartTheme";
import type { AppointmentStatus } from "@/types";

interface DataPoint {
  date: string;
  status: AppointmentStatus;
  count: number;
}

interface AppointmentsByStatusChartProps {
  data: DataPoint[];
}

/**
 * Appointment status is semantic, not categorical — cancelled must read as
 * "bad" and completed as "good" in either theme. These map onto the app's
 * status tokens rather than onto slots in the generic series palette.
 */
function statusColors(chart: ChartTheme): Record<string, string> {
  return {
    completed: chart.semantic.success,
    scheduled: chart.semantic.info,
    checked_in: chart.semantic.warning,
    in_progress: chart.semantic.accent,
    cancelled: chart.semantic.danger,
    no_show: chart.series[7],
  };
}

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
  const chart = useChartTheme();

  if (!data.length) {
    return (
      <div className="h-48 flex items-center justify-center text-sm text-text-disabled">
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
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={chart.grid} />
        <XAxis dataKey="date" tick={chart.axisProps.tick}
          stroke={chart.axisProps.stroke} tickFormatter={(v) => v.slice(5)} />
        <YAxis tick={chart.axisProps.tick}
          stroke={chart.axisProps.stroke} allowDecimals={false} />
        <Tooltip {...chart.tooltip} />
        <Legend wrapperStyle={{ fontSize: 12, color: chart.axis }} formatter={(v) => STATUS_LABELS[v] ?? v} />
        {Array.from(statuses).map((status) => (
          <Bar
            key={status}
            dataKey={status}
            stackId="a"
            fill={statusColors(chart)[status] ?? chart.semantic.neutral}
            name={STATUS_LABELS[status] ?? status}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
