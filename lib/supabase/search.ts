/**
 * Escapes a user-supplied search term for safe use inside a PostgREST
 * `.or("col.ilike.%value%,...")` filter string. Commas and parentheses are
 * structural characters in PostgREST's filter grammar (condition separator
 * and grouping) — left unescaped, user input could reshape the filter's
 * logic (e.g. inject an extra OR'd condition). RLS still guarantees no
 * cross-tenant row could ever be returned even so, but a malformed/altered
 * filter should never be possible from a search box in the first place.
 */
export function sanitizeIlikeTerm(term: string): string {
  return term.replace(/[,()]/g, "").trim();
}
