import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { authClient } from "@/lib/auth-client";
import { trpc } from "@/lib/trpc-client";

export const Route = createFileRoute("/dashboard")({
  component: DashboardPage,
});

type Profile = {
  id: string;
  name: string;
  email: string;
  role: string;
};

type EditorContent = {
  message: string;
  capabilities: string[];
  role: string;
};

function DashboardPage() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [content, setContent] = useState<EditorContent | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const load = async () => {
      const session = await authClient.getSession();

      if (!session.data?.user) {
        navigate({ to: "/login" });
        return;
      }

      try {
        const [profileData, contentData] = await Promise.all([
          trpc.dashboard.getProfile.query(),
          trpc.dashboard.getEditorContent.query(),
        ]);
        setProfile(profileData);
        setContent(contentData);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error cargando datos");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [navigate]);

  const handleSignOut = async () => {
    await authClient.signOut();
    navigate({ to: "/login" });
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
        <h1>Dashboard Editor</h1>
        <p className="subtitle">Panel de edición</p>

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
          </div>
        )}

        {content && (
          <div className="mt-6">
            <h2>Herramientas del editor</h2>
            <p className="subtitle">{content.message}</p>
            <ul
              style={{
                paddingLeft: "20px",
                fontSize: "0.9rem",
                display: "flex",
                flexDirection: "column",
                gap: "6px",
              }}
            >
              {content.capabilities.map((cap) => (
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
