import { requestClient } from '#/api/request';

/**
 * `RubricaResponse` de `com.example.proyecto.api.dto`.
 *
 * Las dos referencias llegan aplanadas. La rúbrica cuelga de una `Actividad` **o**
 * de una `CategoriaActividad`, nunca de las dos: la tabla deriva de aquí las
 * columnas «Tipo» y «Referencia».
 *
 * No trae `criterios` a propósito (ver `RubricaResponse.from`).
 */
export interface Rubrica {
  /**
   * Evaluaciones activas hechas con esta rúbrica. Con alguna, el backend no deja
   * eliminarla ni cambiar su actividad o categoría (409).
   */
  evaluaciones: number;
  idActividad: null | number;
  idCategoriaActividad: null | number;
  idRubrica: number;
  nombre: null | string;
  nombreActividad: null | string;
  nombreCategoriaActividad: null | string;
  version: null | string;
}

/**
 * Campos que edita el formulario.
 *
 * `idActividad` e `idCategoriaActividad` son excluyentes: el backend exige
 * exactamente uno.
 */
export interface RubricaForm {
  idActividad?: number;
  idCategoriaActividad?: number;
  idRubrica?: number;
  nombre: string;
  version: string;
}

/** `GET /api/rubricas` — lista las rúbricas activas. */
export async function listarRubricas() {
  return requestClient.get<Rubrica[]>('/rubricas');
}

/** `GET /api/rubricas/{id}` */
export async function obtenerRubrica(id: number) {
  return requestClient.get<Rubrica>(`/rubricas/${id}`);
}

/**
 * `POST /api/rubricas` — 400 si falta el nombre o la versión, o si no se eligió
 * exactamente una referencia; 409 si esa actividad o categoría ya tiene una
 * rúbrica activa con el mismo nombre y versión.
 */
export async function crearRubrica(data: RubricaForm) {
  return requestClient.post<Rubrica>('/rubricas', data);
}

/** `PUT /api/rubricas/{id}` — mismos errores que el alta. */
export async function actualizarRubrica(id: number, data: RubricaForm) {
  return requestClient.put<Rubrica>(`/rubricas/${id}`, data);
}

/**
 * `DELETE /api/rubricas/{id}` — borrado lógico: el backend pone `estado = 'X'`.
 * No borra los criterios.
 */
export async function eliminarRubrica(id: number) {
  return requestClient.delete<void>(`/rubricas/${id}`);
}
