"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { authClient } from "@/lib/auth-client";

export default function LoginPage() {
  const router = useRouter();
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
      // MODULE_ACCESS_DENIED se lanza cuando el rol no está en allowedRoles del módulo
      setError(error.message ?? "Error al iniciar sesión");
    } else {
      router.push("/dashboard");
    }

    setLoading(false);
  };

  return (
    <div className="container">
      <div className="card">
        <h1>Iniciar sesión</h1>
        <p className="subtitle">Admin Panel — requiere rol admin</p>
        <div className="module-info">
          Solo usuarios con rol <strong>admin</strong> pueden iniciar sesión
          desde este panel. Los demás roles recibirán un error 403.
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
          <Link href="/signup" className="link">
            Crear cuenta admin
          </Link>
        </p>
      </div>
    </div>
  );
}
