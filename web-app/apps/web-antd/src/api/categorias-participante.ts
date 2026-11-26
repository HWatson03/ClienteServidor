import { requestClient } from '#/api/request';

/**
 * `CategoriaParticipanteResponse` de `com.example.proyecto.api.dto`.
 *
 * La pk se llama `idCategoriaParticiapnte` (errata heredada del legacy) y así
 * llega al JSON; no se renombra para no romper los `findByCarrera...` del DAO ni
 * los `select` de `EstudianteApiController`.
 */
export interface CategoriaParticipante {
  descripcion: null | string;
  idCategoriaParticiapnte: number;
  nombre: null | string;
}

/** Campos que edita el formulario. */
export interface CategoriaParticipanteForm {
  descripcion: string;
  idCategoriaParticiapnte?: number;
  nombre: string;
}

/** `GET /api/categorias-participante` — lista las categorías activas. */
export async function listarCategoriasParticipante() {
  return requestClient.get<CategoriaParticipante[]>('/categorias-participante');
}

/** `GET /api/categorias-participante/{id}` */
export async function obtenerCategoriaParticipante(id: number) {
  return requestClient.get<CategoriaParticipante>(
    `/categorias-participante/${id}`,
  );
}

/** `POST /api/categorias-participante` — el backend responde 400 si falta el nombre. */
export async function crearCategoriaParticipante(
  data: CategoriaParticipanteForm,
) {
  return requestClient.post<CategoriaParticipante>(
    '/categorias-participante',
    data,
  );
}

/** `PUT /api/categorias-participante/{id}` */
export async function actualizarCategoriaParticipante(
  id: number,
  data: CategoriaParticipanteForm,
) {
  return requestClient.put<CategoriaParticipante>(
    `/categorias-participante/${id}`,
    data,
  );
}

/** `DELETE /api/categorias-participante/{id}` — borrado lógico: `estado = 'X'`. */
export async function eliminarCategoriaParticipante(id: number) {
  return requestClient.delete<void>(`/categorias-participante/${id}`);
}
