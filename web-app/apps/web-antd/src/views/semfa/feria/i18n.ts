/**
 * Idiomas de las pantallas públicas de la feria (`/fexcoin-vivo` y su mapa): español (principal y
 * por defecto), inglés y portugués de Brasil (Cobija es frontera con Brasiléia/Epitaciolândia).
 *
 * Liviano a propósito (sin vue-i18n ni nada de la administración): el español va aquí mismo y el
 * inglés y el portugués son chunks aparte (`feria-en.ts`, `feria-pt.ts`) que se piden con `import()`
 * solo al elegirlos. Mientras uno carga se sigue viendo el español (`idioma` cambia recién cuando su
 * diccionario llegó; `idiomaPedido` marca el botón al instante).
 *
 * Idioma inicial: `?lang=es|en|pt` > elección guardada (`semfa-feria-idioma`) > español. El idioma
 * del navegador NO cambia nada solo: si es inglés o portugués y el visitante nunca eligió, se le
 * ofrece una vez (`sugerencia`).
 *
 * Textos: `t('Texto en español {n}', { n: 3 })` (la clave es el español) con `{n}` interpolado;
 * «uno|varios» elige por `n === 1`.
 * Nombres de las 10 categorías del afiche: `nombreCategoria`. Frases de la portada por defecto:
 * `fraseTraducida` (ver `traducirPortada` en `portada.ts`).
 */
import type { LocationQuery, LocationQueryRaw } from 'vue-router';

import type EN from './feria-en';

import { computed, ref } from 'vue';

export type Idioma = 'en' | 'es' | 'pt';
export const IDIOMAS: readonly Idioma[] = ['es', 'en', 'pt'];
export const NOMBRE_IDIOMA: Record<Idioma, string> = { en: 'English', es: 'Español', pt: 'Português' };
const LOCALE: Record<Idioma, string> = { en: 'en-US', es: 'es-BO', pt: 'pt-BR' };
const LANG_HTML: Record<Idioma, string> = { en: 'en', es: 'es', pt: 'pt-BR' };
const CLAVE_IDIOMA = 'semfa-feria-idioma';
const CLAVE_SUGERENCIA = 'semfa-feria-idioma-aviso';


/**
 * Las claves son el propio texto en español (como gettext): el español no necesita diccionario y no
 * pesa dos veces. `feria-en.ts` define las claves válidas y `feria-pt.ts` debe traerlas todas.
 */
export type ClaveTexto = keyof (typeof EN)['textos'];
export interface Diccionario<C extends string = ClaveTexto> {
  textos: Record<C, string>;
  /** Nombres de las 10 categorías del afiche (clave en español, tal como en el afiche). */
  categorias: Record<string, string>;
  /** Textos por defecto de la portada (`PORTADA_DEFECTO`, `MEDIOS_DEFECTO`): español → traducción. */
  frases: Record<string, string>;
}
interface Cargado { categorias: Map<string, string>; frases: Map<string, string>; textos: Record<ClaveTexto, string> }

const CARGADORES: Record<'en' | 'pt', () => Promise<{ default: Diccionario }>> = {
  en: () => import('./feria-en'),
  pt: () => import('./feria-pt'),
};
const cargados: Partial<Record<Idioma, Cargado>> = {};
const pendientes: Partial<Record<Idioma, Promise<Cargado>>> = {};

/** Sin tildes, mayúsculas ni espacios de más (como `normalizarTexto`, sin importar `#/utils`). */
export const clavePlana = (s: string) => s.normalize('NFD').replaceAll(/[̀-ͯ]/g, '').toLowerCase().replaceAll(/\s+/g, ' ').trim();
const mapaPlano = (o: Record<string, string>) => new Map(Object.entries(o).map(([k, v]) => [clavePlana(k), v]));

/** Idioma que se está mostrando (su diccionario ya llegó). */
export const idioma = ref<Idioma>('es');
/** Idioma elegido (marca el botón al instante, aunque su diccionario aún esté en camino). */
export const idiomaPedido = ref<Idioma>('es');
/** Idioma del navegador que se ofrece una vez («Ver em português?»), o `null`. */
export const sugerencia = ref<'en' | 'pt' | null>(null);
export const locale = computed(() => LOCALE[idioma.value]);

