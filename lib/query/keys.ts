/**
 * TanStack Query — Query Key Factory
 *
 * Centralised, type-safe query keys for the four high-traffic list pages that
 * use client-side caching: Patients, Appointments, Treatments, Follow-Ups.
 *
 * Design rules:
 * - Every entity exposes a stable root key (e.g. ["patients"]) used for
 *   invalidation. Invalidating the root prefix matches every list variant.
 * - List queries append a "list" segment + a serialisable filters object so
 *   each filter/pagination combination is cached independently while still
 *   sharing the same root for invalidation.
 * - Keys are the SINGLE source of truth — never hand-write key arrays in
 *   components. This guarantees no duplicate / mismatched keys.
 *
 * These keys cover ONLY read operations. Mutations continue to use the
 * existing Server Actions; after a successful mutation the affected root key
 * is invalidated (see lib/query/invalidate or the mutation components).
 */

export interface PatientsListFilters {
  page: number;
  search?: string;
}

export interface AppointmentsListFilters {
  page: number;
  search?: string;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
  timeFrom?: string;
  timeTo?: string;
}

export interface TreatmentsListFilters {
  page: number;
  search?: string;
  status?: string;
  treatmentType?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface FollowUpsListFilters {
  page: number;
  search?: string;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
}

export const queryKeys = {
  patients: {
    all: ["patients"] as const,
    list: (filters: PatientsListFilters) =>
      ["patients", "list", filters] as const,
  },
  appointments: {
    all: ["appointments"] as const,
    list: (filters: AppointmentsListFilters) =>
      ["appointments", "list", filters] as const,
  },
  treatments: {
    all: ["treatments"] as const,
    list: (filters: TreatmentsListFilters) =>
      ["treatments", "list", filters] as const,
  },
  followUps: {
    all: ["followUps"] as const,
    list: (filters: FollowUpsListFilters) =>
      ["followUps", "list", filters] as const,
  },
} as const;
