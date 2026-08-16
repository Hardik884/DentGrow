-- =============================================================================
-- DentGrow — Patient Consent Forms
-- Migration: 20260816000000_patient_consent_forms.sql
--
-- Purpose:
--   Informed-consent documentation for treatments. A clinic maintains its own
--   VERSIONED consent templates; a consent instance is created for a patient/
--   treatment/appointment, signed digitally in-app OR uploaded after being
--   signed on paper, and — once signed — is IMMUTABLE (a frozen content
--   snapshot, never altered by later template edits).
--
-- What this migration adds:
--   1. consent_status, consent_source, consent_audit_action — native enums.
--   2. consent_templates          — per-clinic master templates (editable).
--   3. consent_template_versions  — immutable versioned template content.
--   4. consents                   — a consent instance, with a frozen
--                                   content_snapshot and (for uploads) file
--                                   metadata. treatment/appointment are
--                                   additive optional links (ON DELETE SET NULL)
--                                   so a signed consent survives the treatment
--                                   being removed.
--   5. consent_audit              — append-only audit trail. No client write
--                                   policy; written by a service-role helper
--                                   only (lib/consents/history.ts), mirroring
--                                   appointment_history / tooth_history.
--   6. consent-documents bucket   — private storage for uploaded signed files,
--                                   four-policy storage.objects RLS matching the
--                                   patient-documents bucket.
--   7. patient_consents           — portal-safe view (signed, own consents).
--
-- Access model (feature-specific; see CLAUDE.md §3 and the spec):
--   - dentist:      full authorship — CRUD on templates/versions and consents,
--                   signs digital consents. Cannot edit a SIGNED consent (RLS
--                   update predicate excludes status='signed').
--   - receptionist: operational — reads templates and consents, and inserts an
--                   UPLOADED signed consent (source='uploaded'). No authorship,
--                   no editing, no deletion. Mirrors treatment_documents access.
--   - patient:      read-only, own SIGNED consents, via patient_consents view.
--
-- Does NOT modify any existing treatment/billing/payment/appointment/patient
-- table or policy — purely additive.
-- =============================================================================

-- =============================================================================
-- 1. ENUMS
-- =============================================================================

create type consent_status as enum (
  'draft',
  'ready_to_sign',
  'signed',
  'cancelled'
);

comment on type consent_status is
  'Lifecycle of a consent: draft (editable) -> ready_to_sign (finalised for '
  'signing, still editable back to draft) -> signed (immutable, terminal) | '
  'cancelled (terminal). A signed consent is never edited; a material change '
  'requires a new consent.';

create type consent_source as enum (
  'digital',   -- generated in DentGrow and signed digitally in-app
  'uploaded'   -- signed on paper outside DentGrow, then scanned/photographed in
);

comment on type consent_source is
  'How the signed consent was produced. `uploaded` consents are labelled '
  'distinctly in the UI and never presented as digitally signed by DentGrow.';

create type consent_audit_action as enum (
  'created',
  'updated',
  'status_changed',
  'signed',
  'cancelled',
  'uploaded'
);

comment on type consent_audit_action is
  'Kind of change recorded against a consent. Mirrors appointment_history_action.';

-- =============================================================================
-- 2. CONSENT_TEMPLATES — per-clinic master templates (editable, versioned)
-- =============================================================================

