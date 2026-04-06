"use client";

import { useCallback, useEffect, useState } from "react";
import { authClient } from "@/lib/auth-client";
import { trpc } from "@/lib/trpc-client";

type AdminConfig = {
  modules: { key: string; name: string; origin: string }[];
  staticRoles: string[];
  defaultModuleAccess: Record<string, string[]>;
  availablePermissions: Record<string, string[]>;
};

type DynamicRole = {
  id: string;
  name: string;
  permissions: Record<string, string[]>;
  description: string | null;
};

type RoleForm = {
  name: string;
  description: string;
  modules: string[];
  permissions: Record<string, string[]>;
};

const EMPTY_FORM: RoleForm = {
  name: "",
  description: "",
  modules: [],
  permissions: {},
};

export default function RolesPage() {
  const [config, setConfig] = useState<AdminConfig | null>(null);
  const [dynamicRoles, setDynamicRoles] = useState<DynamicRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [editingRole, setEditingRole] = useState<string | null>(null);
  const [form, setForm] = useState<RoleForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [configData, rolesRes] = await Promise.all([
        trpc.admin.getAdminConfig.query(),
        authClient.extendedAdmin.listRoles(),
      ]);
      setConfig(configData);
      setDynamicRoles((rolesRes.data ?? []) as DynamicRole[]);
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

  const openCreateForm = () => {
    setEditingRole(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
    setError("");
  };

  const openEditForm = (role: DynamicRole) => {
    setEditingRole(role.name);
    setForm({
      name: role.name,
      description: role.description ?? "",
      modules: role.permissions.module ?? [],
      permissions: Object.fromEntries(
        Object.entries(role.permissions).filter(([k]) => k !== "module"),
      ),
    });
    setShowForm(true);
    setError("");
  };

  const cancelForm = () => {
    setShowForm(false);
    setEditingRole(null);
    setForm(EMPTY_FORM);
    setError("");
  };

  const toggleModule = (key: string) => {
    setForm((prev) => ({
      ...prev,
      modules: prev.modules.includes(key)
        ? prev.modules.filter((m) => m !== key)
        : [...prev.modules, key],
    }));
  };

  const togglePermission = (resource: string, action: string) => {
    setForm((prev) => {
      const current = prev.permissions[resource] ?? [];
      const updated = current.includes(action)
        ? current.filter((a) => a !== action)
        : [...current, action];
      const newPerms = { ...prev.permissions };
      if (updated.length === 0) {
        delete newPerms[resource];
      } else {
        newPerms[resource] = updated;
      }
      return { ...prev, permissions: newPerms };
    });
  };

  const handleSave = async () => {
    setError("");
    setSaving(true);
    try {
      const permissions: Record<string, string[]> = { ...form.permissions };
      if (form.modules.length > 0) {
        permissions.module = form.modules;
      }

      if (editingRole) {
        const data: {
          permissions: Record<string, string[]>;
          description?: string;
          newName?: string;
        } = { permissions };
        if (form.description) data.description = form.description;
        if (form.name !== editingRole) data.newName = form.name;

        await authClient.extendedAdmin.updateRole({
          name: editingRole,
          data,
        });
        flash(`Rol "${form.name}" actualizado.`);
      } else {
        await authClient.extendedAdmin.createRole({
          name: form.name,
          permissions,
          description: form.description || undefined,
        });
        flash(`Rol "${form.name}" creado.`);
      }

      cancelForm();
      await loadData();
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : typeof err === "object" && err !== null && "message" in err
            ? String((err as { message: unknown }).message)
            : "Error guardando rol";
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (name: string) => {
    if (!confirm(`¿Eliminar el rol "${name}"? Esta acción no se puede deshacer.`))
      return;
    setDeleting(name);
    setError("");
    try {
      await authClient.extendedAdmin.deleteRole({ name });
      flash(`Rol "${name}" eliminado.`);
      await loadData();
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : typeof err === "object" && err !== null && "message" in err
            ? String((err as { message: unknown }).message)
            : "Error eliminando rol";
      setError(msg);
    } finally {
      setDeleting(null);
    }
  };

  if (loading) {
    return (
      <div className="card">
        <p className="subtitle">Cargando roles...</p>
      </div>
    );
  }

  if (!config) return null;

  const permissionResources = Object.entries(
    config.availablePermissions,
  ).filter(([k]) => k !== "module");

  return (
    <>
      {error && <div className="error">{error}</div>}
      {success && <div className="success">{success}</div>}

      {/* Static roles */}
      <div className="card">
        <div className="card-header">
          <h2>Roles estáticos</h2>
          <span className="subtitle" style={{ marginBottom: 0 }}>
            Definidos en la configuración del servidor (no editables)
          </span>
        </div>
        <table className="table">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Módulos</th>
            </tr>
          </thead>
          <tbody>
            {config.staticRoles.map((role) => (
              <tr key={role}>
                <td>
                  <span className="badge">{role}</span>
                </td>
                <td>
                  <div className="badge-group">
                    {(config.defaultModuleAccess[role] ?? []).map((m) => {
                      const mod = config.modules.find((x) => x.key === m);
                      return (
                        <span key={m} className="badge badge-module">
                          {mod?.name ?? m}
                        </span>
                      );
                    })}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Dynamic roles */}
      <div className="card mt-4">
        <div className="card-header">
          <div>
            <h2>Roles dinámicos</h2>
            <span className="subtitle" style={{ marginBottom: 0 }}>
              Roles creados desde el panel de administración
            </span>
          </div>
          {!showForm && (
            <button className="btn-sm" onClick={openCreateForm}>
              + Crear rol
            </button>
          )}
        </div>

        {showForm && (
          <div className="role-form">
            <h3>{editingRole ? `Editar: ${editingRole}` : "Nuevo rol"}</h3>
            <div className="form-grid">
              <div className="form-group">
                <label htmlFor="role-name">Nombre</label>
                <input
                  id="role-name"
                  value={form.name}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, name: e.target.value }))
                  }
                  placeholder="ej: moderador"
                  disabled={saving}
                />
              </div>
              <div className="form-group">
                <label htmlFor="role-desc">Descripción</label>
                <input
                  id="role-desc"
                  value={form.description}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, description: e.target.value }))
                  }
                  placeholder="Descripción opcional"
                  disabled={saving}
                />
              </div>
            </div>

            <div className="form-section">
              <label>Acceso a módulos</label>
              <div className="checkbox-group">
                {config.modules.map((mod) => (
                  <label key={mod.key} className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={form.modules.includes(mod.key)}
                      onChange={() => toggleModule(mod.key)}
                      disabled={saving}
                    />
                    <span>{mod.name}</span>
                    <span className="text-muted">({mod.origin})</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="form-section">
              <label>Permisos</label>
              {permissionResources.map(([resource, actions]) => (
                <div key={resource} className="permission-block">
                  <span className="permission-resource">{resource}</span>
                  <div className="checkbox-group checkbox-group-inline">
                    {actions.map((action) => (
                      <label key={action} className="checkbox-label">
                        <input
                          type="checkbox"
                          checked={
                            form.permissions[resource]?.includes(action) ??
                            false
                          }
                          onChange={() => togglePermission(resource, action)}
                          disabled={saving}
                        />
                        <span>{action}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="form-actions">
              <button onClick={handleSave} disabled={saving || !form.name}>
                {saving
                  ? "Guardando..."
                  : editingRole
                    ? "Guardar cambios"
                    : "Crear rol"}
              </button>
              <button
                className="secondary"
                onClick={cancelForm}
                disabled={saving}
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

        {dynamicRoles.length === 0 && !showForm ? (
          <p className="text-muted" style={{ padding: "16px 0" }}>
            No hay roles dinámicos creados aún.
          </p>
        ) : (
          !showForm && (
            <table className="table">
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Descripción</th>
                  <th>Módulos</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {dynamicRoles.map((role) => (
                  <tr key={role.id}>
                    <td>
                      <span className="badge">{role.name}</span>
                    </td>
                    <td className="text-muted">
                      {role.description || "—"}
                    </td>
                    <td>
                      <div className="badge-group">
                        {(role.permissions.module ?? []).map((m) => {
                          const mod = config.modules.find((x) => x.key === m);
                          return (
                            <span key={m} className="badge badge-module">
                              {mod?.name ?? m}
                            </span>
                          );
                        })}
                        {(!role.permissions.module ||
                          role.permissions.module.length === 0) && (
                          <span className="text-muted">Ninguno</span>
                        )}
                      </div>
                    </td>
                    <td>
                      <div className="action-buttons">
                        <button
                          className="btn-sm"
                          onClick={() => openEditForm(role)}
                        >
                          Editar
                        </button>
                        <button
                          className="btn-sm danger"
                          onClick={() => handleDelete(role.name)}
                          disabled={deleting === role.name}
                        >
                          {deleting === role.name
                            ? "Eliminando..."
                            : "Eliminar"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        )}
      </div>
    </>
  );
}
