/**
 * Mapa de la feria (FEXCOIN): editor de stands y portada (`/api/feria/admin/**`, ADMIN) con
 * `requestClient`. La parte pública vive en `feria-publico.ts` (se reexporta aquí).
 */
import type { EstadoStand, LimitesFeria, MapaFeria, PortadaFeria, ZonaFeria } from './feria-publico';

import { requestClient } from '#/api/request';

export * from './feria-publico';

export interface StandAdmin {
  idInscripcion: number;
  stand: null | string;
  proyecto: null | string;
  idCategoria: number;
  categoria: string;
  carrera: null | string;
  jornada: null | number;
  lat: null | number;
  lng: null | number;
  ancho: number;
  alto: number;
  rotacion: number;
  estado: EstadoStand;
}

export interface FeriaAdmin {
  idActividad: number;
  actividad: string;
  jornadas: number;
  mapa: MapaFeria;
  categorias: { id: number; nombre: string; color: string }[];
  stands: StandAdmin[];
  visitas: number;
}

export interface ConfigFeriaRequest {
  centroLat: number;
  centroLng: number;
  zoom: number;
  limites: LimitesFeria | null;
  lema: null | string;
  urlFacebook: null | string;
  urlTransmision: null | string;
  zonas: null | ZonaFeria[];
  /** idCategoria → `#rrggbb`. */
  colores: Record<string, string>;
  publicado: boolean;
}

/** `lat: null` quita el stand del mapa; `stand` es su número (se guarda en la inscripción). */
export interface StandFeriaRequest {
  idInscripcion: number;
  stand: null | string;
  lat: null | number;
  lng: null | number;
  ancho: number;
  alto: number;
  rotacion: number;
}

export const obtenerFeriaAdmin = (idActividad: number) =>
  requestClient.get<FeriaAdmin>(`/feria/admin/${idActividad}`);

/** Reemplaza toda la configuración (los campos que falten quedan vacíos). */
export const guardarConfigFeria = (idActividad: number, config: ConfigFeriaRequest) =>
  requestClient.put<FeriaAdmin>(`/feria/admin/${idActividad}/config`, config);

/** Guarda en bloque solo los stands enviados. */
export const guardarStandsFeria = (idActividad: number, stands: StandFeriaRequest[]) =>
  requestClient.put<FeriaAdmin>(`/feria/admin/${idActividad}/stands`, stands);

export interface PrecargaTeselas { total: number; yaEstaban: number; enCola: number }

/** Baja al servidor todas las teselas del área del mapa (zoom `desde`–19) para servirlas sin OSM. */
export const precargarTeselasFeria = (idActividad: number, desde = 15) =>
  requestClient.post<PrecargaTeselas>(`/feria/admin/${idActividad}/teselas/precargar?desde=${desde}`);

/** Guarda solo la portada (no toca mapa, stands ni publicación). `null` = volver a los textos por defecto. */
export const guardarPortadaFeria = (idActividad: number, portada: null | PortadaFeria) =>
  requestClient.put<FeriaAdmin>(`/feria/admin/${idActividad}/portada`, { portada });

export interface FotoSubida { nombre: string; url: string; urlPequena: string; ancho: number; alto: number }

type AlProgreso = (porcentaje: number) => void;
const progreso = (alProgreso?: AlProgreso) => (e: { loaded: number; total?: number }) => {
  if (alProgreso && e.total) alProgreso(Math.round((e.loaded / e.total) * 100));
};

/** Sube una foto (JPG/PNG ≤ 15 MB); el servidor la guarda a 2400 px y una liviana a 900 px. */
export function subirFotoFeria(idActividad: number, archivo: File, alProgreso?: AlProgreso) {
  const datos = new FormData();
  datos.append('archivo', archivo);
  return requestClient.post<FotoSubida>(`/feria/admin/${idActividad}/fotos`, datos, {
    headers: { 'Content-Type': 'multipart/form-data' }, onUploadProgress: progreso(alProgreso), timeout: 180_000,
  });
}

export interface VideoSubido { nombre: string; url: string; bytes: number }

/** Sube un video MP4/WebM (≤ 80 MB) tal cual: conviene que ya venga en 720p. */
export function subirVideoFeria(idActividad: number, archivo: File, alProgreso?: AlProgreso) {
  const datos = new FormData();
  datos.append('archivo', archivo);
  return requestClient.post<VideoSubido>(`/feria/admin/${idActividad}/videos`, datos, {
    headers: { 'Content-Type': 'multipart/form-data' }, onUploadProgress: progreso(alProgreso), timeout: 15 * 60_000,
  });
}

/** Borra una foto o un video subido (por su nombre, sin extensión). */
export const borrarFotoFeria = (idActividad: number, nombre: string) =>
  requestClient.delete<void>(`/feria/admin/${idActividad}/fotos/${encodeURIComponent(nombre)}`);
