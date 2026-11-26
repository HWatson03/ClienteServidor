import { requestClient } from '#/api/request';

/**
 * `api/dto/TipoProyectoResponse.java` — raíz del árbol de evaluación por
 * preguntas (Tipo de proyecto → Categoría criterio → Pregunta → Ponderación).
 */
export interface TipoProyectoFila {
  /** Categorías de criterio activas: con alguna no se puede eliminar (409). */
  categoriasCriterio: number;
  idTipoProyecto: number;
  nombre: null | string;
}

/** Cuerpo de alta/edición. El id viaja en la URL del `PUT`. */
export interface TipoProyectoForm {
  idTipoProyecto?: number;
  nombre: string;
}

/** `GET /api/tipos-proyecto` — los no dados de baja. */
export async function listarTiposProyectoCrud() {
  return requestClient.get<TipoProyectoFila[]>('/tipos-proyecto');
}

/** `POST /api/tipos-proyecto` — 400 sin nombre; 409 si el nombre ya existe. */
export async function crearTipoProyecto(data: Omit<TipoProyectoForm, 'idTipoProyecto'>) {
  return requestClient.post<TipoProyectoFila>('/tipos-proyecto', data);
}

/** `PUT /api/tipos-proyecto/{id}` */
export async function actualizarTipoProyecto(
  id: number,
  data: Omit<TipoProyectoForm, 'idTipoProyecto'>,
) {
  return requestClient.put<TipoProyectoFila>(`/tipos-proyecto/${id}`, data);
}

/** `DELETE /api/tipos-proyecto/{id}` — borrado lógico; 409 si tiene categorías. */
export async function eliminarTipoProyecto(id: number) {
  return requestClient.delete<void>(`/tipos-proyecto/${id}`);
}
