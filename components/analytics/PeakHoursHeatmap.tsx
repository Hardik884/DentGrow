"use client";

interface HeatmapCell {
  hour: number;
  dayOfWeek: number;
  count: number;
}

interface PeakHoursHeatmapProps {
  data: HeatmapCell[];
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const HOURS = Array.from({ length: 13 }, (_, i) => i + 8); // 8 AM – 8 PM

/**
 * PeakHoursHeatmap — custom CSS heatmap grid (hour × day).
 * Color intensity scales from 0 to max count in the dataset.
 */
export function PeakHoursHeatmap({ data }: PeakHoursHeatmapProps) {
  if (!data.length) {
    return (
      <div className="h-48 flex items-center justify-center text-sm text-gray-400">
        No data for selected period
      </div>
    );
  }

  // Build lookup map
  const lookup: Record<string, number> = {};
  let maxCount = 0;
  for (const cell of data) {
    const key = `${cell.dayOfWeek}:${cell.hour}`;
    lookup[key] = cell.count;
    if (cell.count > maxCount) maxCount = cell.count;
  }

  function intensity(count: number): string {
    if (maxCount === 0 || count === 0) return "bg-[#F4F4F5]";
    const ratio = count / maxCount;
    if (ratio < 0.2) return "bg-[#D1FAE5]";
    if (ratio < 0.4) return "bg-[#6EE7B7]";
    if (ratio < 0.6) return "bg-[#34D399]";
    if (ratio < 0.8) return "bg-[#0F766E]";
    return "bg-[#115E59]";
  }

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[360px]">
        {/* Hour labels */}
        <div className="flex mb-1 ml-8">
          {HOURS.map((h) => (
            <div key={h} className="flex-1 text-center text-[9px] text-gray-400">
              {h % 12 === 0 ? "12" : h % 12}
              {h < 12 ? "a" : "p"}
            </div>
          ))}
        </div>
        {/* Grid rows */}
        {DAYS.map((day, dayIdx) => (
          <div key={day} className="flex items-center mb-0.5">
            <span className="w-8 text-[10px] text-gray-500 text-right pr-1">{day}</span>
            {HOURS.map((hour) => {
              const count = lookup[`${dayIdx}:${hour}`] ?? 0;
              return (
                <div
                  key={hour}
                  className={`flex-1 mx-px h-5 rounded-sm ${intensity(count)}`}
                  title={`${day} ${hour}:00 — ${count} appointment${count !== 1 ? "s" : ""}`}
                />
              );
            })}
          </div>
        ))}
        <p className="text-[10px] text-gray-400 mt-1 text-center">Hour of day (8 AM – 8 PM)</p>
      </div>
    </div>
  );
}
