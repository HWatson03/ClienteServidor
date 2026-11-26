/**
 * Parte PÚBLICA del mapa de la feria (`/api/feria/publico/**`): tipos y `fetch` directo, sin
 * `requestClient`, sin JWT y sin nada de la administración. La usan las pantallas públicas
 * `/fexcoin-vivo` y `/fexcoin-vivo/mapa`, que se construyen como página aparte (`feria.html`):
 * importar aquí el cliente de la administración las haría cargar todo el panel (~500 KB).
 */

/**
 * Base de la API: en producción la define `_app-config.js` (la misma que usa la administración);
 * en desarrollo, la variable de entorno. Igual que `useAppConfig` de vben, sin importarlo.
 */
const apiURL: string = (import.meta.env.PROD
  ? (window as unknown as { _VBEN_ADMIN_PRO_APP_CONF_?: { VITE_GLOB_API_URL?: string } })._VBEN_ADMIN_PRO_APP_CONF_?.VITE_GLOB_API_URL
  : undefined) ?? import.meta.env.VITE_GLOB_API_URL ?? '/api';
/** `E` evaluado (todos sus jurados terminaron), `P` en evaluación, `N` pendiente. */
export type EstadoStand = 'E' | 'N' | 'P';

export interface LimitesFeria { sur: number; oeste: number; norte: number; este: number }

/** Zona de referencia del plano (escenario, ingreso, baños…). Su forma la define el editor. */
export interface ZonaFeria {
  id: string;
  /** `rect` = área con borde; `etiqueta` = solo texto (el rectángulo marca su tamaño). */
  tipo: 'etiqueta' | 'rect';
  nombre: string;
  lat: number;
  lng: number;
  ancho: number;
  alto: number;
  rotacion: number;
  color: string;
}

export interface MapaFeria {
  centroLat: number;
  centroLng: number;
  zoom: number;
  limites: LimitesFeria | null;
  lema: null | string;
  urlFacebook: null | string;
  urlTransmision: null | string;
  zonas: null | ZonaFeria[];
  publicado: boolean;
  /** Contenido de la portada de la página pública (JSON libre); `null` = textos por defecto. */
  portada?: null | PortadaFeria;
}

/** Un día de la agenda de la portada. `fecha` en `yyyy-MM-dd`. */
export interface DiaPortada {
  fecha: string;
  titulo: string;
  descripcion?: string;
  items?: string[];
  nota?: string;
  /** Se muestra además en su propia sección (p. ej. «Sábado 14 · Día de los barrios»). */
  destacado?: boolean;
}
/** Foto de la portada: URLs relativas a `/api/...` (ver `resolverUrlApi`). */
export interface FotoPortada { url: string; urlPequena?: string; texto?: string; nombre?: string; ancho?: number; alto?: number }

/**
 * Elemento de la galería de la portada:
 * - `foto`: subida (grande + liviana).
 * - `video`: MP4/WebM subido (`url` = `/api/feria/publico/videos/...`).
 * - `enlace`: reel o video de Facebook, o video de YouTube (se incrusta solo al tocar ▶).
 * `portada` = foto opcional que se muestra antes de reproducir un video o enlace.
 */
export interface MedioPortada extends FotoPortada {
  tipo: 'enlace' | 'foto' | 'video';
  portada?: FotoPortada | null;
  /** Video vertical (reel o short, 9:16). */
  vertical?: boolean;
}

/** Textos comunes de cada sección de la portada; `mostrar: false` la oculta. */
export interface SeccionPortada { mostrar?: boolean; titulo?: string; descripcion?: string }

