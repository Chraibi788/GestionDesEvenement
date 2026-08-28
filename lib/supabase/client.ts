import { createBrowserClient } from "@supabase/ssr";

// See types/database.ts for why this client is not parameterized with a
// Database generic: query results are cast to the domain interfaces there.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
