"use client";

/**
 * QueryProvider
 *
 * Provides a single TanStack Query client to the React tree. Mounted once at
 * the root layout so any client component can read the cache or invalidate
 * queries after a mutation.
 *
 * IMPORTANT — this provider does NOT change the app architecture:
 * - Server Components and Server Actions remain the primary architecture and
 *   the single source of truth.
 * - Merely providing a QueryClient caches nothing on its own. Caching only
 *   happens on the four list pages that explicitly call `useQuery`
 *   (Patients, Appointments, Treatments, Follow-Ups). Everything else
 *   (Dashboard, Queue, Analytics, AI, Auth, Settings, Portal) is untouched.
 *
 * Cache defaults are tuned for read-heavy list pages:
 * - staleTime 5m       → cached lists are considered fresh for 5 minutes,
 *                        so return navigation renders instantly without an
 *                        immediate refetch.
 * - gcTime 15m         → unused caches are retained for 15 minutes.
 * - refetchOnWindowFocus false → avoid aggressive refetching on tab focus.
 * - refetchOnReconnect true     → refresh after the network comes back.
 * - retry 1            → conservative retry; matches the app's existing
 *                        "fail gracefully" posture (Server Actions already
 *                        return typed errors rather than throwing).
 */

import { useState } from "react";
import {
  QueryClient,
  QueryClientProvider,
  type QueryClientConfig,
} from "@tanstack/react-query";

const queryClientConfig: QueryClientConfig = {
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 15 * 60 * 1000, // 15 minutes
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      retry: 1,
    },
  },
};

export function QueryProvider({ children }: { children: React.ReactNode }) {
  // useState ensures a single QueryClient instance per browser session and
  // prevents re-creation across re-renders (the standard Next.js pattern).
  const [queryClient] = useState(() => new QueryClient(queryClientConfig));

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
