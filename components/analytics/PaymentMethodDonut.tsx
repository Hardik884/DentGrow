"use client";

import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { useChartTheme } from "@/hooks/useChartTheme";
import type { PaymentMethod } from "@/types";

interface DataPoint {
  method: PaymentMethod;
  amount: number;
}

const METHOD_LABELS: Record<string, string> = {
  cash: "Cash",
  upi: "UPI",
  card: "Card",
  bank_transfer: "Bank Transfer",
};

/**
 * PaymentMethodDonut — revenue split by payment method.
 */
export function PaymentMethodDonut({ data }: { data: DataPoint[] }) {
  const chart = useChartTheme();

  if (!data.length || data.every((d) => d.amount === 0)) {
    return (
      <div className="h-48 flex items-center justify-center text-sm text-text-disabled">
        No payment data for selected period
      </div>
    );
  }

  const chartData = data
    .filter((d) => d.amount > 0)
    .map((d) => ({
      name: METHOD_LABELS[d.method] ?? d.method,
      value: Math.round(d.amount),
    }));

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
        <Tooltip {...chart.tooltip} formatter={(v: number) => [`₹${v.toLocaleString("en-IN")}`, "Amount"]} />
        <Legend wrapperStyle={{ fontSize: 12, color: chart.axis }} />
      </PieChart>
    </ResponsiveContainer>
  );
}
