import { requestClient } from '#/api/request';

/**
 * `Docente` de `com.example.proyecto.api.dto.DocenteResponse`.
 *
 * A diferencia de `Jurado` y `Estudiante`, el docente no apunta a una persona
 * ya existente: el legacy daba de alta la `Persona` en el mismo formulario, así
 * que el DTO lleva sus datos dentro.
 */
export interface Docente {
  ci: null | string;
  email: null | string;
  /** `yyyy-MM-dd`, el formato que usa el date picker. */
  fecNacimiento: null | string;
  idDocente: number;
  idPersona: null | number;
  materno: null | string;
  /** Getter derivado en Java; es lo que pinta la columna `Docente`. */
  nombreCompleto: null | string;
  nombres: null | string;
  paterno: null | string;
  tipoSexo: null | string;
}

/** Datos de la persona que da de alta el docente. */
export interface DocentePersonaForm {
  ci: string;
  email: string;
  /** `undefined` cuando está vacío: los componentes de Ant Design no admiten `null`. */
  fecNacimiento?: string;
  materno: string;
  nombres: string;
  paterno: string;
  tipoSexo?: string;
}

/** Campos que edita el formulario (equivalente al fragmento `Docente`). */
export interface DocenteForm {
  idDocente?: number;
  idPersona?: number;
  persona: DocentePersonaForm;
}

/** `GET /api/docentes` — lista los docentes activos (`estado = 'A'`). */
export async function listarDocentes() {
  return requestClient.get<Docente[]>('/docentes');
}

/** `GET /api/docentes/{id}` */
export async function obtenerDocente(id: number) {
  return requestClient.get<Docente>(`/docentes/${id}`);
}

/**
 * `POST /api/docentes` — crea persona y docente juntos.
 *
 * El backend responde 400 si falta el nombre o el CI, o si ya existe una
 * persona con ese CI.
 */
export async function crearDocente(data: DocenteForm) {
  return requestClient.post<Docente>('/docentes', data);
}

/** `PUT /api/docentes/{id}` — actualiza los datos de la persona asociada. */
export async function actualizarDocente(id: number, data: DocenteForm) {
  return requestClient.put<Docente>(`/docentes/${id}`, data);
}

/** `DELETE /api/docentes/{id}` — borrado lógico en cascada de persona y docente. */
export async function eliminarDocente(id: number) {
  return requestClient.delete<void>(`/docentes/${id}`);
}
