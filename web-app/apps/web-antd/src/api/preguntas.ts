import { requestClient } from '#/api/request';

/**
 * `api/dto/PreguntaResponse.java`.
 *
 * `categoriaCriterio` y `tipoProyecto` vienen resueltos, que es el texto que
 * llevaba el desplegable del legacy (`categoria - tipo`). La tabla anidada se
 * aplana a una fila por pregunta.
 */
export interface Pregunta {
  categoriaCriterio: null | string;
  idCategoriaCriterio: null | number;
  idPregunta: number;
  nombre: null | string;
  tipoProyecto: null | string;
}

/**
 * Cuerpo de alta/edición. El id viaja en la URL del `PUT`, nunca aquí.
 *
 * El backend responde 400 si falta el texto, si la categoría no existe o si esa
 * pregunta ya está registrada dentro de la misma categoría.
 */
export interface PreguntaForm {
  idCategoriaCriterio?: number;
  nombre: string;
}

/** `GET /api/preguntas` — preguntas activas (`estado = 'A'`). */
export async function listarPreguntas() {
  return requestClient.get<Pregunta[]>('/preguntas');
}

/** `GET /api/preguntas/{id}` */
export async function obtenerPregunta(id: number) {
  return requestClient.get<Pregunta>(`/preguntas/${id}`);
}

/** `POST /api/preguntas` */
export async function crearPregunta(data: PreguntaForm) {
  return requestClient.post<Pregunta>('/preguntas', data);
}

/** `PUT /api/preguntas/{id}` */
export async function actualizarPregunta(id: number, data: PreguntaForm) {
  return requestClient.put<Pregunta>(`/preguntas/${id}`, data);
}

/**
 * `DELETE /api/preguntas/{id}` — borrado lógico (`estado = 'X'`). No borra
 * físicamente: `pregunta.ponderaciones` está en cascada y arrastraría los
 * puntajes de evaluaciones ya realizadas.
 */
export async function eliminarPregunta(id: number) {
  return requestClient.delete<void>(`/preguntas/${id}`);
}
