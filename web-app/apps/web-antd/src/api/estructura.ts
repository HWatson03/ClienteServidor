import { requestClient } from '#/api/request';

/**
 * Estructura académica (`api/controller/EstructuraApiController.java`): las
 * facultades son un catálogo global y las carreras son de cada actividad, cada
 * una en su facultad. FEXCOIN afilia cada proyecto a su carrera para sacar los
 * rankings por carrera y por facultad.
 */
export interface Facultad {
  idFacultad: number;
  nombre: string;
  sigla: null | string;
}

export interface FacultadForm {
  nombre: string;
  sigla: string;
}

export interface Carrera {
  idActividad: null | number;
  idCarrera: number;
  /** `null` en carreras antiguas (EXPOINNOVA) o creadas sin facultad. */
  facultad: null | string;
  idFacultad: null | number;
  nombre: string;
  /** Proyectos (participantes activos) afiliados a la carrera. */
  proyectos: number;
  siglaFacultad: null | string;
}

export interface CarreraForm {
  idActividad?: number;
  idCarrera?: number;
  idFacultad?: null | number;
  nombre: string;
}

/** Una fila pegada desde la planilla: «Facultad · Sigla · Carrera». */
export interface FilaImportacion {
  carrera: string;
  facultad: string;
  sigla: string;
}

export interface ResultadoImportacion {
  carrerasNuevas: number;
  facultadesNuevas: number;
  /** Filas sin carrera o con una carrera que ya existía. */
  omitidas: number;
}

// ---------------------------------------------------------------- facultades

/** `GET /api/estructura/facultades` — activas, por nombre. */
export async function listarFacultades() {
  return requestClient.get<Facultad[]>('/estructura/facultades');
}

/** `POST /api/estructura/facultades` — 409 si el nombre ya existe. */
export async function crearFacultad(data: FacultadForm) {
  return requestClient.post<Facultad>('/estructura/facultades', data);
}

/** `PUT /api/estructura/facultades/{id}` */
export async function actualizarFacultad(id: number, data: FacultadForm) {
  return requestClient.put<Facultad>(`/estructura/facultades/${id}`, data);
}

/** `DELETE /api/estructura/facultades/{id}` — 409 si todavía tiene carreras. */
export async function eliminarFacultad(id: number) {
  return requestClient.delete<void>(`/estructura/facultades/${id}`);
}

// ---------------------------------------------------------------- carreras

/** `GET /api/estructura/carreras?idActividad=N` — con su facultad y nº de proyectos. */
export async function listarCarreras(idActividad: number) {
  return requestClient.get<Carrera[]>('/estructura/carreras', { params: { idActividad } });
}

/** `POST /api/estructura/carreras` — el nombre se guarda en mayúsculas; 409 si se repite. */
export async function crearCarrera(data: CarreraForm) {
  return requestClient.post<Carrera>('/estructura/carreras', data);
}

/**
 * `PUT /api/estructura/carreras/{id}` — al renombrarla, el backend renombra
 * también la institución de sus proyectos.
 */
export async function actualizarCarrera(id: number, data: CarreraForm) {
  return requestClient.put<Carrera>(`/estructura/carreras/${id}`, data);
}

/** `DELETE /api/estructura/carreras/{id}` — 409 si tiene proyectos. */
export async function eliminarCarrera(id: number) {
  return requestClient.delete<void>(`/estructura/carreras/${id}`);
}

/**
 * `POST /api/estructura/carreras/importar` — crea las facultades y carreras que
 * faltan (compara nombres sin tildes ni mayúsculas) y omite las que ya existen,
 * así que se puede repetir sin duplicar.
 */
export async function importarCarreras(idActividad: number, filas: FilaImportacion[]) {
  return requestClient.post<ResultadoImportacion>('/estructura/carreras/importar', {
    filas,
    idActividad,
  });
}
