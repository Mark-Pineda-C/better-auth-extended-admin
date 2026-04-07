"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { authClient } from "@/lib/auth-client";

export default function SignupPage() {
  const router = useRouter();
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
      // El módulo adminpanel (origin:admin-panel.localhost:1355) permite rol admin.
      // por lo que solo se puede crear con rol "admin" desde este origen.
      // @ts-expect-error — campo añadido por allowRoleOnSignUp
      role: "admin",
    });

    if (error) {
      setError(error.message ?? "Error al crear la cuenta");
    } else {
      router.push("/dashboard");
    }

    setLoading(false);
  };

  return (
    <div className="container">
      <div className="card">
        <h1>Crear cuenta admin</h1>
        <p className="subtitle">Admin Panel — crea una cuenta con rol admin</p>
        <div className="module-info">
          Las cuentas creadas desde este panel reciben el rol{" "}
          <strong>admin</strong> automáticamente. El servidor valida que el
          origen <code>http://admin-panel.localhost:1355</code> solo permite dicho rol.
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
            {loading ? "Creando cuenta..." : "Crear cuenta admin"}
          </button>
        </form>
        <p className="mt-4 text-center">
          ¿Ya tienes cuenta?{" "}
          <Link href="/login" className="link">
            Iniciar sesión
          </Link>
        </p>
      </div>
    </div>
  );
}
