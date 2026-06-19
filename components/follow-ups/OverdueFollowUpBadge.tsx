/**
 * OverdueFollowUpBadge
 *
 * Prominent badge shown on follow-ups where due_date < today and status = 'pending'.
 */
export function OverdueFollowUpBadge() {
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
      Overdue
    </span>
  );
}
