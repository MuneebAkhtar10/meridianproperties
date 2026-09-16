import type { DynamicsClient } from "./types";
import { createMockDynamicsClient } from "./mock";
import { createRealDynamicsClient } from "./real";

/**
 * Which Dynamics F&O client to talk to.
 *
 * Set `DYNAMICS_TENANT_ID`, `DYNAMICS_CLIENT_ID`, `DYNAMICS_CLIENT_SECRET` and
 * `DYNAMICS_RESOURCE_URL` (the environment's `https://<org>.operations.dynamics.com`)
 * to switch from the mock to a real sandbox — nothing else in the app changes.
 */
export function getDynamicsClient(): DynamicsClient {
  const hasLiveCredentials =
    !!process.env.DYNAMICS_TENANT_ID &&
    !!process.env.DYNAMICS_CLIENT_ID &&
    !!process.env.DYNAMICS_CLIENT_SECRET &&
    !!process.env.DYNAMICS_RESOURCE_URL;

  return hasLiveCredentials ? createRealDynamicsClient() : createMockDynamicsClient();
}
