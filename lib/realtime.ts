import "server-only";

import { Client } from "pg";

import { prisma } from "@/lib/prisma";
import type { UserType } from "@/lib/generated/prisma/client";

/**
 * Live updates travel over Postgres LISTEN/NOTIFY rather than an in-process
 * emitter, because the server that handles a write is not necessarily the one
 * holding your dashboard's connection open. The database is the one thing every
 * instance already shares, so it does the fan-out.
 *
 * Events carry no data, only an audience and a hint at what moved. Clients
 * refetch from the server on arrival; nothing here is trusted to patch a UI.
 */

const CHANNEL = "pms_events";

export type AppEvent = {
  /** Which slice of the app moved. Used to decide what to refetch, not what to render. */
  kind: "request" | "notification" | "directory" | "finance";
  /** Everyone holding these roles should hear about it. */
  roles?: UserType[];
  /** These specific people should hear about it, whatever their role. */
  userIds?: string[];
};

type Subscriber = (event: AppEvent) => void;

type RealtimeState = {
  subscribers: Set<Subscriber>;
  client?: Client;
  connecting?: Promise<void>;
};

// One listener per process, shared by every open stream, and kept on globalThis
// so a hot reload doesn't strand the old connection.
const globalForRealtime = globalThis as unknown as {
  realtime?: RealtimeState;
};

const state: RealtimeState = (globalForRealtime.realtime ??= {
  subscribers: new Set(),
});

async function ensureListening(): Promise<void> {
  if (state.client) {
    return;
  }

  if (state.connecting) {
    return state.connecting;
  }

  state.connecting = (async () => {
    // LISTEN needs a session that stays open on one backend connection.
    // Supabase's pooled DATABASE_URL runs through Supavisor in transaction
    // mode, which can't hold that — DIRECT_URL is the unpooled connection.
    const client = new Client({ connectionString: process.env.DIRECT_URL });

    client.on("notification", (message) => {
      if (!message.payload) {
        return;
      }

      let event: AppEvent;

      try {
        event = JSON.parse(message.payload) as AppEvent;
      } catch {
        return;
      }

      for (const subscriber of state.subscribers) {
        subscriber(event);
      }
    });

    // A listener that dies quietly would freeze every dashboard on stale data
    // with no visible error, so drop it and let the next subscriber reconnect.
    client.on("error", (error) => {
      console.error("Realtime listener lost:", error);
      state.client = undefined;
      void client.end().catch(() => {});
    });

    await client.connect();
    await client.query(`LISTEN ${CHANNEL}`);

    state.client = client;
  })();

  try {
    await state.connecting;
  } finally {
    state.connecting = undefined;
  }
}

/** Starts listening if nobody was, and returns the unsubscribe. */
export async function subscribe(subscriber: Subscriber): Promise<() => void> {
  await ensureListening();

  state.subscribers.add(subscriber);

  return () => {
    state.subscribers.delete(subscriber);
  };
}

/** Announces a change to every server, and through them to every open dashboard. */
export async function publish(event: AppEvent): Promise<void> {
  try {
    await prisma.$executeRaw`SELECT pg_notify(${CHANNEL}, ${JSON.stringify(
      event,
    )})`;
  } catch (error) {
    // The write already succeeded. A missed live update costs the user one
    // refresh; throwing here would cost them the whole action.
    console.error("Realtime publish failed:", error);
  }
}
