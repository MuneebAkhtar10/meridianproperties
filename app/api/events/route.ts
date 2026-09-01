import type { NextRequest } from "next/server";

import { subscribe, type AppEvent } from "@/lib/realtime";
import { getCurrentUser, type SessionUser } from "@/lib/session";

/** The stream is per-user and never ends, so it can't be cached or prerendered. */
export const dynamic = "force-dynamic";
export const runtime = "nodejs"; // pg cannot run on the edge runtime.

/**
 * Vercel's Hobby plan kills a function at 60s, and it does not care that we are
 * mid-stream. Declaring the ceiling here keeps the platform and this file honest
 * with each other. On Pro this can go up to 300.
 */
export const maxDuration = 60;

/**
 * So we hang up first, with ten seconds to spare. A stream we close cleanly is a
 * reconnect; a stream the platform guillotines is a stall the client has to time
 * out of. EventSource reconnects either way, but only one of them is quiet.
 */
const STREAM_TTL_MS = 50_000;

// Idle proxies and load balancers hang up on a silent connection. A comment
// line is not delivered as a message, so it keeps the pipe warm for free.
const HEARTBEAT_MS = 25_000;

/** How soon the browser should come back after we hang up. */
const RECONNECT_MS = 2_000;

/** An event reaches you if it names your role, or names you. */
function isForUser(event: AppEvent, user: SessionUser): boolean {
  return Boolean(
    event.roles?.includes(user.userType) || event.userIds?.includes(user.id),
  );
}

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();

  if (!user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let open = true;

      const send = (chunk: string) => {
        if (!open) {
          return;
        }

        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          // The client went away mid-write.
          open = false;
        }
      };

      send(`retry: ${RECONNECT_MS}\n\n`);
      send(": connected\n\n");

      const unsubscribe = await subscribe((event) => {
        if (isForUser(event, user)) {
          send(`data: ${JSON.stringify({ kind: event.kind })}\n\n`);
        }
      });

      const heartbeat = setInterval(() => send(": ping\n\n"), HEARTBEAT_MS);

      const close = () => {
        open = false;
        clearInterval(heartbeat);
        clearTimeout(recycle);
        unsubscribe();

        try {
          controller.close();
        } catch {
          // Already closed by the runtime.
        }
      };

      // Retire the stream before the platform does.
      const recycle = setTimeout(close, STREAM_TTL_MS);

      request.signal.addEventListener("abort", close);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Tells nginx and friends not to buffer, which would defeat the point.
      "X-Accel-Buffering": "no",
    },
  });
}
