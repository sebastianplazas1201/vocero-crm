import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import { apiError, parseBody, withAuth } from "@/lib/api";
import { crearPedido, datosPedidoSchema, PedidoError } from "@/server/pedidos";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

/**
 * Una persona revisó el abono: se guarda el pedido con su resumen en imagen,
 * se le envía al cliente con la confirmación y el lead pasa a «Cliente».
 */
export const POST = withAuth(async (session, req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  const body = await parseBody(req, datosPedidoSchema);
  if (!body.ok) return body.response;
  const [conv] = await getDb()
    .select({ contactId: schema.conversation.contactId })
    .from(schema.conversation)
    .where(scoped(schema.conversation.organizationId, session.organizationId, eq(schema.conversation.id, id)))
    .limit(1);
  if (!conv) return apiError(404, "not_found", "Conversación no encontrada");
  try {
    const r = await crearPedido({
      organizationId: session.organizationId,
      contactId: conv.contactId,
      conversationId: id,
      datos: body.data,
      enviar: true,
    });
    return Response.json({ ok: true, numero: r.pedido.numero, pedido: r.pedido, envioError: r.envioError });
  } catch (err) {
    if (err instanceof PedidoError) return apiError(err.status, err.code, err.message);
    throw err;
  }
});
