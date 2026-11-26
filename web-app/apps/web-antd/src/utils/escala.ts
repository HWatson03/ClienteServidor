import type { EscalaCriterio, EscalaForm, NivelEscala } from '#/api/rubricas-criterio';

/**
 * Escala de un criterio mientras se edita en un formulario. `modo`:
 *  - `numeros`: de `minimo` a `maximo`, de `paso` en `paso` (1 = enteros).
 *  - `niveles`: niveles con su descripción (p. ej. 5 «Mínima», …, 25 «Disruptivo»);
 *    con `soloNiveles` el jurado solo elige uno, si no puede afinar con `paso`.
 *  - `rangos`: niveles con nombre, rango `desde`–`puntos` («hasta») y descripción
 *    (Deficiente 0–4, Regular 5–8, …): el jurado elige el nivel y un entero de su
 *    rango. Siempre enteros y sin `soloNiveles`.
 */
export interface NivelEdicion {
  clave: number;
  descripcion: string;
  /** Solo en `rangos`: primer entero del rango. */
  desde?: number;
  /** Solo en `rangos`. */
  nombre?: string;
  /** Puntos del nivel o, en `rangos`, el último entero del rango («hasta»). */
  puntos: number | undefined;
}

export interface EscalaEdicion {
  maximo: number | undefined;
  minimo: number | undefined;
  modo: 'niveles' | 'numeros' | 'rangos';
  niveles: NivelEdicion[];
  paso: number;
  soloNiveles: boolean;
}

let clave = 1;
export const nuevaClave = () => clave++;

export const PASOS = [
  { etiqueta: 'Enteros', valor: 1 },
  { etiqueta: '0,5', valor: 0.5 },
  { etiqueta: '0,1', valor: 0.1 },
];

/** Como se califica hoy (bandas, danza): enteros de 1 al máximo. */
export function escalaPorDefecto(maximo = 10): EscalaEdicion {
  return { maximo, minimo: 1, modo: 'numeros', niveles: [], paso: 1, soloNiveles: false };
}

/** La escala guardada de un criterio, para editarla. */
export function escalaDesde(e: EscalaCriterio | undefined, porcentaje: number): EscalaEdicion {
  if (!e || e.heredada) return escalaPorDefecto(porcentaje);
  return {
    maximo: e.maximo,
    minimo: e.minimo,
    modo: esPorRango(e.niveles) ? 'rangos' : e.niveles.length > 0 ? 'niveles' : 'numeros',
    niveles: e.niveles.map((n) => ({
      clave: nuevaClave(),
      descripcion: n.descripcion ?? '',
      ...(n.desde === null || n.desde === undefined ? {} : { desde: n.desde, nombre: n.nombre ?? '' }),
      puntos: n.puntos,
    })),
    paso: e.paso,
    soloNiveles: e.soloNiveles,
  };
}

export function copiarEscala(e: EscalaEdicion): EscalaEdicion {
  return { ...e, niveles: e.niveles.map((n) => ({ ...n, clave: nuevaClave() })) };
}

/** ¿Todos los niveles traen `desde`? Entonces son niveles por rango. */
export function esPorRango(niveles: { desde?: null | number }[]): boolean {
  return niveles.length > 0 && niveles.every((n) => n.desde !== null && n.desde !== undefined);
}

function nivelesValidos(e: EscalaEdicion): NivelEscala[] {
  if (e.modo === 'rangos') {
    return e.niveles
      .filter((n) => num(n.puntos) !== undefined && num(n.desde) !== undefined)
      .map((n) => ({
        desde: Number(n.desde),
        descripcion: n.descripcion.trim() || null,
        nombre: (n.nombre ?? '').trim(),
        puntos: Number(n.puntos),
      }))
      .sort((a, b) => a.desde! - b.desde!);
  }
  return e.niveles
    .filter((n) => n.puntos !== undefined && n.puntos !== null)
    .map((n) => ({ descripcion: n.descripcion.trim() || null, puntos: Number(n.puntos) }))
    .sort((a, b) => a.puntos - b.puntos);
}

function num(v: null | number | undefined): number | undefined {
  return v === null || v === undefined || Number.isNaN(Number(v)) ? undefined : Number(v);
}