export const esIdioma = (v: unknown): v is Idioma => v === 'es' || v === 'en' || v === 'pt';

/** Diccionario de `en`/`pt` (lo baja una sola vez). También lo usa el editor de la portada. */
export function cargarDiccionario(i: 'en' | 'pt'): Promise<Cargado> {
  const listo = cargados[i];
  if (listo) return Promise.resolve(listo);
  pendientes[i] ??= CARGADORES[i]().then(({ default: d }) => {
    const c: Cargado = { categorias: mapaPlano(d.categorias), frases: mapaPlano(d.frases), textos: d.textos };
    cargados[i] = c;
    return c;
  }).catch((error) => { delete pendientes[i]; throw error; });
  return pendientes[i]!;
}

function guardar(clave: string, valor: null | string) {
  try {
    if (valor === null) localStorage.removeItem(clave);
    else localStorage.setItem(clave, valor);
  } catch { /* almacenamiento bloqueado: solo no se recuerda */ }
}
function leer(clave: string): null | string {
  try { return localStorage.getItem(clave); } catch { return null; }
}

/**
 * Cambia el idioma. `recordar` = elección del visitante (se guarda; la de `?lang=` no).
 * Si su diccionario no llega (sin red), se queda en el idioma que se veía.
 */
export async function cambiarIdioma(i: Idioma, recordar = true) {
  idiomaPedido.value = i;
  if (recordar) { guardar(CLAVE_IDIOMA, i); sugerencia.value = null; }
  try {
    if (i !== 'es') await cargarDiccionario(i);
  } catch {
    if (idiomaPedido.value === i) idiomaPedido.value = idioma.value;
    return;
  }
  if (idiomaPedido.value !== i) return;
  idioma.value = i;
  if (typeof document !== 'undefined') document.documentElement.lang = LANG_HTML[i];
}

let iniciado = false;
/**
 * Idioma inicial (una vez por página): `?lang=` > elección guardada > español. Si el visitante
 * nunca eligió y su navegador está en portugués o inglés, deja la `sugerencia` (una sola vez).
 */
export function iniciarIdioma(lang: unknown) {
  // Solo la primera vez: al volver con «atrás» a una dirección con otro `?lang=` manda lo elegido después.
  if (iniciado) return;
  iniciado = true;
  const pedido = Array.isArray(lang) ? lang[0] : lang;
  const guardado = leer(CLAVE_IDIOMA);
  const inicial: Idioma = esIdioma(pedido) ? pedido : (esIdioma(guardado) ? guardado : 'es');
  if (inicial !== 'es') void cambiarIdioma(inicial, false);
  if (esIdioma(pedido) || esIdioma(guardado) || leer(CLAVE_SUGERENCIA)) return;
  const nav = typeof navigator === 'undefined' ? [] : (navigator.languages?.length ? navigator.languages : [navigator.language]);
  const primero = String(nav[0] ?? '').toLowerCase();
  // Solo si su primer idioma es portugués o inglés (un hispanohablante con inglés de segunda no ve nada).
  if (primero.startsWith('pt')) sugerencia.value = 'pt';
  else if (primero.startsWith('en')) sugerencia.value = 'en';
}
/** El visitante cerró la sugerencia: no se vuelve a mostrar. */
export function cerrarSugerencia() {
  sugerencia.value = null;
  guardar(CLAVE_SUGERENCIA, '1');
}
/** Aviso de la sugerencia, en el idioma que se ofrece (sin bajar su diccionario). */
export const TEXTO_SUGERENCIA: Record<'en' | 'pt', { cambiar: string; cerrar: string; pregunta: string }> = {
  en: { cambiar: 'Yes, switch', cerrar: 'Close', pregunta: 'View in English?' },
  pt: { cambiar: 'Sim, mudar', cerrar: 'Fechar', pregunta: 'Ver em português?' },
};

/** `?lang=` para los enlaces entre la portada y el mapa (nada en español). */
export const consultaIdioma = (): Record<string, string> => (idiomaPedido.value === 'es' ? {} : { lang: idiomaPedido.value });

/**
 * Al abrir una vista: arranca el idioma (si aún no) y deja `?lang=` de la dirección igual al
 * idioma elegido (p. ej. al volver con «atrás» a una dirección con otro idioma).
 */
