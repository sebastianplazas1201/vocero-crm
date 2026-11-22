import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import { apiError, parseBody, withAuth } from "@/lib/api";
import { SendError, sendMediaMessage } from "@/server/inbox/send";
import { upsertFicha } from "@/server/bot/ficha";
import { notaDelSistema, pasarACliente } from "@/server/marcas-agente";
import { pesos, renderFactura } from "@/server/factura";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  cliente: z.string().trim().min(1).max(80),
  lineas: z.string().trim().min(1).max(1200),
  fechaEntrega: z.string().trim().max(60).optional(),
  entrega: z.string().trim().max(120).optional(),
  total: z.coerce.number().int().min(0).max(100_000_000),
  abono: z.coerce.number().int().min(0).max(100_000_000),
});

/**
 * Una persona del equipo revisó el abono: se le confirma al cliente con el
 * resumen del pedido en imagen, el lead pasa a «Cliente» y la ficha lo anota.
 */
export const POST = withAuth(async (session, req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  const body = await parseBody(req, bodySchema);
  if (!body.ok) return body.response;
  const d = body.data;
  const db = getDb();

  const [conv] = await db
    .select({ contactId: schema.conversation.contactId })
    .from(schema.conversation)
    .where(scoped(schema.conversation.organizationId, session.organizationId, eq(schema.conversation.id, id)))
    .limit(1);
  if (!conv) return apiError(404, "not_found", "Conversación no encontrada");

  const [org] = await db
    .select({ name: schema.organization.name })
    .from(schema.organization)
    .where(eq(schema.organization.id, session.organizationId))
    .limit(1);

  const ahora = new Date();
  const numero = ahora.getTime().toString(36).slice(-6).toUpperCase();
  const lineas = d.lineas.split("\n").map((l) => l.trim()).filter(Boolean).slice(0, 12);
  const png = await renderFactura({
    negocio: org?.name ?? "Tu pedido",
    numero,
    emitida: ahora.toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric", timeZone: "America/Bogota" }),
    cliente: d.cliente,
    lineas,
    fechaEntrega: d.fechaEntrega,
    entrega: d.entrega,
    total: d.total,
    abono: d.abono,
  });

  const nombre = d.cliente.split(/\s+/)[0];
  const saldo = Math.max(0, d.total - d.abono);
  const caption =
    `¡Listo, ${nombre}! ✅ Recibimos tu abono y tu pedido quedó confirmado.` +
    (d.fechaEntrega ? ` Te esperamos el ${d.fechaEntrega}.` : "") +
    (saldo > 0 ? ` El saldo de ${pesos(saldo)} lo pagas al recibir.` : "") +
    " ¡Gracias por elegirnos! 😺";

  try {
    const sent = await sendMediaMessage({
      conversationId: id,
      organizationId: session.organizationId,
      file: { data: png, mimeType: "image/png", fileName: `pedido-${numero}.png` },
      caption,
    });
    const etapa = await pasarACliente(session.organizationId, id, "dueno");
    await upsertFicha({
      organizationId: session.organizationId,
      contactId: conv.contactId,
      ficha: {
        pedido_estado: "confirmado",
        pedido_numero: numero,
        pedido_total: d.total,
        pedido_abono: d.abono,
        pedido_saldo: saldo,
      },
    });
    await notaDelSistema(
      session.organizationId,
      id,
      `✅ Pedido ${numero} confirmado · abono ${pesos(d.abono)} · saldo ${pesos(saldo)}${etapa ? ` · etapa «${etapa}»` : ""}`
    );
    return Response.json({ ok: true, numero, messageId: sent.messageId });
  } catch (err) {
    if (err instanceof SendError) return apiError(409, err.code, err.message);
    throw err;
  }
});
