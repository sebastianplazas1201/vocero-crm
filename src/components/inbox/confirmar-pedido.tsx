"use client";

import { useCallback, useEffect, useState } from "react";
import type { FichaDto } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type PedidoDto = {
  id: string;
  numero: string;
  cliente: string;
  fechaEntrega: string | null;
  total: number;
  abono: number;
  enviado: boolean;
  createdAt: string;
  imagenUrl: string;
};

const txt = (v: unknown) => (v === null || v === undefined ? "" : String(v));
const num = (v: unknown) => {
  const n = Number(String(v ?? "").replace(/[^\d]/g, ""));
  return Number.isFinite(n) && n > 0 ? String(n) : "";
};
const pesos = (n: number) => "$" + n.toLocaleString("es-CO");

/**
 * Pedidos del contacto. En la bandeja (`conversationId`) el botón confirma el
 * abono y le envía al cliente el resumen en imagen; en el pipeline sirve para
 * registrar ventas cerradas por otro canal (y enviarlas si hay WhatsApp).
 * Se prellena con lo que Ana dejó en la ficha (`pedido_*`).
 */
export function ConfirmarPedido({
  contactId,
  conversationId,
  contactName,
  ficha,
  onDone,
}: {
  contactId: string;
  conversationId?: string;
  contactName: string;
  ficha: FichaDto;
  onDone?: () => void;
}) {
  const [pedidos, setPedidos] = useState<PedidoDto[]>([]);
  const [abierto, setAbierto] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [enviarWa, setEnviarWa] = useState(Boolean(conversationId));
  const [aviso, setAviso] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const inicial = useCallback(() => {
    const total = num(ficha.pedido_total);
    return {
      cliente: txt(ficha.pedido_nombre) || contactName,
      lineas: txt(ficha.pedido_detalle),
      fechaEntrega: txt(ficha.pedido_fecha),
      entrega: txt(ficha.pedido_entrega),
      total,
      abono: num(ficha.pedido_abono) || (total ? String(Math.round(Number(total) / 2)) : ""),
    };
  }, [ficha, contactName]);
  const [f, setF] = useState(inicial);

  const cargar = useCallback(async () => {
    const r = await fetch(`/api/contacts/${contactId}/pedidos`).then((x) => (x.ok ? x.json() : null)).catch(() => null);
    setPedidos(r?.pedidos ?? []);
  }, [contactId]);
  useEffect(() => {
    void cargar();
  }, [cargar]);

  async function guardar() {
    setEnviando(true);
    setError(null);
    setAviso(null);
    const datos = {
      ...f,
      total: Number(f.total || 0),
      abono: Number(f.abono || 0),
      fechaEntrega: f.fechaEntrega || undefined,
      entrega: f.entrega || undefined,
    };
    const res = await fetch(
      conversationId && enviarWa ? `/api/conversations/${conversationId}/confirmar-pedido` : `/api/contacts/${contactId}/pedidos`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(conversationId && enviarWa ? datos : { ...datos, enviar: enviarWa }),
      }
    ).catch(() => null);
    setEnviando(false);
    const j = await res?.json().catch(() => null);
    if (!res?.ok) {
      setError(j?.error?.message ?? "No se pudo guardar el pedido");
      return;
    }
    setAviso(j?.envioError ? `Guardado, pero no se envió: ${j.envioError}` : enviarWa ? "Pedido confirmado y enviado." : "Pedido guardado.");
    setAbierto(false);
    void cargar();
    onDone?.();
  }

  async function borrar(id: string) {
    if (!confirm("¿Eliminar este pedido? No se le avisa al cliente.")) return;
    await fetch(`/api/pedidos/${id}`, { method: "DELETE" });
    void cargar();
    onDone?.();
  }

  const campo = (k: keyof typeof f, label: string, props: React.ComponentProps<typeof Input> = {}) => (
    <label className="block text-[12px] text-text-3">
      {label}
      <Input value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} className="mt-1" {...props} />
    </label>
  );

  return (
    <section className="border-b p-4">
      <p className="kicker mb-2">Pedidos</p>
      {pedidos.length > 0 && (
        <ul className="mb-3 space-y-2">
          {pedidos.map((p) => (
            <li key={p.id} className="flex items-center gap-2 rounded-md border p-2 text-[13px]">
              <a href={p.imagenUrl} target="_blank" rel="noreferrer" className="flex-1 hover:underline">
                <span className="font-[650]">N.º {p.numero}</span>
                {p.fechaEntrega ? ` · ${p.fechaEntrega}` : ""}
                <span className="block text-[12px] text-text-3">
                  {pesos(p.total)} · abono {pesos(p.abono)}
                  {p.enviado ? " · enviado" : ""}
                </span>
              </a>
              <button onClick={() => void borrar(p.id)} className="text-[12px] text-text-3 hover:text-foreground" aria-label={`Eliminar pedido ${p.numero}`}>
                Eliminar
              </button>
            </li>
          ))}
        </ul>
      )}
      {aviso && <p className="mb-2 text-[12px] text-brand-text">{aviso}</p>}
      {!abierto ? (
        <Button
          size="sm"
          onClick={() => {
            setF(inicial());
            setAbierto(true);
          }}
        >
          {conversationId ? "Confirmar pedido" : "Nuevo pedido"}
        </Button>
      ) : (
        <div className="space-y-2">
          {campo("cliente", "Nombre del cliente")}
          <label className="block text-[12px] text-text-3">
            Pedido (una línea por producto: «Cena para 5 personas», «P2 Lomo…», «A1 Arroz…»)
            <Textarea value={f.lineas} onChange={(e) => setF({ ...f, lineas: e.target.value })} rows={6} className="mt-1" />
          </label>
          {campo("fechaEntrega", "Fecha de entrega", { placeholder: "24 de diciembre" })}
          {campo("entrega", "Entrega", { placeholder: "Recoge / dirección, barrio, conjunto, torre y apto" })}
          <div className="grid grid-cols-2 gap-2">
            {campo("total", "Total", { inputMode: "numeric" })}
            {campo("abono", "Abono recibido", { inputMode: "numeric" })}
          </div>
          <label className="flex items-center gap-2 text-[12px] text-text-2">
            <input type="checkbox" checked={enviarWa} onChange={(e) => setEnviarWa(e.target.checked)} />
            Enviar la confirmación al cliente por WhatsApp
          </label>
          {error && <p className="text-[12px] text-red-500">{error}</p>}
          <div className="flex gap-2 pt-1">
            <Button size="sm" disabled={enviando || !f.cliente || !f.lineas || !f.total} onClick={() => void guardar()}>
              {enviando ? "Guardando…" : enviarWa ? "Confirmar y enviar" : "Guardar pedido"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setAbierto(false)}>
              Cancelar
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
