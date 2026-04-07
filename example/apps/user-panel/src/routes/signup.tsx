import { A, useNavigate } from "@solidjs/router";
import { createSignal } from "solid-js";
import { authClient } from "../../lib/auth-client";

export default function Signup() {
  const navigate = useNavigate();
  const [name, setName] = createSignal("");
  const [email, setEmail] = createSignal("");
  const [password, setPassword] = createSignal("");
  const [error, setError] = createSignal("");
  const [loading, setLoading] = createSignal(false);

  const handleSubmit = async (e: Event) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const result = await authClient.signUp.email({
      name: name(),
      email: email(),
      password: password(),
      // allowRoleOnSignUp: true en el servidor permite enviar el rol.
      // El módulo userpanel (origin:user-panel.localhost:1355) permite admin y user.
      // @ts-expect-error — campo añadido por allowRoleOnSignUp
      role: "user",
    });

    if (result.error) {
      setError(result.error.message ?? "Error al crear la cuenta");
    } else {
      navigate("/dashboard");
    }

    setLoading(false);
  };

  return (
    <div class="container">
      <div class="card">
        <h1>Crear cuenta de usuario</h1>
        <p class="subtitle">User Panel — crea una cuenta con rol user</p>
        <div class="module-info">
          Las cuentas creadas desde este panel reciben el rol{" "}
          <strong>user</strong>. El servidor valida que{" "}
          <code>http://user-panel.localhost:1355</code> solo permite roles{" "}
          <code>admin</code> y <code>user</code>.
        </div>
        <form onSubmit={handleSubmit} class="form">
          <input
            type="text"
            placeholder="Nombre completo"
            value={name()}
            onInput={(e) => setName(e.target.value)}
            required
            autocomplete="name"
          />
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
            placeholder="Contraseña (mín. 8 caracteres)"
            value={password()}
            onInput={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            autocomplete="new-password"
          />
          {error() && <div class="error">{error()}</div>}
          <button type="submit" disabled={loading()}>
            {loading() ? "Creando cuenta..." : "Crear cuenta de usuario"}
          </button>
        </form>
        <p class="mt-4 text-center">
          ¿Ya tienes cuenta? <A href="/login">Iniciar sesión</A>
        </p>
      </div>
    </div>
  );
}
