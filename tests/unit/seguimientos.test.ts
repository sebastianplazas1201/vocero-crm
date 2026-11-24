import { describe, expect, it } from "vitest";
import { ajustarAHorario, horaDelSeguimiento } from "@/server/seguimientos";

const H = 3_600_000;
/** Hora local de Bogotá (UTC−5) del 24 nov 2026 → epoch. */
const bog = (dia: number, h: number, m = 0) => Date.UTC(2026, 10, dia, h + 5, m);
const horaLocal = (t: number) => new Date(t - 5 * H).toISOString().slice(11, 16);

describe("seguimientos", () => {
  it("cliente a las 9 a. m.: 9 p. m. no cabe → 8:55 p. m.; 2.º a las 8 a. m.", () => {
    const tIn = bog(24, 9);
    const s1 = horaDelSeguimiento(1, tIn, null)!;
    expect(horaLocal(s1)).toBe("20:55");
    const s2 = horaDelSeguimiento(2, tIn, s1)!;
    expect(horaLocal(s2)).toBe("08:00");
    expect(s2 - tIn).toBeLessThan(24 * H);
  });
  it("cliente a las 7 p. m.: 7 a. m. y 6 p. m.", () => {
    const tIn = bog(24, 19);
    expect(horaLocal(horaDelSeguimiento(1, tIn, null)!)).toBe("07:00");
    expect(horaLocal(horaDelSeguimiento(2, tIn, tIn + 12 * H)!)).toBe("18:00");
  });
  it("cliente a las 11 p. m.: 2.º cae a las 10 p. m. → 8:55 p. m.", () => {
    const tIn = bog(24, 23);
    expect(horaLocal(horaDelSeguimiento(1, tIn, null)!)).toBe("11:00");
    expect(horaLocal(horaDelSeguimiento(2, tIn, tIn + 12 * H)!)).toBe("20:55");
  });
  it("nunca fuera de 6 a. m.–9 p. m.", () => {
    for (let h = 0; h < 24; h++) {
      const tIn = bog(24, h, 17);
      for (const n of [1, 2] as const) {
        const t = horaDelSeguimiento(n, tIn, n === 2 ? tIn + 12 * H : null);
        if (t === null) continue;
        const hh = Number(horaLocal(t).slice(0, 2));
        expect(hh >= 6 && hh < 21).toBe(true);
        expect(t - tIn).toBeLessThan(24 * H);
      }
    }
  });
  it("ajustar respeta el rango", () => {
    expect(ajustarAHorario(bog(24, 23), bog(24, 22), bog(24, 23, 30))).toBeNull();
  });
});
