import Link from "next/link";

export default function Home() {
  return (
    <div className="container">
      <div className="card">
        <h1>Admin Panel</h1>
        <p className="subtitle">
          Solo usuarios con rol <strong>admin</strong> pueden acceder a este panel.
        </p>
        <div className="module-info">
          🔐 <strong>Módulo:</strong> <code>adminPanel</code> — origen{" "}
          <code>http://localhost:3001</code> — roles permitidos:{" "}
          <code>admin</code>
        </div>
        <div className="form">
          <Link href="/login">
            <button>Iniciar sesión</button>
          </Link>
          <Link href="/signup">
            <button className="secondary">Crear cuenta admin</button>
          </Link>
        </div>
      </div>
    </div>
  );
}
