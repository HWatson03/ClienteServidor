import { requestClient } from '#/api/request';

/**
 * `api/dto/ActividadResponse.java`: los mismos nombres que tenía la entidad, pero
 * `fecha` llega como `yyyy-MM-dd` (antes era un instante UTC que podía mostrarse
 * un día antes en La Paz).
 */
export interface Actividad {
  descripcion: null | string;
  estado: string;
  /**
   * Fase de la evaluación. Solo con `ABIERTA` los jurados la ven en su app y
   * pueden calificar. Las actividades antiguas llegan como `ABIERTA`.
   */
  estadoEvaluacion: EstadoEvaluacionActividad;
  /** `yyyy-MM-dd`, o `null` si no tiene fecha. */
  fecha: null | string;
  /** Último día (`yyyy-MM-dd`) si dura varios; `null` = un solo día. */
  fechaFin: null | string;
  idActividad: number;
  /** Días que dura (1 sin `fechaFin`): los proyectos se reparten por jornada. */
  jornadas: number;
  /**
   * Día (1..`jornadas`) que evalúa el jurado ahora: su app solo trae los proyectos
   * de ese día. `null` = todos los proyectos.
   */
  jornadaEnCurso: null | number;
  /** Participantes por institución: máximo (bloquea al inscribir) y mínimo (solo avisa). `null` = sin regla. */
  maxPorInstitucion: null | number;
  minPorInstitucion: null | number;
  nombre: string;
  tipo: null | string;
}

export type EstadoEvaluacionActividad = 'ABIERTA' | 'CERRADA' | 'EN_PREPARACION';

/**
 * `api/dto/ActividadRequest.java`. El backend exige `nombre` y valida `fecha`;
 * el id va en la URL del `PUT`.
 */
export interface ActividadForm {
  descripcion: string;
  fecha: string;
  /** Vacío = un día. No puede ser anterior a `fecha`. */
  fechaFin: string;
  idActividad?: number;
  maxPorInstitucion?: null | number;
  minPorInstitucion?: null | number;
  nombre: string;
  tipo: string;
}

/** `GET /api/actividades` — lista las actividades activas (`estado = 'A'`). */
export async function listarActividades() {
  return requestClient.get<Actividad[]>('/actividades');
}

/** `GET /api/actividades/{id}` — usado para recargar el registro en edición. */
export async function obtenerActividad(id: number) {
  return requestClient.get<Actividad>(`/actividades/${id}`);
}

/** `POST /api/actividades` — 400 sin nombre o con fecha mal formada; 409 si el nombre ya existe. */
export async function crearActividad(data: ActividadForm) {
  return requestClient.post<Actividad>('/actividades', data);
}

/** `PUT /api/actividades/{id}` — actualiza la actividad indicada. */
export async function actualizarActividad(id: number, data: ActividadForm) {
  return requestClient.put<Actividad>(`/actividades/${id}`, data);
}

/** `DELETE /api/actividades/{id}` — borrado lógico: el backend pone `estado = 'X'`. */
export async function eliminarActividad(id: number) {
  return requestClient.delete<void>(`/actividades/${id}`);
}

/**
 * `PUT /api/actividades/{id}/estado-evaluacion` — abre, cierra o vuelve a poner en
 * preparación la evaluación. Las evaluaciones guardadas no se tocan.
 */
export async function cambiarEstadoEvaluacion(id: number, estado: EstadoEvaluacionActividad) {
  return requestClient.put<Actividad>(`/actividades/${id}/estado-evaluacion`, { estado });
}

/**
 * `PUT /api/actividades/{id}/jornada-en-curso` — en una actividad de varios días,
 * el día que evalúa el jurado ahora (`null` = todos los proyectos). 400 si el día
 * pasa de las jornadas de la actividad. Los resultados siguen contando todos.
 */
export async function cambiarJornadaEnCurso(id: number, jornada: null | number) {
  return requestClient.put<Actividad>(`/actividades/${id}/jornada-en-curso`, { jornada });
}

export type PasoActividad =
  | 'carreras'
  | 'categorias'
  | 'jornadas'
  | 'jurados'
  | 'notas'
  | 'orden'
  | 'participantes'
  | 'rubricas';

/** `api/dto/ResumenActividadResponse.java`. */
export interface ResumenActividad {
  avisos: { mensaje: string; nivel: 'ADVERTENCIA' | 'ERROR' | 'INFO'; paso: PasoActividad }[];
  categorias: {
    criterios: number;
    evaluacionesEsperadas: number;
    evaluacionesHechas: number;
    idCategoria: number;
    inscritos: number;
    jurados: number;
    nombre: string;
    puntajeMaximo: number;
    rubricas: number;
    sinOrden: number;
  }[];
  estadoEvaluacion: EstadoEvaluacionActividad;
  idActividad: number;
  /** Sin avisos de nivel `ERROR`. */
  lista: boolean;
  nombre: string;
  totales: {
    categorias: number;
    evaluacionesEsperadas: number;
    evaluacionesHechas: number;
    inscritos: number;
    jurados: number;
    rubricas: number;
  };
}

/** `GET /api/actividades/{id}/resumen` — qué tiene configurado y qué falta para evaluar. */
export async function obtenerResumenActividad(id: number) {
  return requestClient.get<ResumenActividad>(`/actividades/${id}/resumen`);
}
