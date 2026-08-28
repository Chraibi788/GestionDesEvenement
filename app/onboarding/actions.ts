"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { callRpc } from "@/lib/supabase/rpc";
import type { AuthActionState } from "@/app/login/actions";

export async function completeOnboardingAction(
  _prevState: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const companyName = String(formData.get("company_name") || "").trim();
  const fullName = String(formData.get("full_name") || "").trim();

  if (!companyName || !fullName) {
    return { error: "Tous les champs sont requis." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { error } = await callRpc(supabase, "register_company_and_admin", {
    p_company_name: companyName,
    p_full_name: fullName,
  });

  if (error) {
    return { error: error.message };
  }

  redirect("/dashboard");
}
