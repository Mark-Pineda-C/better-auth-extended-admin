import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: HomePage,
});

function HomePage() {
  return (
    <div className="container">
      <div className="card">
        <h1>Editor Panel</h1>
        <p className="subtitle">
          Usuarios con rol <strong>editor</strong> o <strong>admin</strong>{" "}
          pueden acceder a este panel.
        </p>
        <div className="module-info">
          🖊 <strong>Módulo:</strong> <code>editorPanel</code> — origen{" "}
          <code>http://localhost:3002</code> — roles permitidos:{" "}
          <code>admin</code>, <code>editor</code>
        </div>
        <div className="form">
          <Link to="/login">
            <button>Iniciar sesión</button>
          </Link>
          <Link to="/signup">
            <button className="secondary">Crear cuenta editor</button>
          </Link>
        </div>
      </div>
    </div>
  );
}
