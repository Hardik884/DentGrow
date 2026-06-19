# DentGrow — Complete Project Architecture

> **Staff Next.js Architect Design Document**
> This document is the authoritative architecture reference for the DentGrow project.
> It is derived from `CLAUDE.md` and the approved database migrations.
> No implementation code. Architecture decisions only.

---

## Table of Contents

1. [Folder Structure](#1-folder-structure)
2. [Route Structure](#2-route-structure)
3. [Feature Boundaries](#3-feature-boundaries)
4. [Shared Components](#4-shared-components)
5. [Server Actions Organization](#5-server-actions-organization)
6. [Supabase Client Organization](#6-supabase-client-organization)
7. [Type Organization](#7-type-organization)
8. [Validation Strategy](#8-validation-strategy)
9. [AI Integration Layer](#9-ai-integration-layer)
10. [Analytics Layer](#10-analytics-layer)
11. [Realtime Layer](#11-realtime-layer)
12. [Permission Layer](#12-permission-layer)

---

## 1. Folder Structure

The full project tree, annotated with the responsibility of each node.

```
dentgrow/
│
├── app/                              # Next.js 15 App Router root
│   ├── (auth)/                       # Route group — unauthenticated pages, no sidebar
│   │   ├── login/
│   │   │   └── page.tsx
│   │   ├── signup/
│   │   │   └── page.tsx              # Staff signup (invite-only in production)
│   │   └── layout.tsx                # Minimal centered card layout
│   │
│   ├── (dashboard)/                  # Route group — protected staff shell
│   │   ├── layout.tsx                # Auth guard + role resolution + sidebar shell
│   │   │
│   │   ├── dentist/                  # Dentist-only section
│   │   │   ├── layout.tsx            # Dentist nav items, AI Insights side panel slot
│   │   │   ├── page.tsx              # Dentist dashboard (KPIs + Insights + queue widget)
│   │   │   ├── patients/
│   │   │   │   ├── page.tsx          # Patient list + search
│   │   │   │   ├── new/
│   │   │   │   │   └── page.tsx      # Create patient form
│   │   │   │   └── [id]/
│   │   │   │       ├── page.tsx      # Patient profile (full view)
│   │   │   │       ├── edit/
│   │   │   │       │   └── page.tsx  # Edit patient form
│   │   │   │       └── treatments/
│   │   │   │           └── page.tsx  # Patient treatment history (dentist view)
│   │   │   ├── appointments/
│   │   │   │   ├── page.tsx          # Appointment list / calendar
│   │   │   │   ├── new/
│   │   │   │   │   └── page.tsx      # Book appointment form
│   │   │   │   └── [id]/
│   │   │   │       └── page.tsx      # Appointment detail + status controls
│   │   │   ├── queue/
│   │   │   │   └── page.tsx          # Live queue board + advance/skip controls
│   │   │   ├── treatments/
│   │   │   │   ├── page.tsx          # All treatments list (searchable)
│   │   │   │   └── [id]/
│   │   │   │       └── page.tsx      # Treatment detail + edit form
│   │   │   ├── payments/
│   │   │   │   ├── page.tsx          # Payment ledger + outstanding balances
│   │   │   │   └── new/
│   │   │   │       └── page.tsx      # Record payment form
│   │   │   ├── follow-ups/
│   │   │   │   ├── page.tsx          # All follow-ups list (overdue first)
│   │   │   │   └── [id]/
│   │   │   │       └── page.tsx      # Follow-up detail + edit
│   │   │   ├── analytics/
│   │   │   │   ├── layout.tsx        # Analytics nav tabs
│   │   │   │   ├── page.tsx          # Overview / summary
│   │   │   │   ├── appointments/
│   │   │   │   │   └── page.tsx      # Appointment analytics charts
│   │   │   │   ├── patients/
│   │   │   │   │   └── page.tsx      # Patient analytics charts
│   │   │   │   ├── treatments/
│   │   │   │   │   └── page.tsx      # Treatment analytics charts
│   │   │   │   ├── revenue/
│   │   │   │   │   └── page.tsx      # Revenue analytics charts
│   │   │   │   ├── sources/
│   │   │   │   │   └── page.tsx      # Acquisition source analytics
│   │   │   │   └── follow-ups/
│   │   │   │       └── page.tsx      # Follow-up analytics
│   │   │   └── settings/
│   │   │       ├── page.tsx          # Clinic settings form
│   │   │       └── availability/
│   │   │           └── page.tsx      # Availability rules management
│   │   │
│   │   └── receptionist/             # Receptionist-only section
│   │       ├── layout.tsx            # Receptionist nav items (no analytics, no AI)
│   │       ├── page.tsx              # Receptionist dashboard
│   │       ├── patients/
│   │       │   ├── page.tsx          # Patient list + search
│   │       │   ├── new/
│   │       │   │   └── page.tsx      # Create patient form
│   │       │   └── [id]/
│   │       │       └── page.tsx      # Patient profile (operational view)
│   │       ├── appointments/
│   │       │   ├── page.tsx          # Today's appointment list
│   │       │   ├── new/
│   │       │   │   └── page.tsx      # Book appointment form
│   │       │   └── [id]/
│   │       │       └── page.tsx      # Appointment detail + check-in control
│   │       ├── queue/
│   │       │   └── page.tsx          # Live queue + check-in action
│   │       └── payments/
│   │           ├── page.tsx          # Pending payments list
│   │           └── new/
│   │               └── page.tsx      # Record payment form
│   │
│   ├── portal/                       # Patient portal — separate layout, mobile-first
│   │   ├── layout.tsx                # Portal auth guard + portal nav
│   │   ├── page.tsx                  # Patient dashboard
│   │   ├── setup/
│   │   │   └── page.tsx              # Portal account linking flow (post-signup)
│   │   ├── appointments/
│   │   │   ├── page.tsx              # Upcoming appointments list
│   │   │   ├── new/
│   │   │   │   └── page.tsx          # Slot picker + booking form
│   │   │   └── [id]/
│   │   │       └── page.tsx          # Appointment detail + cancel button
│   │   ├── queue/
│   │   │   └── page.tsx              # Live queue position + estimated wait
│   │   ├── treatments/
│   │   │   └── page.tsx              # Treatment history (patient_visible_notes only)
│   │   └── payments/
│   │       └── page.tsx              # Payment history + outstanding balance
│   │
│   └── api/
│       └── webhooks/
│           └── n8n/
│               └── route.ts          # n8n inbound webhook handler (validates secret, logs)
│
├── components/
│   ├── ui/                           # shadcn/ui primitives (auto-generated, do not edit)
│   │
│   ├── shared/                       # Cross-role, cross-portal reusable components
│   │   ├── AppointmentCard.tsx
│   │   ├── AppointmentStatusBadge.tsx
│   │   ├── PatientSearch.tsx
│   │   ├── PatientAvatar.tsx
│   │   ├── StatusBadge.tsx
│   │   ├── OutstandingBalanceBadge.tsx
│   │   ├── DateRangePicker.tsx
│   │   ├── ConfirmDialog.tsx         # Generic confirm/cancel dialog (used by AI flows)
│   │   ├── ErrorBoundary.tsx
│   │   └── LoadingSpinner.tsx
│   │
│   ├── layouts/
│   │   ├── DashboardSidebar.tsx      # Staff dashboard sidebar (role-aware nav items)
│   │   ├── PortalNav.tsx             # Patient portal top navigation
│   │   └── PageHeader.tsx            # Page title + breadcrumb + action slot
│   │
│   ├── dentist/
│   │   ├── DashboardKPIs.tsx         # Today's KPI metric cards
│   │   ├── UpcomingAppointments.tsx
│   │   ├── PatientProfileHeader.tsx  # Demographics + quick stats
│   │   ├── TreatmentForm.tsx
│   │   ├── FollowUpForm.tsx
│   │   ├── PaymentForm.tsx
│   │   └── AppointmentStatusControl.tsx  # Lifecycle state machine UI
│   │
│   ├── receptionist/
│   │   ├── CheckInButton.tsx
│   │   ├── TodayAppointmentList.tsx
│   │   ├── PendingPaymentsList.tsx
│   │   └── PatientSearchBar.tsx      # Prominent search with quick-link results
│   │
│   ├── patient/
│   │   ├── PortalDashboard.tsx
│   │   ├── SlotPicker.tsx            # Date + time slot selection grid
│   │   ├── AppointmentList.tsx
│   │   ├── TreatmentHistoryList.tsx
│   │   ├── PaymentHistoryList.tsx
│   │   └── OutstandingBalanceCard.tsx
│   │
│   ├── queue/
│   │   ├── QueueBoard.tsx            # Full queue list with position numbers
│   │   ├── QueueEntry.tsx            # Single row: patient name, wait time, actions
│   │   ├── QueueWidget.tsx           # Compact "current + next" widget for dashboards
│   │   └── QueuePositionCard.tsx     # Patient portal — "You are #N in line"
│   │
│   ├── follow-ups/
│   │   ├── FollowUpList.tsx
│   │   ├── FollowUpForm.tsx
│   │   └── OverdueFollowUpBadge.tsx
│   │
│   ├── analytics/
│   │   ├── ChartCard.tsx             # Standard chart wrapper with title + loading state
│   │   ├── AppointmentsByStatusChart.tsx
│   │   ├── RevenueLineChart.tsx
│   │   ├── PeakHoursHeatmap.tsx
│   │   ├── PatientGrowthChart.tsx
│   │   ├── TreatmentBreakdownChart.tsx
│   │   ├── AcquisitionSourceChart.tsx
│   │   ├── FollowUpAnalyticsChart.tsx
│   │   └── DateRangeFilter.tsx       # Shared date range selector for analytics pages
│   │
│   └── ai/
│       ├── PatientSummaryCard.tsx    # "Generate Summary" button + result display
│       ├── CopilotChat.tsx           # Staff copilot chat panel (dentist + receptionist)
│       ├── InsightsPanel.tsx         # Dentist dashboard AI insights card
│       ├── PatientAssistant.tsx      # Patient portal persistent chat widget
│       └── AIFallbackMessage.tsx     # Shared fallback when Gemini is unavailable
│
├── lib/
│   ├── supabase/
│   │   ├── server.ts                 # createServerClient — used in Server Components + Actions
│   │   ├── client.ts                 # createBrowserClient — used in Client Components
│   │   └── middleware.ts             # Session refresh helper for Next.js middleware
│   │
│   ├── ai/
│   │   ├── gemini.ts                 # Gemini SDK initialisation + timeout wrapper
│   │   ├── prompts.ts                # All system + user prompt templates (no hardcoded clinic data)
│   │   ├── tools.ts                  # Copilot tool definitions (staff — typed, validated)
│   │   └── patient-tools.ts          # Patient AI Assistant tool definitions (patient-scoped)
│   │
│   ├── scheduling/
│   │   └── slots.ts                  # getAvailableSlots(date, clinicId) — pure slot generation logic
│   │
│   ├── analytics/
│   │   └── queries.ts                # Typed Supabase query builders for each analytics report
│   │
│   └── utils.ts                      # Shared helpers: date formatting, currency, status labels
│
├── actions/                          # Next.js Server Actions (mutations only)
│   ├── patients.ts
│   ├── appointments.ts
│   ├── queue.ts
│   ├── treatments.ts
│   ├── payments.ts
│   ├── follow-ups.ts
│   ├── clinic-settings.ts
│   ├── availability.ts
│   ├── portal-link.ts
│   └── ai.ts
│
├── types/
│   └── index.ts                      # All TypeScript types, enums, and Zod schemas
│
├── hooks/
│   ├── useQueue.ts                   # Supabase Realtime queue subscription
│   ├── useRealtimeAppointments.ts    # Realtime appointment updates
│   └── useClinicSettings.ts          # Cached clinic settings for client components
│
├── middleware.ts                     # Auth guard + role-based route protection
│
├── .env.local                        # Local secrets (never committed)
├── .env.example                      # Committed reference with placeholder values
│
└── supabase/
    └── migrations/                   # SQL migration files (source of truth for schema)
```

---

## 2. Route Structure

### Route Groups and Their Purpose

| Route Group | Path Prefix | Purpose |
|---|---|---|
| `(auth)` | `/login`, `/signup` | Unauthenticated pages with no sidebar |
| `(dashboard)` | `/dentist/*`, `/receptionist/*` | Protected staff shell with sidebar |
| `portal` | `/portal/*` | Patient portal — separate layout, mobile-first |
| `api` | `/api/*` | Webhooks and any future API-only handlers |

### Full Route Map

```
/                                   → redirect to /login (middleware)

── AUTH ─────────────────────────────────────────────────────────────────────
/login                              → (auth)/login/page.tsx
/signup                             → (auth)/signup/page.tsx

── DENTIST DASHBOARD ────────────────────────────────────────────────────────
/dentist                            → Dentist dashboard (KPIs, queue widget, insights)
/dentist/patients                   → Patient list with search
/dentist/patients/new               → Create patient
/dentist/patients/[id]              → Patient profile (full clinical view)
/dentist/patients/[id]/edit         → Edit patient demographics
/dentist/patients/[id]/treatments   → All treatments for this patient

/dentist/appointments               → Appointment list / calendar view
/dentist/appointments/new           → Book appointment (slot picker + form)
/dentist/appointments/[id]          → Appointment detail + lifecycle controls

/dentist/queue                      → Live queue board + advance/skip

/dentist/treatments                 → All treatments (searchable, filterable)
/dentist/treatments/[id]            → Treatment detail + edit

/dentist/payments                   → Payment ledger + outstanding balances
/dentist/payments/new               → Record payment

/dentist/follow-ups                 → Follow-up list (overdue highlighted)
/dentist/follow-ups/[id]            → Follow-up detail + edit

/dentist/analytics                  → Analytics overview
/dentist/analytics/appointments     → Appointment analytics
/dentist/analytics/patients         → Patient analytics
/dentist/analytics/treatments       → Treatment analytics
/dentist/analytics/revenue          → Revenue analytics
/dentist/analytics/sources          → Acquisition source analytics
/dentist/analytics/follow-ups       → Follow-up analytics

/dentist/settings                   → Clinic settings form
/dentist/settings/availability      → Availability rules

── RECEPTIONIST DASHBOARD ───────────────────────────────────────────────────
/receptionist                       → Receptionist dashboard (today's list, queue, search)
/receptionist/patients              → Patient list with search
/receptionist/patients/new          → Create patient
/receptionist/patients/[id]         → Patient profile (operational view — no clinical notes)

/receptionist/appointments          → Today's appointments
/receptionist/appointments/new      → Book appointment
/receptionist/appointments/[id]     → Appointment detail + check-in button

/receptionist/queue                 → Live queue + check-in action

/receptionist/payments              → Pending payments list
/receptionist/payments/new          → Record payment

── PATIENT PORTAL ───────────────────────────────────────────────────────────
/portal                             → Patient dashboard
/portal/setup                       → Account linking flow (phone match → portal link)
/portal/appointments                → Upcoming appointments
/portal/appointments/new            → Slot picker + booking
/portal/appointments/[id]           → Appointment detail + cancel button
/portal/queue                       → Live queue position + estimated wait time
/portal/treatments                  → Treatment history (patient_visible_notes only)
/portal/payments                    → Payment history + outstanding balance

── API ──────────────────────────────────────────────────────────────────────
/api/webhooks/n8n                   → n8n inbound webhook handler (POST only)
```

### Layout Hierarchy

```
RootLayout (app/layout.tsx)
  └── (auth)/layout.tsx           ← centered card, no nav
  └── (dashboard)/layout.tsx      ← auth check + sidebar shell
        └── dentist/layout.tsx    ← dentist-specific nav, AI insights slot
        └── receptionist/layout.tsx ← receptionist-specific nav
  └── portal/layout.tsx           ← portal auth check + portal nav (mobile-first)
```

---

## 3. Feature Boundaries

Each feature is a self-contained vertical slice. A feature owns its routes, Server Actions, and components. Cross-feature data sharing happens through Server Actions and typed return values — never by importing internals across feature boundaries.

### Feature Slice Map

| Feature | Routes | Actions File | Primary Components | Data Scope |
|---|---|---|---|---|
| **Patient Management** | `/dentist/patients/*`, `/receptionist/patients/*` | `actions/patients.ts` | `dentist/`, `receptionist/` patient components | `patients` table via `active_patients` view |
| **Appointment Management** | `/*/appointments/*` | `actions/appointments.ts` | `shared/AppointmentCard`, role-specific forms | `appointments` + `appointment_history` |
| **Queue Management** | `/*/queue` | `actions/queue.ts` | `queue/` components | `queue_entries` (today) |
| **Treatment Management** | `/dentist/treatments/*`, `/dentist/patients/[id]/treatments` | `actions/treatments.ts` | `dentist/TreatmentForm` | `treatments` (view depends on role) |
| **Payment Management** | `/*/payments/*` | `actions/payments.ts` | Role-specific payment components | `payments` table |
| **Follow-Up Management** | `/dentist/follow-ups/*` | `actions/follow-ups.ts` | `follow-ups/` components | `follow_ups` table |
| **Analytics** | `/dentist/analytics/*` | N/A (read-only via `lib/analytics/queries.ts`) | `analytics/` chart components | Aggregated read queries across all tables |
| **Clinic Settings** | `/dentist/settings/*` | `actions/clinic-settings.ts`, `actions/availability.ts` | Settings forms | `clinic_settings`, `availability_rules` |
| **Patient Portal** | `/portal/*` | `actions/appointments.ts`, `actions/portal-link.ts` | `patient/` components | Patient-scoped views |
| **AI Features** | Embedded in existing pages | `actions/ai.ts` | `ai/` components | Tool functions in `lib/ai/` |
| **Webhooks** | `/api/webhooks/n8n` | N/A (route handler) | None | `webhook_logs` |

### Cross-Feature Rules

- Appointment completion triggers patient `total_visits` / `last_visit` update — this side effect lives in `actions/appointments.ts`, not split across two action files.
- Queue check-in creates a `queue_entries` row — all queue logic stays in `actions/queue.ts`.
- Patient soft delete cascades to appointments, treatments, payments, and follow-ups — all in `actions/patients.ts` as a single transaction.
- AI features call into `lib/ai/tools.ts` which in turn calls `actions/` or direct Supabase server queries — AI never owns the data, only consumes tool results.

---

## 4. Shared Components

### Criteria for `components/shared/`

A component belongs in `shared/` when it is used by two or more roles (dentist, receptionist, patient) and carries no role-specific logic. Role-specific behaviour is passed via props, not embedded.

### Shared Component Catalog

| Component | Purpose | Used By |
|---|---|---|
| `AppointmentCard` | Displays a single appointment summary (status badge, patient name, time) | Dentist, Receptionist, Patient portal |
| `AppointmentStatusBadge` | Color-coded badge for all `appointment_status` enum values | All roles |
| `PatientSearch` | Debounced search input with dropdown results (name + phone) | Dentist, Receptionist |
| `PatientAvatar` | Initials-based avatar fallback | All role patient-facing views |
| `StatusBadge` | Generic status badge, accepts label + variant | All roles |
| `OutstandingBalanceBadge` | Red badge showing outstanding amount | Dentist, Receptionist, Patient portal |
| `DateRangePicker` | Shadcn-based date range selector | Analytics (dentist), payment filter |
| `ConfirmDialog` | Modal dialog with title, description, confirm/cancel buttons | AI flows, destructive actions |
| `ErrorBoundary` | React error boundary with fallback UI | Wraps all AI components, chart components |
| `LoadingSpinner` | Standard loading state, accepts size prop | All async sections |

### Component Composition Patterns

- All forms use `react-hook-form` + Zod resolver. The Zod schema is imported from `types/index.ts`, not defined inline.
- All charts use a `ChartCard` wrapper from `components/analytics/` that handles loading state, error state, and the shadcn `Card` frame — individual charts only render the chart markup.
- Realtime-dependent components (`QueueBoard`, `QueuePositionCard`) receive their initial data as Server Component props and subscribe to Realtime updates client-side via `hooks/useQueue.ts`.

---

## 5. Server Actions Organization

### Principles

- Every mutation goes through a Server Action in `actions/`. No direct Supabase mutations from Client Components.
- Every Server Action **re-validates** `clinic_id` and `role` from the server session. Client-supplied `clinic_id` is ignored.
- Every Server Action returns `{ data: T | null; error: string | null }`.
- Inputs are validated with Zod before any database access.
- `appointment_history` rows are written inside the same Server Action that mutates an appointment — never separately.

### Action File Responsibilities

**`actions/patients.ts`**
- `createPatient(input)` — inserts, sets `created_by` from session
- `updatePatient(id, input)` — updates, enforces role (dentist full, receptionist no soft-delete fields)
- `softDeletePatient(id)` — sets `deleted_at` + cascades to related records in a transaction
- `searchPatients(query)` — name or phone partial match via trigram index
- `getPatient(id)` — returns patient with pending follow-ups, outstanding balance
- `getPatients(filters)` — paginated list

**`actions/appointments.ts`**
- `createAppointment(input)` — staff booking path, validates slot availability, writes `appointment_history` row
- `updateAppointmentStatus(id, newStatus)` — enforces lifecycle order, writes history, triggers patient stat update on `completed`
- `rescheduleAppointment(id, newScheduledAt)` — updates time, writes history with old/new value
- `cancelAppointment(id, reason)` — terminal state, writes history
- `getAppointmentsToday()` — dashboard query, scoped to today + clinic
- `getAppointment(id)` — single appointment with history
- `getAppointments(filters)` — paginated list with status/date filters

**`actions/queue.ts`**
- `checkInPatient(appointmentId)` — creates `queue_entries` row with next position
- `advanceQueue(clinicId)` — moves `in_progress` → `completed`, promotes first `waiting` → `in_progress`
- `skipPatient(queueEntryId)` — moves entry to end of queue, recalculates positions
- `getTodayQueue()` — full queue for today's date, scoped to clinic
- `getQueueStatus(patientId)` — patient's own position, patients ahead, estimated wait

**`actions/treatments.ts`**
- `createTreatment(input)` — dentist only, sets `created_by`
- `updateTreatment(id, input)` — dentist only
- `softDeleteTreatment(id)` — dentist only
- `getTreatmentsForAppointment(appointmentId)` — returns all treatments for an appointment; dentist gets full record, receptionist path uses `receptionist_treatments` view (excludes `internal_notes`)
- `getPatientTreatments(patientId)` — patient portal path uses `patient_treatments` view

**`actions/payments.ts`**
- `recordPayment(input)` — staff only, sets `created_by`
- `getPatientPayments(patientId)` — full ledger
- `getOutstandingBalance(patientId)` — computed server-side: `SUM(treatments.cost) - SUM(payments.amount)`
- `getPaymentsToday()` — revenue today for dashboard KPI

**`actions/follow-ups.ts`**
- `createFollowUp(input)` — dentist only
- `updateFollowUp(id, input)` — dentist only
- `completeFollowUp(id)` — sets status to `completed`
- `cancelFollowUp(id)` — sets status to `cancelled`
- `getFollowUpsForPatient(patientId)` — all follow-ups for a patient profile
- `getOverdueFollowUps()` — dentist dashboard and analytics

**`actions/clinic-settings.ts`**
- `getClinicSettings()` — read for any clinic member; used in AI prompts, scheduling
- `updateClinicSettings(input)` — dentist only

**`actions/availability.ts`**
- `getAvailabilityRules()` — all rules for the clinic
- `createAvailabilityRule(input)` — dentist only
- `updateAvailabilityRule(id, input)` — dentist only
- `toggleAvailabilityRule(id, isActive)` — dentist only
- `getAvailableSlots(date)` — delegates to `lib/scheduling/slots.ts`, returns open slot times

**`actions/portal-link.ts`**
- `linkPortalAccount(phone)` — called post-signup; matches auth user to patient by phone, creates `patient_portal_links` row
- `getLinkedPatient()` — resolves the authenticated portal user's `patient_id`
- `checkPortalLinkStatus()` — returns `linked | unlinked | no_match` for setup page

**`actions/ai.ts`**
- `generatePatientSummary(patientId)` — dentist only; assembles context, calls Gemini, returns text
- `generateInsights()` — dentist only; fetches metric payload, calls Gemini, returns bullet list
- `sendCopilotMessage(history, message)` — dentist/receptionist; handles tool-call loop with Gemini
- `sendPatientAssistantMessage(history, message)` — portal patients; tool-call loop using `patient-tools.ts`

### Action Return Type Contract

```typescript
// Enforced on all Server Actions
type ActionResult<T> = {
  data: T | null;
  error: string | null;
}
```

---

## 6. Supabase Client Organization

### Two Clients, Two Contexts

DentGrow uses two distinct Supabase client instances. Mixing them causes session and RLS errors.

| Client | File | When to Use |
|---|---|---|
| Server client | `lib/supabase/server.ts` | Server Components, Server Actions, Route Handlers, Middleware |
| Browser client | `lib/supabase/client.ts` | Client Components (Realtime subscriptions, auth state listeners) |

### `lib/supabase/server.ts`

- Wraps `createServerClient` from `@supabase/ssr`.
- Reads/writes cookies via Next.js `cookies()`.
- Used in every Server Action and every Server Component that queries data.
- Returns a typed client using the generated `Database` type from `database.types.ts`.
- Never imported in files with `'use client'`.

### `lib/supabase/client.ts`

- Wraps `createBrowserClient` from `@supabase/ssr`.
- Created once per component mount via a stable ref pattern (prevents re-creation on re-renders).
- Used **only** for Realtime subscriptions and client-side auth state changes.
- Data fetching always goes through Server Actions — the browser client is not used for queries.

### `lib/supabase/middleware.ts`

- Exports a `updateSession(request)` helper.
- Called from `middleware.ts` to refresh the user's session cookie on every request.
- Also provides `getSessionUser(request)` for the route guard logic.

### Service Role Usage

- The Supabase service role key (`SUPABASE_SERVICE_ROLE_KEY`) is only used in:
  - The `create_patient_appointment` database function (called via RPC in `actions/portal-link.ts`)
  - `app/api/webhooks/n8n/route.ts` for writing to `webhook_logs` without RLS
  - Any future admin-only operations
- The service role client is constructed inline in the specific server-side location that needs it — never exported as a module-level singleton.

### Generated Types

- `database.types.ts` is generated by the Supabase CLI (`supabase gen types typescript`).
- All row types (`Tables<'patients'>`, etc.) are derived from this file.
- `types/index.ts` re-exports and extends these generated types with application-level types and enums.

---

## 7. Type Organization

All application types live in `types/index.ts`. This is the single source of truth for TypeScript types across the project.

### Structure of `types/index.ts`

**Section 1 — Database Type Re-exports**
- Re-exports from `database.types.ts`:
  - `Database` — full generated type
  - Row types: `Patient`, `Appointment`, `Treatment`, `Payment`, `FollowUp`, `QueueEntry`, `Profile`, `ClinicSettings`, `AvailabilityRule`, `AppointmentHistory`
  - Insert types: `PatientInsert`, `AppointmentInsert`, etc.
  - Update types: `PatientUpdate`, `AppointmentUpdate`, etc.

**Section 2 — Enum Types**
- Derived from database enums; redefined as TypeScript `as const` objects for use in application logic and UI:
  - `AppointmentStatus` — `scheduled | checked_in | in_progress | completed | cancelled | no_show`
  - `AppointmentSource` — `walk_in | phone_call | website | referral | other`
  - `TreatmentStatus` — `planned | in_progress | completed | cancelled`
  - `PaymentMethod` — `cash | upi | card | bank_transfer`
  - `FollowUpStatus` — `pending | completed | cancelled`
  - `QueueStatus` — `waiting | in_progress | completed`
  - `UserRole` — `dentist | receptionist | patient`
  - `GenderType` — `male | female | other`

**Section 3 — Computed / Extended Types**
Types that extend raw DB rows with derived fields:
- `PatientWithBalance` — `Patient & { outstandingBalance: number }`
- `PatientWithFollowUps` — `Patient & { pendingFollowUps: FollowUp[] }`
- `PatientFull` — `Patient & { outstandingBalance: number; pendingFollowUps: FollowUp[] }`
- `AppointmentWithPatient` — `Appointment & { patient: Pick<Patient, 'id' | 'name' | 'phone'> }`
- `QueueEntryWithPatient` — `QueueEntry & { patient: Pick<Patient, 'id' | 'name'> }`
- `TreatmentForReceptionist` — Omit of `internal_notes` from `Treatment`
- `TreatmentForPatient` — Only patient-visible fields

**Section 4 — Server Action Result Types**
- `ActionResult<T>` — `{ data: T | null; error: string | null }`

**Section 5 — Zod Schemas**
Validation schemas for all Server Action inputs. Each schema is co-located with its type:
- `CreatePatientSchema` / `CreatePatientInput`
- `UpdatePatientSchema` / `UpdatePatientInput`
- `CreateAppointmentSchema` / `CreateAppointmentInput`
- `RescheduleAppointmentSchema` / `RescheduleAppointmentInput`
- `CreateTreatmentSchema` / `CreateTreatmentInput`
- `RecordPaymentSchema` / `RecordPaymentInput`
- `CreateFollowUpSchema` / `CreateFollowUpInput`
- `UpdateClinicSettingsSchema` / `UpdateClinicSettingsInput`
- `CreateAvailabilityRuleSchema` / `CreateAvailabilityRuleInput`

**Section 6 — AI Types**
- `CopilotMessage` — `{ role: 'user' | 'model'; content: string }`
- `CopilotToolCall` — typed tool call structures
- `InsightItem` — `{ text: string }`
- `PatientSummaryResult` — `{ summary: string }`
- `AIToolName` — union of all allowed tool names

**Section 7 — Analytics Types**
Typed return shapes for all analytics queries:
- `AppointmentAnalytics`
- `RevenueAnalytics`
- `PatientAnalytics`
- `TreatmentAnalytics`
- `SourceAnalytics`
- `FollowUpAnalytics`

**Section 8 — Session / Auth Types**
- `SessionUser` — `{ id: string; role: UserRole; clinicId: string }`
- `PortalUser` — `{ id: string; patientId: string; clinicId: string }`

---

## 8. Validation Strategy

### Layered Validation

DentGrow validates data at three layers. Each layer has a distinct responsibility. They are complementary, not alternatives.

```
Layer 1: UI / Form (client)
    react-hook-form + Zod resolver
    → Immediate user feedback, prevents bad submits
    → Does NOT trust server with invalid data

Layer 2: Server Action (server)
    Zod schema parse before any DB call
    Session-based clinic_id and role re-validation
    Business rule enforcement (status transitions, slot conflicts)
    → Hard validation — rejects anything invalid

Layer 3: Database (Postgres)
    RLS policies (clinic_id scope, role checks)
    CHECK constraints (durations > 0, valid day_of_week, etc.)
    Unique partial indexes (slot conflicts, phone deduplication)
    Triggers (dentist role validation on appointments.dentist_id)
    → Final safety net — catches anything that slips past layers 1 and 2
```

### Zod Schema Location

All Zod schemas are defined in `types/index.ts` alongside their inferred TypeScript types. They are imported into:
- Server Action files for `schema.parse(input)` server-side validation
- Form component files for `zodResolver(schema)` client-side validation

The same schema is reused at both layers — no duplication.

### Special Validation Cases

**Appointment status transitions**
- Not a Zod schema concern — it is a business rule.
- Enforced in `actions/appointments.ts` via a typed transition map:
  ```
  VALID_TRANSITIONS = {
    scheduled:  ['checked_in', 'cancelled', 'no_show'],
    checked_in: ['in_progress', 'cancelled', 'no_show'],
    in_progress: ['completed'],
    completed:  [],
    cancelled:  [],
    no_show:    [],
  }
  ```
- Any transition not in this map returns `{ data: null, error: 'Invalid status transition' }`.

**Phone number format**
- Validated in `CreatePatientSchema` using a Zod `.regex()` pattern.
- The same pattern is enforced by the DB's partial unique index to prevent duplicates.

**Outstanding balance**
- Always computed server-side in `actions/payments.ts` — never accepted from client input.
- The formula `SUM(treatments.cost) - SUM(payments.amount)` is the only valid source.

**Clinic ID trust boundary**
- `clinic_id` is **never** accepted from the request body or client state.
- Every Server Action resolves `clinic_id` from `auth.uid()` → `profiles.clinic_id`.
- Any input that includes `clinic_id` has the field stripped or ignored before processing.

**AI tool inputs**
- All arguments passed from the Gemini model to a tool function are validated with Zod before the database call executes.
- The Gemini model output is treated as untrusted input.

---

## 9. AI Integration Layer

### Architecture Principle

The AI layer is a consumer of application data, not a producer. Gemini receives structured payloads assembled by the application and returns structured text. It has no database access, no credentials, and no authority to execute side effects directly.

### File Responsibilities

**`lib/ai/gemini.ts`**
- Initialises the Google AI SDK with `GOOGLE_AI_API_KEY`.
- Exports a single `getGeminiModel()` factory that returns the `gemini-flash-lite-3.1` model instance.
- Wraps all calls in a 10-second timeout. On timeout, throws a typed `AITimeoutError`.
- Catches `GoogleGenerativeAIError` and normalises it to the application's error shape.

**`lib/ai/prompts.ts`**
- All system prompts and user prompt templates are defined here as typed template functions.
- No clinic-specific data is hardcoded. Clinic name, hours, and contact info are injected via `clinic_settings` at call time.
- Prompts define safety boundaries: no clinical diagnosis, no medication recommendations, no treatment plans.
- Exports:
  - `buildPatientSummaryPrompt(context)`
  - `buildInsightsPrompt(metrics)`
  - `buildCopilotSystemPrompt(sessionContext)`
  - `buildPatientAssistantSystemPrompt(clinicInfo)`

**`lib/ai/tools.ts`** — Copilot tools (staff)
- Defines the typed tool set available to the Clinic Copilot.
- Each tool is a typed function that accepts validated inputs and returns structured data.
- Tools are executed by the application, not by Gemini directly.
- Tool definitions include the JSON schema description passed to Gemini for function calling.
- Tools: `getTodayAppointments`, `getPendingPayments`, `getNoShowTrends`, `getPatientHistory`, `getWalkInStats`

**`lib/ai/patient-tools.ts`** — Patient AI Assistant tools
- Scoped strictly to the authenticated patient's `patient_id` and `clinic_id`.
- Tools: `getAvailableSlots`, `createAppointment`, `rescheduleAppointment`, `cancelAppointment`, `getQueueStatus`, `getPatientAppointments`, `getPatientTreatments`, `getPatientPayments`, `getClinicInformation`
- Mutating tools (`createAppointment`, `rescheduleAppointment`, `cancelAppointment`) require an explicit `confirmed: true` flag in their input — the assistant must present the action to the user and receive confirmation before calling.

### AI Feature Data Flow

```
1. User triggers AI feature (button click, chat message)
2. Client Component calls Server Action in actions/ai.ts
3. Server Action assembles structured payload (queries DB via server client)
4. Server Action calls lib/ai/gemini.ts with prompt + payload
5. Gemini responds with text OR a tool_call request
6. If tool_call: Server Action executes the tool function from lib/ai/tools.ts
7. Tool result is injected back into the conversation
8. Final text response is returned to the Client Component
9. Client Component renders the result; errors show AIFallbackMessage
```

### AI Feature Isolation

Each AI feature has a dedicated UI component in `components/ai/`:

| Feature | Component | Trigger | Fallback |
|---|---|---|---|
| Patient Summary | `PatientSummaryCard` | "Generate Summary" button | "Unable to generate summary." inline message |
| AI Insights | `InsightsPanel` | Page load (non-blocking) | "Insights temporarily unavailable." card |
| Clinic Copilot | `CopilotChat` | Chat panel open | "AI assistant is temporarily unavailable." |
| Patient Assistant | `PatientAssistant` | Persistent widget | "Please use the menu to manage your appointments." |

All AI components are wrapped in `ErrorBoundary`. An AI error never propagates to the parent page.

### Confirmation Gate for Mutating Actions

The Patient Assistant and Copilot follow a strict two-turn pattern for mutations:

```
Turn 1: User expresses intent
  → Model identifies the action, proposes it with full details
  → Model does NOT call the mutating tool
  → UI renders a ConfirmDialog or confirmation card

Turn 2: User confirms (or cancels)
  → On confirm: Server Action calls the mutating tool
  → On cancel: conversation continues without side effects
```

This is enforced architecturally: mutating tool functions in `patient-tools.ts` check for `confirmed: true` and reject calls where it is absent.

---

## 10. Analytics Layer

### Design Principles

- Analytics is read-only. No Server Actions with mutations exist under analytics routes.
- All queries are scoped to `clinic_id` from the server session.
- All queries support a date range filter (default: last 30 days).
- Analytics queries are defined in `lib/analytics/queries.ts` as typed Supabase query builder functions — never raw SQL in page components.
- Analytics is accessible to the `dentist` role only. Middleware and RLS both enforce this.

### Query Module: `lib/analytics/queries.ts`

Each analytics domain has one or more typed query functions. They accept `{ clinicId, dateFrom, dateTo }` and return typed result objects.

| Query Function | Returns | Source Tables |
|---|---|---|
| `getAppointmentAnalytics` | `AppointmentAnalytics` | `appointments` |
| `getPatientAnalytics` | `PatientAnalytics` | `patients`, `appointments` |
| `getTreatmentAnalytics` | `TreatmentAnalytics` | `treatments` |
| `getRevenueAnalytics` | `RevenueAnalytics` | `payments`, `appointments`, `treatments` |
| `getSourceAnalytics` | `SourceAnalytics` | `appointments` |
| `getFollowUpAnalytics` | `FollowUpAnalytics` | `follow_ups` |
| `getDashboardKPIs` | `DashboardKPIs` | `appointments`, `patients`, `payments`, `queue_entries` |

### Chart Component Strategy

Each analytics page is a Server Component that fetches data via the query functions, then passes typed props to Client Component charts.

```
/dentist/analytics/revenue/page.tsx   (Server Component)
  → calls getRevenueAnalytics({ clinicId, dateFrom, dateTo })
  → passes typed data to:
     <RevenueLineChart data={revenueData} />
     <PaymentMethodDonut data={methodBreakdown} />
     <SourceRevenueBar data={sourceRevenue} />
```

The `DateRangeFilter` component lives in the analytics layout. Its selected range is propagated via URL search params (`?from=&to=`) — no client state management library needed.

### Dashboard KPI Queries

The dentist dashboard fetches `getDashboardKPIs()` on page load. This is a focused query for today's metrics only, not the full analytics date-range queries. It returns:
- `totalAppointmentsToday`
- `seenPatientsToday`
- `completionRateToday`
- `waitingPatients`
- `noShowsToday`
- `revenueToday`
- `newPatientsToday`
- `walkInsToday`

These KPIs are rendered in `components/dentist/DashboardKPIs.tsx`.

---

## 11. Realtime Layer

### What Uses Realtime

Supabase Realtime is scoped to the `queue_entries` table only for MVP. This covers:
- Staff queue board (`/dentist/queue`, `/receptionist/queue`) — live position updates
- Patient portal queue page (`/portal/queue`) — live position and estimated wait time
- Dashboard queue widget (dentist and receptionist dashboards) — current/next patient

`appointments` Realtime is stubbed in `hooks/useRealtimeAppointments.ts` for future use (e.g., live today's schedule updates) but not surfaced in MVP UI.

### Hook: `hooks/useQueue.ts`

This is the single hook that manages the Realtime queue subscription.

- Creates the Supabase browser client from `lib/supabase/client.ts`.
- Subscribes to `queue_entries` changes filtered by `clinic_id` and `queue_date = today`.
- Exposes: `queue` (array of `QueueEntryWithPatient`), `isLoading`, `error`.
- Initial data is fetched server-side and passed as `initialQueue` prop to avoid a loading flash.
- Subscription is established on mount and cleaned up on unmount.
- The hook handles reconnection automatically via Supabase Realtime's built-in retry logic.

### Component Usage Pattern

```
page.tsx (Server Component)
  → fetches initialQueue via actions/queue.ts
  → passes initialQueue to QueueBoard

QueueBoard.tsx (Client Component, 'use client')
  → calls useQueue({ initialQueue, clinicId })
  → renders QueueEntry for each entry
  → re-renders automatically on Realtime events
```

`QueueWidget.tsx` on dashboards follows the same pattern with a condensed display (current patient + next in line).

`QueuePositionCard.tsx` in the patient portal uses the same hook but filters client-side for the authenticated patient's entry, showing their position number and estimated wait.

### Wait Time Estimation

Estimated wait is computed client-side from Realtime data:
```
estimatedWait = patientsAhead × clinic_settings.average_appointment_duration
```
`clinic_settings.average_appointment_duration` is fetched server-side and passed as a prop — it does not need a Realtime subscription.

### Realtime Security

- Supabase Realtime respects RLS. Patients only receive queue entries where `patient_id` matches their portal link. Staff receive all entries for their `clinic_id`.
- No sensitive clinical data (`internal_notes`, etc.) is present in `queue_entries` — the table contains only position, status, and foreign keys.

---

## 12. Permission Layer

The permission system is layered. Each layer is independent — a failure at one layer does not mean another layer is bypassed.

```
Layer 1: Next.js Middleware        → Route-level access control
Layer 2: Layout / Page Guards      → Role-specific UI access
Layer 3: Server Action Guards      → Mutation-level role enforcement
Layer 4: Supabase RLS              → Row-level data isolation (final guarantee)
```

### Layer 1 — Next.js Middleware (`middleware.ts`)

Runs on every request before any page or API route handler.

**Responsibilities:**
1. Refresh the Supabase session cookie via `lib/supabase/middleware.ts`.
2. Resolve the authenticated user's role and session from the refreshed session.
3. Enforce route-to-role mapping:

| Path Prefix | Required Role | Redirect on Failure |
|---|---|---|
| `/dentist/*` | `dentist` | `/login` (unauthenticated) or `/receptionist` (wrong role) |
| `/receptionist/*` | `receptionist` | `/login` or `/dentist` |
| `/portal/*` | any authenticated | `/login` (unauthenticated) or `/portal/setup` (no portal link) |
| `/api/webhooks/n8n` | none (secret-based) | 401 on missing/invalid secret |
| `/login`, `/signup` | unauthenticated | `/dentist` or `/receptionist` (already logged in) |

4. For `/portal/*`: check whether the user has a row in `patient_portal_links`. If not, redirect to `/portal/setup` (except when already on `/portal/setup`).

**What middleware does NOT do:**
- Middleware does not fetch data beyond the session. No DB queries for clinic data.
- Middleware does not replace RLS — it is a UX redirect layer, not a security boundary.

### Layer 2 — Layout Guards

Each route group layout verifies the session and role. This is a redundant check that prevents Server Components from rendering if the middleware was somehow bypassed.

- `(dashboard)/layout.tsx` — verifies session exists, resolves `SessionUser`, passes to context.
- `dentist/layout.tsx` — asserts `role === 'dentist'`. Renders 403 page if not.
- `receptionist/layout.tsx` — asserts `role === 'receptionist'`. Renders 403 page if not.
- `portal/layout.tsx` — resolves `PortalUser` via `actions/portal-link.ts`. Renders setup prompt if no link exists.

### Layer 3 — Server Action Guards

Every mutating Server Action begins with a session check:

```typescript
// Pattern enforced in every action
const supabase = createServerClient()
const { data: { user } } = await supabase.auth.getUser()
if (!user) return { data: null, error: 'Unauthorized' }

const { data: profile } = await supabase
  .from('profiles')
  .select('clinic_id, role')
  .eq('id', user.id)
  .single()

if (!profile) return { data: null, error: 'Unauthorized' }

// Then check role for the specific action:
if (profile.role !== 'dentist') return { data: null, error: 'Forbidden' }

// Use profile.clinic_id — never client-supplied clinic_id
```

Role-based restrictions per action:

| Action | Dentist | Receptionist | Patient |
|---|---|---|---|
| `createPatient` | ✅ | ✅ | ❌ |
| `softDeletePatient` | ✅ | ❌ | ❌ |
| `createTreatment` | ✅ | ❌ | ❌ |
| `getTreatmentsForAppointment` | ✅ (full) | ✅ (no internal_notes) | ❌ |
| `createFollowUp` | ✅ | ❌ | ❌ |
| `updateClinicSettings` | ✅ | ❌ | ❌ |
| `generatePatientSummary` | ✅ | ❌ | ❌ |
| `generateInsights` | ✅ | ❌ | ❌ |
| `sendCopilotMessage` | ✅ | ✅ | ❌ |
| `sendPatientAssistantMessage` | ❌ | ❌ | ✅ (own data only) |
| `recordPayment` | ✅ | ✅ | ❌ |
| `checkInPatient` | ✅ | ✅ | ❌ |
| `advanceQueue` | ✅ | ✅ | ❌ |

### Layer 4 — Supabase RLS

RLS is the authoritative security boundary. Application layers above are UX convenience.

**Staff policies (dentist + receptionist):**
- All policies use `clinic_id = auth_clinic_id()` to scope to the user's clinic.
- `auth_clinic_id()` is a `SECURITY DEFINER` function that resolves `clinic_id` from `profiles` for `auth.uid()`.
- Soft-delete enforcement: all `SELECT` policies include `deleted_at IS NULL`.
- Write policies use both `USING` (existing row check) and `WITH CHECK` (new row check) to prevent cross-clinic writes.

**Patient portal policies:**
- Use `auth_patient_id()` — a `SECURITY DEFINER` function resolving `patient_id` from `patient_portal_links` for `auth.uid()`.
- All patient `SELECT` policies: `patient_id = auth_patient_id()`.
- No direct `INSERT` for patients on `appointments` — handled by the `create_patient_appointment()` SECURITY DEFINER function.
- `patient_treatments` and `patient_treatments` views enforce column-level data restriction (`internal_notes` excluded).

**Receptionist treatment access:**
- Receptionists query the `receptionist_treatments` view, which excludes `internal_notes`.
- The view uses `security_invoker = true` so RLS on the base `treatments` table is still evaluated as the receptionist.

**Append-only tables:**
- `appointment_history` has no INSERT/UPDATE/DELETE RLS for any user role.
- All writes go through `SECURITY DEFINER` server actions using the service role.
- `webhook_logs` similarly allows no user-role writes.

### Permission Matrix Summary

| Module | Dentist | Receptionist | Patient (Portal) |
|---|---|---|---|
| Patients (CRUD) | Full | Create + Read + Update | Own record only |
| Appointments | Full | Full | Book/view/cancel own |
| Queue | Manage | Check-in + View | View own position |
| Treatments | Full | View (no internal notes) | View own (patient_visible_notes) |
| Payments | Full | Create + Read + Update | View own |
| Follow-Ups | Full | None | View own |
| Analytics | Full | None | None |
| Clinic Settings | Read + Write | Read | None |
| Availability Rules | Read + Write | Read | None |
| AI — Patient Summary | ✅ | ❌ | ❌ |
| AI — Copilot | ✅ | ✅ | ❌ |
| AI — Insights | ✅ | ❌ | ❌ |
| AI — Patient Assistant | ❌ | ❌ | ✅ |

---

---

## Architecture Decision Records

Key decisions that shape the entire codebase. Record them here to prevent re-litigating.

### ADR-001: Server Actions over API Routes

**Decision:** All data mutations use Next.js Server Actions. API routes are only for webhooks (`/api/webhooks/n8n`) and any future third-party callbacks.

**Rationale:** Server Actions colocate mutation logic with the Server Component tree, eliminate a round-trip layer, and naturally re-validate session context on every call. API routes would require duplicating session checks and return format contracts.

**Consequence:** No `axios`, no `react-query` for mutations. Forms use `react-hook-form` with Server Action form bindings or explicit client-side `startTransition` calls.

---

### ADR-002: No Direct Supabase Calls from Client Components

**Decision:** Client Components never call Supabase for data fetching. Data flows downward as props from Server Components. The browser Supabase client is only for Realtime subscriptions and auth state listeners.

**Rationale:** Prevents accidental exposure of query logic to the client, keeps RLS as the sole data boundary, and avoids dual data-fetching patterns.

**Consequence:** All data dependencies are resolved at the Server Component level and passed as typed props.

---

### ADR-003: Feature-Scoped Components, Role-Scoped Directories

**Decision:** Components are organized by role (`dentist/`, `receptionist/`, `patient/`), not by entity. Shared components go in `shared/` when used by two or more roles.

**Rationale:** Role boundaries map directly to feature access restrictions. Grouping by role makes it immediately obvious which components carry role assumptions.

**Consequence:** Some components may appear duplicated across role directories with minor differences. This is intentional — avoid "one component with 10 role-based conditionals".

---

### ADR-004: Zod Schemas as the Single Source of Validation Truth

**Decision:** One Zod schema per entity input, defined in `types/index.ts`, reused at both the form layer (`zodResolver`) and the Server Action layer (`schema.parse`).

**Rationale:** Eliminates schema drift between client and server. Adding a new field requires one schema change.

**Consequence:** All form validation imports from `types/index.ts`. No inline Zod schemas in form components.

---

### ADR-005: AI Resilience — Never Block Core Operations

**Decision:** AI features are optional enhancements. Every AI call is wrapped in try/catch with a fallback component. No page render depends on a Gemini response.

**Rationale:** Gemini is a third-party service. Clinic operations (appointments, queue, payments) must never be impacted by AI downtime.

**Consequence:** AI components render independently of their surrounding page. Errors in `InsightsPanel` do not affect the dentist dashboard's KPIs.

---

### ADR-006: Soft Deletes via Active Views

**Decision:** Application code queries `active_patients`, `active_appointments`, `active_treatments`, `active_payments`, `active_follow_ups` views instead of base tables wherever possible.

**Rationale:** The `deleted_at IS NULL` filter is easy to forget in individual queries. Views apply it automatically and reduce the risk of leaking deleted records.

**Consequence:** Server Actions import from views, not base tables, for reads. Soft-delete mutations still target base tables (`UPDATE patients SET deleted_at = now()`).

---

### ADR-007: Appointment History Written in the Same Transaction

**Decision:** Every appointment mutation Server Action writes the `appointment_history` row in the same database operation using the service role client.

**Rationale:** The history must be consistent with the appointment state. If the appointment update succeeds but the history write fails, the audit trail has a gap.

**Consequence:** `actions/appointments.ts` uses the service role client for history inserts. The regular session client handles the appointment mutation, and both are called within a logical transaction boundary (or a DB function if atomicity is required).

---

*End of Architecture Document*

> This document must be kept in sync with `CLAUDE.md`. When `CLAUDE.md` changes (new features, schema updates, role changes), update the corresponding sections here before implementing.
