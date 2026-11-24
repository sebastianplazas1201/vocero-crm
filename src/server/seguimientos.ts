import { and, desc, eq, gt } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/lib/db";
import { chatJson } from "@/lib/ai";
import { sendText } from "@/server/inbox/send";
import { quitarEmojis } from "@/server/filtro-respuesta";

/**
 * Seguimientos de Ana cuando el cliente deja de responder.
 *
 * - 1.º a las 12 h y 2.º a las 23 h del último mensaje del cliente: los dos
 *   dentro de la ventana de 24 h de WhatsApp.
 * - Solo entre 6:00 a. m. y 9:00 p. m. (hora de Bogotá). Si la hora cae fuera,
 *   se usa la más cercana entre «antes de las 9:00 p. m.» y «6:00 a. m.» que
 *   quede dentro de la ventana; si ninguna cabe, la hora permitida más tardía
 *   posible dentro de la ventana.
 * - Los del cerebro (Nea) se bloquean en `/api/bot/messages`: los manda el CRM.
 *
 * Un seguimiento enviado = un mensaje de la IA escrito más de 30 min después
 * del último del cliente (las respuestas de un turno salen en segundos).
 */

const MIN = 60_000;
const H = 60 * MIN;
/** Bogotá no tiene horario de verano: UTC−5 fijo. */
const OFFSET_BOGOTA = -5 * H;
const DESDE = 6; // 6:00 a. m.
const HASTA = 21; // 9:00 p. m.
const MARGEN_TURNO = 30 * MIN;
const BARRIDO = 5 * MIN;

const horaBogota = (t: number) => new Date(t + OFFSET_BOGOTA).getUTCHours() + new Date(t + OFFSET_BOGOTA).getUTCMinutes() / 60;
const permitido = (t: number) => {
  const h = horaBogota(t);
  return h >= DESDE && h < HASTA;
};
/** Medianoche (hora Bogotá) del día de `t`, en epoch UTC. */
function inicioDelDia(t: number) {
  const d = new Date(t + OFFSET_BOGOTA);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - OFFSET_BOGOTA;
}

/** Lleva `objetivo` al horario permitido sin salirse de [min, max]. */
export function ajustarAHorario(objetivo: number, min: number, max: number): number | null {
  if (permitido(objetivo) && objetivo >= min && objetivo <= max) return objetivo;
  const dia = inicioDelDia(objetivo);
  const h = horaBogota(objetivo);
  // Adelante: el próximo 6:00 a. m.
  const adelante = h < DESDE ? dia + DESDE * H : dia + 24 * H + DESDE * H;
  // Atrás: justo antes de las 9:00 p. m. anterior.
  const atras = (h >= HASTA ? dia : dia - 24 * H) + HASTA * H - 5 * MIN;
  // La que quede más cerca de la hora ideal, si cabe.
  const validas = [adelante, atras].filter((t) => t >= min && t <= max);
  validas.sort((a, b) => Math.abs(a - objetivo) - Math.abs(b - objetivo));
  return validas[0] ?? null;
}

/** Cuándo toca el seguimiento `n` (1 o 2), o null si no cabe. */
export function horaDelSeguimiento(n: 1 | 2, ultimoCliente: number, primeroEnviado: number | null): number | null {
  if (n === 1)
    return (
      ajustarAHorario(ultimoCliente + 12 * H, ultimoCliente + 2 * H, ultimoCliente + 22 * H) ??
      ultimaHoraPermitida(ultimoCliente + H, ultimoCliente + 22 * H)
    );
  const max = ultimoCliente + 23 * H + 45 * MIN;
  const min = Math.max((primeroEnviado ?? ultimoCliente) + 2 * H, ultimoCliente + 13 * H);
  return (
    ajustarAHorario(ultimoCliente + 23 * H, min, max) ??
    // No cabe con el espaciado ideal: la hora permitida más tardía que quede
    // dentro de la ventana y después del primer seguimiento.
    ultimaHoraPermitida((primeroEnviado ?? ultimoCliente) + H, max)
  );
}

/** La hora más tardía en horario (6am–9pm) dentro de (desde, hasta], o null. */
export function ultimaHoraPermitida(desde: number, hasta: number): number | null {
  if (hasta <= desde) return null;
  if (permitido(hasta)) return hasta;
  const dia = inicioDelDia(hasta);
  const h = horaBogota(hasta);
  const t = (h >= HASTA ? dia : dia - 24 * H) + HASTA * H - 5 * MIN;
  return t > desde ? t : null;
}

const salida = z.object({ mensaje: z.string().min(1).max(600) });

function sistema(n: 1 | 2) {
  return `Eres Ana, del equipo de Gatos Restaurante (Bogotá). El cliente dejó de responder y le escribes un seguimiento por WhatsApp.
- 1 o 2 frases, cálida, cordial y natural, como una persona. Sin emojis. Sin "¡Hola! Soy Ana" (ya se conocen): usa su nombre si lo sabes.
- Retoma exactamente donde quedó la conversación: si faltaba elegir algo, pregúntalo; si faltaba el abono del 50%, recuérdalo (llave Bre-B @PLA283); si estaba pensándolo, pregunta con amabilidad cómo va.
- No repitas información que ya se dio ni inventes precios.
${n === 1 ? "- Es el primer seguimiento: suave, sin presión." : "- Es el último seguimiento: amable, menciona que las cenas se pueden agotar y que quedas atenta. No insistas más."}
Responde SOLO JSON: {"mensaje": "..."}`;
}