export function sincronizarIdioma(route: { query: LocationQuery }, reemplazar: (query: LocationQueryRaw) => unknown) {
  iniciarIdioma(route.query.lang);
  const lang = consultaIdioma().lang;
  if ((route.query.lang ?? undefined) !== lang) void reemplazar({ ...route.query, lang });
}

/** Texto de la interfaz en el idioma que se ve. */
export function t(clave: ClaveTexto, params?: Record<string, number | string>): string {
  const i = idioma.value;
  let texto: string = (i === 'es' ? undefined : cargados[i]?.textos[clave]) ?? clave;
  if (texto.includes('|')) {
    const [uno = '', varios = uno] = texto.split('|');
    texto = params?.n === 1 ? uno : varios;
  }
  return params ? texto.replaceAll(/\{(\w+)\}/g, (m, k: string) => (k in params ? String(params[k]) : m)) : texto;
}

/** Nombre de una de las 10 categorías del afiche en el idioma que se ve; cualquier otra, tal cual. */
export function nombreCategoria(nombre: null | string | undefined): string {
  const n = nombre ?? '';
  const i = idioma.value;
  return (i === 'es' ? undefined : cargados[i]?.categorias.get(clavePlana(n))) ?? n;
}

/** Traducción por defecto de un texto por defecto de la portada (o `undefined`). */
export function fraseTraducida(es: string, i: Idioma = idioma.value): string | undefined {
  return i === 'es' ? undefined : cargados[i]?.frases.get(clavePlana(es));
}

// ------------------------------------------------------------------ números y fechas

const formatos = new Map<string, Intl.DateTimeFormat>();
function formato(i: Idioma, opciones: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const clave = `${i}${JSON.stringify(opciones)}`;
  let f = formatos.get(clave);
  if (!f) { f = new Intl.DateTimeFormat(LOCALE[i], opciones); formatos.set(clave, f); }
  return f;
}

export const numero = (n: number) => n.toLocaleString(locale.value);
export const diaSemana = (d: Date) => formato(idioma.value, { weekday: 'long' }).format(d);
export const nombreMes = (d: Date) => formato(idioma.value, { month: 'long' }).format(d);
/** Mes corto: «nov» (es), «Nov» (en), «nov.» (pt). */
const mesCorto = (d: Date, i: Idioma) => {
  const m = formato(i, { month: 'short' }).format(d);
  return i === 'es' ? m.replaceAll('.', '') : m;
};

/** «13 nov» · «Nov 13» · «13 de nov.» */
export function fechaCorta(d: Date, i: Idioma = idioma.value): string {
  if (i === 'en') return `${mesCorto(d, i)} ${d.getDate()}`;
  return `${d.getDate()}${i === 'pt' ? ' de' : ''} ${mesCorto(d, i)}`;
}

/** «13 y 14 nov» · «Nov 13–14» · «13 e 14 de nov.» (si cambia de mes, cada fecha completa). */
export function rangoFechas(dias: Date[], i: Idioma = idioma.value): string {
  if (dias.length === 0) return '';
  const ultimo = dias.at(-1)!;
  if (dias.length === 1) return fechaCorta(ultimo, i);
  const mismoMes = dias.every((d) => d.getMonth() === ultimo.getMonth() && d.getFullYear() === ultimo.getFullYear());
  if (!mismoMes) return dias.map((d) => fechaCorta(d, i)).join(i === 'en' ? ', ' : ' · ');
  const nums = dias.map((d) => d.getDate());
  if (i === 'en') {
    const seguidos = nums.every((n, k) => k === 0 || n === nums[k - 1]! + 1);
    return `${mesCorto(ultimo, i)} ${seguidos ? `${nums[0]}–${nums.at(-1)}` : nums.join(', ')}`;
  }
  const y = i === 'pt' ? 'e' : 'y';
  return `${nums.slice(0, -1).join(', ')} ${y} ${fechaCorta(ultimo, i)}`;
}

/** Hora «15:00» tal cual en es/pt y «3:00 PM» en inglés. */
export function hora(hhmm: string): string {
  if (idioma.value !== 'en') return hhmm;
  const [h, m] = hhmm.split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return hhmm;
  return formato('en', { hour: 'numeric', minute: '2-digit' }).format(new Date(2000, 0, 1, h, m));
}
