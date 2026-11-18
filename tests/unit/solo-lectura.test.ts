import { describe, expect, it, vi } from "vitest";

/** Fork de EVOIA — la cuenta de solo lectura ve, pero no cambia nada. */
const mocks = vi.hoisted(() => ({ session: vi.fn() }));
vi.mock("@/lib/auth/session", async (original) => ({
  ...(await original<typeof import("@/lib/auth/session")>()),
  requireSession: mocks.session,
}));

import { withAuth } from "@/lib/api";
import { isReadOnly } from "@/lib/auth/roles";

const handler = withAuth(async (_s, _req: Request) => Response.json({ ok: true }));
const req = (method: string) => new Request("https://crm.test/api/x", { method });

describe("cuenta de solo lectura", () => {
  it("solo «viewer» es de solo lectura", () => {
    expect(isReadOnly("viewer")).toBe(true);
    expect(isReadOnly("member")).toBe(false);
    expect(isReadOnly("owner")).toBe(false);
  });

  it("puede leer (GET) pero no escribir (POST, PUT, PATCH, DELETE)", async () => {
    mocks.session.mockResolvedValue({ userId: "u", organizationId: "o", role: "viewer" });
    expect((await handler(req("GET"))).status).toBe(200);
    for (const m of ["POST", "PUT", "PATCH", "DELETE"]) {
      const res = await handler(req(m));
      expect(res.status, m).toBe(403);
      expect((await res.json()).error.code).toBe("read_only");
    }
  });

  it("los demás roles escriben como siempre", async () => {
    for (const role of ["owner", "member"]) {
      mocks.session.mockResolvedValue({ userId: "u", organizationId: "o", role });
      expect((await handler(req("POST"))).status, role).toBe(200);
    }
  });
});
