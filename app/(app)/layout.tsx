import Link from "next/link";
import { requireSession } from "@/lib/auth/session";
import { signOutAction } from "@/app/login/actions";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Tableau de bord" },
  { href: "/customers", label: "Clients" },
  { href: "/products", label: "Produits" },
  { href: "/rfqs", label: "Demandes de prix" },
  { href: "/quotations", label: "Devis" },
];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex items-center gap-8">
            <Link href="/dashboard" className="text-lg font-bold text-brand-700">
              Khedma AI
            </Link>
            <nav className="hidden gap-1 sm:flex">
              {NAV_ITEMS.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="rounded-md px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right text-sm">
              <div className="font-medium text-gray-900">{session.profile.full_name}</div>
              <div className="text-xs text-gray-500">
                {session.company.name} · {roleLabel(session.profile.role)}
              </div>
            </div>
            <form action={signOutAction}>
              <button type="submit" className="btn-secondary">
                Déconnexion
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">{children}</main>
    </div>
  );
}

function roleLabel(role: string) {
  switch (role) {
    case "admin":
      return "Administrateur";
    case "manager":
      return "Manager";
    case "salesperson":
      return "Commercial";
    default:
      return role;
  }
}
