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
import { useChartTheme } from "@/hooks/useChartTheme";

interface DataPoint {
  treatmentType: string;
  count: number;
}

/**
 * TreatmentBreakdownChart — most common treatment types (horizontal bar chart).
 */
export function TreatmentBreakdownChart({ data }: { data: DataPoint[] }) {
  const chart = useChartTheme();

  if (!data.length) {
    return (
      <div className="h-48 flex items-center justify-center text-sm text-text-disabled">
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
        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={chart.grid} />
        <XAxis type="number" tick={chart.axisProps.tick}
          stroke={chart.axisProps.stroke} allowDecimals={false} />
        <YAxis
          type="category"
          dataKey="treatmentType"
          tick={{ fontSize: 10 }}
          width={90}
        />
        <Tooltip {...chart.tooltip} formatter={(v: number) => [v, "Treatments"]} />
        <Bar dataKey="count" radius={[0, 4, 4, 0]}>
          {chartData.map((_, i) => (
            <Cell key={i} fill={chart.series[i % chart.series.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
