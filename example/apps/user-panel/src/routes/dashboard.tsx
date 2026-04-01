import { useNavigate } from "@solidjs/router";
import { createSignal, onMount, Show } from "solid-js";
import { authClient } from "../../lib/auth-client";
import { trpc } from "../../lib/trpc-client";

type Profile = {
  id: string;
  name: string;
  email: string;
  role: string;
};

type UserContent = {
  message: string;
  page: number;
  items: string[];
  role: string;
};

export default function Dashboard() {
  const navigate = useNavigate();
  const [profile, setProfile] = createSignal<Profile | null>(null);
  const [content, setContent] = createSignal<UserContent | null>(null);
  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal("");

  onMount(async () => {
    const session = await authClient.getSession();

    if (!session.data?.user) {
      navigate("/login");
      return;
    }

    try {
      const [profileData, contentData] = await Promise.all([
        trpc.dashboard.getProfile.query(),
        trpc.dashboard.getUserContent.query({ page: 1 }),
      ]);
      setProfile(profileData);
      setContent(contentData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error cargando datos");
    } finally {
      setLoading(false);
    }
  });

  const handleSignOut = async () => {
    await authClient.signOut();
    navigate("/login");
  };

  return (
    <div class="container">
      <div class="card">
        <h1>Dashboard Usuario</h1>
        <p class="subtitle">Panel de usuario</p>

        <Show when={loading()}>
          <p class="subtitle">Cargando...</p>
        </Show>

        <Show when={error()}>
          <div class="error">{error()}</div>
        </Show>

        <Show when={profile()}>
          <div class="mt-4">
            <h2>Perfil</h2>
            <div class="info-row">
              <span class="label">Nombre</span>
              <span>{profile()!.name}</span>
            </div>
            <div class="info-row">
              <span class="label">Email</span>
              <span>{profile()!.email}</span>
            </div>
            <div class="info-row">
              <span class="label">Rol</span>
              <span class="badge">{profile()!.role}</span>
            </div>
          </div>
        </Show>

        <Show when={content()}>
          <div class="mt-6">
            <h2>Contenido disponible</h2>
            <p class="subtitle">{content()!.message}</p>
            <ul
              style={{
                "padding-left": "20px",
                "font-size": "0.9rem",
                display: "flex",
                "flex-direction": "column",
                gap: "6px",
              }}
            >
              {content()!.items.map((item) => (
                <li>{item}</li>
              ))}
            </ul>
          </div>
        </Show>

        <Show when={!loading()}>
          <div class="mt-6">
            <button class="secondary" onClick={handleSignOut}>
              Cerrar sesión
            </button>
          </div>
        </Show>
      </div>
    </div>
  );
}
