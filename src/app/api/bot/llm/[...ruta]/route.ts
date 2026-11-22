import { apiError } from "@/lib/api";
import { requireBotKey, resolveInstanceOrg } from "@/server/bot/auth";
import { pensarPorElCerebro } from "@/server/bot/llm-proxy";

export const dynamic = "force-dynamic";
// Un modelo puede tardar en contestar: el default cortaría un turno sano.
export const maxDuration = 300;

/**
 * 036 — `POST /api/bot/llm/{ruta}`: el CRM piensa por el cerebro con la llave
 * de Ajustes → IA. Compatible con OpenAI: el SDK añade `chat/completions` a
 * su `base_url` (`{CRM}/api/bot/llm`), y por eso la ruta es comodín.
 *
 * Autentica como el resto de `/api/bot/*`, con `BOT_API_KEY`, que aquí llega
 * también como `Authorization: Bearer` (lo que manda el SDK). La respuesta del
 * proveedor pasa tal cual, con su código: el cliente del cerebro ya sabe leer
 * los errores de un proveedor compatible con OpenAI. Ver
 * `src/server/bot/llm-proxy.ts`.
 */
export async function POST(req: Request, { params }: { params: Promise<{ ruta: string[] }> }) {
  const denied = requireBotKey(req);
  if (denied) return denied;

  const organizationId = await resolveInstanceOrg();
  if (!organizationId) {
    return apiError(409, "no_org", "La instancia aún no tiene organización");
  }

  const { ruta } = await params;
  const r = await pensarPorElCerebro({
    organizationId,
    ruta: ruta.map(encodeURIComponent).join("/"),
    cuerpoCrudo: topeDeTokens(await req.text()),
    contentType: req.headers.get("content-type"),
  });
  if (!r.ok) return apiError(r.status, r.code, r.message);
  return new Response(r.cuerpo, { status: r.status, headers: { "Content-Type": r.contentType } });
}

/**
 * Sin `max_tokens`, OpenRouter reserva el máximo del modelo (131 072) y con
 * poco saldo rechaza el turno con 402 aunque la respuesta real sea de 200
 * tokens. Una respuesta de Ana nunca pasa de unos cientos: se topa.
 */
const TOPE = Number(process.env.LLM_MAX_TOKENS) > 0 ? Number(process.env.LLM_MAX_TOKENS) : 4000;
function topeDeTokens(crudo: string): string {
  try {
    const cuerpo = JSON.parse(crudo) as Record<string, unknown>;
    if (!cuerpo || typeof cuerpo !== "object" || Array.isArray(cuerpo)) return crudo;
    for (const k of ["max_tokens", "max_completion_tokens"]) {
      const v = cuerpo[k];
      if (typeof v === "number" && v > TOPE) cuerpo[k] = TOPE;
    }
    if (typeof cuerpo.max_tokens !== "number" && typeof cuerpo.max_completion_tokens !== "number") cuerpo.max_tokens = TOPE;
    return JSON.stringify(cuerpo);
  } catch {
    return crudo;
  }
}
