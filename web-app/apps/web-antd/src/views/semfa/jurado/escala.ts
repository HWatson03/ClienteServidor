import type { CriterioHoja, EstadoJurado } from '#/api/jurado';

import { claseNivelPorPosicion } from '#/utils/escala';

/**
 * Escala con la que el jurado lee su calificación. El puntaje de un criterio va
 * de 1 a su máximo (≤ 10); el nivel se toma por proporción, así un criterio de 5
 * puntos usa la misma escala que uno de 10.
 */
export interface Nivel {
  /** Clases del botón elegido y de la etiqueta. */
  clase: string;
  texto: string;
}

const NIVELES: { desde: number; nivel: Nivel }[] = [
  { desde: 0.9, nivel: { clase: 'semfa-nivel--excelente', texto: 'Excelente' } },
  { desde: 0.7, nivel: { clase: 'semfa-nivel--bueno', texto: 'Bueno' } },
  { desde: 0.5, nivel: { clase: 'semfa-nivel--regular', texto: 'Regular' } },
  { desde: 0, nivel: { clase: 'semfa-nivel--deficiente', texto: 'Deficiente' } },
];

export function nivelDe(valor: null | number | undefined, maximo: number): Nivel | null {
  if (valor === null || valor === undefined || maximo <= 0) {
    return null;
  }
  const proporcion = valor / maximo;
  return (NIVELES.find((n) => proporcion >= n.desde) ?? NIVELES.at(-1)!).nivel;
}

/**
 * Un criterio con niveles por rango (FEXCOIN): todos sus niveles traen `desde` y
 * `nombre`. Los de punto suelto (EXPOINNOVA) y los criterios clásicos no lo son.
 */
export function esNivelesRango(c: Pick<CriterioHoja, 'niveles'>): boolean {
  const n = c.niveles ?? [];
  return n.length > 0 && n.every((x) => x.desde !== null && x.desde !== undefined);
}

/**
 * El nivel por rango que contiene `valor` («Muy Bueno 13–16») con el color que le toca.
 * Si el puntaje no cae en ningún nivel, «valor · —» (sin color); `null` solo si no hay puntaje.
 */
export function nivelRangoDe(c: Pick<CriterioHoja, 'niveles'>, valor: null | number | undefined) {
  if (valor === null || valor === undefined || !esNivelesRango(c)) return null;
  const niveles = [...c.niveles].sort((a, b) => a.desde! - b.desde!);
  let indice = -1;
  niveles.forEach((n, i) => {
    if (n.desde! <= valor + 1e-9) indice = i;
  });
  // Puntaje bajo el primer nivel (rango mal cargado): se muestra igual, sin nivel.
  if (indice === -1) return { clase: '', nombre: '', texto: `${valor} · —` };
  const n = niveles[indice]!;
  return { clase: claseNivelPorPosicion(indice, niveles.length), nombre: n.nombre ?? '', texto: `${valor} · ${n.nombre ?? ''}` };
}

/** Rangos de la escala para un criterio de `maximo` puntos: «9–10 Excelente»… */
export function leyendaEscala(maximo = 10) {
  const valores = Array.from({ length: maximo }, (_, i) => i + 1);
  return NIVELES.map(({ nivel }) => {
    const del = valores.filter((v) => nivelDe(v, maximo)?.texto === nivel.texto);
    if (del.length === 0) return null;
    const rango = del.length === 1 ? `${del[0]}` : `${del[0]}–${del.at(-1)}`;
    return { ...nivel, rango };
  }).filter((n) => n !== null);
}

export const ESTADOS_JURADO: Record<EstadoJurado, { clase: string; icono: string; texto: string }> = {
  EVALUADO: { clase: 'semfa-estado--ok', icono: 'lucide:circle-check', texto: 'Evaluada' },
  PARCIAL: { clase: 'semfa-estado--proceso', icono: 'lucide:circle-dot-dashed', texto: 'En curso' },
  PENDIENTE: { clase: 'semfa-estado--pendiente', icono: 'lucide:circle-dashed', texto: 'Pendiente' },
};

/**
 * Dónde encontrar el proyecto en la feria: «Stand A-12 · Día 1 · Ing. de
 * Sistemas». Cadena vacía si la actividad no carga esos datos.
 */
export function ubicacionFeria(p: {
  carrera?: null | string;
  jornada?: null | number;
  stand?: null | string;
}) {
  return [
    p.stand?.trim() ? `Stand ${p.stand.trim()}` : null,
    p.jornada == null ? null : `Día ${p.jornada}`,
    p.carrera?.trim() || null,
  ]
    .filter(Boolean)
    .join(' · ');
}
