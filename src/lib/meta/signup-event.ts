import { z } from "zod";

/**
 * 066 — El evento de sesión del Embedded Signup (`window.postMessage` desde
 * facebook.com) y las opciones de `FB.login`. Lo lee el navegador; vive en
 * `lib/` porque lo importan la tarjeta y las pruebas.
 *
 * Puerto de la spec 104 del fork de un cliente. Con la coexistencia (el
 * número sigue en la app WhatsApp Business del teléfono) Meta cierra con
 * `FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING`.
 */

const ORIGENES = new Set([
  "https://www.facebook.com",
  "https://web.facebook.com",
  "https://business.facebook.com",
]);

const id = z.string().regex(/^\d{1,32}$/);

const eventoSchema = z.object({
  type: z.literal("WA_EMBEDDED_SIGNUP"),
  event: z.string(),
  data: z
    .looseObject({
      waba_id: id.optional(),
      phone_number_id: id.optional(),
      error_message: z.string().optional(),
    })
    .optional(),
});

export type EventoDeAlta =
  | { kind: "cancel" }
  | { kind: "error"; message: string | null }
  | { kind: "coexistence"; wabaId: string; phoneNumberId: string | null }
  | { kind: "finish"; wabaId: string; phoneNumberId: string | null };

export function leerEventoDeAlta(origin: string, raw: unknown): EventoDeAlta | null {
  if (!ORIGENES.has(origin)) return null;
  let valor: unknown = raw;
  if (typeof raw === "string") {
    try {
      valor = JSON.parse(raw);
    } catch {
      return null; // los iframes de Facebook mandan otros mensajes
    }
  }
  const parsed = eventoSchema.safeParse(valor);
  if (!parsed.success) return null;
  const { event, data } = parsed.data;
  if (event === "CANCEL") return { kind: "cancel" };
  if (event === "ERROR") return { kind: "error", message: data?.error_message ?? null };
  if (event === "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING") {
    if (!data?.waba_id) return { kind: "error", message: "Meta no devolvió la cuenta de WhatsApp." };
    return { kind: "coexistence", wabaId: data.waba_id, phoneNumberId: data.phone_number_id ?? null };
  }
  if ((event === "FINISH" || event === "FINISH_ONLY_WABA") && data?.waba_id) {
    return { kind: "finish", wabaId: data.waba_id, phoneNumberId: data.phone_number_id ?? null };
  }
  return null;
}

/**
 * Las opciones de `FB.login`: `config_id` en lugar de `scope`, el `code`
 * para canjearlo en el servidor y los `extras` de v4 (los que lanza la app
 * de referencia oficial de Meta).
 */
export type ModoDeAlta = "nuevo" | "app";

/**
 * `modo: "app"` pide la coexistencia: el número sigue en la app WhatsApp
 * Business del teléfono y además entra a la Cloud API
 * (`featureType: whatsapp_business_app_onboarding`).
 */
export function opcionesDeLogin(configId: string, modo: ModoDeAlta = "nuevo") {
  return {
    config_id: configId,
    response_type: "code",
    override_default_response_type: true,
    extras: {
      setup: {},
      ...(modo === "app" ? { featureType: "whatsapp_business_app_onboarding" } : {}),
      sessionInfoVersion: "3",
      version: "v4",
    },
  };
}

/**
 * Las de `FB.init`. `fedCM: false` es obligatorio: con FedCM (encendido por
 * configuración remota del SDK) `FB.login` solo manda `scope` y descarta
 * `config_id`, `response_type` y `extras`, y el `code` nunca llega.
 */
export function opcionesDeInit(appId: string, version: string) {
  return { appId, version, xfbml: false, cookie: false, fedCM: false };
}
