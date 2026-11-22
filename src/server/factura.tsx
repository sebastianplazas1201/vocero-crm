import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";

/**
 * Resumen de pedido confirmado, como imagen para WhatsApp y para el pipeline.
 * No es una factura electrónica: es la confirmación para el cliente.
 *
 * Fondo blanco, color del negocio y su logo (`public/recursos/logo.png`).
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

const COLOR = "#D81B7F";
const COLOR_SUAVE = "#FCE8F3";
const TINTA = "#1f1a1d";
const GRIS = "#7c7178";
const LINEA = "#efe4ea";

const publico = (...p: string[]) => path.join(process.cwd(), "public", ...p);

async function recursos() {
  const [regular, negrita, logo] = await Promise.all([
    readFile(publico("fuentes", "factura-400.ttf")),
    readFile(publico("fuentes", "factura-700.ttf")),
    readFile(publico("recursos", "logo.png")).catch(() => null),
  ]);
  return {
    fonts: [
      { name: "Factura", data: regular, weight: 400 as const, style: "normal" as const },
      { name: "Factura", data: negrita, weight: 700 as const, style: "normal" as const },
    ],
    logo: logo ? `data:image/png;base64,${logo.toString("base64")}` : null,
  };
}

/** «Cena para 5 personas» es el encabezado; lo demás, productos. */
function separar(lineas: string[]) {
  const [primera, ...resto] = lineas;
  if (primera && /para\s+\d+\s+persona/i.test(primera)) return { titulo: primera, productos: resto };
  return { titulo: null, productos: lineas };
}

/** «P2 Lomo relleno…» → código «P2» y nombre aparte, para que se lea mejor. */
function partir(linea: string) {
  const m = linea.match(/^([PA]\d{1,2})\s*[·.\-:]?\s+(.*)$/i);
  return m ? { codigo: m[1]!.toUpperCase(), texto: m[2]! } : { codigo: null, texto: linea };
}

function Dato({ k, v }: { k: string; v: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
      <span style={{ fontSize: 18, color: GRIS, letterSpacing: 1.5 }}>{k}</span>
      <span style={{ fontSize: 26, color: TINTA, fontWeight: 700, marginTop: 4 }}>{v}</span>
    </div>
  );
}

function Fila({ izq, der, fuerte }: { izq: string; der: string; fuerte?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: fuerte ? 14 : 8 }}>
      <span style={{ fontSize: fuerte ? 30 : 24, color: fuerte ? COLOR : GRIS, fontWeight: fuerte ? 700 : 400 }}>{izq}</span>
      <span style={{ fontSize: fuerte ? 36 : 26, color: fuerte ? COLOR : TINTA, fontWeight: 700 }}>{der}</span>
    </div>
  );
}

export async function renderFactura(d: DatosFactura): Promise<Buffer> {
  const { fonts, logo } = await recursos();
  const saldo = Math.max(0, d.total - d.abono);
  const { titulo, productos } = separar(d.lineas);
  const alto = 1180 + Math.max(0, productos.length - 5) * 78 + (d.entrega && d.entrega.length > 38 ? 34 : 0);

  const img = new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: "#ffffff", fontFamily: "Factura", color: TINTA }}>
        <div style={{ display: "flex", height: 16, background: COLOR }} />
        <div style={{ display: "flex", flexDirection: "column", padding: "44px 64px 48px", flexGrow: 1 }}>
          {/* Encabezado */}
          <div style={{ display: "flex", alignItems: "center" }}>
            {logo ? <img src={logo} width={132} height={132} style={{ borderRadius: 66 }} /> : null}
            <div style={{ display: "flex", flexDirection: "column", marginLeft: logo ? 28 : 0, flexGrow: 1 }}>
              <span style={{ fontSize: 46, fontWeight: 700, color: COLOR }}>{d.negocio}</span>
              <span style={{ fontSize: 24, color: GRIS, marginTop: 2 }}>Confirmación de pedido</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
              <span style={{ fontSize: 18, color: GRIS, letterSpacing: 1.5 }}>PEDIDO</span>
              <span style={{ fontSize: 28, fontWeight: 700 }}>{d.numero}</span>
              <span style={{ fontSize: 20, color: GRIS, marginTop: 4 }}>{d.emitida}</span>
            </div>
          </div>

          {/* Cliente y entrega */}
          <div style={{ display: "flex", flexDirection: "column", background: COLOR_SUAVE, borderRadius: 20, padding: "24px 28px", marginTop: 36 }}>
            <div style={{ display: "flex" }}>
              <Dato k="CLIENTE" v={d.cliente} />
              {d.fechaEntrega ? <Dato k="FECHA DE ENTREGA" v={d.fechaEntrega} /> : null}
            </div>
            {d.entrega ? (
              <div style={{ display: "flex", flexDirection: "column", marginTop: 18 }}>
                <span style={{ fontSize: 18, color: GRIS, letterSpacing: 1.5 }}>ENTREGA</span>
                <span style={{ fontSize: 24, marginTop: 4, lineHeight: 1.35 }}>{d.entrega}</span>
              </div>
            ) : null}
          </div>

          {/* Productos */}
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginTop: 36 }}>
            <span style={{ fontSize: 18, color: GRIS, letterSpacing: 1.5 }}>TU PEDIDO</span>
            {titulo ? <span style={{ fontSize: 24, fontWeight: 700, color: COLOR }}>{titulo}</span> : null}
          </div>
          <div style={{ display: "flex", flexDirection: "column", marginTop: 10 }}>
            {productos.map((l, i) => {
              const p = partir(l);
              return (
                <div key={i} style={{ display: "flex", alignItems: "center", padding: "16px 0", borderBottom: `2px solid ${LINEA}` }}>
                  <div style={{ display: "flex", width: 64, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center", background: p.codigo ? COLOR : COLOR_SUAVE, color: p.codigo ? "#ffffff" : COLOR, fontSize: p.codigo ? 20 : 34, fontWeight: 700 }}>
                    {p.codigo ?? "·"}
                  </div>
                  <span style={{ fontSize: 26, marginLeft: 20, flex: 1, lineHeight: 1.3 }}>{p.texto}</span>
                </div>
              );
            })}
          </div>

          <div style={{ display: "flex", flexGrow: 1 }} />

          {/* Totales */}
          <div style={{ display: "flex", flexDirection: "column", border: `2px solid ${LINEA}`, borderRadius: 20, padding: "18px 28px 22px", marginTop: 30 }}>
            <Fila izq="Total del pedido" der={pesos(d.total)} />
            <Fila izq="Abono recibido" der={pesos(d.abono)} />
            <div style={{ display: "flex", height: 2, background: LINEA, marginTop: 14 }} />
            <Fila izq="Saldo al recibir" der={pesos(saldo)} fuerte />
          </div>

          <span style={{ display: "flex", justifyContent: "center", fontSize: 22, color: GRIS, marginTop: 28 }}>
            Gracias por elegirnos
          </span>
        </div>
        <div style={{ display: "flex", height: 16, background: COLOR }} />
      </div>
    ),
    { width: 1000, height: alto, fonts }
  );
  return Buffer.from(await img.arrayBuffer());
}
