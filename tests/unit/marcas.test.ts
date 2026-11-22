import { describe, expect, it } from "vitest";
import { parsearMarcas } from "@/server/bot/marcas";

describe("marcas del cerebro", () => {
  it("quita las marcas del texto y las separa", () => {
    const m = parsearMarcas(
      "Te comparto el menú 😺 [[ENVIAR: menu-cenas]]\n[[LISTA: Elige tu proteína | P1 Lomo glaseado - piña y panela; P2 Lomo de manzana]] [[alerta: no sé qué frutas lleva la BBQ]] [[PAGO]]"
    );
    expect(m.texto).toBe("Te comparto el menú 😺");
    expect(m.recursos).toEqual(["menu-cenas"]);
    expect(m.listas[0]!.cuerpo).toBe("Elige tu proteína");
    expect(m.listas[0]!.filas).toEqual([
      { titulo: "P1 Lomo glaseado", descripcion: "piña y panela" },
      { titulo: "P2 Lomo de manzana" },
    ]);
    expect(m.alertas).toEqual(["no sé qué frutas lleva la BBQ"]);
    expect(m.pago).toBe(true);
  });

  it("deja el texto intacto sin marcas y respeta marcas desconocidas", () => {
    expect(parsearMarcas("Hola [[OTRA]]").texto).toBe("Hola [[OTRA]]");
    expect(parsearMarcas("Hola").pago).toBe(false);
  });

  it("una respuesta solo con marca queda sin texto", () => {
    expect(parsearMarcas("[[ENVIAR: menu-cenas]]").texto).toBe("");
  });
});
