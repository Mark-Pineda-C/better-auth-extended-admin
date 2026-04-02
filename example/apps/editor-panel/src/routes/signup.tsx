import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";

export const Route = createFileRoute("/signup")({
  component: SignupPage,
});

function SignupPage() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const { error } = await authClient.signUp.email({
      name,
      email,
      password,
      // allowRoleOnSignUp: true en el servidor permite enviar el rol.
      // El módulo editorPanel (origin:3002) tiene allowedRoles: ["admin", "editor"].
      // @ts-expect-error — campo añadido por allowRoleOnSignUp
      role: "editor",
    });

    if (error) {
      setError(error.message ?? "Error al crear la cuenta");
    } else {
      navigate({ to: "/dashboard" });
    }

    setLoading(false);
  };

  return (
    <div className="container">
      <div className="card">
        <h1>Crear cuenta editor</h1>
        <p className="subtitle">Editor Panel — crea una cuenta con rol editor</p>
        <div className="module-info">
          Las cuentas creadas desde este panel reciben el rol{" "}
          <strong>editor</strong>. El servidor valida que{" "}
          <code>http://localhost:3002</code> solo permite roles{" "}
          <code>admin</code> y <code>editor</code>.
        </div>
        <form onSubmit={handleSubmit} className="form">
          <input
            type="text"
            placeholder="Nombre completo"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            autoComplete="name"
          />
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
          <input
            type="password"
            placeholder="Contraseña (mín. 8 caracteres)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            autoComplete="new-password"
          />
          {error && <div className="error">{error}</div>}
          <button type="submit" disabled={loading}>
            {loading ? "Creando cuenta..." : "Crear cuenta editor"}
          </button>
        </form>
        <p className="mt-4 text-center">
          ¿Ya tienes cuenta?{" "}
          <Link to="/login" className="link">
            Iniciar sesión
          </Link>
        </p>
      </div>
    </div>
  );
}
