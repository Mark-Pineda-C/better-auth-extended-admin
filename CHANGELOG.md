# Changelog

## 0.2.2 - 2026-04-07

### Fixed
- Fixed declaration emit compatibility for consumers exporting `auth` by exporting the `StoredModule` type in the public API.
- Fixed TypeScript `ts(4023)` (`Exported variable 'auth' has or is using name 'StoredModule' ... but cannot be named`) in external projects using this plugin.

### Compatibility
- Patch release only. No runtime or behavior changes.

## 0.2.1 - 2026-04-06

### Fixed
- Fixed dynamic role permission validation for `permissions.module` to compare module keys case-insensitively against database records.
- Fixed false `INVALID_PERMISSIONS` responses when module keys existed in `globalModule` with different casing.

### Changed
- Added regression tests for `createRole` and `updateRole` covering mixed-case module key scenarios.

### Compatibility
- Patch release only. No breaking API changes.

## 0.2.0 - 2026-04-06

### Added
- Added dynamic module storage in `globalModule`.
- Added explicit `dynamicModules.enabled` feature switch.
- Added module management endpoints:
  - `POST /extended-admin/create-module`
  - `POST /extended-admin/update-module`
  - `POST /extended-admin/delete-module`
  - `GET /extended-admin/list-modules`
  - `GET /extended-admin/get-module`
- Added strict permission validation for actions and module references in role payloads.
- Added module cache invalidation utilities and runtime module resolution from database.
- Added test coverage for module endpoints and dynamic MBLAC behavior.

### Changed
- MBLAC is now opt-in via `dynamicModules.enabled` for backward compatibility.
- Sign-in/sign-up/get-session module checks now resolve module membership from `globalModule`.
- `setRole`/role update flows now normalize role names and support dynamic-role existence checks.
- Example server now seeds module definitions in the database and reads module metadata consistently.

### Breaking changes
- No legacy-breaking default behavior: module checks are disabled unless `dynamicModules.enabled` is set to `true`.
- When enabled, module access is granted by role permission entries in `permissions.module` that match persisted module keys.
- When enabled, role payloads with `permissions.module` fail if they reference non-existent module keys.

### Migration notes
1. For legacy mode, no migration is required.
2. To adopt dynamic modules, enable `dynamicModules: { enabled: true }`.
3. Create and populate `globalModule` with your module keys and origins.
4. Move static module access mappings into role permissions (`permissions.module`).
5. Optionally set `moduleUnmatchedBehavior: "deny"` for stricter default security.

### Verification
- `bun run typecheck` passes.
- `bun test` passes (`105` passing tests, `0` failing).
