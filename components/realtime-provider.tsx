"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";

import type { AppEvent } from "@/lib/realtime";

/**
 * Holds the app's single connection to the event stream and turns anything that
 * arrives into a re-render of whatever page you happen to be on.
 *
 * Server Components already know how to fetch the truth, so an event only says
 * "look again" — it never carries state of its own. That keeps every dashboard
 * correct without any of them having to model what changed.
 */

type Handler = (kind: AppEvent["kind"]) => void;
type Subscribe = (handler: Handler) => () => void;

const RealtimeContext = createContext<Subscribe | null>(null);

// A single write often fires several events (a request plus the notifications it
// creates). Collapse the burst so it costs one refetch, not one per event.
const COALESCE_MS = 200;

// If the stream cannot be established at all — a proxy that eats text/event-stream,
// a platform limit we did not foresee — the app must not silently go back to
// showing stale data. It quietly degrades to polling instead.
const FAILURES_BEFORE_POLLING = 3;
const FALLBACK_POLL_MS = 30_000;

export function RealtimeProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const handlers = useRef(new Set<Handler>());

  useEffect(() => {
    const source = new EventSource("/api/events");

    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let wasDisconnected = false;
    let failures = 0;

    source.onmessage = (message) => {
      const event = JSON.parse(message.data) as { kind: AppEvent["kind"] };

      for (const handler of handlers.current) {
        handler(event.kind);
      }

      if (refreshTimer) {
        clearTimeout(refreshTimer);
      }

      refreshTimer = setTimeout(() => router.refresh(), COALESCE_MS);
    };

    // Serverless caps how long a response may stay open, so the stream is retired
    // and rebuilt every minute by design. Nothing can be delivered during the
    // handover, and EventSource cannot replay it, so coming back is always a
    // reason to refetch — whether we left on purpose or not.
    source.onopen = () => {
      failures = 0;

      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
      }

      if (wasDisconnected) {
        wasDisconnected = false;
        router.refresh();
      }
    };

    source.onerror = () => {
      wasDisconnected = true;
      failures += 1;

      if (failures >= FAILURES_BEFORE_POLLING && !pollTimer) {
        pollTimer = setInterval(() => router.refresh(), FALLBACK_POLL_MS);
      }
    };

    return () => {
      source.close();

      if (refreshTimer) {
        clearTimeout(refreshTimer);
      }

      if (pollTimer) {
        clearInterval(pollTimer);
      }
    };
  }, [router]);

  const subscribe = useCallback<Subscribe>((handler) => {
    handlers.current.add(handler);

    return () => {
      handlers.current.delete(handler);
    };
  }, []);

  return (
    <RealtimeContext.Provider value={subscribe}>
      {children}
    </RealtimeContext.Provider>
  );
}

/**
 * Runs `handler` whenever a live event arrives. For anything a Server Component
 * renders you need nothing — the provider already refreshes the route. Reach for
 * this only where client state has to be refetched by hand.
 */
export function useRealtime(handler: Handler) {
  const subscribe = useContext(RealtimeContext);

  // Keep the latest closure without resubscribing on every render.
  const latest = useRef(handler);
  latest.current = handler;

  useEffect(() => {
    if (!subscribe) {
      return;
    }

    return subscribe((kind) => latest.current(kind));
  }, [subscribe]);
}
