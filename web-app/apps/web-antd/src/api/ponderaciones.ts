import { requestClient } from '#/api/request';

/**
 * `api/dto/PonderacionResponse.java`.
 *
 * Aplana los tres niveles que anidaba la tabla del legacy
 * (categoría → pregunta → ponderaciones) en una fila por ponderación.
 */
export interface Ponderacion {
  categoriaCriterio: null | string;
  idCategoriaCriterio: null | number;
  idPonderacion: number;
  idPregunta: null | number;
  numero: null | number;
  pregunta: null | string;
  tipoProyecto: null | string;
}

/**
 * Cuerpo de alta/edición. El id viaja en la URL del `PUT`, nunca aquí.
 *
 * `numeros` acepta uno o varios: al dar de alta se pueden crear varias
 * ponderaciones de la misma pregunta de una vez (lo que hacía `/PonderacionF2`
 * con un texto separado por comas), y al editar solo se usa el primero.
 *
 * El backend responde 400 si la lista está vacía, si algún valor no es entero no
 * negativo, o si ese número ya existe en la pregunta seleccionada.
 */
export interface PonderacionForm {
  idPregunta?: number;
  numeros: number[];
}

/** `GET /api/ponderaciones` — ponderaciones activas (`estado = 'A'`). */
export async function listarPonderaciones() {
  return requestClient.get<Ponderacion[]>('/ponderaciones');
}

/** `GET /api/ponderaciones/{id}` */
export async function obtenerPonderacion(id: number) {
  return requestClient.get<Ponderacion>(`/ponderaciones/${id}`);
}

/**
 * `POST /api/ponderaciones` — crea una ponderación por cada número recibido y
 * devuelve la lista completa de las creadas.
 */
export async function crearPonderacion(data: PonderacionForm) {
  return requestClient.post<Ponderacion[]>('/ponderaciones', data);
}

/** `PUT /api/ponderaciones/{id}` — edita una sola ponderación. */
export async function actualizarPonderacion(id: number, data: PonderacionForm) {
  return requestClient.put<Ponderacion>(`/ponderaciones/${id}`, data);
}

/**
 * `DELETE /api/ponderaciones/{id}` — borrado lógico (`estado = 'X'`). No borra
 * físicamente: `ponderacion.puntajes` está en cascada y arrastraría los
 * puntajes ya registrados por los jurados.
 */
export async function eliminarPonderacion(id: number) {
  return requestClient.delete<void>(`/ponderaciones/${id}`);
}
