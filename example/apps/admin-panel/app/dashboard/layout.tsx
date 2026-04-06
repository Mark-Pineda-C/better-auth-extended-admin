"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { authClient } from "@/lib/auth-client";

type User = {
  id: string;
  name: string;
  email: string;
  role?: string | null;
};

const NAV_ITEMS = [
  { href: "/dashboard", label: "Vista general" },
  { href: "/dashboard/roles", label: "Roles" },
  { href: "/dashboard/users", label: "Usuarios" },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    authClient.getSession().then((session) => {
      if (!session.data?.user) {
        router.push("/login");
        return;
      }
      setUser(session.data.user as User);
      setChecking(false);
    });
  }, [router]);

  const handleSignOut = async () => {
    await authClient.signOut();
    router.push("/login");
  };

  if (checking) {
    return (
      <div className="container-wide">
        <div className="card">
          <p className="subtitle">Cargando...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-shell">
      <header className="dashboard-header">
        <div className="dashboard-header-inner">
          <div className="dashboard-brand">
            <h1>Admin Panel</h1>
            {user && (
              <span className="badge">{user.role ?? "sin rol"}</span>
            )}
          </div>
          <button className="btn-sm secondary" onClick={handleSignOut}>
            Cerrar sesión
          </button>
        </div>
        <nav className="dashboard-nav">
          {NAV_ITEMS.map((item) => {
            const active =
              item.href === "/dashboard"
                ? pathname === "/dashboard"
                : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`nav-tab${active ? " active" : ""}`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </header>
      <main className="dashboard-content">{children}</main>
    </div>
  );
}
