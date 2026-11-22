import { readFile } from "node:fs/promises";
import path from "node:path";
import { asc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";
import { publish } from "@/server/events/bus";
import { moveLeadToStage } from "@/server/leads/stage-history";
import {
  sendInteractiveList,
  sendMediaMessage,
  type ListaInteractiva,
} from "@/server/inbox/send";

/**
 * Marcas que el cerebro escribe dentro de su texto para pedir algo que su API
 * de solo texto no tiene. El CRM las quita antes de enviar y las ejecuta:
 *
 *   [[ENVIAR: menu-cenas]]   manda el archivo `public/recursos/menu-cenas.*`
 *   [[LISTA: Título | A; B]] manda una lista interactiva (máx. 10 opciones;
 *                            [[LISTA: proteinas]] = una guardada en listas.json;
 *                            «Opción - descripción» para dar detalle)
 *   [[ALERTA: motivo]]       deja una nota de alerta al equipo SIN pausar la IA
 *   [[PAGO]]                 el cliente envió el abono: pasa a la etapa «Cliente»
 *
 * Así el agente sigue la conversación y el CRM hace lo demás.
 */

export type Marcas = {
  texto: string;
  recursos: string[];
  /** Una lista escrita por el cerebro o el nombre de una guardada en `public/recursos/listas.json`. */
  listas: (ListaInteractiva | { nombre: string })[];
  alertas: string[];
  pago: boolean;
};

const MARCA = /\[\[\s*([A-Za-zÁÉÍÓÚáéíóú]+)\s*(?::\s*([\s\S]*?))?\s*\]\]/g;

function quitarTildes(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function parsearLista(arg: string): ListaInteractiva | { nombre: string } | null {
  if (!arg.includes("|")) return { nombre: arg.trim() };
  const [cabeza, resto] = arg.includes("|") ? arg.split(/\|(.*)/s) : ["Elige una opción", arg];
  const filas = (resto ?? "")
    .split(/[;\n]/)
    .map((o) => o.trim().replace(/^[-•*]\s*/, ""))
    .filter(Boolean)
    .slice(0, 10)
    .map((o) => {
      const [titulo, ...desc] = o.split(/\s+[-—–]\s+/);
      const descripcion = desc.join(" - ").trim();
      return { titulo: titulo!.trim(), ...(descripcion ? { descripcion } : {}) };
    });
  if (filas.length === 0) return null;
  return { cuerpo: (cabeza ?? "").trim() || "Elige una opción", boton: "Ver opciones", filas };
}

export function parsearMarcas(entrada: string): Marcas {
  const out: Marcas = { texto: entrada, recursos: [], listas: [], alertas: [], pago: false };
  out.texto = entrada
    .replace(MARCA, (_m, nombre: string, arg?: string) => {
      const clave = quitarTildes(nombre).toUpperCase();
      const valor = (arg ?? "").trim();
      if (clave === "ENVIAR" && valor) out.recursos.push(valor);
      else if (clave === "LISTA" && valor) {
        const l = parsearLista(valor);
        if (l) out.listas.push(l);
      } else if (clave === "ALERTA") out.alertas.push(valor || "Ana pide que alguien revise esta conversación");
      else if (clave === "PAGO") out.pago = true;
      else return _m; // marca desconocida: se deja tal cual
      return "";
    })
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return out;
}

export function tieneMarcas(texto: string): boolean {
  MARCA.lastIndex = 0;
  const hay = MARCA.test(texto);
  MARCA.lastIndex = 0;
  return hay;
}

const MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".pdf": "application/pdf",
};

async function leerRecurso(nombre: string) {
  const limpio = quitarTildes(nombre).toLowerCase().replace(/[^a-z0-9-]/g, "-");
  const dir = path.join(process.cwd(), "public", "recursos");
  for (const ext of Object.keys(MIME)) {
    try {
      const data = await readFile(path.join(dir, limpio + ext));
      return { data, mimeType: MIME[ext]!, fileName: limpio + ext };
    } catch {
      /* siguiente extensión */
    }
  }
  return null;
}

type ListaGuardada = Partial<ListaInteractiva> & { copia?: string };

/** Listas fijas del negocio (`public/recursos/listas.json`), por nombre sin tildes. */
async function listaGuardada(nombre: string): Promise<ListaInteractiva | null> {
  try {
    const todas = JSON.parse(
      await readFile(path.join(process.cwd(), "public", "recursos", "listas.json"), "utf8")
    ) as Record<string, ListaGuardada>;
    const clave = quitarTildes(nombre).toLowerCase().trim().replace(/\s+/g, "-");
    const l = todas[clave];
    if (!l) return null;
    const filas = l.filas ?? (l.copia ? todas[l.copia]?.filas : undefined);
    if (!filas?.length) return null;
    return { cuerpo: l.cuerpo ?? "Elige una opción", boton: l.boton ?? "Ver opciones", filas };
  } catch {
    return null;
  }
}

/** Nota interna sin autor: así se ve como aviso del sistema en el hilo. */
export async function notaDelSistema(
  organizationId: string,
  conversationId: string,
  texto: string
): Promise<void> {
  const [fila] = await getDb()
    .insert(schema.conversationNote)
    .values({
      id: newId("conversationNote"),
      organizationId,
      conversationId,
      authorUserId: null,
      texto: texto.slice(0, 2000),
    })
    .returning();
  if (!fila) return;
  publish(organizationId, {
    type: "note.new",
    data: {
      conversationId,
      note: {
        id: fila.id,
        conversationId,
        texto: fila.texto,
        createdAt: fila.createdAt.toISOString(),
        autor: null,
        puedeBorrar: true,
      },
    },
  });
}

/**
 * Marca la conversación para que el equipo la vea en la bandeja («Atención
 * humana») sin pausar a la IA. Se limpia cuando alguien del equipo responde.
 */
export async function marcarAlerta(organizationId: string, conversationId: string, motivo: string): Promise<void> {
  const ahora = new Date();
  await getDb()
    .update(schema.conversation)
    .set({ alertaAt: ahora, alertaMotivo: motivo.slice(0, 300), updatedAt: ahora })
    .where(scoped(schema.conversation.organizationId, organizationId, eq(schema.conversation.id, conversationId)));
  publish(organizationId, {
    type: "conversation.updated",
    data: { conversation: { id: conversationId, alertaAt: ahora.toISOString(), alertaMotivo: motivo } },
  });
}

/** Lleva el lead de la conversación a la etapa «Cliente» (o la primera ganada). */
export async function pasarACliente(
  organizationId: string,
  conversationId: string,
  source: "bot" | "dueno" = "bot"
): Promise<string | null> {
  const db = getDb();
  const [conv] = await db
    .select({ contactId: schema.conversation.contactId })
    .from(schema.conversation)
    .where(scoped(schema.conversation.organizationId, organizationId, eq(schema.conversation.id, conversationId)))
    .limit(1);
  if (!conv) return null;
  const [lead] = await db
    .select({ id: schema.lead.id, stageId: schema.lead.stageId })
    .from(schema.lead)
    .where(scoped(schema.lead.organizationId, organizationId, eq(schema.lead.contactId, conv.contactId)))
    .limit(1);
  if (!lead) return null;
  const etapas = await db
    .select({ id: schema.pipelineStage.id, name: schema.pipelineStage.name, kind: schema.pipelineStage.kind })
    .from(schema.pipelineStage)
    .where(scoped(schema.pipelineStage.organizationId, organizationId))
    .orderBy(asc(schema.pipelineStage.position));
  const destino =
    etapas.find((e) => quitarTildes(e.name).toLowerCase() === "cliente") ??
    etapas.find((e) => e.kind === "won");
  if (!destino) return null;
  if (lead.stageId !== destino.id) {
    await moveLeadToStage({
      organizationId,
      leadId: lead.id,
      toStageId: destino.id,
      source,
      extra: { lastActivityAt: new Date() },
    });
  }
  return destino.name;
}

/**
 * Ejecuta lo que pidió el cerebro DESPUÉS de enviar su texto. Nunca lanza:
 * un recurso que falta o una lista que Meta rechaza quedan como nota para el
 * equipo, y la conversación sigue.
 */
export async function ejecutarMarcas(
  organizationId: string,
  conversationId: string,
  marcas: Marcas
): Promise<void> {
  for (const nombre of marcas.recursos) {
    try {
      const archivo = await leerRecurso(nombre);
      if (!archivo) {
        await notaDelSistema(organizationId, conversationId, `⚠️ Ana quiso enviar «${nombre}», pero ese archivo no existe.`);
        continue;
      }
      await sendMediaMessage({ conversationId, organizationId, file: archivo, aiGenerated: true });
    } catch (err) {
      console.error("[marcas] no se pudo enviar el recurso", nombre, err);
      await notaDelSistema(organizationId, conversationId, `⚠️ No se pudo enviar «${nombre}» al cliente.`).catch(() => {});
    }
  }
  for (const pedida of marcas.listas) {
    const lista = "nombre" in pedida ? await listaGuardada(pedida.nombre) : pedida;
    if (!lista) {
      await notaDelSistema(organizationId, conversationId, `⚠️ Ana quiso enviar la lista «${"nombre" in pedida ? pedida.nombre : ""}», pero no existe.`).catch(() => {});
      continue;
    }
    try {
      await sendInteractiveList({ conversationId, organizationId, lista, aiGenerated: true });
    } catch (err) {
      console.error("[marcas] no se pudo enviar la lista", err);
      await notaDelSistema(organizationId, conversationId, `⚠️ No se pudo enviar la lista «${lista.cuerpo}».`).catch(() => {});
    }
  }
  for (const motivo of marcas.alertas) {
    await notaDelSistema(organizationId, conversationId, `⚠️ Alerta de Ana (sigue respondiendo): ${motivo}`).catch((err) =>
      console.error("[marcas] no se pudo guardar la alerta", err)
    );
    await marcarAlerta(organizationId, conversationId, motivo).catch(() => {});
  }
  if (marcas.pago) {
    try {
      const etapa = await pasarACliente(organizationId, conversationId);
      await notaDelSistema(
        organizationId,
        conversationId,
        `💸 El cliente envió el abono${etapa ? ` · pasó a «${etapa}»` : ""}. Revisa el pago y pulsa «Confirmar pedido».`
      );
      await marcarAlerta(organizationId, conversationId, "Envió el abono: revisa el pago y confirma el pedido");
    } catch (err) {
      console.error("[marcas] no se pudo registrar el pago", err);
    }
  }
}
