import { ImageResponse } from "next/og";

/**
 * Resumen de pedido confirmado, como imagen minimalista para enviarla por
 * WhatsApp. No es una factura electrónica: es la confirmación para el cliente.
 */
export type DatosFactura = {
  negocio: string;
  numero: string;
  emitida: string;
  cliente: string;
  lineas: string[];
  fechaEntrega?: string;
  entrega?: string;
  total: number;
  abono: number;
};

export const pesos = (n: number) => "$" + Math.round(n).toLocaleString("es-CO");

const TINTA = "#1d1a17";
const SUAVE = "#8a817a";
const LINEA = "#e6dfd6";
const ACENTO = "#8b1e2d";

function Fila({ izq, der, fuerte }: { izq: string; der: string; fuerte?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: fuerte ? 30 : 24, fontWeight: fuerte ? 700 : 400, color: fuerte ? TINTA : SUAVE, marginTop: 10 }}>
      <span>{izq}</span>
      <span style={{ color: TINTA }}>{der}</span>
    </div>
  );
}

export async function renderFactura(d: DatosFactura): Promise<Buffer> {
  const saldo = Math.max(0, d.total - d.abono);
  const alto = 960 + Math.max(0, d.lineas.length - 4) * 44;
  const img = new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#f6f1ea", padding: 48, fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", flexDirection: "column", width: "100%", background: "#ffffff", borderRadius: 28, padding: "56px 60px", color: TINTA }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ fontSize: 44, fontWeight: 700, color: ACENTO }}>{d.negocio}</span>
              <span style={{ fontSize: 22, color: SUAVE, marginTop: 6 }}>Pedido confirmado</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
              <span style={{ fontSize: 22, color: SUAVE }}>N.º {d.numero}</span>
              <span style={{ fontSize: 22, color: SUAVE, marginTop: 6 }}>{d.emitida}</span>
            </div>
          </div>

          <div style={{ display: "flex", height: 2, background: LINEA, margin: "36px 0 28px" }} />

          <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.35 }}>
            <span style={{ fontSize: 20, color: SUAVE, letterSpacing: 2 }}>CLIENTE</span>
            <span style={{ fontSize: 30, marginTop: 4 }}>{d.cliente}</span>
            {(d.fechaEntrega || d.entrega) ? (
              <span style={{ fontSize: 24, color: SUAVE, marginTop: 4 }}>
                {[d.fechaEntrega, d.entrega].filter(Boolean).join(" · ")}
              </span>
            ) : null}
          </div>

          <span style={{ fontSize: 20, color: SUAVE, letterSpacing: 2, marginTop: 36 }}>PEDIDO</span>
          <div style={{ display: "flex", flexDirection: "column", marginTop: 8 }}>
            {d.lineas.map((l, i) => (
              <span key={i} style={{ fontSize: 26, marginTop: 10 }}>{l}</span>
            ))}
          </div>

          <div style={{ display: "flex", flexGrow: 1 }} />
          <div style={{ display: "flex", height: 2, background: LINEA, margin: "28px 0 12px" }} />
          <Fila izq="Total" der={pesos(d.total)} />
          <Fila izq="Abono recibido" der={pesos(d.abono)} />
          <Fila izq="Saldo al recibir" der={pesos(saldo)} fuerte />

          <span style={{ fontSize: 22, color: SUAVE, marginTop: 40, textAlign: "center", width: "100%", justifyContent: "center", display: "flex" }}>
            ¡Gracias por elegirnos!
          </span>
        </div>
      </div>
    ),
    { width: 900, height: alto }
  );
  return Buffer.from(await img.arrayBuffer());
}
