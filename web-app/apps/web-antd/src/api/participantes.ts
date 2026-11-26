import { requestClient } from '#/api/request';

/**
 * `ParticipanteResponse` de `com.example.proyecto.api.dto`.
 *
 * Las dos relaciones `LAZY` llegan aplanadas, así que el `select` de proyecto
 * del formulario de estudiante y la columna "Tipo participante" de la tabla se
 * leen sin navegar objetos anidados.
 */
export interface Participante {
  idCategoriaParticiapnte: null | number;
  idParticipante: number;
  idTipoParticipante: null | number;
  institucion: null | string;
  nombre: null | string;
  nombreCategoria: null | string;
  nombreTipo: null | string;
  posicion?: null | number;
  /** Docente guía (persona); `null` si no tiene. */
  docenteGuia?: null | string;
  idDocenteGuia?: null | number;
  /**
   * Carrera (y su facultad) a la que está afiliado el proyecto, en actividades
   * con estructura académica (FEXCOIN). Con carrera, `institucion` es su nombre.
   */
  carrera?: null | string;
  facultad?: null | string;
  idCarrera?: null | number;
  idFacultad?: null | number;
  siglaFacultad?: null | string;
}

/**
 * Campos que edita el formulario.
 *
 * `posicion` no lo editaba el legacy, así que no viaja y el backend conserva el
 * valor que ya tuviera la fila.
 */
export interface ParticipanteForm {
  idCategoriaParticiapnte?: number;
  idParticipante?: number;
  idTipoParticipante?: number;
  /** Opcional: con carrera, el backend pone `institucion` = nombre de la carrera. */
  idCarrera?: null | number;
  institucion: string;
  nombre: string;
}

/** `GET /api/participantes` — lista los participantes (proyectos) activos. */
export async function listarParticipantes() {
  return requestClient.get<Participante[]>('/participantes');
}

/** `GET /api/participantes/{id}` */
export async function obtenerParticipante(id: number) {
  return requestClient.get<Participante>(`/participantes/${id}`);
}

/**
 * `POST /api/participantes` — el backend responde 400 si falta el nombre, la
 * institución o alguna de las dos relaciones, y 409 si el nombre ya existe.
 */
export async function crearParticipante(data: ParticipanteForm) {
  return requestClient.post<Participante>('/participantes', data);
}

/** `PUT /api/participantes/{id}` */
export async function actualizarParticipante(
  id: number,
  data: ParticipanteForm,
) {
  return requestClient.put<Participante>(`/participantes/${id}`, data);
}

/**
 * `DELETE /api/participantes/{id}` — borrado lógico: el backend pone
 * `estado = 'X'`. No propaga a `Inscripcion` ni a `ParticipanteCategoria`, igual
 * que el legacy.
 */
export async function eliminarParticipante(id: number) {
  return requestClient.delete<void>(`/participantes/${id}`);
}

/** `EquipoParticipanteResponse`: docente guía e integrantes (estudiantes). */
export interface EquipoParticipante {
  docenteGuia: null | PersonaEquipo;
  integrantes: PersonaEquipo[];
}

export interface PersonaEquipo {
  ci: null | string;
  idPersona: number;
  nombre: null | string;
}

/** Lo que se guarda del equipo: ids de persona. */
export interface EquipoForm {
  idDocenteGuia: null | number;
  integrantes: number[];
}

/** `GET /api/participantes/{id}/equipo` */
export async function obtenerEquipoParticipante(id: number) {
  return requestClient.get<EquipoParticipante>(`/participantes/${id}/equipo`);
}

/** `PUT /api/participantes/{id}/equipo` — reemplaza docente guía e integrantes. */
export async function guardarEquipoParticipante(id: number, equipo: EquipoForm) {
  return requestClient.put<EquipoParticipante>(`/participantes/${id}/equipo`, equipo);
}
