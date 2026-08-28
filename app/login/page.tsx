"use client";

import { useActionState, useState } from "react";
import { signInAction, signUpAction, type AuthActionState } from "./actions";

const initialState: AuthActionState = {};

export default function LoginPage() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [signInState, signInFormAction, signInPending] = useActionState(signInAction, initialState);
  const [signUpState, signUpFormAction, signUpPending] = useActionState(signUpAction, initialState);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-brand-700">Khedma AI</h1>
          <p className="mt-1 text-sm text-gray-500">Devis assistés par IA pour PME B2B</p>
        </div>

        <div className="card p-6">
          {mode === "signin" ? (
            <form action={signInFormAction} className="space-y-4">
              <h2 className="text-lg font-semibold text-gray-900">Connexion</h2>
              <div>
                <label className="label" htmlFor="email">Email</label>
                <input id="email" name="email" type="email" required className="input" placeholder="vous@entreprise.ma" />
              </div>
              <div>
                <label className="label" htmlFor="password">Mot de passe</label>
                <input id="password" name="password" type="password" required className="input" />
              </div>
              {signInState.error && <p className="text-sm text-red-600">{signInState.error}</p>}
              <button type="submit" disabled={signInPending} className="btn-primary w-full">
                {signInPending ? "Connexion..." : "Se connecter"}
              </button>
              <p className="text-center text-sm text-gray-500">
                Pas encore de compte ?{" "}
                <button type="button" className="font-medium text-brand-600 hover:underline" onClick={() => setMode("signup")}>
                  Créer une entreprise
                </button>
              </p>
            </form>
          ) : (
            <form action={signUpFormAction} className="space-y-4">
              <h2 className="text-lg font-semibold text-gray-900">Créer votre entreprise</h2>
              <div>
                <label className="label" htmlFor="company_name">Nom de l&apos;entreprise</label>
                <input id="company_name" name="company_name" required className="input" placeholder="Atlas Industrial Supplies SARL" />
              </div>
              <div>
                <label className="label" htmlFor="full_name">Votre nom complet</label>
                <input id="full_name" name="full_name" required className="input" />
              </div>
              <div>
                <label className="label" htmlFor="signup_email">Email</label>
                <input id="signup_email" name="email" type="email" required className="input" />
              </div>
              <div>
                <label className="label" htmlFor="signup_password">Mot de passe</label>
                <input id="signup_password" name="password" type="password" required minLength={8} className="input" />
              </div>
              {signUpState.error && <p className="text-sm text-red-600">{signUpState.error}</p>}
              <button type="submit" disabled={signUpPending} className="btn-primary w-full">
                {signUpPending ? "Création..." : "Créer mon compte admin"}
              </button>
              <p className="text-center text-sm text-gray-500">
                Déjà inscrit ?{" "}
                <button type="button" className="font-medium text-brand-600 hover:underline" onClick={() => setMode("signin")}>
                  Se connecter
                </button>
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
