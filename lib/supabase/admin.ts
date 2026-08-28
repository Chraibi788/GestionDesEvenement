import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// Service-role client: bypasses RLS. Server-only — never import this from
// a Client Component or expose SUPABASE_SERVICE_ROLE_KEY to the browser.
// Used only for the narrow set of operations RLS deliberately blocks for
// authenticated users (audit log inserts, cross-tenant admin tooling).
// See types/database.ts for why no Database generic is used here.
export function createAdminClient() {
  if (typeof window !== "undefined") {
    throw new Error("createAdminClient must never be called from the browser");
  }

  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { autoRefreshToken: false, persistSession: false },
    }
  );
}
