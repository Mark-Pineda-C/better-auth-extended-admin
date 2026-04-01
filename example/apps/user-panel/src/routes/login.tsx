import { A, useNavigate } from "@solidjs/router";
import { createSignal } from "solid-js";
import { authClient } from "../../lib/auth-client";

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = createSignal("");
  const [password, setPassword] = createSignal("");
  const [error, setError] = createSignal("");
  const [loading, setLoading] = createSignal(false);

  const handleSubmit = async (e: Event) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const result = await authClient.signIn.email({
      email: email(),
      password: password(),
    });

    if (result.error) {
      setError(result.error.message ?? "Error al iniciar sesión");
    } else {
      navigate("/dashboard");
    }

    setLoading(false);
  };

  return (
    <div class="container">
      <div class="card">
        <h1>Iniciar sesión</h1>
        <p class="subtitle">User Panel — requiere rol user o admin</p>
        <div class="module-info">
          Solo usuarios con rol <strong>user</strong> o <strong>admin</strong>{" "}
          pueden iniciar sesión desde este panel.
        </div>
        <form onSubmit={handleSubmit} class="form">
          <input
            type="email"
            placeholder="Email"
            value={email()}
            onInput={(e) => setEmail(e.target.value)}
            required
            autocomplete="email"
          />
          <input
            type="password"
            placeholder="Contraseña"
            value={password()}
            onInput={(e) => setPassword(e.target.value)}
            required
            autocomplete="current-password"
          />
          {error() && <div class="error">{error()}</div>}
          <button type="submit" disabled={loading()}>
            {loading() ? "Iniciando sesión..." : "Iniciar sesión"}
          </button>
        </form>
        <p class="mt-4 text-center">
          ¿Sin cuenta? <A href="/signup">Crear cuenta de usuario</A>
        </p>
      </div>
    </div>
  );
}
