import { A } from "@solidjs/router";

export default function Home() {
  return (
    <div class="container">
      <div class="card">
        <h1>User Panel</h1>
        <p class="subtitle">
          Usuarios con rol <strong>user</strong> o <strong>admin</strong> pueden
          acceder a este panel.
        </p>
        <div class="module-info">
          👤 <strong>Módulo:</strong> <code>userPanel</code> — origen{" "}
          <code>http://localhost:3003</code> — roles permitidos:{" "}
          <code>admin</code>, <code>user</code>
        </div>
        <div class="form">
          <A href="/login">
            <button>Iniciar sesión</button>
          </A>
          <A href="/signup">
            <button class="secondary">Crear cuenta de usuario</button>
          </A>
        </div>
      </div>
    </div>
  );
}
