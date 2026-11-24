import { describe, expect, it } from "vitest";
import { textoDelAviso } from "@/server/push";

describe("textoDelAviso", () => {
  it("usa el nombre y el texto", () => {
    expect(textoDelAviso("Ana", "Hola", "text")).toEqual({ titulo: "Ana", cuerpo: "Hola" });
  });
  it("sin texto, nombra el tipo", () => {
    expect(textoDelAviso(null, null, "image")).toEqual({ titulo: "Nuevo mensaje", cuerpo: "Foto" });
  });
  it("recorta textos largos", () => {
    expect(textoDelAviso("X", "a".repeat(300), "text").cuerpo.length).toBe(140);
  });
});
