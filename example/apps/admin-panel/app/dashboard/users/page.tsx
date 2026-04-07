"use client";

import { useCallback, useEffect, useState } from "react";
import { authClient } from "@/lib/auth-client";

type User = {
  id: string;
  name: string;
  email: string;
  role: string | null;
  banned: boolean | null;
  isActive: boolean;
  createdAt: string;
};

type DynamicRole = {
  id: string;
  name: string;
};

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [usersRes, rolesRes] = await Promise.all([
        authClient.extendedAdmin.listUsers({
          query: { limit: 100, sortBy: "createdAt", sortDirection: "desc" },
        }),
        authClient.extendedAdmin.listRoles(),
      ]);
      setUsers((usersRes.data?.users ?? []) as unknown as User[]);

      const dynamicNames = ((rolesRes.data ?? []) as DynamicRole[]).map(
        (r) => r.name,
      );
      const staticRoles = ["admin", "editor", "user"];
      const allRoles = [
        ...staticRoles,
        ...dynamicNames.filter((n) => !staticRoles.includes(n)),
      ];
      setRoles(allRoles);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error cargando datos");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const flash = (msg: string) => {
    setSuccess(msg);
    setTimeout(() => setSuccess(""), 3000);
  };

  const handleSetRole = async (userId: string, role: string) => {
    setBusy(userId);
    setError("");
    try {
      await authClient.extendedAdmin.setRole({ userId, role });
      flash("Rol actualizado.");
      await loadData();
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : typeof err === "object" && err !== null && "message" in err
            ? String((err as { message: unknown }).message)
            : "Error cambiando rol";
      setError(msg);
    } finally {
      setBusy(null);
    }
  };

  const handleBanToggle = async (user: User) => {
    setBusy(user.id);
    setError("");
    try {
      if (user.banned) {
        await authClient.extendedAdmin.unbanUser({ userId: user.id });
        flash(`${user.name} desbaneado.`);
      } else {
        await authClient.extendedAdmin.banUser({
          userId: user.id,
          banReason: "Baneado desde el panel de administración",
        });
        flash(`${user.name} baneado.`);
      }
      await loadData();
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : typeof err === "object" && err !== null && "message" in err
            ? String((err as { message: unknown }).message)
            : "Error actualizando estado de ban";
      setError(msg);
    } finally {
      setBusy(null);
    }
  };

  const handleActiveToggle = async (user: User) => {
    setBusy(user.id);
    setError("");
    try {
      if (user.isActive) {
        await authClient.extendedAdmin.disableUser({ userId: user.id });
        flash(`${user.name} desactivado.`);
      } else {
        await authClient.extendedAdmin.enableUser({ userId: user.id });
        flash(`${user.name} activado.`);
      }
      await loadData();
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : typeof err === "object" && err !== null && "message" in err
            ? String((err as { message: unknown }).message)
            : "Error actualizando estado";
      setError(msg);
    } finally {
      setBusy(null);
    }
  };

  if (loading) {
    return (
      <div className="card">
        <p className="subtitle">Cargando usuarios...</p>
      </div>
    );
  }

  return (
    <>
      {error && <div className="error">{error}</div>}
      {success && <div className="success">{success}</div>}

      <div className="card">
        <div className="card-header">
          <h2>Usuarios</h2>
          <span className="subtitle" style={{ marginBottom: 0 }}>
            {users.length} usuario{users.length !== 1 ? "s" : ""} registrado
            {users.length !== 1 ? "s" : ""}
          </span>
        </div>

        {users.length === 0 ? (
          <p className="text-muted" style={{ padding: "16px 0" }}>
            No hay usuarios registrados.
          </p>
        ) : (
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Email</th>
                  <th>Rol</th>
                  <th>Estado</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id}>
                    <td>{user.name}</td>
                    <td className="text-muted">{user.email}</td>
                    <td>
                      <select
                        className="role-select"
                        value={user.role ?? ""}
                        onChange={(e) =>
                          handleSetRole(user.id, e.target.value)
                        }
                        disabled={busy === user.id}
                      >
                        {!user.role && <option value="">Sin rol</option>}
                        {roles.map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <div className="badge-group">
                        {user.banned ? (
                          <span className="badge badge-danger">Baneado</span>
                        ) : user.isActive ? (
                          <span className="badge badge-success">Activo</span>
                        ) : (
                          <span className="badge badge-warning">
                            Desactivado
                          </span>
                        )}
                      </div>
                    </td>
                    <td>
                      <div className="action-buttons">
                        <button
                          className={`btn-sm ${user.banned ? "" : "danger"}`}
                          onClick={() => handleBanToggle(user)}
                          disabled={busy === user.id}
                        >
                          {user.banned ? "Desbanear" : "Banear"}
                        </button>
                        <button
                          className={`btn-sm ${user.isActive ? "warning" : ""}`}
                          onClick={() => handleActiveToggle(user)}
                          disabled={busy === user.id}
                        >
                          {user.isActive ? "Desactivar" : "Activar"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
