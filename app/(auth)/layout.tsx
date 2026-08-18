/**
 * Auth layout — unauthenticated pages.
 * Clean centered layout, no sidebar.
 */
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F6F8F6] px-4">
      <div className="w-full max-w-[380px]">{children}</div>
    </div>
  );
}

