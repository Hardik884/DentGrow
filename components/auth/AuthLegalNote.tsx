import { privacyPolicyUrl, termsUrl } from "@/lib/legal/links";

/**
 * AuthLegalNote — the one-line legal acknowledgement under a sign-in form.
 *
 * DESIGN INTENT
 *   Subtle, not a compliance banner. It is the smallest type on the page, in
 *   the muted ink already used for supporting copy, sitting below the form's
 *   own footer rule. Someone signing in should be able to ignore it; someone
 *   looking for the policy should find it without hunting.
 *
 * WHERE THE LINKS GO
 *   Out to the marketing site, which publishes the canonical documents — see
 *   lib/legal/links.ts for why this app does not host its own copies.
 *
 * THE TERMS CLAUSE IS CONDITIONAL
 *   No Terms of Service is published yet, so the sentence degrades to the
 *   Privacy Policy alone rather than linking somewhere that 404s. Once
 *   NEXT_PUBLIC_TERMS_URL points at a real page the full sentence appears with
 *   no code change.
 */
export function AuthLegalNote() {
  const privacy = privacyPolicyUrl();
  const terms = termsUrl();

  return (
    <p className="mt-6 text-center text-[11.5px] leading-relaxed text-text-body/80">
      By continuing, you{" "}
      {terms ? (
        <>
          agree to our <LegalLink href={terms}>Terms</LegalLink> and acknowledge our{" "}
        </>
      ) : (
        <>acknowledge our </>
      )}
      <LegalLink href={privacy}>Privacy Policy</LegalLink>.
    </p>
  );
}

function LegalLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      // Opens on the marketing site. noopener/noreferrer because the
      // destination is a different origin and the referrer of an auth page is
      // not something to hand across it.
      target="_blank"
      rel="noopener noreferrer"
      className="rounded underline decoration-border underline-offset-2 transition-colors duration-150 hover:text-text-primary hover:decoration-text-body focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
    >
      {children}
    </a>
  );
}
