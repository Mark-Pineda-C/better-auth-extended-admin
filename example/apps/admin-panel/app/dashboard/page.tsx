"use client";

import { useEffect, useState } from "react";
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

export default function DashboardOverview() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([
      trpc.dashboard.getProfile.query(),
      trpc.dashboard.getAdminStats.query(),
    ])
      .then(([profileData, statsData]) => {
        setProfile(profileData);
        setStats(statsData);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Error cargando datos");
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="card">
        <p className="subtitle">Cargando...</p>
      </div>
    );
  }

  return (
    <>
      {error && <div className="error">{error}</div>}

      {profile && (
        <div className="card">
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
        <div className="card mt-4">
          <h2>Capacidades del administrador</h2>
          <p className="subtitle">{stats.message}</p>
          <ul className="capability-list">
            {stats.capabilities.map((cap) => (
              <li key={cap}>{cap}</li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
