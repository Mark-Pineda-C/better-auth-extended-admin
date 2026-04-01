import { createRootRoute, Outlet } from "@tanstack/react-router";
import "../styles.css";

export const Route = createRootRoute({
  component: RootComponent,
  notFoundComponent: () => (
    <div className="container">
      <div className="card">
        <h1>404 — Página no encontrada</h1>
      </div>
    </div>
  ),
});

function RootComponent() {
  return <Outlet />;
}
