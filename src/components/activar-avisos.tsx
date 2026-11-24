"use client";

import { useEffect, useState } from "react";
import { BellOff, BellRing } from "lucide-react";
import { cn } from "@/lib/utils";
import { activarPush, desactivarPush, iosSinInstalar, pushSoportado, suscritoAqui } from "./push-cliente";

/**
 * Fila «Activar notificaciones» del menú: suscribe este dispositivo a Web Push
 * para que lleguen los mensajes nuevos aunque el CRM esté cerrado. En iPhone
 * hay que abrir el CRM desde la pantalla de inicio primero.
 */
export function BotonActivarAvisos({ className }: { className?: string }) {
  const [estado, setEstado] = useState<"cargando" | "no" | "si" | "ios" | "nada">("cargando");
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    if (iosSinInstalar()) return setEstado("ios");
    if (!pushSoportado()) return setEstado("nada");
    void suscritoAqui().then((s) => setEstado(s ? "si" : "no"));
  }, []);

  if (estado === "cargando" || estado === "nada") return null;

  if (estado === "ios") {
    return (
      <button
        type="button"
        className={cn("w-full text-left", className)}
        onClick={() =>
          window.alert(
            "Para recibir notificaciones en iPhone: en Safari toca Compartir → «Agregar a pantalla de inicio», abre el CRM desde ese ícono y toca aquí «Activar notificaciones»."
          )
        }
      >
        <BellRing className="h-5 w-5 shrink-0 text-text-3" strokeWidth={1.8} aria-hidden />
        <span className="flex-1">Activar notificaciones</span>
      </button>
    );
  }

  const activo = estado === "si";
  return (
    <button
      type="button"
      disabled={ocupado}
      className={cn("w-full text-left", className)}
      onClick={async () => {
        setOcupado(true);
        try {
          if (activo) {
            await desactivarPush();
            setEstado("no");
          } else {
            const r = await activarPush();
            if (r.ok) setEstado("si");
            else window.alert(r.motivo);
          }
        } catch {
          window.alert("No se pudieron activar las notificaciones.");
        } finally {
          setOcupado(false);
        }
      }}
      title="Notificación en este dispositivo con cada mensaje nuevo, aunque el CRM esté cerrado"
    >
      {activo ? (
        <BellOff className="h-5 w-5 shrink-0 text-text-3" strokeWidth={1.8} aria-hidden />
      ) : (
        <BellRing className="h-5 w-5 shrink-0 text-text-3" strokeWidth={1.8} aria-hidden />
      )}
      <span className="flex-1">{activo ? "Desactivar notificaciones" : "Activar notificaciones"}</span>
    </button>
  );
}
