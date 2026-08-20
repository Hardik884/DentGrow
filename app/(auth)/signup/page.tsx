import { redirect } from "next/navigation";

/**
 * /signup — legacy alias.
 *
 * Patient registration moved to /patient/signup when the three sign-in doors
 * were separated. The old path is kept as a permanent redirect target rather
 * than deleted: it is the URL that existing bookmarks, printed clinic handouts
 * and any already-sent confirmation emails point at, and a 404 there would look
 * like the portal is gone.
 */
export default function LegacySignupPage() {
  redirect("/patient/signup");
}