/** Puntaje máximo efectivo: el mayor nivel o el máximo numérico. */
export function maximoDe(e: EscalaEdicion): number {
  if (e.modo === 'rangos') {
    const n = nivelesValidos(e);
    return n.length > 0 ? n.at(-1)!.puntos : 0;
  }
  if (e.modo === 'niveles') {
    const n = nivelesValidos(e);
    return n.length > 0 ? Math.ceil(n.at(-1)!.puntos) : 0;
  }
  return Number(e.maximo) || 0;
}

/** Lo que va al backend (`RubricaCriterioRequest`). */
export function aFormulario(e: EscalaEdicion): EscalaForm & { porcentaje: number } {
  const niveles = e.modo === 'niveles' || e.modo === 'rangos' ? nivelesValidos(e) : [];
  if (e.modo === 'rangos') {
    return {
      niveles,
      paso: 1,
      porcentaje: maximoDe(e),
      puntajeMinimo: niveles.length > 0 ? niveles[0]!.desde! : 0,
      soloNiveles: false,
    };
  }
  return {
    niveles,
    paso: e.paso,
    porcentaje: maximoDe(e),
    puntajeMinimo: niveles.length > 0 ? niveles[0]!.puntos : Number.isFinite(Number(e.minimo)) ? Number(e.minimo) : 1,
    soloNiveles: niveles.length > 0 && e.soloNiveles,
  };
}

/** Número con coma decimal y sin ceros sobrantes: 17,5 · 20. */
export function formatearPuntos(valor: null | number | undefined): string {
  if (valor === null || valor === undefined || Number.isNaN(valor)) return '—';
  return valor.toLocaleString('es', { maximumFractionDigits: 2 });
}

/** «1–10 · enteros», «0–20 · de 0,5 en 0,5», «5 niveles (5–25)». */
export function resumenEscala(e: Pick<EscalaCriterio, 'maximo' | 'minimo' | 'niveles' | 'paso' | 'soloNiveles'>): string {
  const rango = `${formatearPuntos(e.minimo)}–${formatearPuntos(e.maximo)}`;
  if (esPorRango(e.niveles)) return `${e.niveles.length} niveles por rango (${rango})`;
  if (e.niveles.length > 0) {
    return `${e.niveles.length} niveles (${rango})${e.soloNiveles ? '' : e.paso === 1 ? ' · enteros' : ` · de ${formatearPuntos(e.paso)} en ${formatearPuntos(e.paso)}`}`;
  }
  return `${rango} · ${e.paso === 1 ? 'enteros' : `de ${formatearPuntos(e.paso)} en ${formatearPuntos(e.paso)}`}`;
}

export function resumenEdicion(e: EscalaEdicion): string {
  const f = aFormulario(e);
  return resumenEscala({ maximo: f.porcentaje, minimo: f.puntajeMinimo, niveles: f.niveles, paso: f.paso, soloNiveles: f.soloNiveles });
}

/** Error de la escala (o vacío): rango, niveles repetidos, etc. */
export function errorEscala(e: EscalaEdicion): string {
  if (e.modo === 'rangos') {
    if (e.niveles.length < 2) return 'Defina al menos 2 niveles.';
    if (e.niveles.length > 10) return 'Máximo 10 niveles.';
    const errores = erroresRangos(e.niveles);
    for (const n of e.niveles) {
      const error = errores.get(n.clave);
      if (error) return error;
    }
    return '';
  }
  if (e.modo === 'niveles') {
    const n = nivelesValidos(e);
    if (n.length < 2) return 'Defina al menos 2 niveles con sus puntos.';
    if (n.length > 10) return 'Máximo 10 niveles.';
    if (new Set(n.map((x) => x.puntos)).size !== n.length) return 'Dos niveles tienen los mismos puntos.';
    if (n.some((x) => x.puntos < 0 || x.puntos > 100)) return 'Los puntos de cada nivel van de 0 a 100.';
    return '';
  }
  const max = Number(e.maximo);
  const min = Number(e.minimo);
  if (!max || max < 1 || max > 100) return 'El máximo va de 1 a 100.';
  if (Number.isNaN(min) || min < 0 || min >= max) return 'El mínimo debe ser 0 o más y menor que el máximo.';
  return '';
}

/**
 * «Pegar niveles»: una línea por nivel, con los puntos al inicio o al final
 * (copiar la tabla de una convocatoria da «Mínima innovación. → 5»).
 */
