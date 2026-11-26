import { useAppConfig } from '@vben/hooks';

import { requestClient } from '#/api/request';

export interface PuntoPlano { x: number; y: number; latitud: number; longitud: number }
export interface PuntoImagen { x: number; y: number }
export interface PuntoGps { latitud: number; longitud: number }
export interface ReferenciaDanza {
  id: number; nombre: string; figura: 'CIRCULO' | 'RECTANGULO' | 'TRIANGULO';
  tamanoMetros: number; altoMetros: null | number; latitud: number; longitud: number;
}
export type ReferenciaDanzaRequest = Omit<ReferenciaDanza, 'id'>;
export interface PlanoDanza { a: PuntoPlano; b: PuntoPlano; c: null | PuntoPlano; meta: null | PuntoImagen; ruta: PuntoImagen[] }
export interface PosicionDanza {
  id: number; participanteId: number; danza: string; usuarioId: number; responsable: string;
  orden: number; colorMarcador: string;
  compartiendo: boolean; latitud: null | number; longitud: null | number;
  precisionMetros: null | number; ultimaUbicacion: null | string;
  puedeEnviarVoz: boolean; puedeAvisar: boolean; puedeVozGlobal: boolean;
}
export interface OpcionesDanza {
  danzas: { id: number; nombre: string }[];
  acompanantes: { id: number; nombre: string }[];
}
export interface EnlaceActividad {
  id: number; actividadId: number; usuarioId: number; responsable: string;
  compartiendo: boolean; latitud: null | number; longitud: null | number;
  precisionMetros: null | number; ultimaUbicacion: null | string;
  puedeEnviarVoz: boolean; puedeAvisar: boolean; puedeVozGlobal: boolean;
}
export interface SeguimientoPublico {
  actividad: string;
  tamanoMarcadorPx: number;
  recorrido: PuntoGps[];
  danzas: {
    participanteId: number; danza: string; responsable: string; latitud: number; longitud: number;
    precisionMetros: number; ultimaUbicacion: string; enVivo: boolean; orden: number; colorMarcador: string;
  }[];
  enlace: null | { responsable: string; latitud: number; longitud: number;
    precisionMetros: number; ultimaUbicacion: string; enVivo: boolean };
  referencias: ReferenciaDanza[];
  actualizado: string;
}
export interface AvisoAcompanante {
  id: number; idAsignacion: number; tipo: 'APRESURARSE' | 'DETENERSE' | 'MAS_LENTO';
  mensaje: string; enviadoPor: string; creadoEn: string; leidoEn: null | string; canceladoEn: null | string;
}
export const obtenerSeguimientoPublico = (id: number) =>
  requestClient.get<SeguimientoPublico>(`/seguimiento-danzas/${id}/publico`);
export const listarAvisosDanza = (id: number) =>
  requestClient.get<AvisoAcompanante[]>(`/seguimiento-danzas/${id}/avisos`);
export const enviarAvisoDanza = (id: number, tipo: AvisoAcompanante['tipo']) =>
  requestClient.post<AvisoAcompanante>(`/seguimiento-danzas/asignaciones/${id}/avisos`, { tipo });
export const listarPosiciones = (id: number) => requestClient.get<PosicionDanza[]>(`/seguimiento-danzas/${id}`);
export const guardarTamanoMarcador = (id: number, tamanoMarcadorPx: number) =>
  requestClient.put<number>(`/seguimiento-danzas/${id}/estilo-mapa`, { tamanoMarcadorPx });
export const guardarColorMarcador = (id: number, colorMarcador: string) =>
  requestClient.put<PosicionDanza>(`/seguimiento-danzas/asignaciones/${id}/color`, { colorMarcador });
export const guardarOrdenAcompanantes = (id: number, asignaciones: number[]) =>
  requestClient.put<PosicionDanza[]>(`/seguimiento-danzas/${id}/orden`, asignaciones);
export const obtenerOpciones = (id: number) => requestClient.get<OpcionesDanza>(`/seguimiento-danzas/${id}/opciones`);
export const obtenerEnlace = (id: number) => requestClient.get<EnlaceActividad | null>(`/seguimiento-danzas/${id}/enlace`);
export const guardarEnlace = (id: number, usuarioId: number) => requestClient.put<EnlaceActividad>(`/seguimiento-danzas/${id}/enlace`, { usuarioId });
export const quitarEnlace = (id: number) => requestClient.delete<void>(`/seguimiento-danzas/${id}/enlace`);
export type PermisosComunicacion = Pick<PosicionDanza, 'puedeEnviarVoz' | 'puedeAvisar' | 'puedeVozGlobal'>;
export const guardarPermisosEnlace = (id: number, permisos: PermisosComunicacion) =>
  requestClient.put<EnlaceActividad>(`/seguimiento-danzas/${id}/enlace/permisos`, permisos);
