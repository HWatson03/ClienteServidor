import { requestClient } from '#/api/request';

/**
 * `RubricaCriterioResponse` de `com.example.proyecto.api.dto`.
 *
 * `nombreCategoriaRubrica` es la columna «Categoria» de la tabla, que el legacy
 * sacaba de `rubrica.categoriaActividad.nombre`.
 */
export interface RubricaCriterio {
  descripcion: null | string;
  /**
   * Veces que se calificó en evaluaciones activas. Con alguna, el backend no deja
   * cambiar su puntaje ni su rúbrica, ni eliminarlo (409).
   */
  evaluaciones: number;
  idRubrica: null | number;
  idRubricaCriterio: number;
  maxPuntos: null | number;
  nombre: null | string;
  nombreCategoriaRubrica: null | string;
  nombreRubrica: null | string;
  /**
   * Puntaje máximo del ítem. En los criterios antiguos (escala heredada) el tope
   * efectivo es 10; con escala propia, el que se defina.
   */
  porcentaje: number;
  /** Escala con la que lo califica el jurado (`EscalaCriterio`). */
  escala: EscalaCriterio;
}

/**
 * Un nivel de la escala. `puntos` es el valor del atajo o, en los niveles por rango
 * (FEXCOIN), su tope («hasta»); `nombre` y `desde` solo vienen en esos.
 */
export interface NivelEscala {
  /** Primer entero del rango (solo niveles por rango). */
  desde?: null | number;
  descripcion: null | string;
  /** Solo niveles por rango: «Deficiente», «Regular», … */
  nombre?: null | string;
  puntos: number;
}

/**
 * `Models/Service/EscalaCriterio.java`. `heredada`: enteros de 1 a 10 (criterios
 * creados antes de la escala); si no, de `minimo` a `maximo` de `paso` en `paso`,
 * con `niveles` opcionales (y `soloNiveles` = solo se elige uno de ellos).
 */
export interface EscalaCriterio {
  heredada: boolean;
  maximo: number;
  minimo: number;
  niveles: NivelEscala[];
  paso: number;
  soloNiveles: boolean;
}

/** Lo que se envía de la escala al crear o editar un criterio. */
export interface EscalaForm {
  niveles: NivelEscala[];
  paso: number;
  puntajeMinimo: number;
  soloNiveles: boolean;
}

/**
 * Campos que edita el formulario.
 *
 * `maxPuntos` no lo editaba el legacy — es el campo con el que puntúa FEXCOIN — así
 * que no viaja y el backend conserva el valor de la fila.
 */
export interface RubricaCriterioForm extends Partial<EscalaForm> {
  descripcion: string;
  idRubrica?: number;
  idRubricaCriterio?: number;
  nombre: string;
  /** Puntaje máximo (con niveles, el mayor de ellos). */
  porcentaje: number;
}

/** `GET /api/rubricas-criterio` — lista los criterios activos. */
export async function listarRubricasCriterio() {
  return requestClient.get<RubricaCriterio[]>('/rubricas-criterio');
}

/** `GET /api/rubricas-criterio/{id}` */
export async function obtenerRubricaCriterio(id: number) {
  return requestClient.get<RubricaCriterio>(`/rubricas-criterio/${id}`);
}

/**
 * `POST /api/rubricas-criterio` — 400 si falta la rúbrica, el nombre o el
 * porcentaje (1-100); 409 si la rúbrica ya tiene un criterio con ese nombre o ya
 * tiene evaluaciones (no se le agregan ítems).
 */
export async function crearRubricaCriterio(data: RubricaCriterioForm) {
  return requestClient.post<RubricaCriterio>('/rubricas-criterio', data);
}

/** `PUT /api/rubricas-criterio/{id}` */
export async function actualizarRubricaCriterio(
  id: number,
  data: RubricaCriterioForm,
) {
  return requestClient.put<RubricaCriterio>(`/rubricas-criterio/${id}`, data);
}

/** `DELETE /api/rubricas-criterio/{id}` — borrado lógico. */
export async function eliminarRubricaCriterio(id: number) {
  return requestClient.delete<void>(`/rubricas-criterio/${id}`);
}
