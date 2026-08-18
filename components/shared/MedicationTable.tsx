import type { MedicationInput } from "@/types";

interface MedicationTableProps {
  medications: MedicationInput[];
}

/**
 * MedicationTable
 *
 * Shared read-only medication table used by both the Dentist Portal treatment
 * detail page and the Patient Portal treatment history. Renders the exact same
 * columns — Medicine, Dosage, Number, Days, Instructions — so patients see the
 * same prescription information their dentist recorded.
 *
 * Returns null when there are no medications so callers can render it
 * unconditionally without leaving an empty section.
 */
export function MedicationTable({ medications }: MedicationTableProps) {
  if (!medications || medications.length === 0) return null;

  // Render the stored unit count in a human-friendly way (0.5 → "1/2").
  const formatNumber = (n: MedicationInput["number"]): string => {
    const value = typeof n === "number" ? n : Number(n);
    if (!Number.isFinite(value)) return String(n ?? "—");
    if (value === 0.5) return "1/2";
    return String(value);
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-text-disabled uppercase tracking-wide">
            <th className="py-1 pr-4 font-medium">Medicine</th>
            <th className="py-1 pr-4 font-medium">Number</th>
            <th className="py-1 pr-4 font-medium">Dosage</th>
            <th className="py-1 pr-4 font-medium">Instructions</th>
            <th className="py-1 font-medium">Days</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-surface-muted">
          {medications.map((m, i) => (
            <tr key={i}>
              <td className="py-1.5 pr-4 text-text-primary">{m.name}</td>
              <td className="py-1.5 pr-4 text-text-body">{formatNumber(m.number)}</td>
              <td className="py-1.5 pr-4 text-text-body">{m.dosage || "—"}</td>
              <td className="py-1.5 pr-4 text-text-body whitespace-pre-wrap">
                {m.instructions || "—"}
              </td>
              <td className="py-1.5 text-text-body">{m.days}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
