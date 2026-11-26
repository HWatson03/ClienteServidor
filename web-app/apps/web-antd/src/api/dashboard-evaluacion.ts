import { requestClient } from '#/api/request';

/**
 * `api/dto/DashboardEvaluacionResponse.java`: el monitoreo de la evaluación de
 * una actividad, ya calculado en `DashboardEvaluacionService`.
 *
 * Solo cuentan inscripciones, evaluaciones, asignaciones y rúbricas vivas. El
 * `promedio` de un proyecto es la media de los totales de los jurados que
 * completaron todas las rúbricas; esperadas = jurados asignados × rúbricas.
 */
export interface DashboardEvaluacion {
  actividad: { fecha: null | string; idActividad: number; nombre: string };
  categorias: DashboardCategoria[];
  jurados: DashboardJurado[];
  resumen: DashboardResumen;
}

export interface DashboardResumen {
  completos: number;
  enProceso: number;
  evaluacionesEsperadas: number;
  evaluacionesHechas: number;
  proyectos: number;
  sinIniciar: number;
  sinJurados: number;
}

export interface DashboardCategoria {
  carrera: null | string;
  completos: number;
  evaluacionesEsperadas: number;
  evaluacionesHechas: number;
  filas: DashboardFila[];
  idCategoria: number;
  /** Asignados primero; `asignado: false` = evaluó aquí pero ya no está asignado. */
  jurados: { asignado: boolean; idJurado: number; nombre: string }[];
  nivel: null | string;
  nombre: string;
  proyectos: number;
  /** Rúbricas por proyecto (de la categoría o de toda la actividad). */
  rubricas: number;
}

export type EstadoEvaluacion = 'COMPLETO' | 'EN_PROCESO' | 'SIN_INICIAR' | 'SIN_JURADOS';

export interface DashboardFila {
  categoriaParticipante: null | string;
  estado: EstadoEvaluacion;
  evaluacionesEsperadas: number;
  evaluacionesHechas: number;
  idInscripcion: number;
  idParticipante: number;
  institucion: null | string;
  /** Día de la feria (1..n); `null` sin asignar o actividad de un día. */
  jornada: null | number;
  juradosAsignados: number;
  /** Jurados que deben evaluar este proyecto (asignación por categoría o por proyecto). */
  juradosCubren: number[];
  juradosCompletos: number;
  notas: DashboardNota[];
  /** Orden de presentación en la categoría; `null` sin definir. */
  orden: null | number;
  /**
   * Puesto oficial 1..n dentro de la categoría (empates comparten): solo cuando
   * todos sus proyectos están completos; si no, `0`.
   */
  posicion: number;
  promedio: null | number;
  proyecto: null | string;
  /** Puesto por promedio aunque la categoría siga en curso (`0` sin promedio). */
  puestoProvisional: number;
  stand: null | string;
  /** Carrera y facultad (sigla) del proyecto: filtro por área en el seguimiento. */
  carrera?: null | string;
  facultad?: null | string;
  idFacultad?: null | number;
  /** Motivo por el que se excluyó del ranking (sin puesto); `null` = compite. */
  exclusionRanking?: null | string;
}

export interface DashboardNota {
  completa: boolean;
  idJurado: number;
  /** Rúbricas que ese jurado ya llenó para el proyecto. */
  rubricas: number;
  total: number;
}

export interface DashboardJurado {
  categorias: string[];
  evaluacionesEsperadas: number;
  evaluacionesHechas: number;
  idJurado: number;
  nombre: string;
  /** `yyyy-MM-dd'T'HH:mm:ss` (hora del servidor) o `null`. */
  ultimaEvaluacion: null | string;
}

/** `GET /api/dashboard-evaluacion/{idActividad}` */
export async function obtenerDashboard(idActividad: number) {
  return requestClient.get<DashboardEvaluacion>(`/dashboard-evaluacion/${idActividad}`);
}

/** `GET /api/dashboard-evaluacion/sse-token` — token de un uso para abrir el stream. */
export async function obtenerSseTokenDashboard() {
  return requestClient.get<{ expiraEnSegundos: number; token: string }>(
    '/dashboard-evaluacion/sse-token',
  );
}

// Los PDF de resultados están en `api/resultados.ts` (`/api/resultados/{id}/pdf/**`).
