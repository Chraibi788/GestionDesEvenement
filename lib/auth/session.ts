import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Company, Profile, UserRole } from "@/types/database";

export interface CurrentSession {
  userId: string;
  email: string | null;
  profile: Profile;
  company: Company;
}

/**
 * Loads the signed-in user's profile + company. Redirects to /login if
 * there is no session, and to /onboarding if auth succeeded but no
 * profile/company exists yet (should be rare: signup creates both).
 */
export async function requireSession(): Promise<CurrentSession> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profileData } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();
  const profile = profileData as Profile | null;

  if (!profile) {
    redirect("/onboarding");
  }

  const { data: companyData } = await supabase
    .from("companies")
    .select("*")
    .eq("id", profile.company_id)
    .maybeSingle();
  const company = companyData as Company | null;

  if (!company) {
    redirect("/onboarding");
  }

  return {
    userId: user.id,
    email: user.email ?? null,
    profile,
    company,
  };
}

export function requireRole(session: CurrentSession, allowed: UserRole[]) {
  if (!allowed.includes(session.profile.role)) {
    throw new Error("FORBIDDEN: insufficient role");
  }
}

/**
 * Same lookup as requireSession() but returns null instead of redirecting,
 * for use in API route handlers where a redirect makes no sense — callers
 * should return a 401 JSON response themselves.
 */
export async function getApiSession(): Promise<CurrentSession | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profileData } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();
  const profile = profileData as Profile | null;
  if (!profile) return null;

  const { data: companyData } = await supabase
    .from("companies")
    .select("*")
    .eq("id", profile.company_id)
    .maybeSingle();
  const company = companyData as Company | null;
  if (!company) return null;

  return {
    userId: user.id,
    email: user.email ?? null,
    profile,
    company,
  };
}
