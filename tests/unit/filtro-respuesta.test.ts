import { describe, expect, it } from "vitest";
import { esRellenoGenerico, quitarEmojis } from "@/server/filtro-respuesta";

describe("filtro de respuestas de la IA", () => {
  it("detecta el saludo suelto", () => {
    expect(esRellenoGenerico("¿En qué te puedo ayudar, Juan?")).toBe(true);
    expect(esRellenoGenerico("¡Hola! Soy Ana, del equipo de Gatos Restaurante. ¿Cómo puedo ayudarte?")).toBe(true);
    expect(esRellenoGenerico("Hola, Juan. ¿En qué te puedo ayudar?")).toBe(true);
  });
  it("no toca respuestas con contenido", () => {
    expect(esRellenoGenerico("Listo, Juan. El abono del 50% son *101.250* por Llave Bre-B.")).toBe(false);
    expect(esRellenoGenerico("¿Me confirmas el barrio de la dirección?")).toBe(false);
    expect(esRellenoGenerico("Para 4 personas son 162.000. ¿En qué fecha te la llevamos?")).toBe(false);
  });
  it("quita emojis", () => {
    expect(quitarEmojis("¿En qué te puedo ayudar, Juan? 🙂")).toBe("¿En qué te puedo ayudar, Juan?");
    expect(quitarEmojis("Gatos 😺 Restaurante 🎄🎅🏽")).toBe("Gatos Restaurante");
    expect(quitarEmojis("Total: *202.500*\n- Natilla")).toBe("Total: *202.500*\n- Natilla");
  });
});
