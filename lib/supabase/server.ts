import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Server-side client that runs with the caller's own session, so every
// query goes through RLS exactly as it would for that user in the browser.
// See types/database.ts for why no Database generic is used here.
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
            // Called from a Server Component render; middleware refreshes
            // the session cookie instead, so this can be safely ignored.
          }
        },
      },
    }
  );
}
