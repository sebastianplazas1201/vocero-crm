import { apiError, withAuth } from "@/lib/api";
import { imagenDePedido } from "@/server/pedidos";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export const GET = withAuth(async (session, _req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  const png = await imagenDePedido(session.organizationId, id);
  if (!png) return apiError(404, "not_found", "Pedido no encontrado");
  return new Response(new Uint8Array(png), {
    headers: { "content-type": "image/png", "cache-control": "private, max-age=86400" },
  });
});
