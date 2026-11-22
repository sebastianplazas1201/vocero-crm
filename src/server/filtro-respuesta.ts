import { and, desc, eq, gt } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";

/**
 * Limpieza de lo que escribe la IA antes de que salga al cliente.
 *
 * - Sin emojis (regla del negocio).
 * - Un «¿En qué te puedo ayudar?» suelto en mitad de una conversación es
 *   relleno: pasa cuando al cerebro le llega un mensaje que ya contestó (el
 *   cliente escribió en dos trozos) y no tiene nada nuevo que decir.
 */

const EMOJI = /(?:\p{Extended_Pictographic}|\p{Emoji_Modifier}|\p{Regional_Indicator}|‍|️|⃣)/gu;

export function quitarEmojis(texto: string): string {
  return texto
    .replace(EMOJI, "")
    .replace(/[ \t]+([.,!?;:])/g, "$1")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

const RELLENO =
  /^(?:¡?\s*(?:hola|buen[oa]s?(?:\s+(?:d[ií]as?|tardes?|noches?))?)\b[^.!?¿]*[.!?]?\s*)?(?:soy ana[^.!?¿]*[.!?]?\s*)?¿?\s*(?:en\s+qu[eé]|c[oó]mo)\s+(?:(?:te|le|les)\s+)?(?:puedo|podemos)\s+(?:ayudar|colaborar|servir)[^?]*\?*\s*$/i;

/** ¿El mensaje entero es solo un saludo / ofrecimiento de ayuda? */
export function esRellenoGenerico(texto: string): boolean {
  const t = texto.trim();
  return t.length > 0 && t.length <= 140 && RELLENO.test(t);
}

/** 12 h: la misma frontera que usa el despacho para «la conversación empieza». */
const EN_CURSO_MS = 12 * 60 * 60 * 1000;

/** La IA ya le escribió hace poco: no es momento de volver a saludar. */
export async function conversacionEnCurso(organizationId: string, conversationId: string): Promise<boolean> {
  const [ultima] = await getDb()
    .select({ id: schema.message.id })
    .from(schema.message)
    .where(
      and(
        eq(schema.message.organizationId, organizationId),
        eq(schema.message.conversationId, conversationId),
        eq(schema.message.direction, "out"),
        gt(schema.message.createdAt, new Date(Date.now() - EN_CURSO_MS))
      )
    )
    .orderBy(desc(schema.message.createdAt))
    .limit(1);
  return Boolean(ultima);
}