let corriendo = false;

async function barrer(): Promise<void> {
  if (corriendo) return;
  corriendo = true;
  try {
    const db = getDb();
    const ahora = Date.now();
    const candidatas = await db
      .select({
        id: schema.conversation.id,
        organizationId: schema.conversation.organizationId,
        contactId: schema.conversation.contactId,
        aiEnabled: schema.conversation.aiEnabled,
        handoffAt: schema.conversation.handoffAt,
        isTest: schema.conversation.isTest,
        alertaAt: schema.conversation.alertaAt,
        nombre: schema.contact.name,
      })
      .from(schema.conversation)
      .innerJoin(schema.contact, eq(schema.contact.id, schema.conversation.contactId))
      .where(gt(schema.conversation.lastMessageAt, new Date(ahora - 25 * H)));

    for (const c of candidatas) {
      if (!c.aiEnabled || c.handoffAt || c.isTest || c.alertaAt) continue;
      try {
        await quizaSeguir(c, ahora);
      } catch (err) {
        console.error(`[seguimiento] ${c.id}:`, err instanceof Error ? err.message : err);
      }
    }
  } finally {
    corriendo = false;
  }
}

async function quizaSeguir(
  c: { id: string; organizationId: string; contactId: string; nombre: string | null },
  ahora: number
) {
  const db = getDb();
  const [perfil] = await db
    .select({ enabled: schema.agentProfile.enabled })
    .from(schema.agentProfile)
    .where(eq(schema.agentProfile.organizationId, c.organizationId))
    .limit(1);
  if (!perfil?.enabled) return;

  // Lead ya ganado o perdido: no se le persigue.
  const [etapa] = await db
    .select({ kind: schema.pipelineStage.kind })
    .from(schema.lead)
    .innerJoin(schema.pipelineStage, eq(schema.pipelineStage.id, schema.lead.stageId))
    .where(and(eq(schema.lead.organizationId, c.organizationId), eq(schema.lead.contactId, c.contactId)))
    .limit(1);
  if (etapa && etapa.kind !== "open") return;

  const mensajes = await db
    .select({
      direction: schema.message.direction,
      aiGenerated: schema.message.aiGenerated,
      text: schema.message.text,
      type: schema.message.type,
      createdAt: schema.message.createdAt,
    })
    .from(schema.message)
    .where(and(eq(schema.message.organizationId, c.organizationId), eq(schema.message.conversationId, c.id)))
    .orderBy(desc(schema.message.createdAt))
    .limit(50);
  if (!mensajes.length || mensajes[0]!.direction === "in") return; // falta responderle, no seguirle
  const ultimoIn = mensajes.find((m) => m.direction === "in");
  if (!ultimoIn) return; // nunca escribió: eso es una campaña, no un seguimiento
  const tIn = ultimoIn.createdAt.getTime();
  if (ahora - tIn > 24 * H) return;

  const enviados = mensajes
    .filter((m) => m.direction === "out" && m.aiGenerated && m.createdAt.getTime() - tIn > MARGEN_TURNO)
    .map((m) => m.createdAt.getTime())
    .sort((a, b) => a - b);
  if (enviados.length >= 2) return;
  const n = (enviados.length + 1) as 1 | 2;
  const cuando = horaDelSeguimiento(n, tIn, enviados[0] ?? null);
  if (cuando === null || ahora < cuando) return;
  // Se pasó del margen (el servidor estuvo caído): mejor no escribir tarde.
  if (ahora - cuando > 2 * H || !permitido(ahora)) return;

  const transcript = mensajes
    .slice(0, 40)
    .reverse()
    .map((m) => `${m.direction === "in" ? "CLIENTE" : "GATOS"}: ${m.text ?? `[${m.type}]`}`)
    .join("\n");
  const r = await chatJson(
    salida,
    [
      { role: "system", content: sistema(n) },
      { role: "user", content: `Cliente: ${c.nombre ?? "(sin nombre)"}\n\nCONVERSACIÓN:\n${transcript}` },
    ],
    { organizationId: c.organizationId, timeoutMs: 45_000 }
  );
  if (!r.ok) {
    console.error(`[seguimiento] ${c.id}: la IA no respondió (${r.error})`);
    return;
  }
  const texto = quitarEmojis(r.data.mensaje);
  if (!texto) return;
  await sendText({ conversationId: c.id, organizationId: c.organizationId, text: texto, aiGenerated: true });
  console.info(`[seguimiento] ${n}.º enviado en ${c.id}`);
}

let timer: ReturnType<typeof setInterval> | null = null;

export function iniciarSeguimientos(): void {
  if (timer) return;
  timer = setInterval(() => void barrer().catch((e) => console.error("[seguimiento]", e)), BARRIDO);
  timer.unref?.();
  console.log("[boot] seguimientos activos: 12 h y 23 h, de 6:00 a. m. a 9:00 p. m.");
}
