import { requestClient } from '#/api/request';

/**
 * `Estudiante` de `com.example.proyecto.api.dto.EstudianteResponse`.
 *
 * El backend aplana las dos relaciones `LAZY` (`persona` y `participante`) para
 * que la tabla muestre lo mismo que `tabla.html` sin arriesgar ciclos de
 * serialización. Los ids viajan además para dejar preseleccionados los
 * `select` del formulario.
 */
export interface Estudiante {
  ci: null | string;
  idEstudiante: number;
  idParticipante: null | number;
  idPersona: null | number;
  institucion: null | string;
  nombrePersona: null | string;
  proyecto: null | string;
}

/**
 * Campos que edita el formulario:
 * un `select` de persona y otro de proyecto, ambos obligatorios.
 */
export interface EstudianteForm {
  idEstudiante?: number;
  idParticipante?: number;
  idPersona?: number;
}

/** `GET /api/estudiantes` — lista los estudiantes activos (`_estado = 'A'`). */
export async function listarEstudiantes() {
  return requestClient.get<Estudiante[]>('/estudiantes');
}

/** `GET /api/estudiantes/{id}` — usado para recargar el registro en edición. */
export async function obtenerEstudiante(id: number) {
  return requestClient.get<Estudiante>(`/estudiantes/${id}`);
}

/** `POST /api/estudiantes` — el backend exige `idPersona` e `idParticipante`. */
export async function crearEstudiante(data: EstudianteForm) {
  return requestClient.post<Estudiante>('/estudiantes', data);
}

/** `PUT /api/estudiantes/{id}` — actualiza las relaciones del estudiante. */
export async function actualizarEstudiante(id: number, data: EstudianteForm) {
  return requestClient.put<Estudiante>(`/estudiantes/${id}`, data);
}

/** `DELETE /api/estudiantes/{id}` — borrado lógico: el backend pone `_estado = 'X'`. */
export async function eliminarEstudiante(id: number) {
  return requestClient.delete<void>(`/estudiantes/${id}`);
}
