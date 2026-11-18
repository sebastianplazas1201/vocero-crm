"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Inbox, Kanban, Menu, Users, type LucideIcon } from "lucide-react";
import { isNavActive } from "@/lib/nav";
import { cn } from "@/lib/utils";

/**
 * Fork de EVOIA — la barra inferior del teléfono y la tableta (por debajo de
 * `lg`). Lo de cada día a un toque del pulgar: Bandeja, Pipeline y Contactos;
 * el resto (Agente, Resultados, Ajustes…) sigue en el menú, que abre «Más».
 *
 * Va en el flujo, debajo de `<main>`, y no fija encima del contenido: así no
 * tapa el compositor ni la última fila de una lista. Con un hilo abierto en el
 * teléfono se esconde (ver `.cromo-movil` en globals.css).
 */
const ENTRADAS: { href: string; label: string; icon: LucideIcon; badge?: boolean }[] = [
  { href: "/inbox", label: "Bandeja", icon: Inbox, badge: true },
  { href: "/pipeline", label: "Pipeline", icon: Kanban },
  { href: "/contacts", label: "Contactos", icon: Users },
];

export function BarraMovil({
  noLeidos,
  menuAbierto,
  onMas,
}: {
  noLeidos: number;
  menuAbierto: boolean;
  onMas: () => void;
}) {
  const pathname = usePathname();
  const enEntrada = ENTRADAS.some((e) => isNavActive(pathname, e.href));

  return (
    <nav
      aria-label="Navegación principal"
      className="cromo-movil grid shrink-0 grid-cols-4 border-t bg-background pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      {ENTRADAS.map(({ href, label, icon: Icono, badge }) => {
        const activa = isNavActive(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={activa ? "page" : undefined}
            className={cn(
              "flex flex-col items-center gap-1 py-2 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
              activa ? "text-foreground" : "text-text-3 hover:text-foreground"
            )}
          >
            <span
              className={cn(
                "relative flex h-7 w-12 items-center justify-center rounded-full transition-colors",
                activa && "bg-brand text-brand-fg"
              )}
            >
              <Icono className="h-[18px] w-[18px]" strokeWidth={activa ? 2.2 : 1.8} />
              {badge && noLeidos > 0 && (
                <span
                  className="absolute -right-0.5 -top-1 min-w-[18px] rounded-full bg-destructive px-1 text-center text-[10px] font-semibold leading-[18px] text-destructive-foreground"
                  aria-label={`${noLeidos} sin leer`}
                >
                  {noLeidos > 99 ? "99+" : noLeidos}
                </span>
              )}
            </span>
            {label}
          </Link>
        );
      })}
      <button
        type="button"
        onClick={onMas}
        aria-label="Más: abrir el menú"
        aria-expanded={menuAbierto}
        className={cn(
          "flex flex-col items-center gap-1 py-2 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
          !enEntrada || menuAbierto ? "text-foreground" : "text-text-3 hover:text-foreground"
        )}
      >
        <span
          className={cn(
            "flex h-7 w-12 items-center justify-center rounded-full transition-colors",
            !enEntrada && "bg-secondary"
          )}
        >
          <Menu className="h-[18px] w-[18px]" strokeWidth={1.8} />
        </span>
        Más
      </button>
    </nav>
  );
}
