import { requestClient } from '#/api/request';

/**
 * `Jurado` de `com.example.proyecto.api.dto.JuradoResponse`.
 *
 * El backend aplana la relación `LAZY` con `persona` para poder pintar la
 * tabla sin depender de la sesión de JPA.
 */
export interface Jurado {
  ci: null | string;
  idJurado: number;
  idPersona: null | number;
  nombreCompleto: null | string;
  /** Solo lo devuelve el alta: es el usuario generado para el jurado. */
  usuario?: null | string;
}

/**
 * Campos que edita el formulario:
 * persona obligatoria, más usuario y contraseña que solo aplican al alta.
 */
export interface JuradoForm {
  contrasena?: string;
  idJurado?: number;
  idPersona?: number;
  usuario?: string;
}

/** `GET /api/jurados` — lista los jurados activos (`estado = 'A'`). */
export async function listarJurados() {
  return requestClient.get<Jurado[]>('/jurados');
}

/** `GET /api/jurados/{id}` */
export async function obtenerJurado(id: number) {
  return requestClient.get<Jurado>(`/jurados/${id}`);
}

/**
 * `POST /api/jurados` — da de alta el jurado y su usuario con rol `J`.
 *
 * El backend responde 400 si la persona ya es jurado, si no existe o si la
 * contraseña tiene menos de 6 caracteres.
 */
export async function crearJurado(data: JuradoForm) {
  return requestClient.post<Jurado>('/jurados', data);
}

/** `PUT /api/jurados/{id}` — reajusta la persona; no toca el usuario. */
export async function actualizarJurado(id: number, data: JuradoForm) {
  return requestClient.put<Jurado>(`/jurados/${id}`, data);
}

/** `DELETE /api/jurados/{id}` — borrado lógico: `estado = 'ELIMINADO'`. */
export async function eliminarJurado(id: number) {
  return requestClient.delete<void>(`/jurados/${id}`);
}
