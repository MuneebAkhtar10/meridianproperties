import "server-only";

import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

/**
 * Supabase client for Server Components, Server Actions and Route Handlers.
 * Reads and writes the auth session through Next's cookie store.
 *
 * Writing cookies only works from a Server Action or Route Handler; a call
 * made while rendering a Server Component is a no-op there because Next
 * forbids setting cookies mid-render — `proxy.ts` refreshes the session on
 * every request instead, so a still-valid session keeps working either way.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Called from a Server Component render.
          }
        },
      },
    },
  );
}
