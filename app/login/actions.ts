"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { callRpc } from "@/lib/supabase/rpc";

export interface AuthActionState {
  error?: string;
}

export async function signInAction(_prevState: AuthActionState, formData: FormData): Promise<AuthActionState> {
  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "");

  if (!email || !password) {
    return { error: "Email et mot de passe requis." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: "Identifiants invalides." };
  }

  redirect("/dashboard");
}

export async function signUpAction(_prevState: AuthActionState, formData: FormData): Promise<AuthActionState> {
  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "");
  const fullName = String(formData.get("full_name") || "").trim();
  const companyName = String(formData.get("company_name") || "").trim();

  if (!email || !password || !fullName || !companyName) {
    return { error: "Tous les champs sont requis." };
  }
  if (password.length < 8) {
    return { error: "Le mot de passe doit contenir au moins 8 caractères." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({ email, password });

  if (error || !data.user) {
    return { error: error?.message ?? "Impossible de créer le compte." };
  }

  // If email confirmation is enabled there is no active session yet, so the
  // company/profile registration RPC (which relies on auth.uid()) must wait
  // until the user actually signs in for the first time — /onboarding
  // handles that case for a confirmed-but-not-yet-provisioned user.
  if (!data.session) {
    return {
      error:
        "Compte créé. Vérifiez votre boîte mail pour confirmer votre adresse, puis connectez-vous pour finaliser la création de votre entreprise.",
    };
  }

  const { error: rpcError } = await callRpc(supabase, "register_company_and_admin", {
    p_company_name: companyName,
    p_full_name: fullName,
  });

  if (rpcError) {
    return { error: rpcError.message };
  }

  redirect("/dashboard");
}

export async function signOutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
