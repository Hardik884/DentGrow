# Backup and disaster recovery

**Status: DOCUMENTED, NOT VERIFIED.**

This describes the infrastructure as it can be determined *from this
repository*. Several fields are marked unverified, and they are unverified
because nothing in the code can establish them — not because nobody looked.

⚠️ **The application must never rely on a backup that has never been restored.
No restore of this system has been tested.** That is the single most important
line in this document.

---

## 1. What actually holds the data

| Component | Provider | Backed up by | Verified? |
|---|---|---|---|
| PostgreSQL (all clinical data) | Supabase | Supabase platform backups | ❌ |
| Auth (`auth.users`, sessions, factors) | Supabase | Same cluster | ❌ |
| Storage (radiographs, consents, signatures) | Supabase Storage | ⚠️ **separate from database backups** | ❌ |
| Application code | GitHub | Git history | ✅ |
| Migrations | GitHub, `supabase/migrations/` | Git history | ✅ |
| Environment configuration | Vercel + Supabase dashboards | ❌ **nothing** | ❌ |

**The storage line is the one to look at first.** On Supabase, database backups
and Storage objects are handled separately. A database restore that brings back
`treatment_documents` rows pointing at objects that were not restored produces a
clinical record whose radiographs are all broken links — and the failure is
silent, because the rows are present and correct.

⚙️ **REQUIRES MANUAL VERIFICATION:** confirm in the Supabase dashboard whether
Storage is included in this project's backups, and if not, what the plan is.

---

## 2. What cannot be answered from the repository

| Question | Where the answer is |
|---|---|
| Backup frequency | Supabase dashboard → Database → Backups |
| Retention of backups | Same |
| Point-in-time recovery available? | Same (PITR is a paid add-on) |
| Database region | Supabase dashboard → Project Settings → General |
| Vercel function region | Vercel dashboard → Project Settings → Functions |
| Where logs are stored and for how long | Both dashboards |

⚙️ **REQUIRES MANUAL VERIFICATION.** Fill this table in and commit it; a DR
document with blanks is a DR document nobody can act on at 3am.

---

## 3. RPO and RTO

**Not established.** Stating a number here without a tested restore would be
inventing one.

What they mean, so the eventual numbers are chosen rather than guessed:

- **RPO** — how much data you are willing to lose. Without PITR this is the
  interval between backups: lose everything since the last one.
- **RTO** — how long you are willing to be down. It is dominated by the parts
  nobody has measured: noticing, deciding, restoring, and re-pointing the app.

**A dental clinic's practical RTO is one working day.** A clinic that cannot see
today's appointments cannot run its list, and paper fallback for a full day is
already a bad day.

---

## 4. Restore drill

⚙️ **NOT YET PERFORMED.** The procedure below is written to be followed, not to
be filed.

**Never restore into production.** Restore into a scratch project.

1. **Create a scratch Supabase project** in the same region as production.
2. **Restore the most recent backup** into it (dashboard → Backups → Restore).
3. **Verify structure**: 28+ tables present, RLS enabled on every one, and the
   `security_invoker` sweep passes:
   `SUPABASE_TEST_URL=<scratch> npx vitest --run actions/__tests__/view-security-invoker.spec.ts`
4. **Verify content**, without reading patient data: row counts per table
   against production, and the newest `created_at` in `appointments` — that
   timestamp is the real RPO for this restore.
5. **Verify storage**: list objects in `patient-documents`. If the bucket is
   empty, the database restore did **not** bring the files, which is the finding
   this drill exists to produce.
6. **Point a preview deployment at the scratch project** and sign in as each
   role. Open a patient, a treatment, and an X-ray.
7. **Record**: wall-clock time from step 1 to step 6 (that is the measured RTO),
   the data gap from step 4 (the measured RPO), and anything that broke.
8. **Delete the scratch project.** It contains a full copy of production.

Re-run after any change to the schema, the storage layout, or the plan.

---

## 5. Environment configuration is not backed up

Environment variables live only in the Vercel and Supabase dashboards. A project
deleted by accident takes `CRON_SECRET`, `GOOGLE_AI_API_KEY` and the Supabase
keys with it, and the application cannot be rebuilt from git alone.

⚙️ **REQUIRES MANUAL ACTION:** keep an offline record of which variables must
exist (`.env.example` is that list) and where each value is obtained. Do **not**
commit the values.

---

## 6. Deliberately not implemented here

- **No custom backup job.** Supabase's platform backups are the mechanism; a
  second, home-grown one would mean this application holding a full database
  dump somewhere — which is precisely the exposure that produced the
  uncontrolled developer-laptop copy described in `docs/INCIDENT-RESPONSE.md`.
- **No automated restore testing.** It needs a scratch project and a billing
  decision.
