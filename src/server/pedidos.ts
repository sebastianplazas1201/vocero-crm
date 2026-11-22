import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";
import { readMediaFile, saveMediaFile } from "@/server/whatsapp/media";
import { sendMediaMessage } from "@/server/inbox/send";
import { upsertFicha } from "@/server/bot/ficha";
import { notaDelSistema, pasarACliente } from "@/server/marcas-agente";
import { pesos, renderFactura } from "@/server/factura";

/**
 * Pedidos confirmados. Cada uno guarda su resumen en imagen y queda con el
 * contacto (se ve en la bandeja y en el pipeline). El monto del trato pasa a
 * ser la suma de sus pedidos.
 */

export const datosPedidoSchema = z.object({
  cliente: z.string().trim().min(1).max(80),
  lineas: z.string().trim().min(1).max(1500),
  fechaEntrega: z.string().trim().max(60).optional(),
  entrega: z.string().trim().max(240).optional(),
  total: z.coerce.number().int().min(0).max(100_000_000),
  abono: z.coerce.number().int().min(0).max(100_000_000),
});
export type DatosPedido = z.infer<typeof datosPedidoSchema>;

export type PedidoDto = {
  id: string;
  numero: string;
  cliente: string;
  lineas: string[];
  fechaEntrega: string | null;
  entrega: string | null;
  total: number;
  abono: number;
  enviado: boolean;
  createdAt: string;
  imagenUrl: string;
};

export class PedidoError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
  }
}

function aDto(p: typeof schema.pedido.$inferSelect): PedidoDto {
  return {
    id: p.id,
    numero: p.numero,
    cliente: p.cliente,
    lineas: p.lineas,
    fechaEntrega: p.fechaEntrega,
    entrega: p.entrega,
    total: p.total,
    abono: p.abono,
    enviado: p.enviadoAt !== null,
    createdAt: p.createdAt.toISOString(),
    imagenUrl: `/api/pedidos/${p.id}/imagen`,
  };
}

export async function listarPedidos(organizationId: string, contactId: string): Promise<PedidoDto[]> {
  const filas = await getDb()
    .select()
    .from(schema.pedido)
    .where(scoped(schema.pedido.organizationId, organizationId, eq(schema.pedido.contactId, contactId)))
    .orderBy(desc(schema.pedido.createdAt));
  return filas.map(aDto);
}

export async function imagenDePedido(organizationId: string, pedidoId: string): Promise<Buffer | null> {
  const [p] = await getDb()
    .select({ imagenId: schema.pedido.imagenId })
    .from(schema.pedido)
    .where(scoped(schema.pedido.organizationId, organizationId, eq(schema.pedido.id, pedidoId)))
    .limit(1);
  if (!p) return null;
  return readMediaFile(organizationId, p.imagenId).catch(() => null);
}

/** El monto del trato en el pipeline = suma de los pedidos del contacto. */
async function actualizarMonto(organizationId: string, contactId: string) {
  const db = getDb();
  const pedidos = await db
    .select({ total: schema.pedido.total })
    .from(schema.pedido)
    .where(scoped(schema.pedido.organizationId, organizationId, eq(schema.pedido.contactId, contactId)));
  const suma = pedidos.reduce((s, p) => s + p.total, 0);
  await db
    .update(schema.lead)
    .set({ amountCents: suma * 100, updatedAt: new Date() })
    .where(and(eq(schema.lead.organizationId, organizationId), eq(schema.lead.contactId, contactId)));
}

/**
 * Crea el pedido, guarda su imagen y, si se pide y hay conversación de
 * WhatsApp, se la envía al cliente con la confirmación.
 */
