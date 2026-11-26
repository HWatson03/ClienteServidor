/**
 * Formato de texto compartido por las vistas SEMFA: nombres de personas, CI,
 * iniciales para avatares y comparación sin tildes para buscadores.
 */

/** Minúsculas y sin tildes, para que «perez» encuentre «Pérez». */
export function normalizarTexto(valor: unknown): string {
  return String(valor ?? '')
    .normalize('NFD')
    .replaceAll(/[\u0300-\u036F]/g, '')
    .toLowerCase();
}

/** Recorta y colapsa espacios repetidos: «  Juan   Carlos » → «Juan Carlos». */
export function limpiarEspacios(valor: null | string | undefined): string {
  return (valor ?? '').replaceAll(/\s+/g, ' ').trim();
}

/** Partículas que van en minúscula salvo al inicio: «Ñuflo de Chávez», «De la Cruz». */
const PARTICULAS = new Set(['de', 'del', 'la', 'las', 'los', 'y']);

/** «jUAN carlos» → «Juan Carlos». También capitaliza tras guion o apóstrofo. */
export function nombrePropio(valor: null | string | undefined): string {
  return limpiarEspacios(valor)
    .toLocaleLowerCase('es')
    .split(' ')
    .map((palabra, i) =>
      i > 0 && PARTICULAS.has(palabra)
        ? palabra
        : palabra.replaceAll(
            /(^|['-])(\p{L})/gu,
            (_, sep: string, letra: string) => sep + letra.toLocaleUpperCase('es'),
          ),
    )
    .join(' ');
}

/** CI en mayúsculas y sin espacios, para comparar y guardar: «1234567-1a» → «1234567-1A». */
export function normalizarCi(valor: null | string | undefined): string {
  return (valor ?? '').replaceAll(/\s+/g, '').toUpperCase();
}

/** Dos letras para el avatar: primer nombre y apellido (paterno o, si falta, materno). */
export function iniciales(
  nombres: null | string | undefined,
  paterno: null | string | undefined,
  materno: null | string | undefined,
): string {
  const letras = [nombres, paterno || materno]
    .map((parte) => parte?.trim().charAt(0) ?? '')
    .join('');
  return letras.toUpperCase() || '?';
}

/**
 * Iniciales a partir del nombre completo ya armado («Nombres Paterno Materno»),
 * cuando la API no manda las partes sueltas: toma el primer nombre y el
 * penúltimo término, que suele ser el apellido paterno.
 */
export function inicialesDeNombre(nombreCompleto: null | string | undefined): string {
  const palabras = limpiarEspacios(nombreCompleto).split(' ').filter(Boolean);
  if (palabras.length === 0) {
    return '?';
  }
  const apellido =
    palabras.length >= 3 ? palabras.at(-2) : palabras.length === 2 ? palabras[1] : '';
  return iniciales(palabras[0], apellido, '');
}

interface DatosPersona {
  ci: null | string;
  materno: null | string;
  nombreCompleto: string;
  nombres: null | string;
  paterno: null | string;
}

/**
 * Nombre, CI e iniciales para la vista previa de un formulario. Si la persona no
 * está en la lista (p. ej. ya no está activa), usa los datos aplanados del
 * registro en edición.
 */
export function resumenPersona(
  persona: DatosPersona | undefined,
  respaldo?: { ci: null | string; nombre: null | string },
) {
  if (persona) {
    return {
      ci: persona.ci,
      iniciales: iniciales(persona.nombres, persona.paterno, persona.materno),
      nombre: persona.nombreCompleto,
    };
  }
  if (respaldo?.nombre) {
    return {
      ci: respaldo.ci,
      iniciales: inicialesDeNombre(respaldo.nombre),
      nombre: respaldo.nombre,
    };
  }
  return undefined;
}

// ---------------------------------------------------------------- fechas `yyyy-MM-dd`

/** Fecha local (sin zona horaria) a partir de `yyyy-MM-dd`; `null` si no es válida. */
export function fechaLocal(valor: null | string | undefined): Date | null {
  const partes = (valor ?? '').split('-').map(Number);
  const [anio, mes, dia] = partes;
  if (partes.length !== 3 || !anio || !mes || !dia) {
    return null;
  }
  return new Date(anio, mes - 1, dia);
}

/** «15 oct 2026». */
export function formatearFecha(valor: null | string | undefined): string {
  const fecha = fechaLocal(valor);
  return fecha
    ? new Intl.DateTimeFormat('es-BO', { day: 'numeric', month: 'short', year: 'numeric' })
        .format(fecha)
        .replaceAll('.', '')
    : '';
}

/** Días de hoy a la fecha: positivo en el futuro, negativo en el pasado. */
export function diasHasta(valor: null | string | undefined, hoy = new Date()): null | number {
  const fecha = fechaLocal(valor);
  if (!fecha) {
    return null;
  }
  const base = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  return Math.round((fecha.getTime() - base.getTime()) / 86_400_000);
}

/** «Hoy», «Mañana», «En 16 días», «Hace 3 meses»… */
export function fechaRelativa(valor: null | string | undefined, hoy = new Date()): string {
  const dias = diasHasta(valor, hoy);
  if (dias === null) {
    return '';
  }
  if (dias === 0) {
    return 'Hoy';
  }
  if (dias === 1) {
    return 'Mañana';
  }
  if (dias === -1) {
    return 'Ayer';
  }
  const abs = Math.abs(dias);
  const cantidad =
    abs < 60
      ? `${abs} días`
      : abs < 730
        ? `${Math.round(abs / 30)} meses`
        : `${Math.round(abs / 365)} años`;
  return dias > 0 ? `En ${cantidad}` : `Hace ${cantidad}`;
}

/**
 * «hace un momento», «hace 5 min», «hace 2 h», «ayer», «hace 3 días» para un
 * instante `yyyy-MM-dd'T'HH:mm:ss` sin zona (hora local del servidor).
 */
export function tiempoTranscurrido(iso: null | string | undefined, ahora = Date.now()): string {
  if (!iso) {
    return '';
  }
  const minutos = Math.round((ahora - new Date(iso).getTime()) / 60_000);
  if (minutos < 1) {
    return 'hace un momento';
  }
  if (minutos < 60) {
    return `hace ${minutos} min`;
  }
  if (minutos < 60 * 24) {
    return `hace ${Math.round(minutos / 60)} h`;
  }
  const dias = Math.round(minutos / 1440);
  return dias === 1 ? 'ayer' : `hace ${dias} días`;
}
