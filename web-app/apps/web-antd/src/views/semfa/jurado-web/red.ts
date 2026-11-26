/**
 * Acceso a la API para la app web ligera del jurado (`/evaluar`): `fetch` directo, sin
 * `requestClient` ni nada de la administración (importarlos cargaría todo el panel).
 *
 * Todas las peticiones tienen tope de tiempo: con la red saturada de la feria una petición
 * colgada no debe dejar al jurado esperando. Un error de red llega como `ErrorApi` con
 * `status` 0; uno del servidor, con su código y el `mensaje` de `ApiResponse`.
 */

/** Base de la API: en producción la define `_app-config.js`; en desarrollo, la variable de entorno. */
export const apiURL: string =
  (import.meta.env.PROD
    ? (window as unknown as { _VBEN_ADMIN_PRO_APP_CONF_?: { VITE_GLOB_API_URL?: string } })._VBEN_ADMIN_PRO_APP_CONF_
        ?.VITE_GLOB_API_URL
    : undefined) ??
  import.meta.env.VITE_GLOB_API_URL ??
  '/api';

export class ErrorApi extends Error {
  /** Código HTTP; 0 = sin respuesta (sin señal, tiempo agotado). */
  readonly status: number;

  constructor(status: number, mensaje: string) {
    super(mensaje);
    this.status = status;
  }
}

export const esErrorDeRed = (e: unknown) => !(e instanceof ErrorApi) || e.status === 0 || e.status >= 500;

const POR_ESTADO: Record<number, string> = {
  400: 'Datos no válidos.',
  401: 'Tu sesión venció: vuelve a ingresar.',
  403: 'No tienes permiso para esto.',
  404: 'No se encontró.',
  409: 'No se puede hacer en este momento.',
};

export interface Respuesta<T> {
  /** `null` si el servidor respondió 304 (nada cambió). */
  data: null | T;
  etag: null | string;
  status: number;
}

export interface OpcionesPedido {
  cuerpo?: unknown;
  etag?: null | string;
  metodo?: 'GET' | 'POST';
  /** Tope de espera en milisegundos (por defecto 15 s). */
  ms?: number;
  token?: null | string;
}

/** Avisa a quien escuche (la sincronización) si hubo o no respuesta del servidor. */
type Oyente = (conectado: boolean, status: number) => void;
const oyentes = new Set<Oyente>();
export function alResponder(oyente: Oyente) {
  oyentes.add(oyente);
  return () => oyentes.delete(oyente);
}
function notificar(conectado: boolean, status: number) {
  for (const o of oyentes) o(conectado, status);
}

export async function pedir<T>(ruta: string, op: OpcionesPedido = {}): Promise<Respuesta<T>> {
  const control = new AbortController();
  const reloj = setTimeout(() => control.abort(), op.ms ?? 15_000);
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (op.cuerpo !== undefined) headers['Content-Type'] = 'application/json';
  if (op.token) headers.Authorization = `Bearer ${op.token}`;
  if (op.etag) headers['If-None-Match'] = op.etag;

  let respuesta: Response;
  try {
    respuesta = await fetch(`${apiURL}${ruta}`, {
      body: op.cuerpo === undefined ? undefined : JSON.stringify(op.cuerpo),
      // Sin caché del navegador: el ETag lo manejamos nosotros (y el 304 llega tal cual).
      cache: 'no-store',
      credentials: 'omit',
      headers,
      method: op.metodo ?? 'GET',
      signal: control.signal,
    });
  } catch {
    notificar(false, 0);
    throw new ErrorApi(0, 'Sin conexión con el servidor.');
  } finally {
    clearTimeout(reloj);
  }
  // 502/503/504: el proxy no llegó al servidor (red saturada): para el jurado es «sin señal».
  notificar(respuesta.status < 502 || respuesta.status > 504, respuesta.status);

  const etag = respuesta.headers.get('ETag');
  if (respuesta.status === 304) return { data: null, etag: etag ?? op.etag ?? null, status: 304 };

  let json: null | { data?: T; mensaje?: string; ok?: boolean } = null;
  try {
    json = await respuesta.json();
  } catch {
    // Cuerpo vacío o no JSON (p. ej. página de error del proxy).
  }
  if (!respuesta.ok || json?.ok === false) {
    const status = respuesta.ok ? 400 : respuesta.status;
    throw new ErrorApi(status, json?.mensaje || POR_ESTADO[status] || `Error del servidor (${status}).`);
  }
  return { data: (json?.data ?? null) as null | T, etag, status: respuesta.status };
}
