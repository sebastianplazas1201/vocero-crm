import { apiError, withAuth } from "@/lib/api";
import { borrarPedido, PedidoError } from "@/server/pedidos";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export const DELETE = withAuth(async (session, _req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  try {
    await borrarPedido(session.organizationId, id);
    return Response.json({ ok: true });
  } catch (err) {
    if (err instanceof PedidoError) return apiError(err.status, err.code, err.message);
    throw err;
  }
});
