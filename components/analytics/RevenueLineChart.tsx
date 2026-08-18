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
  amount: number;
}

interface RevenueLineChartProps {
  data: DataPoint[];
}

/**
 * RevenueLineChart — daily revenue trend line chart.
 */
export function RevenueLineChart({ data }: RevenueLineChartProps) {
  const chart = useChartTheme();

  if (!data.length) {
    return (
      <div className="h-48 flex items-center justify-center text-sm text-text-disabled">
        No revenue data for selected period
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={chart.grid} />
        <XAxis dataKey="date" tick={chart.axisProps.tick}
          stroke={chart.axisProps.stroke} tickFormatter={(v) => v.slice(5)} />
        <YAxis
          tick={chart.axisProps.tick}
          stroke={chart.axisProps.stroke}
          tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`}
        />
        <Tooltip {...chart.tooltip}
          formatter={(value: number) =>
            [`₹${value.toLocaleString("en-IN")}`, "Revenue"]
          }
        />
        <Line
          type="monotone"
          dataKey="amount"
          stroke={chart.semantic.accent}
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
