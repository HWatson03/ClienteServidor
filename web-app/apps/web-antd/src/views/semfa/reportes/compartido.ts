import type { InjectionKey, Ref } from 'vue';

import type {
  EstadoResultado,
  PdfResultados,
  ResultadosCalificacion,
  ResultadosCategoria,
  ResultadosProyecto,
} from '#/api/resultados';

import { normalizarTexto } from '#/utils/formato';

/** Lo que la pantalla de reportes comparte con sus pestañas para pedir PDF. */
export interface ContextoPdf {
  /** Clave del PDF que se está generando (para el spinner del botón). */
  generando: Ref<string | undefined>;
  pedir: (clave: string, pdf: PdfResultados, nombre: string, abrir: boolean) => Promise<void>;
}

export const CONTEXTO_PDF: InjectionKey<ContextoPdf> = Symbol('semfa-reportes-pdf');

export const ESTADOS: Record<EstadoResultado, { clase: string; texto: string }> = {
  COMPLETO: { clase: 'semfa-estado--ok', texto: 'Completa' },
  EN_PROCESO: { clase: 'semfa-estado--proceso', texto: 'En evaluación' },
  SIN_INICIAR: { clase: 'semfa-estado--pendiente', texto: 'Sin iniciar' },
  SIN_JURADOS: { clase: 'semfa-estado--error', texto: 'Sin jurados' },
};

/** Dos decimales, o «—». */
export function fmt(valor: null | number | undefined) {
  return valor === null || valor === undefined ? '—' : valor.toFixed(2);
}

/** Sin decimales si es entero (máximos y puntajes de criterio). */
export function fmtCorto(valor: null | number | undefined) {
  if (valor === null || valor === undefined) return '—';
  return Number.isInteger(valor) ? String(valor) : String(Math.round(valor * 100) / 100);
}

export function calificacionDe(p: ResultadosProyecto, idJurado: number): ResultadosCalificacion | undefined {
  return p.calificaciones.find((c) => c.idJurado === idJurado);
}

export function notaCriterio(
  cal: ResultadosCalificacion | undefined,
  idRubrica: number,
  idCriterio: number,
): number | undefined {
  return cal?.rubricas.find((r) => r.idRubrica === idRubrica)?.criterios[String(idCriterio)];
}

export function subtotalRubrica(cal: ResultadosCalificacion | undefined, idRubrica: number): number | undefined {
  return cal?.rubricas.find((r) => r.idRubrica === idRubrica)?.subtotal;
}

export function promedio(valores: number[]): null | number {
  return valores.length === 0 ? null : valores.reduce((a, b) => a + b, 0) / valores.length;
}

/** «J1», «J2»… según el orden de los jurados de la categoría (el mismo de los PDF). */
export function codigoJurado(cat: ResultadosCategoria, idJurado: number) {
  return `J${cat.jurados.findIndex((j) => j.idJurado === idJurado) + 1}`;
}

/** Nombre de archivo sin tildes ni espacios. */
export function archivo(...partes: (null | string | undefined)[]) {
  const base = partes
    .filter(Boolean)
    .map((p) => normalizarTexto(p).replaceAll(/[^a-z0-9]+/g, '-'))
    .join('-')
    .replaceAll(/^-+|-+$/g, '');
  return `${base.slice(0, 90) || 'reporte'}.pdf`;
}

// ------------------------------------------------------------------ rankings entre categorías

/** Filtro de jornada: `0` = todas. */
export type FiltroJornada = 0 | 1 | 2;

/** Un proyecto con su categoría, para rankings que cruzan categorías. */
export interface ProyectoConCategoria extends ResultadosProyecto {
  categoria: string;
  idCategoria: number;
  /** Puntaje / máximo de su categoría × 100 (`null` sin puntaje). */
  porcentaje: null | number;
  puntajeMaximo: number;
}

