"use client";

/**
 * useChartTheme
 *
 * Recharts takes its colours as React props (`stroke`, `fill`, `contentStyle`)
 * rather than as CSS classes, so it cannot pick up a `.dark` class change on
 * its own — charts would keep their light axes, light grid lines and the
 * library's default white tooltip box over a dark page.
 *
 * This hook resolves the chart design tokens out of the document's computed
 * style into concrete colour strings, and recomputes them whenever the resolved
 * theme flips. Reading the real computed values (rather than hardcoding two
 * palettes here) keeps globals.css the single source of truth: change a
 * `--color-chart-*` token and every chart follows.
 */

import { useEffect, useState } from "react";
import { useTheme } from "@/components/providers/ThemeProvider";

export type ChartTheme = {
  /** Categorical series colours, in the order they should be assigned. */
  series: string[];
  /** Cartesian grid lines — visible, but never louder than the data. */
  grid: string;
  /** Axis lines and tick labels. */
  axis: string;
  /** Props to spread onto a Recharts <Tooltip />. */
  tooltip: {
    contentStyle: React.CSSProperties;
    labelStyle: React.CSSProperties;
    itemStyle: React.CSSProperties;
    cursor: { fill: string } | { stroke: string };
  };
  /** Props to spread onto <XAxis /> / <YAxis /> for readable ticks. */
  axisProps: {
    stroke: string;
    tick: { fill: string; fontSize: number };
  };
  /**
   * Status colours for charts where a series MEANS something — a cancelled
   * appointment should read red in both themes, not "whatever slot 5 of the
   * categorical palette happens to be". These follow the app's status tokens.
   */
  semantic: {
    success: string;
    warning: string;
    danger: string;
    info: string;
    accent: string;
    neutral: string;
  };
};

const SERIES_TOKENS = [
  "--color-chart-1",
  "--color-chart-2",
  "--color-chart-3",
  "--color-chart-4",
  "--color-chart-5",
  "--color-chart-6",
  "--color-chart-7",
  "--color-chart-8",
];

/**
 * Light-theme fallbacks. Used for the very first render and during SSR, where
 * there is no computed style to read. They match the light token values, so a
 * chart never flashes an unrelated colour before the real values arrive.
 */
const FALLBACK: ChartTheme = {
  series: [
    "#0D6B5E", "#2563EB", "#B45309", "#7C3AED",
    "#0E7490", "#BE185D", "#4D7C0F", "#9A3412",
  ],
  grid: "#E3E9E6",
  axis: "#737A76",
  tooltip: {
    contentStyle: {
      background: "#FFFFFF",
      border: "1px solid #E3E9E6",
      borderRadius: 8,
      fontSize: 12,
      color: "#151918",
      boxShadow: "0 6px 16px -4px rgba(21,25,24,0.08)",
    },
    labelStyle: { color: "#151918", fontWeight: 600 },
    itemStyle: { color: "#5B635E" },
    cursor: { fill: "rgba(21,25,24,0.04)" },
  },
  axisProps: { stroke: "#E3E9E6", tick: { fill: "#737A76", fontSize: 11 } },
  semantic: {
    success: "#16A34A",
    warning: "#B45309",
    danger: "#DC2626",
    info: "#2563EB",
    accent: "#0D6B5E",
    neutral: "#737A76",
  },
};

function read(styles: CSSStyleDeclaration, token: string, fallback: string) {
  const value = styles.getPropertyValue(token).trim();
  return value || fallback;
}

export function useChartTheme(): ChartTheme {
  const { resolvedTheme, mounted } = useTheme();
  const [theme, setTheme] = useState<ChartTheme>(FALLBACK);

  useEffect(() => {
    if (!mounted) return;

    const styles = getComputedStyle(document.documentElement);

    const surface = read(styles, "--color-surface", FALLBACK.tooltip.contentStyle.background as string);
    const border = read(styles, "--color-border", FALLBACK.grid);
    const textPrimary = read(styles, "--color-text-primary", "#151918");
    const textBody = read(styles, "--color-text-body", "#5B635E");
    const axis = read(styles, "--color-chart-axis", FALLBACK.axis);
    const grid = read(styles, "--color-chart-grid", FALLBACK.grid);

    setTheme({
      series: SERIES_TOKENS.map((token, i) => read(styles, token, FALLBACK.series[i])),
      grid,
      axis,
      tooltip: {
        contentStyle: {
          background: surface,
          border: `1px solid ${border}`,
          borderRadius: 8,
          fontSize: 12,
          color: textPrimary,
          boxShadow: read(styles, "--shadow-md", FALLBACK.tooltip.contentStyle.boxShadow as string),
        },
        labelStyle: { color: textPrimary, fontWeight: 600 },
        itemStyle: { color: textBody },
        // A hover highlight tinted from the theme's own ink, so it reads as a
        // gentle wash in light and a gentle lift in dark.
        cursor: {
          fill: resolvedTheme === "dark"
            ? "rgba(241,245,243,0.06)"
            : "rgba(21,25,24,0.04)",
        },
      },
      axisProps: { stroke: grid, tick: { fill: axis, fontSize: 11 } },
      semantic: {
        success: read(styles, "--color-success", FALLBACK.semantic.success),
        warning: read(styles, "--color-warning", FALLBACK.semantic.warning),
        danger: read(styles, "--color-danger", FALLBACK.semantic.danger),
        info: read(styles, "--color-info", FALLBACK.semantic.info),
        accent: read(styles, "--color-accent", FALLBACK.semantic.accent),
        neutral: axis,
      },
    });
  }, [resolvedTheme, mounted]);

  return theme;
}
