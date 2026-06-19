"use client";

import { createBrowserClient } from "@supabase/ssr";
import { useMemo } from "react";
import type { Database } from "@/types/database.types";

/**
 * createBrowserSupabaseClient
 *
 * Creates a Supabase client for use ONLY in Client Components ('use client').
 *
 * Usage:
 * - Supabase Realtime subscriptions (useQueue, useRealtimeAppointments)
 * - Auth state change listeners (onAuthStateChange)
 *
 * NOT for data fetching — all data queries go through Server Actions.
 *
 * Pattern: use useMemo or useRef to prevent re-creation on every render.
 */
export function createBrowserSupabaseClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

/**
 * useBrowserSupabaseClient
 *
 * React hook that returns a stable Supabase browser client instance.
 * Memoized to prevent re-creation on re-renders.
 */
export function useBrowserSupabaseClient() {
  return useMemo(() => createBrowserSupabaseClient(), []);
}
