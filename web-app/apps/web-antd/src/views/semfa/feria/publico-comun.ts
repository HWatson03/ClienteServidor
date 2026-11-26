/**
 * Lo que comparten la portada (`/fexcoin-vivo`) y el mapa (`/fexcoin-vivo/mapa`) sin traer Leaflet:
 * la foto guardada en el teléfono (la portada la deja lista para que el mapa abra al instante),
 * el texto de cada jornada y las rutas entre ambas vistas.
 */
import type { FeriaPublica } from '#/api/feria-publico';
import type { LocationQuery } from 'vue-router';

import { fechaLocal } from '#/utils/formato';

import { consultaIdioma, fechaCorta, t } from './i18n';

/** Escudo UAP liviano (96 px, 5 KB; el `favicon_uap.png` de 28 KB es para la administración). */
export const ESCUDO = `${import.meta.env.BASE_URL}fexcoin/escudo-96.webp`;
/** Misma clave en ambas vistas: un visitante cuenta una sola vez. */
export const CLAVE_VISITANTE = 'semfa-feria-visitante';

export const actividadPedida = (q: LocationQuery) => (Number(q.actividad) > 0 ? Number(q.actividad) : null);
export const claveFoto = (idPedido: null | number) => `semfa-feria-foto${idPedido ? `:${idPedido}` : ''}`;

export interface FotoGuardada { etag: null | string; foto: FeriaPublica; hora: number }

export function leerFotoGuardada(clave: string): FotoGuardada | null {
  try {
    const crudo = localStorage.getItem(clave);
    if (!crudo) return null;
    const c = JSON.parse(crudo) as FotoGuardada;
    return c?.foto?.stands && c.foto.mapa ? c : null;
  } catch { return null; /* caché ilegible o almacenamiento bloqueado */ }
}

export function guardarFoto(clave: string, foto: FeriaPublica | null, etag: null | string, hora: number) {
  try {
    if (foto) localStorage.setItem(clave, JSON.stringify({ etag, foto, hora }));
    else localStorage.removeItem(clave);
  } catch { /* lleno o bloqueado: solo no se recuerda */ }
}

/** «Día 1 · 13 nov» («Day 1 · Nov 13», «Dia 1 · 13 de nov.») a partir de la fecha de la actividad. */
export function textoJornada(fechaActividad: null | string | undefined, j: null | number | undefined): string {
  const n = j ?? 1;
  const base = fechaLocal(fechaActividad);
  if (!base) return t('Día {n}', { n });
  base.setDate(base.getDate() + n - 1);
  return `${t('Día {n}', { n })} · ${fechaCorta(base)}`;
}

/** Ruta al mapa, con el stand elegido, la actividad pedida (si la hay) y el idioma (si no es español). */
export function rutaMapa(q: LocationQuery, stand?: number) {
  const query: Record<string, string> = {};
  if (actividadPedida(q)) query.actividad = String(q.actividad);
  if (stand) query.stand = String(stand);
  return { path: '/fexcoin-vivo/mapa', query: { ...query, ...consultaIdioma() } };
}
export function rutaPortada(q: LocationQuery) {
  return { path: '/fexcoin-vivo', query: { ...(actividadPedida(q) ? { actividad: String(q.actividad) } : {}), ...consultaIdioma() } };
}

/** «FEXCOIN» con la O como foco y el resto del nombre («ECUANA V5») aparte. */
export function partesLogo(nombre: null | string | undefined) {
  const limpio = (nombre || 'FEXCOIN ECUANA V5').trim();
  const [palabra = '', ...resto] = limpio.split(/\s+/);
  const i = palabra.toUpperCase().indexOf('O');
  return { antes: i < 0 ? palabra : palabra.slice(0, i), despues: i < 0 ? '' : palabra.slice(i + 1), foco: i >= 0, nombre: limpio, resto: resto.join(' ') };
}
