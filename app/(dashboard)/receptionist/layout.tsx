/**
 * Receptionist layout — pass-through.
 *
 * Role enforcement is handled at two layers:
 * 1. middleware.ts → only allows role === 'receptionist' past /receptionist/* routes.
 * 2. app/(dashboard)/layout.tsx → single auth + profile lookup for the full
 *    dashboard segment.
 *
 * This layout previously repeated auth.getUser() + profiles.select(role),
 * adding 2 redundant DB queries on every receptionist page load. Removed.
 */
export default function ReceptionistLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
