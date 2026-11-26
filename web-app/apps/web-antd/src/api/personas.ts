import { requestClient } from '#/api/request';

/**
 * `api/dto/PersonaResponse.java`.
 *
 * Los nombres viajan sueltos porque el formulario los edita por separado, igual
 * que en `DocenteResponse`. `nombreCompleto` es un getter derivado en Java, no
 * una columna: el backend lo arma tolerando `paterno`/`materno` nulos.
 * `fecNacimiento` llega como `yyyy-MM-dd`, no como epoch.
 */
export interface Persona {
  ci: null | string;
  direccion: null | string;
  email: null | string;
  fecNacimiento: null | string;
  idPersona: number;
  materno: null | string;
  nombreCompleto: string;
  nombres: null | string;
  paterno: null | string;
  telefono: null | string;
  tipoSexo: null | string;
}

/**
 * `api/dto/PersonaRequest.java` — los cuatro campos que editaba
 * `templates/vista/persona/formulario.html`, con `ci` y `nombres` obligatorios.
 *
 * `email`, `telefono`, `direccion`, `fecNacimiento` y `tipoSexo` no se editan en
 * esa pantalla y por eso no viajan: el backend parte de la fila existente y los
 * conserva. `idPersona` solo se usa aquí para decidir alta o edición, nunca se
 * manda en el cuerpo (en la edición va en la URL del `PUT`).
 */
export interface PersonaForm {
  ci: string;
  idPersona?: number;
  materno?: string;
  nombres: string;
  paterno?: string;
}

/**
 * `GET /api/personas` — lista las personas activas (`estado = 'A'`).
 */
export async function listarPersonas() {
  return requestClient.get<Persona[]>('/personas');
}

/**
 * `POST /api/personas` — el backend exige `ci` y `nombres` no vacíos (400 si falta
 * cualquiera de los dos).
 */
export async function crearPersona(data: Omit<PersonaForm, 'idPersona'>) {
  return requestClient.post<Persona>('/personas', data);
}

/**
 * `PUT /api/personas/{id}` — actualiza la persona indicada. El id viaja en la ruta,
 * nunca en el cuerpo.
 */
export async function actualizarPersona(id: number, data: Omit<PersonaForm, 'idPersona'>) {
  return requestClient.put<Persona>(`/personas/${id}`, data);
}

/**
 * `DELETE /api/personas/{id}` — borrado lógico: el backend pone `estado = 'X'`.
 */
export async function eliminarPersona(id: number) {
  return requestClient.delete<void>(`/personas/${id}`);
}
