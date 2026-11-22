import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import { crearPedido, datosPedidoSchema, listarPedidos, PedidoError } from "@/server/pedidos";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export const GET = withAuth(async (session, _req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  return Response.json({ pedidos: await listarPedidos(session.organizationId, id) });
});

/** Pedido creado a mano (p. ej. una venta cerrada por otro canal). */
export const POST = withAuth(async (session, req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  const body = await parseBody(req, datosPedidoSchema.extend({ enviar: z.boolean().optional().default(false) }));
  if (!body.ok) return body.response;
  const { enviar, ...datos } = body.data;
  try {
    const r = await crearPedido({ organizationId: session.organizationId, contactId: id, datos, enviar });
    return Response.json({ pedido: r.pedido, envioError: r.envioError }, { status: 201 });
  } catch (err) {
    if (err instanceof PedidoError) return apiError(err.status, err.code, err.message);
    throw err;
  }
});
