import type { SupabaseClient } from "@supabase/supabase-js";
import type { RpcSignatures } from "@/types/database";

/**
 * Thin type-safe wrapper around supabase.rpc() for the fixed set of
 * Postgres functions this app calls, so call sites get argument/return
 * typing without depending on the SupabaseClient<Database> generic.
 */
export async function callRpc<Name extends keyof RpcSignatures>(
  supabase: SupabaseClient,
  name: Name,
  args: RpcSignatures[Name]["args"]
) {
  return supabase.rpc(name, args) as unknown as Promise<{
    data: RpcSignatures[Name]["returns"] | null;
    error: { message: string } | null;
  }>;
}
