import { requestClient } from '#/api/request';

/** `TipoParticipanteResponse` de `com.example.proyecto.api.dto`. */
export interface TipoParticipante {
  descripcion: null | string;
  idTipoParticipante: number;
  nombre: null | string;
}

/** Campos que edita el formulario. */
export interface TipoParticipanteForm {
  descripcion: string;
  idTipoParticipante?: number;
  nombre: string;
}

/** `GET /api/tipos-participante` — lista los tipos de participante activos. */
export async function listarTiposParticipante() {
  return requestClient.get<TipoParticipante[]>('/tipos-participante');
}

/** `GET /api/tipos-participante/{id}` */
export async function obtenerTipoParticipante(id: number) {
  return requestClient.get<TipoParticipante>(`/tipos-participante/${id}`);
}

/**
 * `POST /api/tipos-participante` — el backend responde 400 si falta el nombre y
 * 409 si ya existe un tipo activo con ese nombre.
 */
export async function crearTipoParticipante(data: TipoParticipanteForm) {
  return requestClient.post<TipoParticipante>('/tipos-participante', data);
}

/** `PUT /api/tipos-participante/{id}` */
export async function actualizarTipoParticipante(
  id: number,
  data: TipoParticipanteForm,
) {
  return requestClient.put<TipoParticipante>(`/tipos-participante/${id}`, data);
}

/** `DELETE /api/tipos-participante/{id}` — borrado lógico: el backend pone `estado = 'X'`. */
export async function eliminarTipoParticipante(id: number) {
  return requestClient.delete<void>(`/tipos-participante/${id}`);
}
