"use client";

import { useEffect, useState } from "react";
import { useBrowserSupabaseClient } from "@/lib/supabase/client";
import type { AppointmentWithPatient } from "@/types";

interface UseRealtimeAppointmentsOptions {
  clinicId: string;
  date?: string; // ISO date string, defaults to today
  initialAppointments?: AppointmentWithPatient[];
}

/**
 * useRealtimeAppointments
 *
 * Supabase Realtime subscription for the appointments table.
 *
 * MVP note: This hook is scaffolded for future use.
 * In MVP, the dentist/receptionist appointment lists use server-fetched data
 * with manual refresh. This hook will be activated for live today's-schedule
 * updates in a post-MVP iteration.
 *
 * Pattern matches useQueue — initialAppointments from Server Component.
 */
export function useRealtimeAppointments({
  clinicId,
  date,
  initialAppointments = [],
}: UseRealtimeAppointmentsOptions) {
  const supabase = useBrowserSupabaseClient();
  const [appointments, setAppointments] =
    useState<AppointmentWithPatient[]>(initialAppointments);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const targetDate = date ?? new Date().toISOString().split("T")[0];

  useEffect(() => {
    // Stubbed for MVP — subscribe but do not render updates
    const channel = supabase
      .channel(`appointments:${clinicId}:${targetDate}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "appointments",
          filter: `clinic_id=eq.${clinicId}`,
        },
        () => {
          // TODO: re-fetch today's appointments and update state
          setIsLoading(false);
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [supabase, clinicId, targetDate]);

  return { appointments, setAppointments, isLoading, error };
}