export function leerNivelesPegados(texto: string): EscalaEdicion['niveles'] {
  const salida: EscalaEdicion['niveles'] = [];
  for (const linea of texto.split(/\r?\n/)) {
    const celdas = linea
      .split(/\t|\|/)
      .map((c) => c.replaceAll('`', '').replaceAll(/\s+/g, ' ').trim())
      .filter(Boolean);
    if (celdas.length === 0 || /^[-:\s]+$/.test(celdas.join(''))) continue;
    const numero = (c: string | undefined) => (c && /^\d+([.,]\d+)?$/.test(c) ? Number(c.replace(',', '.')) : undefined);
    let puntos = numero(celdas[0]);
    let descripcion = celdas.slice(1).join(' ');
    if (puntos === undefined) {
      puntos = numero(celdas.at(-1));
      descripcion = celdas.slice(0, -1).join(' ');
    }
    if (puntos === undefined) {
      // «Mínima innovación 5» (sin separador): número al final de la línea.
      const m = /^(.*?)[\s.:-]+(\d+(?:[.,]\d+)?)$/.exec(celdas.join(' '));
      if (!m) continue;
      descripcion = m[1]!.trim();
      puntos = Number(m[2]!.replace(',', '.'));
    }
    salida.push({ clave: nuevaClave(), descripcion, puntos });
  }
  return salida;
}

// ------------------------------------------------------------------ niveles por rango

/** Nombres con los que se reparte una escala por rango de 5 niveles, de peor a mejor. */
export const NOMBRES_NIVEL = ['Deficiente', 'Regular', 'Bueno', 'Muy Bueno', 'Excelente'];

/**
 * Reparte 0..`maximo` en `cantidad` rangos contiguos lo más parejos posible
 * (los primeros se llevan el sobrante): 20 → 0–4 · 5–8 · 9–12 · 13–16 · 17–20;
 * 10 → 0–2 · 3–4 · 5–6 · 7–8 · 9–10.
 */
export function nivelesPorRango(maximo: number, cantidad = 5): NivelEdicion[] {
  const tope = Math.max(0, Math.floor(maximo));
  const n = Math.max(1, Math.min(cantidad, tope + 1));
  const valores = tope + 1;
  const base = Math.floor(valores / n);
  const sobrante = valores % n;
  const salida: NivelEdicion[] = [];
  let desde = 0;
  for (let i = 0; i < n; i++) {
    const tamano = base + (i < sobrante ? 1 : 0);
    salida.push({
      clave: nuevaClave(),
      descripcion: '',
      desde,
      nombre: nombrePorDefecto(i, n),
      puntos: desde + tamano - 1,
    });
    desde += tamano;
  }
  return salida;
}

/** Nombre del nivel `i` de `n`: los 5 conocidos si son 5; si no, «Nivel i». */
export function nombrePorDefecto(i: number, n: number): string {
  return n === NOMBRES_NIVEL.length ? NOMBRES_NIVEL[i]! : `Nivel ${i + 1}`;
}

/**
 * Cambia el «hasta» de un nivel y el «desde» del siguiente se ajusta solo
 * (hasta + 1) para que no queden huecos ni solapes.
 */
export function cambiarHasta(niveles: NivelEdicion[], clave: number, valor: number | undefined): NivelEdicion[] {
  const i = niveles.findIndex((n) => n.clave === clave);
  return niveles.map((n, k) => {
    if (k === i) return { ...n, puntos: valor };
    if (k === i + 1 && valor !== undefined) return { ...n, desde: valor + 1 };
    return n;
  });
}

/** Cambia el «desde» de un nivel y el «hasta» del anterior se ajusta solo (desde − 1). */
export function cambiarDesde(niveles: NivelEdicion[], clave: number, valor: number | undefined): NivelEdicion[] {
  const i = niveles.findIndex((n) => n.clave === clave);
  return niveles.map((n, k) => {
    if (k === i) return { ...n, desde: valor };
    if (k === i - 1 && valor !== undefined) return { ...n, puntos: valor - 1 };
    return n;
  });
}

