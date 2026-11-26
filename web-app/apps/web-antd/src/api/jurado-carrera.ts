import { requestClient } from '#/api/request';

/** `CarreraSlots` de `AsignacionCarreraDatosDto`: una fila de la lista izquierda. */
export interface CarreraSlots {
  /** Ids de jurado ya asignados al nivel Básico. */
  basico: number[];
  /** Ids de jurado ya asignados al nivel Avanzado. */
  avanzado: number[];
  idCatAvanzado: null | number;
  idCatBasico: null | number;
  idCarrera: number;
  nombre: null | string;
}

/** `JuradoMini` de `AsignacionCarreraDatosDto`: jurados disponibles para asignar. */
export interface JuradoMini {
  /** Carrera en la que ya está asignado, o `null` si está libre. */
  asignadoCarrera: null | number;
  idJurado: number;
  /** `BASICO`, `AVANZADO` o `null` si está libre. */
  nivel: null | string;
  nombre: null | string;
}

/** `AsignacionCarreraDatosDto` completo. */
export interface AsignacionCarreraDatos {
  carreras: CarreraSlots[];
  jurados: JuradoMini[];
}

/** `AsignacionCarreraGuardarDto`: reemplaza los slots de una carrera. */
export interface AsignacionCarreraGuardar {
  avanzado: number[];
  basico: number[];
  idCarrera: number;
}

/** `CarreraRequest` para el alta de carrera. */
export interface CarreraForm {
  idActividad?: number;
  nombre: string;
}

/** `CarreraResponse` devuelto tras crear la carrera. */
export interface CarreraCreada {
  idActividad: null | number;
  idCarrera: number;
  nombre: null | string;
  nombreActividad: null | string;
}

/**
 * `GET /api/jurado-carrera/datos` — carreras con sus slots y el padrón de
 * jurados con la carrera/nivel en la que ya están asignados.
 */
export async function obtenerDatosAsignacion() {
  return requestClient.get<AsignacionCarreraDatos>('/jurado-carrera/datos');
}

/**
 * `POST /api/jurado-carrera/guardar` — reemplaza los slots de la carrera.
 *
 * Borra y vuelve a crear las asignaciones de las dos categorías de la carrera.
 * El backend responde 400 si falta alguna de ellas. No impide que un jurado esté
 * también en otra carrera: la vista solo lo avisa.
 */
export async function guardarAsignacion(data: AsignacionCarreraGuardar) {
  return requestClient.post<void>('/jurado-carrera/guardar', data);
}

/**
 * `POST /api/jurado-carrera/carreras` — alta de carrera.
 *
 * El backend crea también sus categorías `BASICO` y `AVANZADO`; sin ellas la
 * carrera no admitiría jurados.
 */
export async function crearCarrera(data: CarreraForm) {
  return requestClient.post<CarreraCreada>('/jurado-carrera/carreras', data);
}
