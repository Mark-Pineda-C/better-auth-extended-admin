import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const { error } = await authClient.signIn.email({ email, password });

    if (error) {
      setError(error.message ?? "Error al iniciar sesión");
    } else {
      navigate({ to: "/dashboard" });
    }

    setLoading(false);
  };

  return (
    <div className="container">
      <div className="card">
        <h1>Iniciar sesión</h1>
        <p className="subtitle">Editor Panel — requiere rol editor o admin</p>
        <div className="module-info">
          Solo usuarios con rol <strong>editor</strong> o{" "}
          <strong>admin</strong> pueden iniciar sesión desde este panel.
        </div>
        <form onSubmit={handleSubmit} className="form">
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
            placeholder="Contraseña"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
          />
          {error && <div className="error">{error}</div>}
          <button type="submit" disabled={loading}>
            {loading ? "Iniciando sesión..." : "Iniciar sesión"}
          </button>
        </form>
        <p className="mt-4 text-center">
          ¿Sin cuenta?{" "}
          <Link to="/signup" className="link">
            Crear cuenta editor
          </Link>
        </p>
      </div>
    </div>
  );
}
