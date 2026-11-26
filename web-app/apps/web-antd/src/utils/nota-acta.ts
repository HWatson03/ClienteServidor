/**
 * Nota de acta (espejo de `Models/Service/NotaDirecta.java`): la nota que llegó
 * escrita («8.5» sobre 10, «95/100») y su conversión al puntaje máximo de la
 * categoría. El backend vuelve a validar; esto es para la vista previa.
 */

export type LecturaNota =
  | { error: string; ok: false }
  | { escala: number; ok: true; texto: string; valor: number };

const FORMATO = /^(\d+(?:\.\d+)?)\s*(?:(?:\/|sobre|de)\s*(\d+(?:\.\d+)?))?$/;
const ESCALA_MAXIMA = 1000;
const ESCALA_SIN_RUBRICAS = 100;

function formato(v: number) {
  return String(Number(v.toFixed(4)));
}

/** Lee lo escrito: «8.5», «8,5», «95/100», «95 sobre 100». Sin «/» usa `escala`. */
export function leerNota(texto: string, escala: null | number | undefined): LecturaNota {
  const limpio = (texto ?? '').trim().toLowerCase().replaceAll(',', '.').replaceAll(/\s+/g, ' ');
  if (!limpio) return { error: 'Escriba la nota.', ok: false };
  const m = FORMATO.exec(limpio);
  if (!m) return { error: `Nota no válida: «${texto.trim()}». Ejemplos: 8.5, 8.5/10, 95/100.`, ok: false };
  const valor = Number(m[1]);
  const sobre = m[2] === undefined ? (escala ?? null) : Number(m[2]);
  if (sobre === null) return { error: 'Indique sobre cuánto es la nota (10, 100…).', ok: false };
  if (!(sobre > 0) || sobre > ESCALA_MAXIMA) {
    return { error: `La escala debe ser mayor que 0 y como máximo ${ESCALA_MAXIMA}.`, ok: false };
  }
  if (valor > sobre) return { error: `La nota ${formato(valor)} supera el máximo de ${formato(sobre)}.`, ok: false };
  return { escala: sobre, ok: true, texto: `${formato(valor)}/${formato(sobre)}`, valor };
}

/** Regla de tres al máximo de la categoría (sin rúbricas: sobre 100), con 2 decimales. */
export function puntajeEnCategoria(valor: number, escala: number, maximoCategoria: number) {
  const destino = maximoCategoria > 0 ? maximoCategoria : ESCALA_SIN_RUBRICAS;
  return Math.round((valor / escala) * destino * 100) / 100;
}

/**
 * Puesto que tendría `idInscripcion` con `puntaje` en su grupo (misma carrera y
 * categoría): 1 + los evaluados con más puntaje (los empates comparten el puesto).
 * `pendientes` = los del grupo que aún no tienen puntaje final (y tienen jurados).
 */
export function posicionEstimada(
  grupo: { estado: string; idInscripcion: number; puntaje: null | number }[],
  idInscripcion: number,
  puntaje: number,
) {
  const otros = grupo.filter((p) => p.idInscripcion !== idInscripcion);
  const evaluados = otros.filter((p) => p.estado === 'COMPLETO' && p.puntaje !== null);
  return {
    pendientes: otros.filter((p) => p.estado !== 'COMPLETO' && p.estado !== 'SIN_JURADOS').length,
    puesto: 1 + evaluados.filter((p) => (p.puntaje as number) > puntaje).length,
    total: evaluados.length + 1,
  };
}
