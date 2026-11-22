import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import { apiError, withAuth } from "@/lib/api";
import { chatJson } from "@/lib/ai";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const borrador = z.object({
  cliente: z.string().nullable().optional(),
  lineas: z.array(z.string()).nullable().optional(),
  fechaEntrega: z.string().nullable().optional(),
  entrega: z.string().nullable().optional(),
  total: z.coerce.number().nullable().optional(),
  abono: z.coerce.number().nullable().optional(),
});

const SISTEMA = `Lees una conversación de WhatsApp entre un restaurante y un cliente y sacas el pedido que acordaron, para su confirmación. Respondes SOLO un objeto JSON:
{"cliente": string|null, "lineas": string[], "fechaEntrega": string|null, "entrega": string|null, "total": number|null, "abono": number|null}
Reglas:
- cliente: nombre completo que dio el cliente (o el nombre del contacto si no dio otro).
- lineas: una por renglón, en español claro y SIN códigos (nada de P1, A3). Primera línea "Cena navideña para N personas" si es una cena. Luego la proteína, cada acompañamiento en su propia línea, la salsa, adiciones con su cantidad, y al final "Natilla y buñuelo por persona" si es una cena navideña.
- fechaEntrega: como "24 de diciembre".
- entrega: "Recoge en el restaurante" o la dirección completa (dirección, barrio, conjunto, torre y apartamento o descripción de la casa).
- total y abono: números enteros en pesos, sin puntos. El abono es lo que el cliente pagó o debe pagar para separar (normalmente el 50%).
- Si algo no se dijo, usa null. No inventes.`;

/** Borrador del pedido sacado de la conversación, para no tener que escribirlo. */
export const GET = withAuth(async (session, _req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  const db = getDb();
  const [conv] = await db
    .select({ contactName: schema.contact.name })
    .from(schema.conversation)
    .innerJoin(schema.contact, eq(schema.contact.id, schema.conversation.contactId))
    .where(scoped(schema.conversation.organizationId, session.organizationId, eq(schema.conversation.id, id)))
    .limit(1);
  if (!conv) return apiError(404, "not_found", "Conversación no encontrada");

  const filas = await db
    .select({ direction: schema.message.direction, text: schema.message.text, type: schema.message.type })
    .from(schema.message)
    .where(scoped(schema.message.organizationId, session.organizationId, eq(schema.message.conversationId, id)))
    .orderBy(desc(schema.message.createdAt))
    .limit(80);
  const transcript = filas
    .reverse()
    .map((m) => `${m.direction === "in" ? "CLIENTE" : "RESTAURANTE"}: ${m.text ?? `[${m.type}]`}`)
    .join("\n");

  const r = await chatJson(
    borrador,
    [
      { role: "system", content: SISTEMA },
      { role: "user", content: `Contacto: ${conv.contactName ?? "(sin nombre)"}\n\nCONVERSACIÓN:\n${transcript}` },
    ],
    { organizationId: session.organizationId, timeoutMs: 45_000 }
  );
  if (!r.ok) return apiError(502, "ai_error", "No se pudo leer el pedido del chat; llénalo a mano");
  return Response.json({ borrador: r.data });
});