export interface PortadaFeria {
  /** 2 = formato por secciones. Sin versión = formato anterior (eslogan, fotos…), que se sigue leyendo. */
  version?: number;
  /** @deprecated formato 1: ahora `hero.titulo` + `hero.tituloRojo`. */
  eslogan?: string;
  /** @deprecated formato 1: parte del eslogan que iba en rojo. */
  resaltado?: string;
  /** @deprecated formato 1: ahora `hero.descripcion`. */
  subtitulo?: string;
  /** Inicio de la feria `yyyy-MM-ddTHH:mm` (hora local), para la cuenta regresiva. */
  inicio?: string;
  horario?: string;
  lugar?: string;
  organiza?: string;
  dias?: DiaPortada[];
  /** @deprecated formato 1: ahora `medios`. */
  fotos?: FotoPortada[];
  /** idInscripcion de los proyectos destacados, en orden. */
  destacados?: number[];
  hero?: SeccionPortada & { tituloRojo?: string; lema?: string; frase?: string; contador?: boolean };
  galeria?: SeccionPortada;
  medios?: MedioPortada[];
  acciones?: SeccionPortada;
  /** Mapa público: apagado = `/fexcoin-vivo/mapa` muestra «en preparación» y la portada «Mapa · muy pronto». */
  mapa?: { publicar?: boolean; titulo?: string; texto?: string };
  agenda?: SeccionPortada;
  proyectos?: SeccionPortada & {
    /** Mostrar los proyectos al público; apagado = mensaje «se están preparando». */
    publicar?: boolean;
    preparandoTitulo?: string;
    preparandoTexto?: string;
    /** Cifra que se anuncia («400» → «más de 400 proyectos»). */
    cifra?: string;
    /** Categorías que se anuncian mientras se preparan los proyectos. */
    categorias?: string[];
    destacadosTitulo?: string;
    todosTitulo?: string;
  };
  pie?: SeccionPortada;
  /**
   * Traducciones que carga el administrador (inglés y portugués), con la forma de los textos de
   * arriba; lo que falta se muestra con la traducción sugerida (si el español es el por defecto) o
   * en español. Ver `traducirPortada` en `views/semfa/feria/portada.ts`.
   */
  traducciones?: Partial<Record<'en' | 'pt', TextosPortada>>;
}

type TextosSeccion = { descripcion?: string; titulo?: string };
/** Textos traducibles de la portada. Los días van por su fecha y los pies de los medios por su `url`. */
export interface TextosPortada {
  horario?: string;
  organiza?: string;
  hero?: TextosSeccion & { frase?: string; lema?: string; tituloRojo?: string };
  galeria?: TextosSeccion;
  acciones?: TextosSeccion;
  mapa?: { texto?: string; titulo?: string };
  agenda?: TextosSeccion;
  proyectos?: TextosSeccion & { destacadosTitulo?: string; preparandoTexto?: string; preparandoTitulo?: string; todosTitulo?: string };
  pie?: TextosSeccion;
  /** Por fecha del día (`yyyy-MM-dd`); `items` en el mismo orden que en español. */
  dias?: Record<string, { descripcion?: string; items?: string[]; nota?: string; titulo?: string }>;
  /** Pie de cada foto o video, por su `url`. */
  medios?: Record<string, string>;
}

export interface ResumenFeria { total: number; evaluados: number; enEvaluacion: number; pendientes: number }

export interface StandPublico {
  /** idInscripcion. */
  id: number;
  stand: null | string;
  proyecto: null | string;
  idCategoria: number;
  carrera: null | string;
  facultad: null | string;
  siglaFacultad: null | string;
  jornada: null | number;
  docente: null | string;
  integrantes: string[];
  lat: null | number;
  lng: null | number;
  ancho: number;
  alto: number;
  rotacion: number;
  estado: EstadoStand;
}

export interface FeriaPublica {
  actividad: { id: number; nombre: string; descripcion: null | string; fecha: null | string; fechaFin: null | string; jornadas: number };
  mapa: MapaFeria;
  categorias: { id: number; nombre: string; color: string; proyectos: number }[];
  stands: StandPublico[];
  resumen: ResumenFeria;
  actualizado: null | string;
}

export interface EstadosFeria {
  idActividad: number;
  estados: Record<string, EstadoStand>;
  resumen: ResumenFeria;
  visitas: number;
  actualizado: null | string;
}