/** Quita un nivel y cierra el hueco: el siguiente empieza donde terminaba el anterior + 1. */
export function quitarNivelRango(niveles: NivelEdicion[], clave: number): NivelEdicion[] {
  const i = niveles.findIndex((n) => n.clave === clave);
  if (i === -1) return niveles;
  const restantes = niveles.filter((n) => n.clave !== clave);
  const anterior = restantes[i - 1];
  const siguiente = restantes[i];
  if (anterior?.puntos !== undefined && siguiente) {
    restantes[i] = { ...siguiente, desde: anterior.puntos + 1 };
  } else if (!anterior && siguiente && niveles[i]?.desde !== undefined) {
    // Se quitó el primero: el siguiente toma su lugar (empieza donde empezaba aquel).
    restantes[i] = { ...siguiente, desde: niveles[i]!.desde };
  }
  return restantes;
}

/** Nivel nuevo al final: empieza donde termina el último. */
export function agregarNivelRango(niveles: NivelEdicion[]): NivelEdicion[] {
  const ultimo = niveles.at(-1);
  const desde = ultimo?.puntos === undefined ? 0 : ultimo.puntos + 1;
  return [
    ...niveles,
    { clave: nuevaClave(), descripcion: '', desde, nombre: nombrePorDefecto(niveles.length, 5), puntos: desde },
  ];
}

/** Error de cada nivel por rango (por clave), en vivo: huecos, solapes, nombres repetidos, descripción vacía… */
export function erroresRangos(niveles: NivelEdicion[]): Map<number, string> {
  const mapa = new Map<number, string>();
  const marcar = (clave: number, texto: string) => {
    if (!mapa.has(clave)) mapa.set(clave, texto);
  };
  const nombres = new Map<string, number>();
  for (const n of niveles) {
    const nombre = (n.nombre ?? '').trim();
    const desde = num(n.desde);
    const hasta = num(n.puntos);
    const etiqueta = nombre ? `«${nombre}»` : 'Un nivel';
    if (!nombre) marcar(n.clave, 'Falta el nombre del nivel.');
    else if (nombre.length > 60) marcar(n.clave, 'El nombre pasa de 60 caracteres.');
    else {
      const clave = normalizarNombre(nombre);
      if (nombres.has(clave)) marcar(n.clave, `Hay dos niveles llamados ${etiqueta}.`);
      nombres.set(clave, n.clave);
    }
    if (!(n.descripcion ?? '').trim()) marcar(n.clave, `Falta la descripción del nivel ${etiqueta}.`);
    if (desde === undefined || hasta === undefined) {
      marcar(n.clave, `${etiqueta}: falta el «desde» o el «hasta».`);
      continue;
    }
    if (!Number.isInteger(desde) || !Number.isInteger(hasta)) marcar(n.clave, `${etiqueta}: el rango va en enteros.`);
    else if (desde < 0 || hasta > 100) marcar(n.clave, `${etiqueta}: los puntos van de 0 a 100.`);
    else if (desde > hasta) marcar(n.clave, `${etiqueta}: el «desde» no puede pasar del «hasta».`);
    if (n.descripcion.length > 255) marcar(n.clave, 'La descripción pasa de 255 caracteres.');
  }
  const completos = niveles
    .filter((n) => num(n.desde) !== undefined && num(n.puntos) !== undefined)
    .sort((a, b) => Number(a.desde) - Number(b.desde));
  for (let i = 1; i < completos.length; i++) {
    const anterior = completos[i - 1]!;
    const n = completos[i]!;
    const esperado = Number(anterior.puntos) + 1;
    if (Number(n.desde) > esperado) {
      marcar(n.clave, `Hueco: el nivel anterior termina en ${anterior.puntos}, este debería empezar en ${esperado}.`);
    } else if (Number(n.desde) < esperado) {
      marcar(n.clave, `Se solapa con el nivel anterior (termina en ${anterior.puntos}): debe empezar en ${esperado}.`);
    }
  }
  return mapa;
}

function normalizarNombre(texto: string): string {
  return texto
    .normalize('NFD')
    .replaceAll(/\p{M}/gu, '')
    .toLowerCase()
    .replaceAll(/\s+/g, ' ');
}

/** Color del nivel `i` de `n`, de rojo (deficiente) a verde (excelente): clases `semfa-nivel--*`. */
const CLASES_NIVEL = [
  'semfa-nivel--deficiente',
  'semfa-nivel--regular',
  'semfa-nivel--bueno',
  'semfa-nivel--muy-bueno',
  'semfa-nivel--excelente',
];

