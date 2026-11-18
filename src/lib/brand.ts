/**
 * La marca Vocero — la misma de vocerocrm.com.
 *
 * Vive aquí, sin React, porque la usan dos mundos: los componentes (el trazo
 * del panel lateral y del login) y el servidor (el favicon generado que se
 * sirve como texto). Tener el dibujo en un solo sitio es lo que garantiza que
 * la pestaña y la barra lateral enseñen la MISMA "v".
 *
 * El trazo es una "v" caligráfica fluida con remate cian. El cuerpo se pinta
 * con `currentColor` (así hereda el acento white-label); el remate es una
 * constante de marca y NO se recalcula con el acento: es lo que la hace
 * reconocible.
 */

/** Cuerpo de la "v": se pinta con el color del contexto. */
export const BRAND_MARK_BODY =
  "M4 5c2 8 5 14.5 7.8 14.7 2.3.2 3.7-4.1 4.7-8.2";

/** Remate corto, siempre cian. */
export const BRAND_MARK_TAIL = "M16.5 11.5c.8-3 2-5.5 4-6.1";

export const BRAND_MARK_STROKE = 3.4;

/** Cian sobre fondos claros (texto azul al lado). */
export const BRAND_CYAN = "#00c6f5";

/** Cian sobre el mosaico azul: un punto más claro para que no se hunda. */
export const BRAND_CYAN_ON_TILE = "#3fdcff";

/**
 * ¿Esta instancia se llama Vocero? Solo entonces se dibuja el logo: una
 * agencia que rebautizó el CRM para su cliente no debe ver la "v" de otro
 * producto en su barra lateral ni en su pestaña. El nombre por defecto es
 * "Vocero", así que una instancia sin configurar la ve de inmediato.
 */
export function isVoceroName(name: string): boolean {
  return name.trim().toLowerCase() === "vocero";
}

/**
 * EVOIA — la marca de la agencia (evoia.tech). Una «E» de trazos redondeados
 * en lima sobre casi negro, el mismo dibujo que el favicon de la web. Va en
 * una caja de 32×32.
 */
export const EVOIA_MARK_PATH = "M9 9h14M9 16h10M9 23h14M9 9v14";
export const EVOIA_INK = "#07080c";
export const EVOIA_LIME = "#c6ff3d";

/** ¿Esta instancia se llama EVOIA? Entonces se dibuja su «E». */
export function isEvoiaName(name: string): boolean {
  return name.trim().toLowerCase() === "evoia";
}