/** Respuesta condicional: `sinCambios` = 304 (lo guardado sigue vigente). */
export interface RespuestaEtag<T> { datos: T; etag: null | string; sinCambios: boolean }


const consultaActividad = (actividad?: null | number) => (actividad ? `?actividad=${actividad}` : '');

async function obtenerConEtag<T>(ruta: string, etag?: null | string, senal?: AbortSignal): Promise<RespuestaEtag<null | T>> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  // Con `If-None-Match` el navegador no usa su caché y nos entrega el 304 tal cual.
  if (etag) headers['If-None-Match'] = etag;
  const respuesta = await fetch(`${apiURL}${ruta}`, { credentials: 'omit', headers, signal: senal });
  if (respuesta.status === 304) return { datos: null, etag: etag ?? null, sinCambios: true };
  if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);
  const cuerpo = await respuesta.json() as { data: null | T; ok: boolean };
  if (!cuerpo.ok) throw new Error('Respuesta no válida');
  return { datos: cuerpo.data, etag: respuesta.headers.get('ETag'), sinCambios: false };
}

/** Foto completa del mapa publicado (`datos: null` si no hay ninguno). */
export const obtenerFeriaPublica = (actividad?: null | number, etag?: null | string, senal?: AbortSignal) =>
  obtenerConEtag<FeriaPublica>(`/feria/publico${consultaActividad(actividad)}`, etag, senal);

/** Solo el estado de cada stand, el resumen y las visitas (liviano). */
export const obtenerEstadosFeria = (actividad?: null | number, etag?: null | string, senal?: AbortSignal) =>
  obtenerConEtag<EstadosFeria>(`/feria/publico/estados${consultaActividad(actividad)}`, etag, senal);

/** Stream SSE: evento `estados` ({ok, data: EstadosFeria}) y `mapa` (volver a pedir la foto). */
export const urlStreamFeria = (actividad?: null | number) => `${apiURL}/feria/publico/stream${consultaActividad(actividad)}`;

/** Cuenta este navegador (identificador anónimo) y devuelve el total de visitantes únicos. */
export async function registrarVisitaFeria(visitante: string, actividad?: null | number): Promise<number> {
  const respuesta = await fetch(`${apiURL}/feria/publico/visita`, {
    body: JSON.stringify({ actividad: actividad ?? null, visitante }), credentials: 'omit', method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
  });
  if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);
  const cuerpo = await respuesta.json() as { data: number; ok: boolean };
  return cuerpo.data;
}

// ------------------------------------------------------------------ administración

/** Plantilla de teselas servidas (y cacheadas) por SEMFA; ver `capa-teselas.ts`. */
export const URL_TESELAS_FERIA = `${apiURL}/feria/publico/teselas`;

/**
 * Registra el service worker de `/fexcoin-vivo` (`resources/feria-sw.js` en el backend):
 * con la red caída, recargar la página sigue mostrando el mapa. Solo en
 * producción (en desarrollo cachearía los módulos de Vite) y con alcance
 * `/fexcoin-vivo`, así no controla la administración ni el jurado.
 */
export function registrarServiceWorkerFeria() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator) || !window.isSecureContext) return;
  navigator.serviceWorker.register(`${apiURL}/feria/publico/sw.js`, { scope: '/fexcoin-vivo' })
    .catch(() => { /* sin SW la página funciona igual */ });
}

/**
 * Las URLs de fotos llegan como `/api/feria/...`: se resuelven con la misma base que el resto de
 * la API pública (en producción es el mismo origen; en otros despliegues puede ser absoluta).
 */
export function resolverUrlApi(url: null | string | undefined): string {
  if (!url) return '';
  if (/^(https?:)?\/\//.test(url) || url.startsWith('data:') || url.startsWith('blob:')) return url;
  if (url.startsWith('/api/')) return `${apiURL.replace(/\/$/, '')}${url.slice(4)}`;
  return url;
}