export async function crearPedido(input: {
  organizationId: string;
  contactId: string;
  conversationId?: string | null;
  datos: DatosPedido;
  enviar: boolean;
}): Promise<{ pedido: PedidoDto; envioError: string | null }> {
  const { organizationId, contactId, datos: d } = input;
  const db = getDb();

  const [contacto] = await db
    .select({ id: schema.contact.id })
    .from(schema.contact)
    .where(scoped(schema.contact.organizationId, organizationId, eq(schema.contact.id, contactId)))
    .limit(1);
  if (!contacto) throw new PedidoError(404, "not_found", "Contacto no encontrado");

  let conversationId = input.conversationId ?? null;
  if (!conversationId) {
    const [conv] = await db
      .select({ id: schema.conversation.id })
      .from(schema.conversation)
      .where(scoped(schema.conversation.organizationId, organizationId, eq(schema.conversation.contactId, contactId)))
      .orderBy(desc(schema.conversation.lastMessageAt))
      .limit(1);
    conversationId = conv?.id ?? null;
  }

  const [org] = await db
    .select({ name: schema.organization.name })
    .from(schema.organization)
    .where(eq(schema.organization.id, organizationId))
    .limit(1);

  const ahora = new Date();
  const numero = ahora.getTime().toString(36).slice(-6).toUpperCase();
  const lineas = d.lineas.split("\n").map((l) => l.trim()).filter(Boolean).slice(0, 14);
  const png = await renderFactura({
    negocio: process.env.NOMBRE_NEGOCIO_FACTURA?.trim() || org?.name || "Tu pedido",
    numero,
    emitida: ahora.toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric", timeZone: "America/Bogota" }),
    cliente: d.cliente,
    lineas,
    fechaEntrega: d.fechaEntrega,
    entrega: d.entrega,
    total: d.total,
    abono: d.abono,
  });

  const imagenId = newId("imagenPedido");
  await saveMediaFile(organizationId, imagenId, png, "image/png");
  const [fila] = await db
    .insert(schema.pedido)
    .values({
      id: newId("pedido"),
      organizationId,
      contactId,
      conversationId,
      numero,
      cliente: d.cliente,
      lineas,
      fechaEntrega: d.fechaEntrega || null,
      entrega: d.entrega || null,
      total: d.total,
      abono: d.abono,
      imagenId,
    })
    .returning();
  const pedido = fila!;
  const saldo = Math.max(0, d.total - d.abono);

  let envioError: string | null = null;
  if (input.enviar && conversationId) {
    const nombre = d.cliente.split(/\s+/)[0];
    const caption =
      `Listo, ${nombre}. Recibimos tu abono y tu pedido quedó confirmado.` +
      (d.fechaEntrega ? ` Te esperamos el ${d.fechaEntrega}.` : "") +
      (saldo > 0 ? ` El saldo de ${pesos(saldo)} lo pagas al recibir.` : "") +
      " Gracias por elegirnos.";
    try {
      await sendMediaMessage({
        conversationId,
        organizationId,
        file: { data: png, mimeType: "image/png", fileName: `pedido-${numero}.png` },
        caption,
      });
      await db.update(schema.pedido).set({ enviadoAt: new Date() }).where(eq(schema.pedido.id, pedido.id));
      pedido.enviadoAt = new Date();
    } catch (err) {
      envioError = err instanceof Error ? err.message : "No se pudo enviar por WhatsApp";
    }
  } else if (input.enviar) {
    envioError = "El contacto no tiene conversación de WhatsApp: el pedido quedó guardado sin enviar";
  }

  await actualizarMonto(organizationId, contactId);
  await upsertFicha({
    organizationId,
    contactId,
    ficha: { pedido_estado: "confirmado", pedido_numero: numero, pedido_total: d.total, pedido_abono: d.abono, pedido_saldo: saldo },
  });
  if (conversationId) {
    await pasarACliente(organizationId, conversationId, "dueno");
    await notaDelSistema(
      organizationId,
      conversationId,
      `✅ Pedido ${numero} confirmado · abono ${pesos(d.abono)} · saldo ${pesos(saldo)}${pedido.enviadoAt ? " · enviado al cliente" : ""}`
    );
  } else {
    await moverContactoACliente(organizationId, contactId);
  }
  return { pedido: aDto(pedido), envioError };
}

/** Sin conversación: mueve directo el lead del contacto a «Cliente». */
async function moverContactoACliente(organizationId: string, contactId: string) {
  const db = getDb();
  const [lead] = await db
    .select({ id: schema.lead.id })
    .from(schema.lead)
    .where(scoped(schema.lead.organizationId, organizationId, eq(schema.lead.contactId, contactId)))
    .limit(1);
  if (!lead) return;
  const etapas = await db
    .select({ id: schema.pipelineStage.id, name: schema.pipelineStage.name, kind: schema.pipelineStage.kind })
    .from(schema.pipelineStage)
    .where(scoped(schema.pipelineStage.organizationId, organizationId));
  const destino =
    etapas.find((e) => e.name.trim().toLowerCase() === "cliente") ?? etapas.find((e) => e.kind === "won");
  if (!destino) return;
  const { moveLeadToStage } = await import("@/server/leads/stage-history");
  await moveLeadToStage({ organizationId, leadId: lead.id, toStageId: destino.id, source: "dueno", extra: { lastActivityAt: new Date() } });
}

export async function borrarPedido(organizationId: string, pedidoId: string): Promise<void> {
  const db = getDb();
  const [p] = await db
    .select({ contactId: schema.pedido.contactId })
    .from(schema.pedido)
    .where(scoped(schema.pedido.organizationId, organizationId, eq(schema.pedido.id, pedidoId)))
    .limit(1);
  if (!p) throw new PedidoError(404, "not_found", "Pedido no encontrado");
  await db.delete(schema.pedido).where(eq(schema.pedido.id, pedidoId));
  await actualizarMonto(organizationId, p.contactId);
}
