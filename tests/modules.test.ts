import { describe, expect, test } from "bun:test";
import { createTestInstance } from "./setup";
import { defaultAc } from "../src/access";

function createDynamicInstance() {
  return createTestInstance({
    ac: defaultAc,
    dynamicRoles: { enabled: true },
    dynamicModules: { enabled: true },
  });
}

async function setupDynamicAdmin() {
  const instance = createDynamicInstance();
  const admin = await instance.createAdminUser();
  return { ...instance, adminHeaders: admin.headers };
}

describe("module endpoints", () => {
  test("module endpoints return NOT_IMPLEMENTED when dynamicModules is disabled", async () => {
    const instance = createTestInstance({
      ac: defaultAc,
      dynamicRoles: { enabled: true },
    });
    const admin = await instance.createAdminUser();

    const createRes = await instance.client.extendedAdmin.createModule({
      key: "disabled-module",
      name: "Disabled Module",
      origins: ["http://disabled.example.com"],
      fetchOptions: { headers: Object.fromEntries(admin.headers.entries()) },
    });

    expect(createRes.error).not.toBeNull();
    expect(createRes.error?.status).toBe(501);
  });

  test("admin can create and list modules", async () => {
    const { client, adminHeaders } = await setupDynamicAdmin();

    const createRes = await client.extendedAdmin.createModule({
      key: "editorPanel",
      name: "Editor Panel",
      origins: ["http://editor.example.com"],
      fetchOptions: { headers: Object.fromEntries(adminHeaders.entries()) },
    });

    expect(createRes.error).toBeNull();
    expect(
      (createRes.data as { module: { key: string } })?.module?.key,
    ).toBe("editorpanel");

    const listRes = await client.extendedAdmin.listModules({
      fetchOptions: { headers: Object.fromEntries(adminHeaders.entries()) },
    });

    expect(listRes.error).toBeNull();
    const modules = listRes.data as Array<{ key: string }>;
    expect(modules.some((m) => m.key === "editorpanel")).toBe(true);
  });

  test("admin can update and get module", async () => {
    const { client, adminHeaders } = await setupDynamicAdmin();

    await client.extendedAdmin.createModule({
      key: "userPanel",
      name: "User Panel",
      origins: ["http://user.example.com"],
      fetchOptions: { headers: Object.fromEntries(adminHeaders.entries()) },
    });

    const updateRes = await client.extendedAdmin.updateModule({
      key: "userPanel",
      data: {
        name: "Customer Panel",
        origins: ["http://customer.example.com"],
        denyMessage: "Acceso restringido",
      },
      fetchOptions: { headers: Object.fromEntries(adminHeaders.entries()) },
    });

    expect(updateRes.error).toBeNull();
    expect(
      (updateRes.data as { module: { name: string } })?.module?.name,
    ).toBe("Customer Panel");

    const getRes = await client.extendedAdmin.getModule({
      query: { key: "userPanel" },
      fetchOptions: { headers: Object.fromEntries(adminHeaders.entries()) },
    });
    expect(getRes.error).toBeNull();
    expect((getRes.data as { origins: string[] })?.origins).toEqual([
      "http://customer.example.com",
    ]);
  });

  test("cannot delete module assigned to roles", async () => {
    const { client, adminHeaders } = await setupDynamicAdmin();

    await client.extendedAdmin.createModule({
      key: "adminPanel",
      name: "Admin Panel",
      origins: ["http://admin.example.com"],
      fetchOptions: { headers: Object.fromEntries(adminHeaders.entries()) },
    });

    await client.extendedAdmin.createRole({
      name: "module-admin",
      permissions: { module: ["adminPanel"] },
      fetchOptions: { headers: Object.fromEntries(adminHeaders.entries()) },
    });

    const deleteRes = await client.extendedAdmin.deleteModule({
      key: "adminPanel",
      fetchOptions: { headers: Object.fromEntries(adminHeaders.entries()) },
    });

    expect(deleteRes.error).not.toBeNull();
    expect(deleteRes.error?.status).toBe(400);
  });

  test("can delete module without roles assigned", async () => {
    const { client, adminHeaders } = await setupDynamicAdmin();

    await client.extendedAdmin.createModule({
      key: "userPanel",
      name: "User Panel",
      origins: ["http://user.example.com"],
      fetchOptions: { headers: Object.fromEntries(adminHeaders.entries()) },
    });

    const deleteRes = await client.extendedAdmin.deleteModule({
      key: "userPanel",
      fetchOptions: { headers: Object.fromEntries(adminHeaders.entries()) },
    });

    expect(deleteRes.error).toBeNull();
    expect((deleteRes.data as { success: boolean })?.success).toBe(true);
  });
});
