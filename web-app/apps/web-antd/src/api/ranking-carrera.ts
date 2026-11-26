import { requestClient } from '#/api/request';

/**
 * Salida de `GET /api/ranking-carrera/datos`
 * (`com.example.proyecto.api.dto.RankingCarreraResponse`).
 *
 * El cálculo ya viene hecho en `RankingCarreraService`: estas interfaces solo
 * sirven para tipar lo que la vista pinta. Los dos campos derivados que el legacy
 * computaba en JavaScript (`c.ganadorNivel` presente, `f.promedio` no nulo) se
 * resuelven en la vista, para no inventar campos que el backend no envía.
 */
export interface RankingCarrera {
  /** Tabla del nivel Avanzado. */
  avanzado: RankingCarreraNivel;
  /** Tabla del nivel Básico. */
  basico: RankingCarreraNivel;
  /**
   * Nivel del ganador de la carrera (el premio): `BASICO` o `AVANZADO`.
   * `null` si ninguno de los dos niveles tiene resultados.
   */
  ganadorNivel: null | string;
  /** Promedio del ganador, a 2 decimales. */
  ganadorPromedio: null | number;
  ganadorProyecto: null | string;
  carrera: null | string;
  idCarrera: null | number;
}

/** Tabla de un nivel dentro de una carrera. */
export interface RankingCarreraNivel {
  /**
   * `null` si esa carrera no tiene categoría para este nivel; entonces `filas`
   * viene vacía.
   */
  categoriaId: null | number;
  /** Proyectos inscritos, ordenados por promedio descendente. */
  filas: RankingCarreraFila[];
  /** Cuántos jurados están asignados a la categoría de este nivel. */
  juradosEsperados: number;
  nivel: null | string;
}

/** Un proyecto dentro de un nivel. */
export interface RankingCarreraFila {
  /** `true` si los `juradosEsperados` completaron todas las rúbricas. */
  completo: boolean;
  juradosEvaluaron: number;
  /** Media de los totales por jurado a 2 decimales; `null` si aún no hay ninguno. */
  promedio: null | number;
  participanteId: null | number;
  /** 1..n por orden de promedio; `0` si el proyecto todavía no tiene promedio. */
  posicion: number;
  proyecto: null | string;
}

/** Respuesta completa: la lista de carreras, ya ordenada por nombre. */
export interface RankingCarreraResponse {
  carreras: RankingCarrera[];
}

/**
 * `GET /api/ranking-carrera/datos` — solo lectura, no hay ni POST ni DELETE.
 *
 * Es la versión con prefijo `/api` y envuelta en `ApiResponse` de
 * `/ranking-carrera/datos` del backend.
 */
export async function obtenerRankingCarrera() {
  return requestClient.get<RankingCarreraResponse>('/ranking-carrera/datos');
}