create table consent_templates (
  id                   uuid        primary key default gen_random_uuid(),
  clinic_id            uuid        not null references clinics (id) on delete cascade,
  template_key         text        not null,   -- stable key, e.g. 'root_canal'
  name                 text        not null,
  treatment_keywords   text[]      not null default '{}',
  consent_required     boolean     not null default false,
  consent_recommended  boolean     not null default true,
  is_active            boolean     not null default true,
  current_version      integer     not null default 1,
  created_by           uuid        references profiles (id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  constraint uq_consent_templates_clinic_key unique (clinic_id, template_key)
);

comment on table consent_templates is
  'A clinic-owned, editable consent template. Provisioned from the code '
  'defaults in lib/consents/templates.ts, then owned and edited by the clinic. '
  'The latest content lives in consent_template_versions (current_version); '
  'editing creates a NEW version and never rewrites history.';
comment on column consent_templates.treatment_keywords is
  'Lower-cased substrings matched against a treatment''s free-text treatment_type '
  'for auto-selection. Empty for the general fallback template.';

create index idx_consent_templates_clinic on consent_templates (clinic_id);

create trigger trg_consent_templates_updated_at
  before update on consent_templates
  for each row execute function set_updated_at();

-- =============================================================================
-- 3. CONSENT_TEMPLATE_VERSIONS — immutable versioned content
-- =============================================================================

create table consent_template_versions (
  id           uuid        primary key default gen_random_uuid(),
  template_id  uuid        not null references consent_templates (id) on delete cascade,
  clinic_id    uuid        not null references clinics (id) on delete cascade,
  version      integer     not null,
  -- ConsentContent shape: { sections: ConsentSection[], disclaimer: string }
  content      jsonb       not null,
  created_by   uuid        references profiles (id) on delete set null,
  created_at   timestamptz not null default now(),

  constraint uq_consent_template_versions_template_version unique (template_id, version)
);

comment on table consent_template_versions is
  'Immutable snapshot of a template''s content at a version. Rows are never '
  'updated or deleted — a template edit inserts a new version. Signed consents '
  'reference the exact version they were built from.';

create index idx_consent_template_versions_template on consent_template_versions (template_id);

-- =============================================================================
-- 4. CONSENTS — a consent instance for a patient / treatment / appointment
-- =============================================================================

create table consents (
  id                    uuid           primary key default gen_random_uuid(),
  clinic_id             uuid           not null references clinics (id)     on delete cascade,
  patient_id            uuid           not null references patients (id)    on delete cascade,
  -- additive optional links (ON DELETE SET NULL) so a signed consent survives
  -- the treatment/appointment being removed, mirroring follow_ups.treatment_id.
  treatment_id          uuid           references treatments (id)   on delete set null,
  appointment_id        uuid           references appointments (id) on delete set null,

  -- template identity, denormalised so the snapshot stays intact even if the
  -- template or version row is later edited/removed.
  template_id           uuid           references consent_templates (id)         on delete set null,
  template_version_id   uuid           references consent_template_versions (id) on delete set null,
  template_key          text           not null,
  template_name         text           not null,
  template_version      integer        not null default 1,

  source                consent_source not null default 'digital',
  status                consent_status not null default 'draft',

  -- Editable while draft/ready_to_sign; FROZEN once signed. Holds the full
  -- ConsentSnapshot (resolved content + patient/clinic/treatment/dentist).
  content_snapshot      jsonb          not null,

  -- Digital signature (source='digital')
  patient_signed_name   text,
  patient_signature     text,          -- PNG data URL captured at sign time, frozen
  signed_at             timestamptz,
  dentist_id            uuid           references profiles (id) on delete set null,
  dentist_signature_url text,          -- resolved + frozen at sign time

  -- Uploaded signed document (source='uploaded')
  file_name             text,
  file_path             text,          -- key within the consent-documents bucket
  file_type             text,          -- mime type
  file_size             integer,       -- bytes (nullable)
  uploaded_by           uuid           references profiles (id) on delete set null,
  uploaded_at           timestamptz,

  created_by            uuid           references profiles (id) on delete set null,
  deleted_at            timestamptz,
  created_at            timestamptz    not null default now(),
  updated_at            timestamptz    not null default now()
);

comment on table consents is
  'A consent instance. content_snapshot is the exact document; it is editable '
  'while draft/ready_to_sign and permanently frozen once status=signed. '
  'source=digital rows carry patient_signature (data URL) + signed_at; '
  'source=uploaded rows carry file_* metadata for a file in the '
  'consent-documents bucket. Immutability of signed rows is enforced by the '
  'RLS update predicate (status <> ''signed'') as well as in server actions.';

create index idx_consents_clinic      on consents (clinic_id)      where deleted_at is null;
create index idx_consents_patient     on consents (patient_id)     where deleted_at is null;
create index idx_consents_treatment   on consents (treatment_id)   where treatment_id is not null;
create index idx_consents_appointment on consents (appointment_id) where appointment_id is not null;

create trigger trg_consents_updated_at
  before update on consents
  for each row execute function set_updated_at();

-- =============================================================================
-- 5. CONSENT_AUDIT — append-only audit trail (mirrors appointment_history)
-- =============================================================================

create table consent_audit (
  id            uuid                 primary key default gen_random_uuid(),
  consent_id    uuid                 not null references consents (id) on delete cascade,
  clinic_id     uuid                 not null references clinics (id)  on delete cascade,
  action        consent_audit_action not null,
  old_value     jsonb,
  new_value     jsonb,
  performed_by  uuid                 references profiles (id) on delete set null,
  timestamp     timestamptz          not null default now()
);

comment on table consent_audit is
  'Append-only audit trail for consents. Records are never updated or deleted. '
  'Inserts are performed by server-side service-role actions only '
  '(lib/consents/history.ts) — there is no client write policy on this table.';

create index idx_consent_audit_consent on consent_audit (consent_id, timestamp desc);

-- =============================================================================
-- 6. ROW LEVEL SECURITY
-- =============================================================================

alter table consent_templates         enable row level security;
alter table consent_template_versions enable row level security;
alter table consents                  enable row level security;
alter table consent_audit             enable row level security;

-- ── CONSENT_TEMPLATES ──────────────────────────────────────────────────────
-- dentist: full CRUD (authorship). receptionist: read only (needs to pick a
-- consent type when uploading). No portal access.

create policy "consent_templates: dentist select"
  on consent_templates for select
  using (clinic_id = auth_clinic_id() and auth_role() = 'dentist');
create policy "consent_templates: dentist insert"
  on consent_templates for insert
  with check (clinic_id = auth_clinic_id() and auth_role() = 'dentist');
create policy "consent_templates: dentist update"
  on consent_templates for update
  using  (clinic_id = auth_clinic_id() and auth_role() = 'dentist')
  with check (clinic_id = auth_clinic_id() and auth_role() = 'dentist');
create policy "consent_templates: dentist delete"
  on consent_templates for delete
  using (clinic_id = auth_clinic_id() and auth_role() = 'dentist');
create policy "consent_templates: receptionist select"
  on consent_templates for select
  using (clinic_id = auth_clinic_id() and auth_role() = 'receptionist');

-- ── CONSENT_TEMPLATE_VERSIONS ──────────────────────────────────────────────
-- dentist: select + insert only (versions are immutable — no update/delete
-- policy = deny). receptionist: read only.

create policy "consent_template_versions: dentist select"
  on consent_template_versions for select
  using (clinic_id = auth_clinic_id() and auth_role() = 'dentist');
create policy "consent_template_versions: dentist insert"
  on consent_template_versions for insert
  with check (clinic_id = auth_clinic_id() and auth_role() = 'dentist');
create policy "consent_template_versions: receptionist select"
  on consent_template_versions for select
  using (clinic_id = auth_clinic_id() and auth_role() = 'receptionist');

-- ── CONSENTS ───────────────────────────────────────────────────────────────
-- dentist: full CRUD, clinic + active scoped. UPDATE/DELETE deliberately
-- exclude status='signed' so a signed consent is IMMUTABLE at the database
-- level (not merely in application code).
create policy "consents: dentist select"
  on consents for select
  using (clinic_id = auth_clinic_id() and auth_role() = 'dentist' and deleted_at is null);
create policy "consents: dentist insert"
  on consents for insert
  with check (clinic_id = auth_clinic_id() and auth_role() = 'dentist');
create policy "consents: dentist update"
  on consents for update
  using  (clinic_id = auth_clinic_id() and auth_role() = 'dentist'
          and deleted_at is null and status <> 'signed')
  with check (clinic_id = auth_clinic_id() and auth_role() = 'dentist');
create policy "consents: dentist delete"
  on consents for delete
  using (clinic_id = auth_clinic_id() and auth_role() = 'dentist' and status <> 'signed');

-- receptionist: read consents, and insert an UPLOADED signed consent only.
-- No update/delete (cannot alter or remove a consent), so an uploaded signed
-- document is immutable to them once stored.
create policy "consents: receptionist select"
  on consents for select
  using (clinic_id = auth_clinic_id() and auth_role() = 'receptionist' and deleted_at is null);
create policy "consents: receptionist insert uploaded"
  on consents for insert
  with check (clinic_id = auth_clinic_id() and auth_role() = 'receptionist'
              and source = 'uploaded');

-- patient portal: read own SIGNED consents only (drafts are staff-internal).
create policy "consents: portal read own signed"
  on consents for select
  using (patient_id = auth_patient_id() and deleted_at is null and status = 'signed');

-- ── CONSENT_AUDIT ──────────────────────────────────────────────────────────
-- Staff read-only within their clinic. No client write policy — writes go
-- through the service-role helper.
create policy "consent_audit: staff read"
  on consent_audit for select
  using (clinic_id = auth_clinic_id() and auth_role() in ('dentist', 'receptionist'));

-- =============================================================================
-- 7. STORAGE — consent-documents bucket (private) for uploaded signed files
-- =============================================================================

insert into storage.buckets (id, name, public)
values ('consent-documents', 'consent-documents', false)
on conflict (id) do nothing;

-- Path layout: {clinic_id}/{patient_id}/{consent_id}/{file}
-- segment[1] = clinic_id (clinic isolation), segment[2] = patient_id (portal).

create policy "consent-documents: staff read own clinic"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'consent-documents'
    and (storage.foldername(name))[1] = auth_clinic_id()::text
    and auth_role() in ('dentist', 'receptionist')
  );

