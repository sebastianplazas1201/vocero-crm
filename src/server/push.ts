import { eq, inArray } from "drizzle-orm";
import * as webpushNs from "web-push";

// En el bundle de Next el módulo CJS llega sin `default`: se toma el que exista.
const webpush = ((webpushNs as unknown as { default?: typeof webpushNs }).default ?? webpushNs) as typeof webpushNs;
import { getDb, schema } from "@/lib/db";

/**
 * Notificaciones push (Web Push / VAPID): llegan al iPhone (app agregada a la
 * pantalla de inicio, iOS 16.4+) y a Chrome/Android aunque el CRM esté cerrado.
 * Sin VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY no se envía nada.
 */

export function vapidPublica(): string | null {
  return process.env.VAPID_PUBLIC_KEY || null;
}

let configurado = false;
function configurar(): boolean {
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return false;
  if (!configurado) {
    webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:avisos@example.com", pub, priv);
    configurado = true;
  }
  return true;
}

export function textoDelAviso(nombre: string | null, texto: string | null, tipo: string): { titulo: string; cuerpo: string } {
  const titulo = nombre?.trim() || "Nuevo mensaje";
  const etiquetas: Record<string, string> = {
    image: "Foto",
    audio: "Audio",
    video: "Video",
    document: "Documento",
    sticker: "Sticker",
    location: "Ubicación",
  };
  const base = texto?.trim() || etiquetas[tipo] || "Mensaje nuevo";
  const cuerpo = base.length > 140 ? `${base.slice(0, 139)}…` : base;
  return { titulo, cuerpo };
}

/** Avisa a todos los dispositivos de la organización. Nunca lanza. */
export async function notificarMensajeNuevo(a: {
  organizationId: string;
  conversationId: string;
  nombre: string | null;
  texto: string | null;
  tipo: string;
}): Promise<void> {
  try {
    if (!configurar()) return;
    const db = getDb();
    const subs = await db
      .select()
      .from(schema.suscripcionPush)
      .where(eq(schema.suscripcionPush.organizationId, a.organizationId));
    if (!subs.length) return;
    const { titulo, cuerpo } = textoDelAviso(a.nombre, a.texto, a.tipo);
    const payload = JSON.stringify({
      titulo,
      cuerpo,
      tag: a.conversationId,
      url: `/inbox?conversation=${encodeURIComponent(a.conversationId)}`,
    });
    const muertas: string[] = [];
    await Promise.all(
      subs.map(async (s) => {
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            payload,
            { TTL: 60 * 60 * 12, urgency: "high" }
          );
        } catch (err) {
          const code = (err as { statusCode?: number }).statusCode;
          if (code === 404 || code === 410) muertas.push(s.id);
          else console.warn("[push] no salió:", code ?? (err instanceof Error ? err.message : err));
        }
      })
    );
    if (muertas.length) await db.delete(schema.suscripcionPush).where(inArray(schema.suscripcionPush.id, muertas));
  } catch (err) {
    console.warn("[push]", err instanceof Error ? err.message : err);
  }
}
