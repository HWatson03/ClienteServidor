import { requestClient } from '#/api/request';

/** Nivel de un proyecto. El backend solo acepta estos dos valores. */
export type NivelClasificacion = 'AVANZADO' | 'BASICO';

/**
 * Fila de la pantalla "Clasificar proyectos" (`ClasificacionProyectoResponse`).
 *
 * `carrera` no es un id: es el texto de la carrera deducido de
 * `participante.institucion`, y `carreraValida` indica si coincide con alguna
 * fila de `carrera`. Si no coincide, el backend no puede resolver la categoría y
 * la fila no se puede clasificar.
 */
export interface ProyectoClasificacion {
  carrera: string;
  carreraValida: boolean;
  clasificado: boolean;
  /** `null` si el proyecto todavía no tiene nivel. */
  /** Evaluaciones activas: cambiarle el nivel las archiva (hay que confirmarlo). */
  evaluaciones: number;
  nivel: NivelClasificacion | null;
  nombre: null | string;
  participanteId: number;
}

/** `ClasificacionDatosResponse`: las carreras (para el filtro) y los proyectos. */
export interface DatosClasificacion {
  carreras: string[];
  proyectos: ProyectoClasificacion[];
}

/** `ClasificacionGuardarRequest`: un nivel por participante. */
export interface ClasificacionGuardarRequest {
  /**
   * Confirma cambiar de nivel proyectos ya evaluados: se trasladan archivando sus
   * evaluaciones. Sin ella, esos se omiten y vuelven en `requierenConfirmacion`.
   */
  archivarEvaluadas?: boolean;
  items: { nivel: NivelClasificacion; participanteId: number }[];
}

/** `ClasificacionGuardarResponse`. */
export interface ClasificacionGuardarResponse {
  /** Evaluaciones archivadas por los traslados. */
  evaluacionesArchivadas: number;
  /** Sin evaluaciones, cambiados de nivel. */
  guardados: number;
  /** Sin inscripción activa o con carrera no reconocida. */
  omitidos: number;
  /** Evaluados que no se tocaron por falta de confirmación. */
  requierenConfirmacion: number[];
  sinCambios: number;
  /** Evaluados cambiados de nivel (confirmado): deben evaluarse de nuevo. */
  trasladados: number;
}

/**
 * `GET /api/clasificacion/datos` — proyectos de la actividad-feria con su nivel
 * actual y la lista de carreras registradas.
 */
export async function listarDatosClasificacion() {
  return requestClient.get<DatosClasificacion>('/clasificacion/datos');
}

/**
 * `POST /api/clasificacion/guardar` — re-inscribe cada proyecto en la categoría de
 * su carrera con el nivel indicado.
 *
 * `guardados` puede ser menor que `items.length`: el backend se salta los
 * participantes que no están inscritos en la actividad de la feria y los que
 * tienen una carrera no reconocida.
 */
export async function guardarClasificacion(data: ClasificacionGuardarRequest) {
  return requestClient.post<ClasificacionGuardarResponse>(
    '/clasificacion/guardar',
    data,
  );
}
