import { redirect } from "next/navigation";

/**
 * Root route — middleware handles the redirect based on auth state,
 * but this fallback ensures unauthenticated visits land on login.
 */
export default function RootPage() {
  redirect("/login");
}

