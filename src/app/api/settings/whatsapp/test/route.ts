import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import { testConnection } from "@/server/whatsapp/connect";
import { getCredentialsByOrg } from "@/server/whatsapp/credentials";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  phoneNumberId: z.string().trim().min(1),
  token: z.string().trim().optional(),
});

/** Prueba de conexión: valida token↔número, NO guarda (FR-040). */
export const POST = withAuth(async (session, req: Request) => {
  const body = await parseBody(req, bodySchema);
  if (!body.ok) return body.response;

  // Sin token pegado: se prueba con el que ya está guardado (cambiar de número sin re-pegarlo).
  const token = body.data.token || (await getCredentialsByOrg(session.organizationId))?.token;
  if (!token) return apiError(422, "invalid_body", "Pega el token de acceso");
  const check = await testConnection(body.data.phoneNumberId, token);
  if (!check.ok) {
    const status = check.code === "meta_unavailable" ? 503 : 422;
    return apiError(status, check.code, check.message);
  }
  return Response.json({
    ok: true,
    displayPhoneNumber: check.displayPhoneNumber,
    verifiedName: check.verifiedName,
  });
});