export const guardarPermisosDanza = (id: number, permisos: PermisosComunicacion) =>
  requestClient.put<PosicionDanza>(`/seguimiento-danzas/asignaciones/${id}/permisos`, permisos);
export const obtenerPlano = (id: number) => requestClient.get<null | PlanoDanza>(`/seguimiento-danzas/${id}/plano`);
export const obtenerRecorrido = (id: number) => requestClient.get<PuntoGps[]>(`/seguimiento-danzas/${id}/recorrido`);
export const listarReferencias = (id: number) => requestClient.get<ReferenciaDanza[]>(`/seguimiento-danzas/${id}/referencias`);
export const crearReferencia = (id: number, datos: ReferenciaDanzaRequest) =>
  requestClient.post<ReferenciaDanza>(`/seguimiento-danzas/${id}/referencias`, datos);
export const actualizarReferencia = (id: number, datos: ReferenciaDanzaRequest) =>
  requestClient.put<ReferenciaDanza>(`/seguimiento-danzas/referencias/${id}`, datos);
export const eliminarReferencia = (id: number) => requestClient.delete<void>(`/seguimiento-danzas/referencias/${id}`);
export const guardarRecorrido = (id: number, ruta: PuntoGps[]) => requestClient.put<PuntoGps[]>(`/seguimiento-danzas/${id}/recorrido`, ruta);
export const guardarPlano = (id: number, plano: PlanoDanza) => requestClient.put<PlanoDanza>(`/seguimiento-danzas/${id}/plano`, plano);
export const asignarDanza = (id: number, participanteId: number, usuarioId: number) =>
  requestClient.post<PosicionDanza>(`/seguimiento-danzas/${id}/asignaciones`, { participanteId, usuarioId });
export const cambiarResponsableDanza = (id: number, usuarioId: number) =>
  requestClient.put<PosicionDanza>(`/seguimiento-danzas/asignaciones/${id}`, { usuarioId });
export const quitarAsignacion = (id: number) => requestClient.delete<void>(`/seguimiento-danzas/asignaciones/${id}`);

/** Vista pública `/en-vivo`: solo danza, color y posición (sin responsables). `null` si no hay recorrido. */
export interface SeguimientoEnVivo {
  actividad: string;
  recorrido: PuntoGps[];
  danzas: {
    id: number; danza: string; latitud: number; longitud: number;
    ultimaUbicacion: string; enVivo: boolean; orden: number; color: string;
  }[];
  referencias: ReferenciaDanza[];
  actualizado: string;
  /** Visitas acumuladas a la pantalla `/en-vivo`. */
  visitas: number;
}
const { apiURL } = useAppConfig(import.meta.env, import.meta.env.PROD);
/** Stream SSE público de `/en-vivo` (evento `foto` con el mismo cuerpo que `obtenerEnVivo`). */
export const URL_EN_VIVO_STREAM = `${apiURL}/seguimiento-danzas/en-vivo/stream`;
/**
 * `fetch` directo, sin `requestClient`: la pantalla es anónima (no envía el JWT de quien la abra)
 * y consulta cada 3 s, así que un corte de red no debe convertirse en un aviso por consulta.
 */
export async function obtenerEnVivo(senal?: AbortSignal): Promise<null | SeguimientoEnVivo> {
  const respuesta = await fetch(`${apiURL}/seguimiento-danzas/en-vivo`, {
    credentials: 'omit', headers: { Accept: 'application/json' }, signal: senal,
  });
  if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);
  const cuerpo = await respuesta.json() as { data: null | SeguimientoEnVivo; ok: boolean };
  if (!cuerpo.ok) throw new Error('Respuesta no válida');
  return cuerpo.data;
}

/**
 * Registra al visitante de `/en-vivo` y devuelve el total de visitantes únicos. `visitante` es el
 * identificador anónimo de este navegador: el servidor lo cuenta una sola vez (recargar no suma).
 */
export async function registrarVisitaEnVivo(visitante: string): Promise<number> {
  const respuesta = await fetch(`${apiURL}/seguimiento-danzas/en-vivo/visita`, {
    body: JSON.stringify({ visitante }), credentials: 'omit', method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
  });
  if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);
  const cuerpo = await respuesta.json() as { data: number; ok: boolean };
  return cuerpo.data;
}
