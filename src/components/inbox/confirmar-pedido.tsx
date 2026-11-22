"use client";

import { useState } from "react";
import type { FichaDto } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const txt = (v: unknown) => (v === null || v === undefined ? "" : String(v));
const num = (v: unknown) => {
  const n = Number(String(v ?? "").replace(/[^\d]/g, ""));
  return Number.isFinite(n) && n > 0 ? String(n) : "";
};

/**
 * Confirmar un pedido pagado: envía al cliente el resumen en imagen y el
 * mensaje de confirmación, y pasa el lead a «Cliente». Se prellena con lo que
 * Ana dejó en la ficha (`pedido_*`), y todo se puede corregir antes de enviar.
 */
export function ConfirmarPedido({
  conversationId,
  contactName,
  ficha,
  onDone,
}: {
  conversationId: string;
  contactName: string;
  ficha: FichaDto;
  onDone?: () => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hecho, setHecho] = useState<string | null>(null);
  const [f, setF] = useState(() => inicial());

  function inicial() {
    const total = num(ficha.pedido_total);
    return {
      cliente: txt(ficha.pedido_nombre) || contactName,
      lineas: txt(ficha.pedido_detalle) || txt(ficha.notas),
      fechaEntrega: txt(ficha.pedido_fecha),
      entrega: txt(ficha.pedido_entrega),
      total,
      abono: num(ficha.pedido_abono) || (total ? String(Math.round(Number(total) / 2)) : ""),
    };
  }

  const confirmado = ficha.pedido_estado === "confirmado";

  async function enviar() {
    setEnviando(true);
    setError(null);
    const res = await fetch(`/api/conversations/${conversationId}/confirmar-pedido`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...f,
        total: Number(f.total || 0),
        abono: Number(f.abono || 0),
        fechaEntrega: f.fechaEntrega || undefined,
        entrega: f.entrega || undefined,
      }),
    }).catch(() => null);
    setEnviando(false);
    if (!res?.ok) {
      const j = await res?.json().catch(() => null);
      setError(j?.error?.message ?? "No se pudo enviar la confirmación");
      return;
    }
    const j = await res.json();
    setHecho(j.numero);
    setAbierto(false);
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
      <p className="kicker mb-2">Pedido</p>
      {!abierto ? (
        <>
          {(hecho || confirmado) && (
            <p className="mb-2 text-[13px] text-brand-text">
              ✅ Confirmado{hecho || ficha.pedido_numero ? ` · N.º ${hecho ?? txt(ficha.pedido_numero)}` : ""}
            </p>
          )}
          <Button
            size="sm"
            variant={confirmado || hecho ? "outline" : "default"}
            onClick={() => {
              setF(inicial());
              setAbierto(true);
            }}
          >
            {confirmado || hecho ? "Reenviar confirmación" : "Confirmar pedido"}
          </Button>
          <p className="mt-2 text-[12px] text-text-3">
            Revisa el abono y envía al cliente el resumen en imagen.
          </p>
        </>
      ) : (
        <div className="space-y-2">
          {campo("cliente", "Nombre del cliente")}
          <label className="block text-[12px] text-text-3">
            Pedido (una línea por plato o detalle)
            <Textarea
              value={f.lineas}
              onChange={(e) => setF({ ...f, lineas: e.target.value })}
              rows={5}
              className="mt-1"
            />
          </label>
          {campo("fechaEntrega", "Fecha de entrega", { placeholder: "24 de diciembre" })}
          {campo("entrega", "Entrega", { placeholder: "Recoge en el restaurante / dirección" })}
          <div className="grid grid-cols-2 gap-2">
            {campo("total", "Total", { inputMode: "numeric" })}
            {campo("abono", "Abono recibido", { inputMode: "numeric" })}
          </div>
          {error && <p className="text-[12px] text-red-500">{error}</p>}
          <div className="flex gap-2 pt-1">
            <Button size="sm" disabled={enviando || !f.cliente || !f.lineas || !f.total} onClick={() => void enviar()}>
              {enviando ? "Enviando…" : "Enviar confirmación"}
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
