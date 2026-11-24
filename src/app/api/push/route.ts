import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { vapidPublica } from "@/server/push";

export const dynamic = "force-dynamic";

/** La llave pública VAPID para que el navegador se suscriba. */
export const GET = withAuth(async () => Response.json({ publicKey: vapidPublica() }));

const subSchema = z.object({
  endpoint: z.string().url().max(2000),
  keys: z.object({ p256dh: z.string().min(1).max(500), auth: z.string().min(1).max(500) }),
});

export const POST = withAuth(async (session, req: Request) => {
  if (!vapidPublica()) return apiError(409, "push_off", "Las notificaciones push no están configuradas");
  const body = await parseBody(req, subSchema);
  if (!body.ok) return body.response;
  const { endpoint, keys } = body.data;
  await getDb()
    .insert(schema.suscripcionPush)
    .values({
      id: newId("suscripcionPush"),
      organizationId: session.organizationId,
      userId: session.userId,
      endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
    })
    .onConflictDoUpdate({
      target: schema.suscripcionPush.endpoint,
      set: { organizationId: session.organizationId, userId: session.userId, p256dh: keys.p256dh, auth: keys.auth },
    });
  return Response.json({ ok: true });
});

const delSchema = z.object({ endpoint: z.string().min(1).max(2000) });

export const DELETE = withAuth(async (session, req: Request) => {
  const body = await parseBody(req, delSchema);
  if (!body.ok) return body.response;
  await getDb()
    .delete(schema.suscripcionPush)
    .where(
      and(
        eq(schema.suscripcionPush.organizationId, session.organizationId),
        eq(schema.suscripcionPush.endpoint, body.data.endpoint)
      )
    );
  return Response.json({ ok: true });
});
