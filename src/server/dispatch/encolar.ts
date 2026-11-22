import { and, desc, eq } from "drizzle-orm";
import { notaDelSistema } from "@/server/marcas-agente";
import { getDb, schema } from "@/lib/db";
import { encolarDespacho } from "@/server/dispatch/outbox";
import { iniciarWorker, programarTanda } from "@/server/dispatch/worker";

/**
 * 021 — El enganche de la ingesta: un mensaje entrante real ya está en la
 * bandeja y hay un cerebro configurado, así que su turno se ENCOLA.
 *
 * 036 — Desde que el CRM no trae agente, este es el único camino por el que
 * alguien contesta, y el interruptor de la pantalla Agente
 * (`agent_profile.enabled`) decide si se toma: apagado, la conversación
 * queda en la bandeja para una persona.
 *
 * Nunca lanza. Corre al final de la ingesta, dentro del `after()` del webhook:
 * una excepción aquí no puede costarle a ese payload los mensajes que vengan
 * detrás. Lo que no se encoló sigue en la bandeja.
 */
export async function despacharAlCerebro(
  conversationId: string,
  organizationId: string,
  messageId: string
): Promise<void> {
  try {
    const [conv] = await getDb()
      .select({
        aiEnabled: schema.conversation.aiEnabled,
        handoffAt: schema.conversation.handoffAt,
        isTest: schema.conversation.isTest,
      })
      .from(schema.conversation)
      .where(
        and(
          eq(schema.conversation.id, conversationId),
          eq(schema.conversation.organizationId, organizationId)
        )
      )
      .limit(1);
    if (!conv) return;

    // Pausada por una persona o traspasada por el agente: no se despacha. Es
    // la misma bandera que respeta `/api/bot/messages`, y aquí la respeta
    // cualquier cerebro sin tener que acordarse. El Laboratorio no pasa por la
    // ingesta, pero una conversación de prueba no sale del CRM por ningún
    // camino.
    if (!conv.aiEnabled || conv.handoffAt || conv.isTest) return;

    const [perfil] = await getDb()
      .select({ enabled: schema.agentProfile.enabled })
      .from(schema.agentProfile)
      .where(eq(schema.agentProfile.organizationId, organizationId))
      .limit(1);
    if (!perfil?.enabled) return;

    // Notas de voz: el cerebro no las entiende (daba «error del proveedor de
    // IA»). Se avisa al equipo para que la escuche y la IA sigue con el
    // siguiente mensaje escrito.
    const [msg] = await getDb()
      .select({ type: schema.message.type })
      .from(schema.message)
      .where(eq(schema.message.id, messageId))
      .limit(1);
    if (msg?.type === "audio") {
      await notaDelSistema(
        organizationId,
        conversationId,
        "🎙️ El cliente envió una nota de voz: escúchala y respóndele. Ana sigue con el próximo mensaje escrito."
      );
      return;
    }

    // 025 — El despacho anota qué entrante lo provoca: es lo que le debe al
    // cerebro, aunque después la conversación tenga una respuesta.
    const { notBefore } = await encolarDespacho({
      organizationId,
      conversationId,
      messageIds: [messageId],
      ventanaMs: await ventanaDeEsta(conversationId),
    });
    iniciarWorker();
    // Que despierte justo cuando la ventana venza, no en su siguiente barrido.
    programarTanda(notBefore);
  } catch (err) {
    console.error("[despacho] no se pudo encolar el turno:", err);
  }
}

/** 12 h sin que le hayamos escrito = la conversación (re)empieza. */
const INICIO_MS = 12 * 60 * 60 * 1000;

/**
 * Al abrir una conversación se contesta rápido (`AGENT_COALESCE_FIRST_MS`);
 * después, con la ventana normal, que también agrupa los mensajes a trozos.
 */
async function ventanaDeEsta(conversationId: string): Promise<number | undefined> {
  const crudo = process.env.AGENT_COALESCE_FIRST_MS?.trim();
  const primera = crudo ? Number(crudo) : NaN;
  if (!Number.isFinite(primera) || primera < 0) return undefined;
  const [ultima] = await getDb()
    .select({ createdAt: schema.message.createdAt })
    .from(schema.message)
    .where(and(eq(schema.message.conversationId, conversationId), eq(schema.message.direction, "out")))
    .orderBy(desc(schema.message.createdAt))
    .limit(1);
  const inicio = !ultima || Date.now() - ultima.createdAt.getTime() > INICIO_MS;
  return inicio ? primera : undefined;
}