export function claseNivelPorPosicion(i: number, n: number): string {
  if (n <= 1) return CLASES_NIVEL.at(-1)!;
  return CLASES_NIVEL[Math.round((i / (n - 1)) * (CLASES_NIVEL.length - 1))]!;
}

/** Enteros de un rango: 13–16 → [13, 14, 15, 16]. */
export function valoresDeRango(desde: number, hasta: number): number[] {
  const ini = Math.ceil(desde);
  const fin = Math.floor(hasta);
  return fin < ini ? [] : Array.from({ length: fin - ini + 1 }, (_, k) => ini + k);
}

// ------------------------------------------------------------------ «Pegar fila del Word»

export interface FilaWord {
  /** Lo que se pudo proponer del criterio (primera celda). */
  criterio: { descripcion?: string; maximo?: number; nombre?: string };
  niveles: { descripcion: string; desde: number; hasta: number }[];
}

// El rango va pegado a la descripción («0 – 4 ptsPresentan…»): «pts» o «pt» en
// minúscula y sin `i` para no comerse la «S» de «Solo…».
const RANGO_WORD = /(\d+)\s*[–—−-]\s*(\d+)\s*(?:[Pp]ts?|[Pp]untos?)\.?/g;

/**
 * Lee una fila copiada de la tabla del documento de rúbricas: una celda con el
 * criterio («1. Pertinencia … (Bloque 01: …) (Máx. 20 pts)») y una por nivel
 * («0 – 4 ptsPresentan errores…»). No depende de los tabuladores: corta por los
 * rangos, así aguanta celdas con saltos de línea. Devuelve `null` si no hay al
 * menos 2 rangos (p. ej. la fila del encabezado, que se ignora).
 */
export function leerFilaWord(texto: string): FilaWord | null {
  let t = texto.replaceAll('\r', '');
  // Encabezado de la tabla («Criterio  Deficiente  Regular …»): se descarta su línea.
  const lineas = t.split('\n');
  if (lineas.length > 1 && /^\s*(criterios?|indicadores?|aspectos?)\b/i.test(lineas[0]!) && !/m[áa]x/i.test(lineas[0]!)) {
    t = lineas.slice(1).join('\n');
  }
  const marcas = [...t.matchAll(RANGO_WORD)];
  if (marcas.length < 2) return null;

  const limpiar = (x: string) => x.replaceAll(/\s+/g, ' ').trim();
  const niveles = marcas.map((m, i) => {
    const fin = marcas[i + 1]?.index ?? t.length;
    return {
      descripcion: limpiar(t.slice(m.index! + m[0].length, fin)),
      desde: Number(m[1]),
      hasta: Number(m[2]),
    };
  });
  return { criterio: leerCeldaCriterio(limpiar(t.slice(0, marcas[0]!.index))), niveles };
}

/** «1. Pertinencia … (Bloque 01: …) (Máx. 20 pts)» → nombre, bloque y máximo. */
function leerCeldaCriterio(celda: string): FilaWord['criterio'] {
  const salida: FilaWord['criterio'] = {};
  let resto = celda.replace(/^\d+\s*[).:-]\s*/, '');
  const maximo = /\(\s*m[áa]x\.?\s*(\d+)\s*(?:pts?|puntos?)?\.?\s*\)/i.exec(resto);
  if (maximo) {
    salida.maximo = Number(maximo[1]);
    resto = resto.replace(maximo[0], ' ');
  }
  const bloques: string[] = [];
  resto = resto.replaceAll(/\(([^()]*)\)/g, (_, dentro: string) => {
    if (dentro.trim()) bloques.push(dentro.trim());
    return ' ';
  });
  const nombre = resto.replaceAll(/\s+/g, ' ').trim().replace(/[\s:.,;-]+$/, '');
  if (nombre) salida.nombre = nombre;
  if (bloques.length > 0) salida.descripcion = bloques.join(' · ');
  return salida;
}

/** Los niveles leídos de una fila del Word, listos para editar (nombres por defecto en orden). */
export function nivelesDeFilaWord(fila: FilaWord): NivelEdicion[] {
  const n = fila.niveles.length;
  return fila.niveles.map((x, i) => ({
    clave: nuevaClave(),
    descripcion: x.descripcion.slice(0, 255),
    desde: x.desde,
    nombre: nombrePorDefecto(i, n),
    puntos: x.hasta,
  }));
}
