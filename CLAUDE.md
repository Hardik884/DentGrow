# CLAUDE.md — DentGrow

> **Single source of truth for all AI-assisted and human development on the DentGrow project.**
> Every engineer or AI coding agent working on this codebase must read this document before writing any code.

---

## Table of Contents

1. [Product Overview](#1-product-overview)
2. [Tech Stack](#2-tech-stack)
3. [User Roles & Permissions](#3-user-roles--permissions)
4. [Core Modules](#4-core-modules)
5. [Detailed Feature Requirements](#5-detailed-feature-requirements)
6. [Dashboard Requirements](#6-dashboard-requirements)
7. [Analytics Requirements](#7-analytics-requirements)
8. [AI Features](#8-ai-features)
9. [n8n Workflows](#9-n8n-workflows)
10. [Multi-Tenant Architecture](#10-multi-tenant-architecture)
11. [Database Schema](#11-database-schema)
12. [Project Structure](#12-project-structure)
13. [Development Principles](#13-development-principles)
14. [Non-Goals for MVP](#14-non-goals-for-mvp)
15. [Environment Variables](#15-environment-variables)
16. [Future Scalability Notes](#16-future-scalability-notes)
17. [Appendix: Key Type Definitions](#appendix-key-type-definitions)

---

## 1. Product Overview

### What is DentGrow?

DentGrow is an AI-powered dental practice management system designed specifically for small and medium dental clinics. It centralises patient records, appointment scheduling, real-time queue management, treatment tracking, payments, and analytics into a single web application — augmented with AI features that surface insights and assist clinical and administrative workflows.

### Problems It Solves

| Problem | How DentGrow Addresses It |
|---|---|
| Paper-based or fragmented patient records | Centralised digital patient profiles with full visit history |
| Manual appointment booking and rescheduling | Structured appointment lifecycle with source tracking |
| No visibility into the waiting room | Real-time queue management with live position updates |
| Inconsistent treatment documentation | Structured treatment records with notes, cost, and status |
| Difficulty tracking outstanding payments | Payment ledger with outstanding balance per patient |
| No data-driven decision making | Built-in analytics across appointments, revenue, and patients |
| Reactive practice management | AI-generated insights and a conversational Clinic Copilot |

### Target Users

- **Dentists** — Clinical owners or practitioners who need full access to clinical and business data.
- **Receptionists** — Front-desk staff who manage bookings, check-ins, and payments.
- **Patients** — Individuals who use the patient portal to book, track appointments, and review their history.

---

## 2. Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15 (App Router) |
| Language | TypeScript (strict mode) |
| Database & Backend | Supabase (PostgreSQL) |
| Authentication | Supabase Auth |
| Real-time | Supabase Realtime |
| AI Model | Gemini 3.1 Flash Lite |
| Automation | n8n |
| Styling | Tailwind CSS |
| UI Components | shadcn/ui |

### Key Conventions

- Use **Server Actions** as the primary data mutation pattern. Avoid API routes unless absolutely necessary (e.g., webhooks, n8n callbacks).
- Use **Next.js App Router** exclusively. No Pages Router.
- Supabase client is split: `createServerClient` for server components/actions, `createBrowserClient` for client components.
- All database access must enforce **Row Level Security (RLS)** policies scoped to `clinic_id`.

---

## 3. User Roles & Permissions

Roles are stored in the `profiles` table and enforced via Supabase RLS policies and middleware route guards.

### Role: `dentist`

Full access to all modules and data within their clinic.

| Module | Access |
|---|---|
| Patients | Create, read, update, delete |
| Appointments | Create, read, update, cancel, reschedule |
| Queue | Read, manage (advance, skip) |
| Treatments | Create, read, update, delete |
| Payments | Create, read, update |
| Analytics | Full dashboard + all reports |
| AI Features | Patient summary, Copilot, Insights |
| Settings | Clinic settings, user management |

### Role: `receptionist`

Operational access for front-desk workflows. No access to clinical treatment details or analytics.

| Module | Access |
|---|---|
| Patients | Create, read, update (no delete) |
| Appointments | Create, read, update, cancel, reschedule |
| Queue | Check-in patients, view waiting queue, advance queue |
| Payments | Create, read, update |
| Check-ins | Full access |
| Analytics | None |
| AI Features | None |

### Role: `patient`

Self-service portal access. Patients can only see their own data.

| Module | Access |
|---|---|
| Appointments | Book new (view available slots), view own, cancel future appointments |
| Queue | View own queue position and estimated wait time (real-time) |
| Treatment History | View own completed treatments |
| Payments | View own payment history and outstanding balance |
| Follow-Ups | View own pending follow-ups |
| AI Assistant | Conversational access to own data via Patient AI Assistant |

---

## 4. Core Modules

### 4.1 Patient Management

Central registry of all patients belonging to a clinic. Each patient record aggregates visits, treatments, and payment history. Supports search, filtering, and AI-powered summaries.

### 4.2 Appointment Management

Structured booking lifecycle from creation through completion. Tracks the source of each booking and maintains a full status history. Supports rescheduling and cancellation with reason capture.

### 4.3 Queue Management

Real-time waiting room management. Patients are checked in upon arrival and placed in a queue. The dentist or receptionist advances the queue. All connected clients receive live updates via Supabase Realtime.

### 4.4 Treatment Management

Per-appointment clinical records. Each treatment is linked to a patient and an appointment. Dentists document treatment type, notes, cost, and status.

### 4.5 Payment Management

Financial ledger at the patient level. Tracks individual payment transactions and calculates outstanding balances. Supports multiple payment methods.

### 4.6 Analytics

Read-only reporting module for dentists. Aggregates data across appointments, patients, treatments, and revenue. Visualised with charts built on top of the analytics data layer.

### 4.7 Patient Portal

A separate, simplified UI for patients. Authenticated patients can view available slots, book and cancel appointments, check their real-time queue position and estimated wait time, and review their treatment history, payment history, and outstanding balance. The portal also surfaces the Patient AI Assistant chatbot.

### 4.8 Follow-Up Management

Tracks treatment follow-ups and future recall visits. Follow-ups are linked to a patient, appointment, and optionally a treatment. They have a due date and status, and are visible on the patient profile, analytics, and surfaced by AI Insights.

### 4.9 AI Features

Four AI-powered capabilities powered by Gemini 3.1 Flash Lite:
- **Patient Summary** — Generates a natural-language summary of a patient's history.
- **Clinic Copilot** — Conversational assistant for dentists and receptionists.
- **AI Insights** — Proactive, data-driven observations surfaced on the dentist dashboard, including follow-up detection.
- **Patient AI Assistant** — Conversational chatbot in the patient portal for booking, queue, history, and clinic FAQ queries.

### 4.10 Clinic Settings

Stores clinic-specific configuration and operational settings. Used by the Patient AI Assistant for clinic FAQ responses, by queue logic for wait-time estimation, and by appointment scheduling for slot duration defaults. Replaces any hardcoded clinic information in prompts or business logic.

### 4.11 Availability Management

Controls appointment booking slots. Dentists define recurring weekly availability rules (day, start time, end time, slot duration). Available slots are generated dynamically from these rules minus existing appointments. Used by the patient portal, receptionist booking UI, and Patient AI Assistant.

### 4.12 Patient Portal Account Linking

Manages the optional link between a patient record and a Supabase Auth account. Patient records exist independently of authentication. A `patient_portal_links` join table connects a patient to a portal account only when the patient chooses to register. This supports receptionist-created records, patient self-registration, and clinics where most patients never use the portal.

---

## 5. Detailed Feature Requirements

### 5.1 Patients

Each patient record must store the following fields:

| Field | Type | Notes |
|---|---|---|
| `id` | `uuid` | Primary key |
| `clinic_id` | `uuid` | Foreign key → `clinics.id` |
| `name` | `text` | Full name, required |
| `phone` | `text` | Primary contact number |
| `date_of_birth` | `date` | Used to calculate age dynamically |
| `gender` | `enum` | `male`, `female`, `other` |
| `address` | `text` | Optional |
| `emergency_contact_name` | `text` | Optional |
| `emergency_contact_phone` | `text` | Optional |
| `notes` | `text` | Free-form clinical or admin notes |
| `total_visits` | `integer` | Computed or maintained counter |
| `last_visit` | `timestamptz` | Timestamp of most recent completed appointment |
| `deleted_at` | `timestamptz` | Soft delete timestamp; null = active |
| `created_at` | `timestamptz` | Auto-set |
| `updated_at` | `timestamptz` | Auto-updated |

> **Age** is never stored as a column. It is always calculated at query/render time from `date_of_birth` using `EXTRACT(YEAR FROM AGE(date_of_birth))` in SQL or equivalent in application code.

**Behaviours:**
- `total_visits` increments when an appointment status transitions to `completed`.
- `last_visit` updates on the same `completed` transition.
- Phone number must be validated for format before save.
- Patient search must support partial match on `name` and `phone`.
- Patient profile must display pending follow-ups (from the `follow_ups` table).

---

### 5.2 Appointments

| Field | Type | Notes |
|---|---|---|
| `id` | `uuid` | Primary key |
| `clinic_id` | `uuid` | Foreign key → `clinics.id` |
| `patient_id` | `uuid` | Foreign key → `patients.id` |
| `dentist_id` | `uuid` | Foreign key → `profiles.id` (role: dentist) |
| `scheduled_at` | `timestamptz` | Date and time of appointment |
| `duration_minutes` | `integer` | Default 30 |
| `source` | `enum` | See sources below |
| `status` | `enum` | See statuses below |
| `notes` | `text` | Optional appointment-level notes |
| `deleted_at` | `timestamptz` | Soft delete timestamp; null = active |
| `created_at` | `timestamptz` | Auto-set |
| `updated_at` | `timestamptz` | Auto-updated |

**Appointment Sources:**

| Value | Label |
|---|---|
| `walk_in` | Walk-in |
| `phone_call` | Phone Call |
| `website` | Website |
| `referral` | Referral |
| `other` | Other |

**Appointment Statuses (ordered lifecycle):**

| Value | Description |
|---|---|
| `scheduled` | Booked, not yet arrived |
| `checked_in` | Patient arrived and checked in |
| `in_progress` | Currently being seen |
| `completed` | Visit finished |
| `cancelled` | Cancelled before visit |
| `no_show` | Patient did not arrive |

**Behaviours:**
- Status transitions must follow the lifecycle order. Invalid transitions (e.g., `completed` → `scheduled`) must be rejected.
- Cancellation and `no_show` are terminal states.
- On `completed`, trigger update of `patients.total_visits` and `patients.last_visit`.
- Rescheduling updates `scheduled_at` on the existing record; the original value and actor are recorded in `appointment_history`.
- Every status change must write a row to `appointment_history` (see Section 5.7).

---

### 5.3 Queue

The queue is a real-time view of patients who have checked in for the current day at a clinic.

| Field | Type | Notes |
|---|---|---|
| `id` | `uuid` | Primary key |
| `clinic_id` | `uuid` | Foreign key → `clinics.id` |
| `appointment_id` | `uuid` | Foreign key → `appointments.id` |
| `patient_id` | `uuid` | Foreign key → `patients.id` |
| `position` | `integer` | Order in queue, 1-indexed |
| `status` | `enum` | `waiting`, `in_progress`, `completed` |
| `checked_in_at` | `timestamptz` | When the patient was checked in |
| `called_at` | `timestamptz` | When the patient was called in |

**Behaviours:**
- Check-in creates a queue entry with the next available `position`.
- Only one patient can be `in_progress` at a time per clinic.
- Advancing the queue moves the current `in_progress` patient to `completed` and promotes the next `waiting` patient to `in_progress`.
- Queue position is recalculated after any removal or skip.
- **Supabase Realtime** must broadcast queue changes to all subscribed clients so patients and staff see live updates without polling.
- Queue resets daily (entries are scoped to today's date).

---

### 5.4 Treatments

| Field | Type | Notes |
|---|---|---|
| `id` | `uuid` | Primary key |
| `clinic_id` | `uuid` | Foreign key → `clinics.id` |
| `appointment_id` | `uuid` | Foreign key → `appointments.id` |
| `patient_id` | `uuid` | Foreign key → `patients.id` |
| `treatment_type` | `text` | E.g. "Root Canal", "Cleaning", "Extraction" |
| `internal_notes` | `text` | Clinical notes visible to dentist only |
| `patient_visible_notes` | `text` | Notes visible to the patient in the portal |
| `cost` | `numeric(10,2)` | Treatment cost in local currency |
| `status` | `enum` | `planned`, `in_progress`, `completed`, `cancelled` |
| `performed_at` | `timestamptz` | When the treatment was performed |
| `deleted_at` | `timestamptz` | Soft delete timestamp; null = active |
| `created_at` | `timestamptz` | Auto-set |
| `updated_at` | `timestamptz` | Auto-updated |

**Note visibility rules:**
- `internal_notes` — visible only to dentist. Never returned by patient-facing APIs or portal queries.
- `patient_visible_notes` — visible in the patient portal and returned by `getPatientTreatments` tool. Should contain only information appropriate for the patient to read (e.g., "Filling completed on upper left molar").
- Both fields are always editable, even after the treatment is `completed`.

**Behaviours:**
- `cost` contributes to the patient's outstanding balance calculation if unpaid.
- Multiple treatments can exist per appointment.
- Soft-deleted treatments are excluded from all default queries, balance calculations, and AI context. They remain in the database for audit purposes.

---

### 5.5 Payments

| Field | Type | Notes |
|---|---|---|
| `id` | `uuid` | Primary key |
| `clinic_id` | `uuid` | Foreign key → `clinics.id` |
| `patient_id` | `uuid` | Foreign key → `patients.id` |
| `appointment_id` | `uuid` | Optional FK → `appointments.id` |
| `amount` | `numeric(10,2)` | Amount paid |
| `method` | `enum` | `cash`, `upi`, `card`, `bank_transfer` |
| `payment_date` | `date` | Date payment was received |
| `notes` | `text` | Optional notes |
| `deleted_at` | `timestamptz` | Soft delete timestamp; null = active |
| `created_at` | `timestamptz` | Auto-set |

**Outstanding Balance:**
- Calculated as: `SUM(treatments.cost) - SUM(payments.amount)` per patient.
- This must be computed server-side, never trusted from the client.
- Expose as a read-only derived value on the patient profile.

---

### 5.6 Follow-Ups

Tracks required follow-up visits and recall reminders linked to a patient.

| Field | Type | Notes |
|---|---|---|
| `id` | `uuid` | Primary key |
| `clinic_id` | `uuid` | Foreign key → `clinics.id` |
| `patient_id` | `uuid` | Foreign key → `patients.id` |
| `appointment_id` | `uuid` | Optional FK → `appointments.id` (originating appointment) |
| `treatment_id` | `uuid` | Optional FK → `treatments.id` |
| `due_date` | `date` | When the follow-up should occur |
| `status` | `enum` | `pending`, `completed`, `cancelled` |
| `notes` | `text` | Reason or description of follow-up |
| `deleted_at` | `timestamptz` | Soft delete timestamp; null = active |
| `created_at` | `timestamptz` | Auto-set |
| `updated_at` | `timestamptz` | Auto-updated |

**Use cases:**
- Root canal review
- Crown placement follow-up
- Cleaning recall (every 6 months)
- Implant review

**Behaviours:**
- A follow-up with `due_date < today` and `status = pending` is considered **overdue**.
- Overdue follow-ups are surfaced in AI Insights and Follow-Up Analytics.
- Dentist can create, update, and complete/cancel follow-ups from the patient profile.
- Follow-ups are visible in the patient portal under the patient's profile.

---

### 5.7 Appointment History

Audit trail for all changes to an appointment record.

| Field | Type | Notes |
|---|---|---|
| `id` | `uuid` | Primary key |
| `appointment_id` | `uuid` | Foreign key → `appointments.id` |
| `action` | `text` | e.g. `created`, `rescheduled`, `cancelled`, `status_changed` |
| `old_value` | `jsonb` | Previous value(s) of changed field(s) |
| `new_value` | `jsonb` | New value(s) of changed field(s) |
| `performed_by` | `uuid` | Foreign key → `profiles.id` (who made the change) |
| `timestamp` | `timestamptz` | When the change occurred, default `now()` |

**Behaviours:**
- Written automatically by the Server Action that mutates the appointment — never written directly from the client.
- `old_value` and `new_value` store only the fields that changed (e.g., `{ "scheduled_at": "2026-06-18T10:00:00Z" }`).
- History is read-only; records must never be updated or deleted.
- No RLS write access for any role — inserts happen via service role in server actions only.

---

### 5.8 Patient Portal Account Linking

Patient records and Supabase Auth accounts are **intentionally decoupled**. A clinic may have thousands of patient records created by receptionists; only a subset of those patients will ever register for portal access.

**Entity: `patient_portal_links`**

| Field | Type | Notes |
|---|---|---|
| `id` | `uuid` | Primary key |
| `patient_id` | `uuid` | Foreign key → `patients.id` — unique |
| `user_id` | `uuid` | Foreign key → `auth.users.id` — unique |
| `created_at` | `timestamptz` | Auto-set |

**Constraints:**
- `patient_id` has a `UNIQUE` constraint — one patient can have at most one portal account.
- `user_id` has a `UNIQUE` constraint — one portal account can belong to only one patient.
- `clinic_id` is not stored here; it is derived from `patients.clinic_id` via join.

**Three valid states:**

| State | Description |
|---|---|
| Patient record only | Receptionist created the patient; no portal access. Default for walk-in and phone bookings. |
| Patient record + portal link | Patient registered for the portal; `patient_portal_links` row exists. |
| Auth account only | User signed up but has not been linked to a patient record yet. Must be resolved before portal access is granted. |

**Registration workflow:**
1. Receptionist creates a patient record in the system (no auth involved).
2. Patient visits the portal signup page and creates an auth account.
3. After signup, the system matches the auth account to an existing patient record by phone number (or clinic-defined matching criteria).
4. If a match is found, a `patient_portal_links` row is created and the patient gains portal access.
5. If no match is found, the patient is prompted to contact the clinic to link their account.

**RLS implication:**
- Patient portal RLS policies must use `patient_portal_links.user_id = auth.uid()` to resolve the patient's `patient_id`, then scope all queries to that `patient_id`.
- `patients.user_id` does not exist. Never add it directly to the `patients` table.

---

### 5.9 Clinic Settings

Clinic-specific configuration stored per clinic. Used as the source of truth for operational parameters across scheduling, queue estimation, AI prompts, and future automations.

**Entity: `clinic_settings`**

| Field | Type | Notes |
|---|---|---|
| `clinic_id` | `uuid` | Primary key + FK → `clinics.id` (one-to-one) |
| `clinic_name` | `text` | Display name used in communications |
| `phone` | `text` | Clinic contact phone |
| `email` | `text` | Clinic contact email |
| `address` | `text` | Full clinic address |
| `clinic_hours` | `jsonb` | Operating hours per day (see format below) |
| `average_appointment_duration` | `integer` | Minutes; used for wait-time estimation. Default: 30 |
| `created_at` | `timestamptz` | Auto-set |
| `updated_at` | `timestamptz` | Auto-updated |

**`clinic_hours` JSON format:**
```json
{
  "monday":    { "open": "09:00", "close": "18:00", "is_open": true },
  "tuesday":   { "open": "09:00", "close": "18:00", "is_open": true },
  "wednesday": { "open": "09:00", "close": "18:00", "is_open": true },
  "thursday":  { "open": "09:00", "close": "18:00", "is_open": true },
  "friday":    { "open": "09:00", "close": "17:00", "is_open": true },
  "saturday":  { "open": "10:00", "close": "14:00", "is_open": true },
  "sunday":    { "open": null,    "close": null,    "is_open": false }
}
```

**Used by:**
- Patient AI Assistant `getClinicInformation` tool — clinic hours, phone, address, email are read from here, never hardcoded in prompts.
- Queue wait-time estimation — `average_appointment_duration` drives the formula.
- Appointment scheduling — slot boundaries respect clinic hours.
- Future n8n reminder workflows — contact details sourced from here.

---

### 5.10 Availability Rules

Weekly recurring rules that define when appointment slots are available.

**Entity: `availability_rules`**

| Field | Type | Notes |
|---|---|---|
| `id` | `uuid` | Primary key |
| `clinic_id` | `uuid` | Foreign key → `clinics.id` |
| `day_of_week` | `integer` | 0 = Sunday … 6 = Saturday |
| `start_time` | `time` | Slot window start (e.g. `09:00`) |
| `end_time` | `time` | Slot window end (e.g. `13:00`) |
| `slot_duration_minutes` | `integer` | Duration of each slot (e.g. 30) |
| `is_active` | `boolean` | Whether this rule is currently enabled |
| `created_at` | `timestamptz` | Auto-set |
| `updated_at` | `timestamptz` | Auto-updated |

**Example rules:**

| Day | Start | End | Slot Duration |
|---|---|---|---|
| Monday (1) | 09:00 | 13:00 | 30 min |
| Monday (1) | 14:00 | 18:00 | 30 min |
| Saturday (6) | 10:00 | 14:00 | 30 min |

**Slot generation (`getAvailableSlots`):**
- Available slots are generated dynamically at query time — they are not pre-materialised in the database.
- Algorithm: for each active rule matching the requested date's `day_of_week`, generate all slot start times between `start_time` and `end_time` at `slot_duration_minutes` intervals, then subtract slots already occupied by existing appointments with status not in (`cancelled`, `no_show`).
- Double-booking prevention: a slot is occupied if any appointment exists at the same `dentist_id` + `scheduled_at`.
- `getAvailableSlots(date, clinicId)` is a typed server-side function used by the patient portal, receptionist UI, and Patient AI Assistant tool.

**Future support:** the `availability_rules` table is designed to support per-dentist rules (add `dentist_id` column) when multi-dentist scheduling is introduced.

---

### 5.11 Soft Delete Strategy

The following tables support soft deletion via a `deleted_at timestamptz` column:

- `patients`
- `appointments`
- `treatments`
- `payments`
- `follow_ups`

**Rules:**
- Records are **never physically deleted** from the database.
- All default Supabase queries and Server Actions must include a `WHERE deleted_at IS NULL` filter, or use a database view that applies this filter automatically.
- RLS policies must also enforce `deleted_at IS NULL` for standard read access.
- Deleted records remain accessible to superadmin queries for audit purposes.
- AI features (Patient Summary, Copilot, Insights, Patient AI Assistant) must only receive non-deleted records. Deleted data must never appear in AI context.
- Soft deletion of a patient cascades logically: the patient's appointments, treatments, payments, and follow-ups should also be soft-deleted in the same Server Action transaction.

---

## 6. Dashboard Requirements

### 6.1 Dentist Dashboard

The dentist dashboard is the primary landing page after login for users with the `dentist` role. It must display the following KPIs, all scoped to **today** and **current clinic**:

| KPI | Description |
|---|---|
| Total Appointments Today | Count of all appointments scheduled for today |
| Seen Patients Today | Count of appointments with status `completed` today |
| Completion Rate Today | `Seen Patients Today / Total Appointments Today` (percentage) |
| Waiting Patients | Count of queue entries with status `waiting` right now |
| Upcoming Appointments | List of next N appointments still in `scheduled` or `checked_in` status |
| No-Shows | Count of appointments marked `no_show` today |
| Revenue Today | Sum of payments received today |
| New Patients Today | Count of patients whose `created_at` is today |
| Walk-ins Today | Count of today's appointments with `source = walk_in` |

**Additional dentist dashboard elements:**
- AI Insights panel (see Section 8.3)
- Quick-access navigation to Patients, Queue, and Analytics
- Realtime queue widget showing current and next patient

---

### 6.2 Receptionist Dashboard

Focused on operational workflows for the current day:

| Element | Description |
|---|---|
| Today's Appointments | Full list of today's appointments with status badges |
| Waiting Queue | Live queue with position, patient name, and check-in time |
| Upcoming Appointments | Next appointments requiring action |
| Patient Search | Prominent search bar to find patients by name or phone |
| Pending Payments | List of patients with outstanding balance > 0 |

---

### 6.3 Patient Dashboard

Simplified self-service view for patients:

| Element | Description |
|---|---|
| Upcoming Appointments | Their next scheduled appointment(s) |
| Queue Position | Live position in today's queue (if checked in) |
| Estimated Wait Time | Approximate wait based on patients ahead × `clinic_settings.average_appointment_duration` |
| Current Patient Number | Which queue number is currently being seen |
| Treatment History | List of completed treatments |
| Payment History | List of past payments |
| Outstanding Balance | Current amount owed |
| AI Assistant | Persistent chat widget (Patient AI Assistant) |

---

## 7. Analytics Requirements

Analytics are read-only and available only to the `dentist` role. All analytics queries must be scoped to `clinic_id` and support date range filtering (default: last 30 days).

### 7.1 Appointment Analytics

- Total appointments by status (stacked bar chart by day/week/month)
- Cancellation rate over time
- No-show rate over time
- Average appointments per day
- Peak hours heatmap (hour of day vs day of week)

### 7.2 Patient Analytics

- New patients over time (line chart)
- Returning vs new patient ratio
- Patient age distribution (bar chart)
- Gender breakdown (donut chart)
- Top patients by visit count

### 7.3 Treatment Analytics

- Most common treatment types (bar chart)
- Average treatment cost by type
- Treatment completion rate (completed vs cancelled/planned)
- Revenue by treatment type

### 7.4 Revenue Analytics

- Daily/weekly/monthly revenue (line chart)
- Revenue by payment method (donut chart): cash, upi, card, bank_transfer
- Revenue by appointment source (bar chart): walk_in, phone_call, website, referral, other
- Outstanding balance totals
- Average revenue per completed appointment
- Month-over-month growth

### 7.5 Acquisition Source Analytics

- Appointment source breakdown (pie/donut chart): walk-in, phone, website, referral, other
- Source trend over time (stacked area chart)
- Conversion by source (booked vs completed vs no-show by source)

### 7.6 Follow-Up Analytics

- Pending follow-ups count (total and by due-date proximity)
- Completed follow-ups over time (line chart)
- Overdue follow-ups count and list (due_date < today, status = pending)
- Follow-up completion rate (completed / total created)
- Follow-ups by treatment type (which treatments generate the most follow-ups)

---

## 8. AI Features

All AI features use **Gemini 3.1 Flash Lite** via the Google AI SDK. AI calls are always made server-side (Server Actions or Route Handlers). Never expose API keys to the client.

> **AI Resilience Principle:** DentGrow must remain fully functional even if Gemini is unavailable. AI features are enhancements only and must never be required for core clinic operations. The following must work without AI: Patients, Appointments, Queue, Treatments, Payments, and Analytics. All AI features must fail gracefully with a user-facing message (e.g., "AI features are temporarily unavailable") and never block or error the surrounding page.

### 8.1 Patient Summary

**Trigger:** Dentist opens a patient profile and clicks "Generate Summary".

**Input to AI:**
- Patient demographics (name, age, gender)
- Total visits and last visit date
- Last N treatment records (type, notes, date, cost, status)
- Outstanding balance
- Any open appointment notes

**Output:** A concise 2–4 paragraph natural-language clinical summary covering:
- Patient background and visit frequency
- Recent treatments and clinical observations from notes
- Financial standing
- Suggested follow-up considerations (non-prescriptive)

**Implementation notes:**
- Summarised with a structured prompt; do not allow free-form user injection into the prompt.
- Response is displayed in a read-only card on the patient profile.
- Response is not stored in the database (generated on demand).

---

### 8.2 Clinic Copilot

**Trigger:** Chat interface available on the dentist and receptionist dashboards.

**Capabilities (examples):**
- "Show today's patients" → returns a formatted list of today's appointments
- "Show pending payments" → lists patients with outstanding balances
- "Identify no-show trends" → analyses no-show rate and highlights patterns
- "Summarise patient history for [name]" → delegates to Patient Summary feature
- "How many walk-ins this week?" → queries appointment source data

**Implementation notes:**
- The Copilot receives a structured system prompt describing the clinic's current context (date, clinic name, logged-in user role).
- The AI does **not** have direct database access. The application resolves a defined set of **tool functions** (structured data fetchers) and passes results into the conversation context.
- Supported tool functions must be explicitly defined and type-safe. No arbitrary SQL generation.
- Conversation history is kept in local component state (not persisted to database in MVP).
- The Copilot must gracefully decline requests outside its defined tool scope.

---

### 8.3 AI Insights

**Trigger:** Automatically generated and displayed on the dentist dashboard. Refreshed on page load or on demand.

**Examples of insights generated:**
- "You had 3 no-shows this week — 40% higher than last week."
- "Walk-in appointments have increased 25% this month."
- "Patient [Name] has an outstanding balance of [amount] from their last visit."
- "Your busiest hour this week was 10–11 AM."
- "Revenue is down 15% compared to the same period last month."
- "Patient [Name] had a root canal 45 days ago and has no crown appointment scheduled — may require follow-up."
- "You have 5 overdue follow-ups this week."

**Follow-Up Detection Logic:**
The AI receives a structured payload that includes treatments completed 30+ days ago alongside the patient's subsequent appointment and treatment records. It identifies gaps — for example, a completed root canal with no crown treatment recorded within a reasonable window — and flags them as potential follow-up needs. This is observational only; the AI does not issue clinical recommendations.

**Implementation notes:**
- A fixed set of metrics is fetched server-side and passed to Gemini as structured JSON.
- The AI returns 3–5 bullet-point insights in plain language.
- Insights are displayed in a card on the dentist dashboard.
- Results are not stored; regenerated on each dashboard load.
- If Gemini is unavailable, the Insights panel shows a non-blocking fallback message.

---

### 8.4 Patient AI Assistant

**Trigger:** Persistent chat widget available inside the patient portal for authenticated patients.

**Purpose:** Allow patients to interact with their own clinic data through natural language, and get answers to common clinic questions — without needing to navigate multiple pages.

**Capabilities:**

| Category | Example Queries |
|---|---|
| Appointments | "I need an appointment tomorrow evening", "Do I have any upcoming appointments?" |
| Rescheduling | "Reschedule my appointment to Friday" |
| Cancellation | "Cancel my appointment on Thursday" |
| Queue | "How many patients are ahead of me?", "What is the estimated wait time?" |
| Treatment History | "What treatments have I had?" |
| Payments | "Do I have any outstanding balance?", "Show my payment history" |
| Clinic FAQ | "What are the clinic timings?", "What is the clinic phone number?" |

**Implementation Architecture:**

- Powered by **Gemini 3.1 Flash Lite** with tool-calling and structured outputs.
- All AI calls are made server-side via a dedicated Server Action or API route.
- The assistant uses a **tool-calling architecture**: the model declares which tool it needs to call, the application executes it server-side, and the result is passed back into the conversation context.
- The model has **no direct database access**. All data access goes through the defined application tool functions below.

**Allowed Tools:**

| Tool | Description |
|---|---|
| `getAvailableSlots` | Returns open appointment slots for a given date range |
| `createAppointment` | Books a new appointment for the authenticated patient |
| `rescheduleAppointment` | Moves an existing appointment to a new slot |
| `cancelAppointment` | Cancels a future appointment owned by the patient |
| `getQueueStatus` | Returns the patient's current queue position, patients ahead, and estimated wait time |
| `getPatientAppointments` | Returns the patient's upcoming and past appointments |
| `getPatientTreatments` | Returns the patient's treatment history |
| `getPatientPayments` | Returns the patient's payment history and outstanding balance |
| `getClinicInformation` | Returns clinic info from `clinic_settings`: name, address, phone, email, hours |

**Data Scope:**
- Every tool function is scoped to the authenticated patient's `patient_id` and `clinic_id` from the server session.
- A patient cannot query or mutate data belonging to another patient.
- Tool inputs from the model are validated server-side before any database call.

**Safety Restrictions:**

The assistant **must not**:
- Diagnose dental conditions
- Recommend medications or dosages
- Provide treatment plans or clinical advice
- Replace professional dental consultation

For any medically oriented question, the assistant must respond with:
> "Please consult your dentist for medical advice."

**Conversation handling:**
- Conversation history is held in local component state for the session; not persisted to the database.
- The assistant must gracefully decline requests outside its defined tool scope.
- **Action confirmation required:** The assistant must never execute a mutating tool (`createAppointment`, `rescheduleAppointment`, `cancelAppointment`) without first presenting the action to the patient and receiving explicit confirmation. Example flow: AI proposes "I found a slot at 5 PM tomorrow — shall I book it?", patient confirms, then and only then is `createAppointment` called.
- If Gemini is unavailable, the chat widget shows a non-blocking fallback: "The AI assistant is temporarily unavailable. Please use the menu to manage your appointments."

---

## 9. n8n Workflows

n8n is integrated for automation workflows. In MVP, the infrastructure is set up but workflows are not yet active. The application should expose webhook endpoints that n8n can call, and n8n should be able to call back into the application via secure API routes.

### Planned Workflows (Post-MVP)

| Workflow | Trigger | Action |
|---|---|---|
| Appointment Reminder | 24h before `scheduled_at` | Send SMS/email reminder to patient |
| Follow-up Task | Appointment status → `completed` | Create follow-up reminder for dentist |
| Payment Reminder | Outstanding balance > 0 for 7+ days | Send payment reminder to patient |
| Analytics Report | Weekly cron | Generate and email weekly summary to dentist |
| No-Show Alert | Appointment marked `no_show` | Notify receptionist to follow up |
| Follow-Up Reminder | Follow-up `due_date` is within 3 days, status = `pending` | Send reminder to patient and dentist |
| Overdue Follow-Up Detection | Daily cron — `due_date < today`, status = `pending` | Flag overdue follow-ups; notify dentist |
| Appointment Reminder Automation | 48h and 2h before `scheduled_at` | Multi-stage reminder sequence to patient |
| Payment Reminder Automation | Outstanding balance > 0 for 3, 7, 14 days | Escalating payment reminder to patient |

### MVP Integration Requirements

- Create a dedicated `/api/webhooks/n8n` route handler that validates a shared secret before processing.
- Expose typed payload schemas for each webhook event type.
- Log all incoming webhook calls to a `webhook_logs` table for debugging.
- Do not implement workflow logic in the MVP — only the skeleton infrastructure.

---

## 10. Multi-Tenant Architecture

DentGrow is a multi-tenant SaaS product. Each clinic is a tenant. **All data isolation is enforced at the database level via Row Level Security (RLS), not just at the application level.**

### Core Rules

1. Every major entity table must have a `clinic_id uuid NOT NULL` column with a foreign key to `clinics.id`.
2. Every RLS policy must include `clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid())`.
3. The `profiles` table links each Supabase Auth user to a `clinic_id` and a `role`.
4. Middleware must validate the user's session and role on every protected route before rendering.
5. Server Actions must re-validate `clinic_id` from the server session — never trust `clinic_id` from the client request body.

### Tenant-Scoped Tables

The following tables require `clinic_id`:

- `patients`
- `appointments`
- `appointment_history`
- `queue_entries`
- `treatments`
- `payments`
- `follow_ups`
- `clinic_settings`
- `availability_rules`
- `webhook_logs`

> `patient_portal_links` does not carry `clinic_id` directly. Clinic scoping for portal links is resolved via `patients.clinic_id` through a join.

### Patient Portal RLS

Patient-facing RLS policies follow a two-step ownership pattern:

1. Resolve the `patient_id` for the authenticated user: `SELECT patient_id FROM patient_portal_links WHERE user_id = auth.uid()`.
2. Scope all data queries to that `patient_id`.

This means:
- RLS on `appointments`, `treatments`, `payments`, `queue_entries`, and `follow_ups` for the `patient` role must check `patient_id = (SELECT patient_id FROM patient_portal_links WHERE user_id = auth.uid())`.
- A user with no entry in `patient_portal_links` gets zero rows — they are not blocked by an error, they simply see no data.
- `patients.user_id` does not exist. Never add it to the `patients` table.

### Clinics Table

| Field | Type | Notes |
|---|---|---|
| `id` | `uuid` | Primary key |
| `name` | `text` | Clinic display name |
| `phone` | `text` | Clinic contact number |
| `address` | `text` | Physical address |
| `created_at` | `timestamptz` | Auto-set |

---

## 11. Database Schema

Below is the canonical schema. Always keep migrations in sync with this reference.

```sql
-- Clinics
create table clinics (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  address text,
  created_at timestamptz not null default now()
);

-- Profiles (extends Supabase Auth users)
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  clinic_id uuid not null references clinics(id) on delete cascade,
  full_name text not null,
  role text not null check (role in ('dentist', 'receptionist', 'patient')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Patients
create table patients (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  name text not null,
  phone text,
  date_of_birth date,
  gender text check (gender in ('male', 'female', 'other')),
  address text,
  emergency_contact_name text,
  emergency_contact_phone text,
  notes text,
  total_visits integer not null default 0,
  last_visit timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Appointments
create table appointments (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  patient_id uuid not null references patients(id) on delete cascade,
  dentist_id uuid not null references profiles(id),
  scheduled_at timestamptz not null,
  duration_minutes integer not null default 30,
  source text not null check (source in ('walk_in','phone_call','website','referral','other')),
  status text not null default 'scheduled'
    check (status in ('scheduled','checked_in','in_progress','completed','cancelled','no_show')),
  notes text,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Appointment History (audit trail)
create table appointment_history (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references appointments(id) on delete cascade,
  action text not null,              -- 'created' | 'rescheduled' | 'cancelled' | 'status_changed'
  old_value jsonb,
  new_value jsonb,
  performed_by uuid references profiles(id),
  timestamp timestamptz not null default now()
);

-- Queue Entries
create table queue_entries (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  appointment_id uuid not null references appointments(id) on delete cascade,
  patient_id uuid not null references patients(id) on delete cascade,
  position integer not null,
  status text not null default 'waiting'
    check (status in ('waiting','in_progress','completed')),
  checked_in_at timestamptz not null default now(),
  called_at timestamptz
);

-- Treatments
create table treatments (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  appointment_id uuid not null references appointments(id) on delete cascade,
  patient_id uuid not null references patients(id) on delete cascade,
  treatment_type text not null,
  internal_notes text,              -- visible to dentist only
  patient_visible_notes text,       -- visible in patient portal
  cost numeric(10,2) not null default 0,
  status text not null default 'planned'
    check (status in ('planned','in_progress','completed','cancelled')),
  performed_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Payments
create table payments (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  patient_id uuid not null references patients(id) on delete cascade,
  appointment_id uuid references appointments(id),
  amount numeric(10,2) not null,
  method text not null check (method in ('cash','upi','card','bank_transfer')),
  payment_date date not null default current_date,
  notes text,
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);

-- Follow-Ups
create table follow_ups (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  patient_id uuid not null references patients(id) on delete cascade,
  appointment_id uuid references appointments(id),
  treatment_id uuid references treatments(id),
  due_date date not null,
  status text not null default 'pending'
    check (status in ('pending','completed','cancelled')),
  notes text,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Patient Portal Links (decouples patient records from auth accounts)
create table patient_portal_links (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null unique references patients(id) on delete cascade,
  user_id uuid not null unique references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Clinic Settings (one-to-one with clinics)
create table clinic_settings (
  clinic_id uuid primary key references clinics(id) on delete cascade,
  clinic_name text not null,
  phone text,
  email text,
  address text,
  clinic_hours jsonb,               -- see Section 5.9 for JSON format
  average_appointment_duration integer not null default 30,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Availability Rules
create table availability_rules (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  day_of_week integer not null check (day_of_week between 0 and 6),
  start_time time not null,
  end_time time not null,
  slot_duration_minutes integer not null default 30,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Webhook Logs
create table webhook_logs (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid references clinics(id),
  event_type text not null,
  payload jsonb,
  received_at timestamptz not null default now()
);
```

---

## 12. Project Structure

```
dentgrow/
├── app/
│   ├── (auth)/                     # Auth pages (login, signup)
│   │   ├── login/
│   │   └── signup/
│   ├── (dashboard)/                # Protected app shell
│   │   ├── layout.tsx              # Shared layout with sidebar
│   │   ├── dentist/
│   │   │   ├── page.tsx            # Dentist dashboard
│   │   │   ├── patients/
│   │   │   ├── appointments/
│   │   │   ├── queue/
│   │   │   ├── treatments/
│   │   │   ├── payments/
│   │   │   ├── follow-ups/
│   │   │   ├── analytics/
│   │   │   └── settings/           # Clinic settings management
│   │   └── receptionist/
│   │       ├── page.tsx            # Receptionist dashboard
│   │       ├── patients/
│   │       ├── appointments/
│   │       ├── queue/
│   │       └── payments/
│   ├── portal/                     # Patient portal (separate layout)
│   │   ├── layout.tsx
│   │   ├── page.tsx                # Patient dashboard
│   │   ├── setup/                  # Portal account linking flow
│   │   ├── appointments/
│   │   ├── queue/
│   │   ├── treatments/
│   │   └── payments/
│   └── api/
│       └── webhooks/
│           └── n8n/
│               └── route.ts
├── components/
│   ├── ui/                         # shadcn/ui primitives (auto-generated)
│   ├── shared/                     # Shared cross-role components
│   │   ├── AppointmentCard.tsx
│   │   ├── PatientSearch.tsx
│   │   └── StatusBadge.tsx
│   ├── dentist/                    # Dentist-specific components
│   ├── receptionist/               # Receptionist-specific components
│   ├── patient/                    # Patient portal components
│   ├── queue/                      # Queue management components
│   │   ├── QueueBoard.tsx          # Live queue display
│   │   └── QueueEntry.tsx
│   ├── follow-ups/                 # Follow-up management components
│   │   ├── FollowUpList.tsx
│   │   └── FollowUpForm.tsx
│   ├── analytics/                  # Chart components
│   └── ai/
│       ├── PatientSummaryCard.tsx
│       ├── CopilotChat.tsx
│       ├── InsightsPanel.tsx
│       └── PatientAssistant.tsx    # Patient AI Assistant chat widget
├── lib/
│   ├── supabase/
│   │   ├── server.ts               # createServerClient
│   │   ├── client.ts               # createBrowserClient
│   │   └── middleware.ts           # Session refresh helper
│   ├── ai/
│   │   ├── gemini.ts               # Gemini client initialisation
│   │   ├── prompts.ts              # All prompt templates
│   │   ├── tools.ts                # Copilot tool function definitions
│   │   └── patient-tools.ts        # Patient AI Assistant tool definitions
│   ├── scheduling/
│   │   └── slots.ts                # getAvailableSlots() slot generation logic
│   └── utils.ts                    # Shared utility functions
├── actions/
│   ├── patients.ts                 # Patient server actions
│   ├── appointments.ts             # Appointment server actions (writes audit history)
│   ├── queue.ts                    # Queue server actions
│   ├── treatments.ts               # Treatment server actions
│   ├── payments.ts                 # Payment server actions
│   ├── follow-ups.ts               # Follow-up server actions
│   ├── clinic-settings.ts          # Clinic settings server actions
│   ├── availability.ts             # Availability rules server actions
│   ├── portal-link.ts              # Patient portal account linking actions
│   └── ai.ts                       # AI feature server actions (all roles)
├── types/
│   └── index.ts                    # All TypeScript types and enums
├── hooks/
│   ├── useQueue.ts                 # Realtime queue subscription
│   └── useRealtimeAppointments.ts
├── middleware.ts                   # Next.js middleware (auth + role routing)
├── .env.local                      # Local environment variables (never commit)
└── supabase/
    └── migrations/                 # SQL migration files
```

---

## 13. Development Principles

These are non-negotiable standards. Every PR and every AI-generated code block must conform to these.

### 13.1 Production-Ready Code

- No `console.log` in production paths. Use structured error logging.
- All async operations must have proper error handling (`try/catch` or `.catch()`).
- Loading and error states must be handled in every UI component.
- No hardcoded IDs, magic strings, or raw SQL in application code (use parameterized queries or Supabase query builder only).

### 13.2 Type Safety

- TypeScript strict mode is enabled. No `any` types.
- All database row types must be derived from the Supabase generated types (`database.types.ts`).
- All Server Action inputs must be validated with `zod` before processing.
- All enums (role, status, source, method, gender) must be defined as TypeScript enums or `as const` objects in `types/index.ts` and reused everywhere.

### 13.3 Reusable Components

- Before creating a new component, check if a similar one exists in `components/shared/` or `components/ui/`.
- Components must accept typed props. No prop drilling beyond two levels — use context or server-fetched data instead.
- All form components must use `react-hook-form` with `zod` schema validation.

### 13.4 Server Actions Preferred

- Mutations (create, update, delete) must use Next.js Server Actions defined in the `actions/` directory.
- Server Actions must re-validate the user's `clinic_id` and `role` from the Supabase session. Never trust values from the request body for `clinic_id`.
- Return types from Server Actions must be explicitly typed: `{ data: T | null; error: string | null }`.

### 13.5 Mobile Responsive

- All pages and components must be responsive. Use Tailwind's responsive prefixes (`sm:`, `md:`, `lg:`).
- The patient portal must be optimised for mobile-first usage.
- The dentist and receptionist dashboards should be usable on a tablet (768px minimum).

### 13.6 No Mock Data

- Never use hardcoded mock data in components. All data must come from Supabase.
- Use Supabase's local development environment (`supabase start`) for local development.
- Seed scripts may exist in `supabase/seed.sql` for development use only.

### 13.7 Follow Existing Architecture

- New features must follow the established pattern: Server Action in `actions/` → Component in `components/` → Page in `app/`.
- Do not introduce new state management libraries. Use React state, context, and Server Components.
- Do not introduce new HTTP client libraries. Use native `fetch` or Supabase client methods.

### 13.8 Avoid Duplicate Implementations

- Before adding a utility function, check `lib/utils.ts`.
- Before adding a new Supabase query, check if a matching Server Action already exists.
- If a pattern is used in more than two places, extract it into a shared utility or component.

### 13.9 No Secrets or Credential Leaks

- Never commit `.env.local` or any file containing secrets.
- Environment variable names that are safe for the browser must be prefixed with `NEXT_PUBLIC_`.
- AI API keys, Supabase service role keys, and n8n webhook secrets must **never** be prefixed with `NEXT_PUBLIC_` and must only be accessed server-side.
- All secret environment variables must be documented in `.env.example` with placeholder values.

### 13.10 RLS Is the Last Line of Defence

- Application-level role checks (middleware, component guards) are a UX convenience.
- RLS policies are the security guarantee. Every table must have RLS enabled with appropriate policies.
- Never disable RLS on any table containing clinic or patient data.

### 13.11 AI Must Never Block Core Operations

- All AI features (Patient Summary, Copilot, Insights, Patient AI Assistant) must be wrapped in `try/catch` and render non-blocking fallback UI on failure.
- Core modules — Patients, Appointments, Queue, Treatments, Payments, Analytics — must function completely independently of Gemini availability.
- Never make a page render contingent on an AI response.
- AI calls must have a defined timeout (recommended: 10 seconds). On timeout, display the fallback message and log the error.

### 13.12 AI Action Confirmation Required

- AI systems (Clinic Copilot and Patient AI Assistant) must **never** execute a mutating operation without explicit user confirmation.
- This applies to: appointment booking, appointment cancellation, appointment rescheduling, payment updates, and follow-up creation.
- The required pattern: AI presents the proposed action with all relevant details → user confirms → Server Action executes.
- The model must not call a mutating tool function in the same turn it identifies the intent. Confirmation is a mandatory intermediate step.
- UI must make it unambiguous what the user is confirming (e.g., a confirmation card with slot details and a "Confirm Booking" button).

### 13.13 AI Models Must Never Access Data Directly

- AI models (Gemini) must never execute SQL, call Supabase directly, or hold or receive database credentials.
- All data access by AI features must occur through typed tool functions defined in `lib/ai/tools.ts` or `lib/ai/patient-tools.ts`.
- Tool functions are executed server-side by the application, not by the model.
- Tool function inputs received from the model must be validated with `zod` before any database call is made.
- The model receives only the structured result of the tool call — never raw database responses, connection strings, or credentials.

### 13.14 Soft Delete Enforcement

- Every Server Action that queries soft-deletable tables (`patients`, `appointments`, `treatments`, `payments`, `follow_ups`) must include a `deleted_at IS NULL` filter.
- Prefer database views (e.g., `active_patients`, `active_appointments`) that apply this filter automatically, to reduce the risk of accidental omission.
- Soft deletes must be performed via a dedicated Server Action that sets `deleted_at = now()` — never via a raw `DELETE` statement.
- RLS policies for all roles must include `deleted_at IS NULL` for standard read policies.

---

## 14. Non-Goals for MVP

The following features are explicitly **out of scope** for the MVP. Do not implement, scaffold, or stub these unless a future spec explicitly re-introduces them.

| Feature | Reason Excluded |
|---|---|
| WhatsApp Integration | Requires additional vendor approval and compliance review |
| Voice AI | Significant infrastructure complexity; not validated with users |
| Inventory Management | Different user workflow; separate product scope |
| Billing / Invoice Generation | PDF generation and accounting integration deferred |
| Multi-Clinic Chains | Requires org-level tenant hierarchy above `clinics` table |
| Advanced RAG | Embeddings and vector search infrastructure not yet provisioned |

If a future request asks for any of the above, flag it explicitly rather than quietly implementing it.

---

## 15. Environment Variables

All environment variables are documented here. Store actual values in `.env.local` (never committed). Use `.env.example` as the committed reference.

```bash
# .env.example

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key   # Server-side only

# Google AI (Gemini)
GOOGLE_AI_API_KEY=your-gemini-api-key             # Server-side only

# n8n Webhook
N8N_WEBHOOK_SECRET=your-shared-secret             # Server-side only
N8N_BASE_URL=https://your-n8n-instance.com        # Server-side only

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### Usage Rules

| Variable | Where Used | Client Safe? |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase client init | Yes |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase browser client | Yes |
| `SUPABASE_SERVICE_ROLE_KEY` | Server Actions, admin operations | **No** |
| `GOOGLE_AI_API_KEY` | AI Server Actions only | **No** |
| `N8N_WEBHOOK_SECRET` | Webhook route handler only | **No** |
| `N8N_BASE_URL` | n8n trigger calls only | **No** |
| `NEXT_PUBLIC_APP_URL` | Absolute URL generation | Yes |

---

## 16. Future Scalability Notes

The current architecture is intentionally designed to support the following additions without requiring major schema redesigns. When building any feature, keep these future paths in mind and avoid decisions that would close them off.

| Future Capability | Current Design Decision That Enables It |
|---|---|
| WhatsApp / SMS automation | `clinic_settings` stores contact info; n8n webhook infrastructure already in place |
| Email reminders | `clinic_settings.email` field; n8n workflow slots pre-defined |
| Multi-dentist scheduling | `availability_rules` has a `clinic_id` column; adding `dentist_id` is additive. `appointments.dentist_id` already exists. |
| Multiple treatment rooms | Room can be added to `availability_rules` and `appointments` as an additive column |
| AI-powered recall campaigns | `follow_ups` table provides the data foundation; n8n + Gemini can orchestrate outreach |
| Patient self-registration at scale | `patient_portal_links` decouples auth from patient records; matching logic is isolated in `actions/portal-link.ts` |
| Clinic FAQ customisation | `clinic_settings` stores all clinic info; prompts read from the database, not hardcoded |
| Advanced analytics / BI | All data is structured and clinic-scoped; adding a read replica or analytics view is non-breaking |

**Principles for future-proof development:**
- Add columns rather than changing existing ones when extending entities.
- Use additive migrations only — never drop or rename columns without a deprecation cycle.
- Keep business logic in Server Actions, not in database triggers, so logic is portable.
- Do not hardcode clinic-specific values (phone, hours, name) anywhere in the codebase — always read from `clinic_settings`.

---

## Appendix: Key Type Definitions

```typescript
// types/index.ts

export type UserRole = 'dentist' | 'receptionist' | 'patient'

export type AppointmentStatus =
  | 'scheduled'
  | 'checked_in'
  | 'in_progress'
  | 'completed'
  | 'cancelled'
  | 'no_show'

export type AppointmentSource =
  | 'walk_in'
  | 'phone_call'
  | 'website'
  | 'referral'
  | 'other'

export type TreatmentStatus = 'planned' | 'in_progress' | 'completed' | 'cancelled'

export type PaymentMethod = 'cash' | 'upi' | 'card' | 'bank_transfer'

export type QueueStatus = 'waiting' | 'in_progress' | 'completed'

export type Gender = 'male' | 'female' | 'other'

export type FollowUpStatus = 'pending' | 'completed' | 'cancelled'

export type AppointmentHistoryAction =
  | 'created'
  | 'rescheduled'
  | 'cancelled'
  | 'status_changed'

// Patient AI Assistant tool names
export type PatientAssistantTool =
  | 'getAvailableSlots'
  | 'createAppointment'
  | 'rescheduleAppointment'
  | 'cancelAppointment'
  | 'getQueueStatus'
  | 'getPatientAppointments'
  | 'getPatientTreatments'
  | 'getPatientPayments'
  | 'getClinicInformation'

// Clinic hours shape (stored as JSONB in clinic_settings)
export type DayHours = {
  open: string | null    // e.g. "09:00"
  close: string | null   // e.g. "18:00"
  is_open: boolean
}

export type ClinicHours = Record<
  'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday',
  DayHours
>

// Available slot shape returned by getAvailableSlots()
export type AvailableSlot = {
  start_time: string      // ISO 8601 datetime
  end_time: string        // ISO 8601 datetime
  duration_minutes: number
}

// Standard server action return shape
export type ActionResult<T> = {
  data: T | null
  error: string | null
}
```

---

*This document is the authoritative reference for DentGrow. When in doubt about architecture, features, or scope — consult this file first. Update it whenever a significant architectural decision is made.*
