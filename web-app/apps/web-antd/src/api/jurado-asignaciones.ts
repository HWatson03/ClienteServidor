import { requestClient } from '#/api/request';

/**
 * `api/dto/JuradoAsignacionResponse.java`.
 *
 * Aplana las tres relaciones de la asignación. El legacy pintaba una columna
 * única «Referencia» con el nombre de la actividad *o* el de la categoría, y dos
 * badges superpuestos si venían las dos; aquí van columnas separadas, porque
 * admitiendo el caso «ambas» una sola celda de texto mentiría sobre la otra
 * relación.
 */
export interface JuradoAsignacion {
  /** `null` si la asignación no apunta a una actividad. */
  actividad: null | string;
  /** `null` si la asignación no apunta a una categoría. */
  categoriaActividad: null | string;
  idActividad: null | number;
  idCategoriaActividad: null | number;
  idJurado: null | number;
  idJuradoAsignacion: number;
  /**
   * Proyectos (inscripciones) a los que se limita la asignación. Vacío = evalúa
   * toda la categoría.
   */
  idsInscripcion: number[];
  /**
   * Facultades cuyos proyectos de la categoría evalúa (asignación por
   * facultad). Vacío = sin filtro. Se combina con `idsInscripcion`.
   */
  idsFacultad: number[];
  /** Nombre completo del jurado, resuelto a través de su persona. */
  jurado: null | string;
}

/**
 * Cuerpo de alta/edición del módulo de asignaciones.
 *
 * `idActividad` e `idCategoriaActividad` son independientes y **pueden venir
 * ambos**: el legacy exigía uno o el otro, pero esa regla solo vivía en el
 * formulario y el modelo de datos ya la contradecía — las filas que escribe
 * «Asignar Jurados por carrera» llevan las dos. El backend solo rechaza que no
 * se indique ninguna.
 *
 * El id de la asignación viaja en la URL del `PUT`, nunca aquí.
 */
export interface JuradoAsignacionForm {
  idActividad?: number;
  idCategoriaActividad?: number;
  idJurado?: number;
}

/**
 * `GET /api/jurado-asignaciones` — asignaciones activas (`estado = 'A'`).
 */
export async function listarJuradoAsignaciones() {
  return requestClient.get<JuradoAsignacion[]>('/jurado-asignaciones');
}

/** `GET /api/jurado-asignaciones/{id}` */
export async function obtenerJuradoAsignacion(id: number) {
  return requestClient.get<JuradoAsignacion>(`/jurado-asignaciones/${id}`);
}

/**
 * `POST /api/jurado-asignaciones`.
 *
 * El backend responde 400 si no se elige jurado, si no se indica ninguna de las
 * dos relaciones, o si la relación elegida no existe o está inactiva; y 409 si ese
 * jurado ya tiene una asignación activa a esa misma actividad o categoría.
 */
export async function crearJuradoAsignacion(data: JuradoAsignacionForm) {
  return requestClient.post<JuradoAsignacion>('/jurado-asignaciones', data);
}

/** `PUT /api/jurado-asignaciones/{id}` — 404 si la asignación está dada de baja. */
export async function actualizarJuradoAsignacion(
  id: number,
  data: JuradoAsignacionForm,
) {
  return requestClient.put<JuradoAsignacion>(`/jurado-asignaciones/${id}`, data);
}

/**
 * `DELETE /api/jurado-asignaciones/{id}` — borrado lógico (`estado = 'X'`).
 *
 * No borra físicamente: la fila la leen los rankings, el dashboard del concurso
 * y los PDF de resultados.
 */
export async function eliminarJuradoAsignacion(id: number) {
  return requestClient.delete<void>(`/jurado-asignaciones/${id}`);
}

/**
 * `PUT /api/jurado-asignaciones/{id}/proyectos` — limita la asignación a esas
 * inscripciones activas de su categoría; `[]` la devuelve a toda la categoría.
 */
export async function limitarProyectosAsignacion(id: number, idsInscripcion: number[]) {
  return requestClient.put<JuradoAsignacion>(`/jurado-asignaciones/${id}/proyectos`, {
    idsInscripcion,
  });
}

/**
 * `POST /api/jurado-asignaciones/por-facultad` — el jurado evalúa los proyectos
 * de esa facultad en todas las categorías de la actividad que los tienen.
 */
export async function asignarPorFacultad(idActividad: number, idJurado: number, idFacultad: number) {
  return requestClient.post<JuradoAsignacion[]>('/jurado-asignaciones/por-facultad', {
    idActividad,
    idFacultad,
    idJurado,
  });
}

/** `DELETE /api/jurado-asignaciones/por-facultad` — deja de evaluar esa facultad. */
export async function quitarPorFacultad(idActividad: number, idJurado: number, idFacultad: number) {
  return requestClient.delete<void>('/jurado-asignaciones/por-facultad', {
    params: { idActividad, idFacultad, idJurado },
  });
}

/**
 * ¿La asignación cubre esa inscripción? Misma regla que `JuradoAsignacion.cubre`:
 * sin lista de proyectos ni facultades = toda la categoría.
 */
export function asignacionCubre(
  a: Pick<JuradoAsignacion, 'idsFacultad' | 'idsInscripcion'>,
  i: { idFacultad?: null | number; idInscripcion: number },
) {
  const porProyecto = (a.idsInscripcion ?? []).length === 0 || a.idsInscripcion.includes(i.idInscripcion);
  const facultades = a.idsFacultad ?? [];
  return porProyecto && (facultades.length === 0 || (i.idFacultad != null && facultades.includes(i.idFacultad)));
}
