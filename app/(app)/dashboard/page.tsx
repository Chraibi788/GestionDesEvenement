import { requireSession } from "@/lib/auth/session";

export default async function DashboardPage() {
  const session = await requireSession();

  return (
    <div>
      <h1 className="text-xl font-semibold text-gray-900">Tableau de bord</h1>
      <p className="mt-2 text-sm text-gray-500">Bienvenue, {session.profile.full_name}.</p>
    </div>
  );
}
