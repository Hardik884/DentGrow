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

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-[#A1A1AA] uppercase tracking-wide">
            <th className="py-1 pr-4 font-medium">Medicine</th>
            <th className="py-1 pr-4 font-medium">Dosage</th>
            <th className="py-1 pr-4 font-medium">Number</th>
            <th className="py-1 pr-4 font-medium">Days</th>
            <th className="py-1 font-medium">Instructions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#F4F4F5]">
          {medications.map((m, i) => (
            <tr key={i}>
              <td className="py-1.5 pr-4 text-[#09090B]">{m.name}</td>
              <td className="py-1.5 pr-4 text-[#52525B]">{m.dosage || "—"}</td>
              <td className="py-1.5 pr-4 text-[#52525B]">{m.number}</td>
              <td className="py-1.5 pr-4 text-[#52525B]">{m.days}</td>
              <td className="py-1.5 text-[#52525B] whitespace-pre-wrap">
                {m.instructions || "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
