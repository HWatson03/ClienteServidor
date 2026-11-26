import { fechaLocal } from '#/utils/formato';

/**
 * Jornadas de una actividad de varios días (FEXCOIN: 13 y 14 de noviembre). El
 * backend devuelve `jornadas` (días entre `fecha` y `fechaFin`, 1 sin `fechaFin`)
 * y cada inscripción puede llevar su `jornada` (1..N).
 */

const DIA_MES = new Intl.DateTimeFormat('es-BO', { day: 'numeric', month: 'short' });
const DIA_SEMANA = new Intl.DateTimeFormat('es-BO', { day: 'numeric', month: 'short', weekday: 'short' });

function sinPuntos(texto: string) {
  return texto.replaceAll('.', '');
}

/** Fecha (`Date` local) de la jornada `n` (1 = el día de `fecha`); `null` sin fecha. */
export function fechaDeJornada(fecha: null | string | undefined, n: number): Date | null {
  const inicio = fechaLocal(fecha);
  if (!inicio) {
    return null;
  }
  return new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate() + n - 1);
}

/** «Día 2 · vie 14 nov», o solo «Día 2» si la actividad no tiene fecha. */
export function etiquetaJornada(fecha: null | string | undefined, n: number): string {
  const dia = fechaDeJornada(fecha, n);
  return dia ? `Día ${n} · ${sinPuntos(DIA_SEMANA.format(dia)).replace(',', '')}` : `Día ${n}`;
}

/** Opciones `Día 1..N` para un `Select`. */
export function opcionesJornada(actividad: null | undefined | { fecha: null | string; jornadas?: null | number }) {
  const total = Math.max(1, actividad?.jornadas ?? 1);
  return Array.from({ length: total }, (_, i) => ({
    label: etiquetaJornada(actividad?.fecha, i + 1),
    value: i + 1,
  }));
}

/**
 * Rango corto: «13–14 nov», «30 oct–2 nov» o «14 nov» si es un día. Vacío sin
 * fecha.
 */
export function rangoFechas(fecha: null | string | undefined, fechaFin: null | string | undefined): string {
  const inicio = fechaLocal(fecha);
  if (!inicio) {
    return '';
  }
  const fin = fechaLocal(fechaFin);
  if (!fin || fin.getTime() <= inicio.getTime()) {
    return sinPuntos(DIA_MES.format(inicio));
  }
  if (inicio.getMonth() === fin.getMonth() && inicio.getFullYear() === fin.getFullYear()) {
    return `${inicio.getDate()}–${sinPuntos(DIA_MES.format(fin))}`;
  }
  return `${sinPuntos(DIA_MES.format(inicio))}–${sinPuntos(DIA_MES.format(fin))}`;
}

/** Proyectos por día: `porDia[0]` es el Día 1 y `sinDia` los que aún no tienen. */
export interface ConteoJornadas {
  porDia: number[];
  sinDia: number;
}

/**
 * Cuenta proyectos por jornada (1..`jornadas`). Una jornada fuera de rango (por
 * ejemplo de una actividad que se acortó) cuenta como «sin día».
 */
export function contarPorJornada(items: { jornada?: null | number }[], jornadas: number): ConteoJornadas {
  const total = Math.max(1, jornadas);
  const porDia = Array.from({ length: total }, () => 0);
  let sinDia = 0;
  for (const { jornada } of items) {
    if (jornada && jornada >= 1 && jornada <= total) {
      porDia[jornada - 1] = (porDia[jornada - 1] ?? 0) + 1;
    } else {
      sinDia += 1;
    }
  }
  return { porDia, sinDia };
}

/** «13/11»: día y mes de la jornada `n`; vacío si la actividad no tiene fecha. */
export function fechaCortaJornada(fecha: null | string | undefined, n: number): string {
  const dia = fechaDeJornada(fecha, n);
  return dia ? `${String(dia.getDate()).padStart(2, '0')}/${String(dia.getMonth() + 1).padStart(2, '0')}` : '';
}

/** Código del filtro «sin día» en las listas por jornada. */
export const SIN_DIA = 0;

/** Texto de la jornada en curso: «Todos los proyectos» o «Día 2 · vie 14 nov». */
export function textoJornadaEnCurso(fecha: null | string | undefined, jornada: null | number | undefined): string {
  return jornada ? etiquetaJornada(fecha, jornada) : 'Todos los proyectos';
}
