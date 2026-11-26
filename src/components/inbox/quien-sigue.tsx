"use client";

import type { MessageDto } from "@/lib/types";

/**
 * Quién atiende el chat: desde que alguien del equipo responde (en el CRM o en
 * el celular), arriba del chat se pregunta si sigue Ana o el equipo; con la IA
 * en pausa se ofrece devolvérselo a Ana. Así en el iPhone se gestiona con un
 * toque, sin abrir el panel del contacto.
 */
export function QuienSigue({
  conversation,
  messages,
  decidido,
  onAnaContinua,
  onSigoYo,
  onDevolverAna,
}: {
  conversation: { id: string; aiEnabled?: boolean; handoffAt?: unknown; isTest?: boolean };
  messages: MessageDto[];
  decidido: string | undefined;
  onAnaContinua: (mensajeId: string) => void;
  onSigoYo: () => void;
  onDevolverAna: () => void;
}) {
  if (conversation.isTest) return null;
  const pausada = conversation.aiEnabled === false || Boolean(conversation.handoffAt);
  const base = "flex flex-wrap items-center gap-2 border-b border-border px-4 py-2 text-sm";
  const boton = "min-h-9 rounded-full px-4 py-1.5 font-medium";

  if (pausada) {
    return (
      <div className={`${base} bg-surface-2`}>
        <span className="min-w-0 flex-1 text-text-2">
          {conversation.handoffAt ? "Ana pidió ayuda: atiende el equipo." : "Atiendes tú: Ana está en pausa."}
        </span>
        <button type="button" onClick={onDevolverAna} className={`${boton} bg-primary text-primary-foreground hover:opacity-90`}>
          Devolver a Ana
        </button>
      </div>
    );
  }

  // Último saliente: si lo escribió una persona del equipo, se pregunta.
  const ultimoSaliente = [...messages].reverse().find((m) => m.direction === "out");
  const esDelEquipo =
    ultimoSaliente && !ultimoSaliente.aiGenerated && (ultimoSaliente.origin === "operator" || ultimoSaliente.origin === "manual");
  if (!ultimoSaliente || !esDelEquipo || decidido === ultimoSaliente.id) return null;

  return (
    <div className={`${base} bg-surface-2`}>
      <span className="min-w-0 flex-1 text-text-2">Respondió el equipo. ¿Quién sigue con este cliente?</span>
      <button
        type="button"
        onClick={() => onAnaContinua(ultimoSaliente.id)}
        className={`${boton} border border-border-strong hover:border-text-3`}
      >
        Ana continúa
      </button>
      <button type="button" onClick={onSigoYo} className={`${boton} bg-primary text-primary-foreground hover:opacity-90`}>
        Sigo yo
      </button>
    </div>
  );
}
