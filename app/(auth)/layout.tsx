/**
 * Auth layout — the unauthenticated pages.
 *
 * Deliberately a passthrough. Every page in this group renders inside
 * <AuthShell>, which owns the full-bleed split composition and needs the whole
 * viewport; the old centred `max-w-[380px]` wrapper here would have clamped it
 * back into a narrow column.
 */
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
