"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { trpc } from "@/lib/trpc-client";

type AdminStats = {
  message: string;
  capabilities: string[];
  role: string;
};

type Profile = {
  id: string;
  name: string;
  email: string;
  role: string;
};

export default function DashboardPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const load = async () => {
      const session = await authClient.getSession();

      if (!session.data?.user) {
        router.push("/login");
        return;
      }

      try {
        const [profileData, statsData] = await Promise.all([
          trpc.dashboard.getProfile.query(),
          trpc.dashboard.getAdminStats.query(),
        ]);
        setProfile(profileData);
        setStats(statsData);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error cargando datos");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [router]);

  const handleSignOut = async () => {
    await authClient.signOut();
    router.push("/login");
  };

  if (loading) {
    return (
      <div className="container">
        <div className="card">
          <p className="subtitle">Cargando...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="card">
        <h1>Dashboard Admin</h1>
        <p className="subtitle">Panel de administración</p>

        {error && <div className="error">{error}</div>}

        {profile && (
          <div className="mt-4">
            <h2>Perfil</h2>
            <div className="info-row">
              <span className="label">Nombre</span>
              <span>{profile.name}</span>
            </div>
            <div className="info-row">
              <span className="label">Email</span>
              <span>{profile.email}</span>
            </div>
            <div className="info-row">
              <span className="label">Rol</span>
              <span className="badge">{profile.role}</span>
            </div>
            <div className="info-row">
              <span className="label">ID</span>
              <span style={{ fontSize: "0.75rem", color: "#999" }}>
                {profile.id}
              </span>
            </div>
          </div>
        )}

        {stats && (
          <div className="mt-6">
            <h2>Capacidades del administrador</h2>
            <p className="subtitle">{stats.message}</p>
            <ul
              style={{
                paddingLeft: "20px",
                fontSize: "0.9rem",
                display: "flex",
                flexDirection: "column",
                gap: "6px",
              }}
            >
              {stats.capabilities.map((cap) => (
                <li key={cap}>{cap}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-6">
          <button className="secondary" onClick={handleSignOut}>
            Cerrar sesión
          </button>
        </div>
      </div>
    </div>
  );
}