/** Evaluación completa: todos sus jurados llenaron todas las rúbricas. */
export function evaluacionCompleta(p: ResultadosProyecto) {
  return p.estado === 'COMPLETO' && p.puntaje !== null && p.juradosAsignados > 0
    && p.juradosCompletos >= p.juradosAsignados;
}

export function aplanarProyectos(categorias: ResultadosCategoria[], jornada: FiltroJornada = 0): ProyectoConCategoria[] {
  return categorias.flatMap((c) =>
    c.proyectos
      .filter((p) => jornada === 0 || p.jornada === jornada)
      .map((p) => ({
        ...p,
        categoria: c.nombre,
        idCategoria: c.idCategoria,
        porcentaje: p.puntaje === null || c.puntajeMaximo <= 0 ? null : (p.puntaje * 100) / c.puntajeMaximo,
        puntajeMaximo: c.puntajeMaximo,
      })),
  );
}

export interface ProyectoUbicado extends ProyectoConCategoria {
  /** Puesto dentro del ranking que se está viendo (empates lo comparten). */
  lugar: number;
}

/**
 * Ordena por porcentaje (las categorías pueden tener máximos distintos) solo los
 * de evaluación completa; los empates (a dos decimales) comparten el lugar.
 */
export function ubicar(proyectos: ProyectoConCategoria[]): ProyectoUbicado[] {
  const ordenados = proyectos
    .filter((p) => !p.exclusion && evaluacionCompleta(p) && p.porcentaje !== null)
    .sort((a, b) => (b.porcentaje! - a.porcentaje!) || (a.nombre ?? '').localeCompare(b.nombre ?? '', 'es'));
  let lugar = 0;
  let anterior: null | string = null;
  return ordenados.map((p, i) => {
    const clave = p.porcentaje!.toFixed(2);
    if (clave !== anterior) {
      lugar = i + 1;
      anterior = clave;
    }
    return { ...p, lugar };
  });
}

/** Los que aún no se pueden ubicar, ordenados por avance (más avanzados primero). */
export function enEvaluacion(proyectos: ProyectoConCategoria[]) {
  return proyectos
    .filter((p) => !p.exclusion && !evaluacionCompleta(p))
    .sort((a, b) => (b.juradosCompletos - a.juradosCompletos) || (a.nombre ?? '').localeCompare(b.nombre ?? '', 'es'));
}

export function fmtPorcentaje(valor: null | number | undefined) {
  return valor === null || valor === undefined ? '—' : `${valor.toFixed(1)} %`;
}

/** «Día 1», «Día 2» o «—». */
export function textoJornada(jornada: null | number | undefined) {
  return jornada ? `Día ${jornada}` : '—';
}

/** Hay al menos un proyecto con jornada (sino el filtro no se muestra). */
export function hayJornadas(categorias: ResultadosCategoria[]) {
  return categorias.some((c) => c.proyectos.some((p) => p.jornada !== null));
}

// ------------------------------------------------------------------ CSV

type Celda = null | number | string | undefined;

/**
 * Descarga un CSV que Excel abre bien: BOM UTF-8 (tildes), `;` como separador
 * (Excel en español usa la coma decimal) y decimales con coma.
 */
export function descargarCsv(nombre: string, encabezado: string[], filas: Celda[][]) {
  const celda = (v: Celda) => {
    const texto = v === null || v === undefined ? '' : typeof v === 'number' ? String(v).replace('.', ',') : v;
    return /[";\n\r]/.test(texto) ? `"${texto.replaceAll('"', '""')}"` : texto;
  };
  const contenido = [encabezado, ...filas].map((f) => f.map(celda).join(';')).join('\r\n');
  const url = URL.createObjectURL(new Blob([`﻿${contenido}`], { type: 'text/csv;charset=utf-8' }));
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = archivo(nombre).replace(/\.pdf$/, '.csv');
  document.body.append(enlace);
  enlace.click();
  enlace.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Redondeo para el CSV (número, no texto, para que Excel pueda sumar). */
export function r2(valor: null | number | undefined) {
  return valor === null || valor === undefined ? null : Math.round(valor * 100) / 100;
}
