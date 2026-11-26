import { requestClient } from '#/api/request';

/**
 * `api/dto/CategoriaCriterioResponse.java`.
 *
 * Una fila por categoría, con el nombre del tipo de proyecto ya resuelto. El
 * legacy agrupaba en una tabla anidada (fila por tipo de proyecto, y dentro la
 * lista de sus categorías); es la misma información en forma plana.
 */
export interface CategoriaCriterio {
  idCategoriaCriterio: number;
  idTipoProyecto: null | number;
  nombre: null | string;
  tipoProyecto: null | string;
}

/**
 * `api/dto/TipoProyectoResponse.java` — tipos de proyecto no dados de baja, para
 * el desplegable del formulario.
 */
export interface TipoProyecto {
  idTipoProyecto: number;
  nombre: null | string;
}

/**
 * Cuerpo de alta/edición. El id viaja en la URL del `PUT`, nunca aquí.
 *
 * El backend exige `nombre` e `idTipoProyecto`: responde 400 si falta alguno, si
 * el tipo de proyecto no existe o si ya hay otra categoría con ese nombre.
 */
export interface CategoriaCriterioForm {
  idTipoProyecto?: number;
  nombre: string;
}

/** `GET /api/categorias-criterio` — categorías activas (`estado = 'A'`). */
export async function listarCategoriasCriterio() {
  return requestClient.get<CategoriaCriterio[]>('/categorias-criterio');
}

/** `GET /api/categorias-criterio/{id}` */
export async function obtenerCategoriaCriterio(id: number) {
  return requestClient.get<CategoriaCriterio>(`/categorias-criterio/${id}`);
}

/** `GET /api/categorias-criterio/tipos-proyecto` — para el desplegable. */
export async function listarTiposProyecto() {
  return requestClient.get<TipoProyecto[]>('/categorias-criterio/tipos-proyecto');
}

/** `POST /api/categorias-criterio` — el nombre se guarda en mayúsculas. */
export async function crearCategoriaCriterio(data: CategoriaCriterioForm) {
  return requestClient.post<CategoriaCriterio>('/categorias-criterio', data);
}

/** `PUT /api/categorias-criterio/{id}` */
export async function actualizarCategoriaCriterio(
  id: number,
  data: CategoriaCriterioForm,
) {
  return requestClient.put<CategoriaCriterio>(`/categorias-criterio/${id}`, data);
}

/**
 * `DELETE /api/categorias-criterio/{id}` — borrado lógico (`estado = 'X'`).
 * No borra físicamente: la categoría tiene `preguntas` en cascada y arrastraría
 * las ponderaciones y los puntajes ya evaluados.
 */
export async function eliminarCategoriaCriterio(id: number) {
  return requestClient.delete<void>(`/categorias-criterio/${id}`);
}
