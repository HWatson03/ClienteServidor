import type { ExclusionRanking, NotaActa } from '#/api/resultados';

import { requestClient } from '#/api/request';

/**
 * `InscripcionResponse` de `com.example.proyecto.api.dto`.
 *
 * Las tres relaciones `LAZY` llegan aplanadas (id + nombre), así que la tabla y
 * el formulario no navegan objetos anidados.
 *
 * Se mandan `idActividad` e `idCategoriaActividad` por separado porque el
 * formulario tiene dos `select` distintos y `categoriaActividad` es la columna
 * que después usan el panel del jurado, los rankings y los PDF.
 */
export interface Inscripcion {
  /**
   * Evaluaciones activas. Con alguna, el backend no deja cambiar proyecto,
   * actividad ni categoría (409), y borrar la inscripción las desactiva.
   */
  evaluaciones: number;
  /**
   * Evaluaciones que debería tener: jurados asignados a su categoría × rúbricas
   * de la categoría. 0 = su categoría no tiene jurados o rúbricas.
   */
  evaluacionesEsperadas: number;
  idActividad: number;
  idCategoriaActividad: number;
  idInscripcion: number;
  idParticipante: number;
  nombreActividad: null | string;
  nombreCategoriaActividad: null | string;
  nombreParticipante: null | string;
  /** Orden de presentación en su categoría (1, 2, …); `null` si no se definió. */
  orden: null | number;
  /** Datos de feria (FEXCOIN); `null` si la actividad no los usa o no se cargaron. */
  carrera?: null | string;
  facultad?: null | string;
  idFacultad?: null | number;
  siglaFacultad?: null | string;
  /** Día de la feria en que se presenta (1, 2, …). */
  jornada?: null | number;
  stand?: null | string;
}

/**
 * Campos que edita el formulario.
 *
 * La entidad `Inscripcion` solo tiene estas tres relaciones, así que el formulario
 * es completo. Los tres `select` del legacy eran `required`.
 */
export interface InscripcionForm {
  idActividad?: number;
  idCategoriaActividad?: number;
  idInscripcion?: number;
  idParticipante?: number;
  /** Feria de varios días: jornada (1..10); opcional. */
  jornada?: null | number;
  /** Stand, ≤ 30 caracteres; opcional. */
  stand?: null | string;
}

/** `GET /api/inscripciones` — lista las inscripciones activas. */
export async function listarInscripciones() {
  return requestClient.get<Inscripcion[]>('/inscripciones');
}

/** `GET /api/inscripciones/{id}` */
export async function obtenerInscripcion(id: number) {
  return requestClient.get<Inscripcion>(`/inscripciones/${id}`);
}

/**
 * `POST /api/inscripciones` — el backend responde 400 si falta alguna de las tres
 * relaciones, si el id enviado no existe o si la categoría es de otra actividad,
 * y 409 si el proyecto ya está inscrito en esa actividad (una inscripción por
 * proyecto y actividad: cambiar de categoría es un traslado).
 */
export async function crearInscripcion(data: InscripcionForm) {
  return requestClient.post<Inscripcion>('/inscripciones', data);
}

/**
 * `PUT /api/inscripciones/{id}` — mismos 400 y 409 que el alta, pero la fila que
 * se está editando se excluye del chequeo de duplicados, así que guardar sin
 * cambios no se rechaza a sí mismo.
 */
export async function actualizarInscripcion(id: number, data: InscripcionForm) {
  return requestClient.put<Inscripcion>(`/inscripciones/${id}`, data);
}

/**
 * `DELETE /api/inscripciones/{id}` — borrado lógico: el backend pone
 * `estado = 'X'`. No propaga a `Evaluacion`, igual que el legacy.
 */
export async function eliminarInscripcion(id: number) {
  return requestClient.delete<void>(`/inscripciones/${id}`);
}

/**
 * `POST /api/inscripciones/{id}/traslado` — cambia el proyecto de categoría dentro
 * de la misma actividad. Archiva sus evaluaciones (quedan como historial) y crea
 * una inscripción nueva, que deberá volver a ser evaluada.
 */
export async function trasladarInscripcion(id: number, idCategoriaActividad: number) {
  return requestClient.post<Inscripcion>(`/inscripciones/${id}/traslado`, {
    idCategoriaActividad,
  });
}

/**
 * `PUT /api/inscripciones/orden` — fija el orden de presentación de una categoría
 * (lo que lista la app del jurado). `idsInscripcion` debe traer todas sus
 * inscripciones activas; si no coincide (alguien la cambió), responde 409.
 */
export async function guardarOrdenPresentacion(idCategoriaActividad: number, idsInscripcion: number[]) {
  return requestClient.put<void>('/inscripciones/orden', {
    idCategoriaActividad,
    inscripciones: idsInscripcion,
  });
}

/** Una fila del cambio en bloque de jornada y/o stand. */
export interface DatosFeriaItem {
  idInscripcion: number;
  jornada?: null | number;
  stand?: null | string;
}

/**
 * `PUT /api/inscripciones/datos-feria` — cambia en bloque la jornada y/o el stand.
 * `campos` dice cuáles se tocan (`jornada`, `stand`): así se pasan 50 proyectos
 * a la jornada 2 sin borrar sus stands. Devuelve cuántas se actualizaron; 400 si
 * algún valor no es válido.
 */
export async function guardarDatosFeria(items: DatosFeriaItem[], campos: ('jornada' | 'stand')[]) {
  return requestClient.put<number>('/inscripciones/datos-feria', { campos, items });
}

/**
 * Pasa varias inscripciones a un día (`null` = quitarles el día) sin tocar sus
 * stands. Un solo `PUT /api/inscripciones/datos-feria`; devuelve cuántas cambió.
 */
export async function asignarJornadaEnBloque(idsInscripcion: number[], jornada: null | number) {
  return guardarDatosFeria(
    idsInscripcion.map((idInscripcion) => ({ idInscripcion, jornada })),
    ['jornada'],
  );
}

/**
 * `PUT /api/inscripciones/{id}/nota-directa` — registra la nota de acta del
 * proyecto («8.5», «95/100»; `escala` cuando el texto no dice sobre cuánto es).
 * Desde ahí es su puntaje (llevado al máximo de la categoría) y ningún jurado lo
 * evalúa.
 */
export async function guardarNotaDirecta(
  idInscripcion: number,
  datos: { escala: null | number; nota: string; observacion: null | string },
) {
  return requestClient.put<NotaActa>(`/inscripciones/${idInscripcion}/nota-directa`, datos);
}

/** `DELETE /api/inscripciones/{id}/nota-directa` — el proyecto vuelve a los jurados. */
export async function quitarNotaDirecta(idInscripcion: number) {
  return requestClient.delete<void>(`/inscripciones/${idInscripcion}/nota-directa`);
}

/**
 * `PUT /api/inscripciones/{id}/exclusion-ranking` — saca el proyecto del ranking
 * (p. ej. no se presentó a la feria pero se evaluó internamente). Conserva su
 * puntaje; no recibe puesto ni sale en la TV, el público ni las actas.
 */
export async function excluirDelRanking(idInscripcion: number, motivo: string) {
  return requestClient.put<ExclusionRanking>(`/inscripciones/${idInscripcion}/exclusion-ranking`, { motivo });
}

/** `DELETE /api/inscripciones/{id}/exclusion-ranking` — el proyecto vuelve a competir. */
export async function quitarExclusionRanking(idInscripcion: number) {
  return requestClient.delete<void>(`/inscripciones/${idInscripcion}/exclusion-ranking`);
}