create policy "consent-documents: staff insert own clinic"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'consent-documents'
    and (storage.foldername(name))[1] = auth_clinic_id()::text
    and auth_role() in ('dentist', 'receptionist')
  );

create policy "consent-documents: dentist delete own clinic"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'consent-documents'
    and (storage.foldername(name))[1] = auth_clinic_id()::text
    and auth_role() = 'dentist'
  );

create policy "consent-documents: patient read own"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'consent-documents'
    and (storage.foldername(name))[2] = auth_patient_id()::text
  );

-- =============================================================================
-- 8. PATIENT PORTAL VIEW — signed, own consents only
-- =============================================================================

create or replace view patient_consents
with (security_invoker = true)
as
  select
    id,
    patient_id,
    treatment_id,
    appointment_id,
    template_key,
    template_name,
    template_version,
    source,
    status,
    content_snapshot,
    patient_signed_name,
    patient_signature,
    signed_at,
    file_name,
    file_type,
    created_at
  from consents
  where deleted_at is null
    and status = 'signed'
    and patient_id = auth_patient_id();

comment on view patient_consents is
  'Portal-safe consent view. Exposes only the authenticated patient''s SIGNED '
  'consents (RLS on the base table also enforces this). The consent content is '
  'patient-facing informed-consent material, so no columns are excluded. Always '
  'query this view from patient-facing code, never consents directly.';
