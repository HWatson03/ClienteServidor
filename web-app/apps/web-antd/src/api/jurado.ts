import { requestClient } from '#/api/request';

/**
 * Contratos del panel de jurado (`JuradoApiController`, `/api/jurado/**`).
 *
 * Mapea los DTOs de `com.example.proyecto.Models.Dto`. El interceptor de
 * `request.ts` desenvuelve `ApiResponse<T>` y devuelve `data`.
 */

/** `ActividadMiniDto` — actividad asignada al jurado. */
export interface ActividadJurado {
  id: number;
  nombre: string;
  descripcion: null | string;
  fecha: null | string;
}

/** `CategoriaDto` — `actividadNombre` viene null en las queries de 2 campos. */
export interface CategoriaJurado {
  actividadNombre: null | string;
  id: number;
  nombre: string;
}

/** `InscripcionPendienteDto` — inscripción sin evaluar por este jurado. */
export interface InscripcionPendiente {
  categoriaId: null | number;
  categoriaNombre: null | string;
  id: number;
  institucion: null | string;
  orden: null | number;
  participanteNombre: string;
}

/** `RubricaCriterioDto`. */
export interface RubricaCriterioJurado {
  descripcion: null | string;
  id: number;
  maxPuntos: null | number;
  nombre: string;
  porcentaje: null | number;
}

/** `RubricaDto`. */
export interface RubricaJurado {
  criterios: RubricaCriterioJurado[];
  id: number;
  nombre: string;
  version: null | string;
}

/** Detalle de `EvaluacionGuardarDto` (puntaje 0..100). */
export interface DetalleEvaluacionPanel {
  criterioId: number;
  puntaje: number;
}

/** `EvaluacionGuardarDto` — endpoint {@code POST /api/jurado/evaluar}. */
export interface EvaluacionGuardar {
  actividadId: number;
  detalles: DetalleEvaluacionPanel[];
  inscripcionId: number;
  rubricaId: number;
}

/** Detalle de `EvaluacionCompletaDto` (puntaje 1..10). */
export interface DetalleEvaluacionCategoria {
  criterioId: number;
  observacion?: null | string;
  puntaje: number;
}

/** Rúbrica a guardar dentro de `EvaluacionCompletaDto`. */
export interface EvaluacionRubrica {
  detalles: DetalleEvaluacionCategoria[];
  rubricaId: number;
}

/** `EvaluacionCompletaDto` — todas las rúbricas de un participante en 1 petición. */
export interface EvaluacionCompleta {
  categoriaId: number;
  participanteId: number;
  rubricas: EvaluacionRubrica[];
}

/** `EvaluacionResultDto`. */
export interface ResultadoEvaluacion {
  message: string;
  participanteId: number;
  promedioTotal: number;
  rubricasGuardadas: number;
  success: boolean;
}

/** Criterio dentro de la respuesta de entrada universitaria. */
export interface CriterioEntrada {
  descripcion: null | string;
  id: number;
  maxPuntos: number;
  nombre: string;
}

/** Participante dentro de la respuesta de entrada universitaria. */
export interface ParticipanteEntrada {
  evaluado: boolean;
  id: number;
  institucion: null | string;
  nombre: string;
  puntajes: Record<number, number>;
}

/** Sección categoría de `obtenerDatosEvaluacion`. */
export interface CategoriaEntrada {
  criterios: CriterioEntrada[];
  idCategoria: number;
  idRubrica: number;
  nombreCategoria: string;
  participantes: ParticipanteEntrada[];
}

/** `GET /api/jurado/entrada/{actId}/datos`. */
export interface DatosEntrada {
  categoria: CategoriaEntrada;
  nombreActividad: string;
}

/** `CronometroDTO` recibido por SSE. */
export interface Cronometro {
  accion: null | string;
  estado: null | string;
  participanteId: null | number;
  participanteNombre: null | string;
  tiempoRestante: null | number;
  timestamp: null | number;
}

/** `GET /api/jurado/sse-token`. */
export interface SseToken {
  expiraEnSegundos: number;
  token: string;
}

/** `GET /api/jurado/actividades`. */
export async function listarActividadesJurado() {
  return requestClient.get<ActividadJurado[]>('/jurado/actividades');
}

/** `GET /api/jurado/{actId}/categorias`. */
export async function categoriasDeActividad(actId: number) {
  return requestClient.get<CategoriaJurado[]>(`/jurado/${actId}/categorias`);
}

/** `GET /api/jurado/{actId}/inscripciones-pendientes?categoriaId=`. */
export async function inscripcionesPendientes(
  actId: number,
  categoriaId?: number,
) {
  const params = categoriaId != null ? { categoriaId } : undefined;
  return requestClient.get<InscripcionPendiente[]>(
    `/jurado/${actId}/inscripciones-pendientes`,
    { params },
  );
}

/** `GET /api/jurado/{actId}/rubrica`. */
export async function rubricaDeActividad(actId: number) {
  return requestClient.get<RubricaJurado>(`/jurado/${actId}/rubrica`);
}

/** `POST /api/jurado/evaluar`. */
export async function evaluarParticipante(datos: EvaluacionGuardar) {
  return requestClient.post<void>('/jurado/evaluar', datos);
}

/** `POST /api/jurado/evaluar-completo`. */
export async function evaluarCompleto(datos: EvaluacionCompleta) {
  return requestClient.post<ResultadoEvaluacion>('/jurado/evaluar-completo', datos);
}

/** `GET /api/jurado/entrada/{actId}/datos`. */
export async function datosEntrada(actId: number) {
  return requestClient.get<DatosEntrada>(`/jurado/entrada/${actId}/datos`);
}

/** `POST /api/jurado/entrada/guardar`. */
export async function guardarEntrada(
  datos: { idParticipante: number; puntajes: Record<number, number>; total: number },
) {
  return requestClient.post<void>('/jurado/entrada/guardar', datos);
}

/** `GET /api/jurado/sse-token` — token de un uso para el stream del cronómetro. */
export async function obtenerSseToken() {
  return requestClient.get<SseToken>('/jurado/sse-token');
}
// ── Mis evaluaciones (`JuradoTableroService`) ────────────────────────────────

/** Avance del jurado con un proyecto: todas sus rúbricas, algunas o ninguna. */
export type EstadoJurado = 'EVALUADO' | 'PARCIAL' | 'PENDIENTE';

/** `TableroJuradoResponse.Proyecto`. */
export interface ProyectoTablero {
  actualizado: null | string;
  /** Campos de feria (FEXCOIN); `null` en otras actividades o si no se cargaron. */
  carrera: null | string;
  facultad: null | string;
  /** Día de la feria en que se presenta (1, 2, …). */
  jornada: null | number;
  stand: null | string;
  estado: EstadoJurado;
  idInscripcion: number;
  idParticipante: number;
  institucion: null | string;
  nombre: string;
  /** Orden de presentación; `null` si no se definió. */
  orden: null | number;
  rubricasEvaluadas: number;
  /** Suma de lo que el jurado ya guardó. */
  total: null | number;
}

/** `TableroJuradoResponse.Categoria`. */
export interface CategoriaTablero {
  actividad: string;
  criterios: number;
  evaluados: number;
  idActividad: number;
  idCategoria: number;
  nombre: string;
  pendientes: number;
  proyectos: ProyectoTablero[];
  puntajeMaximo: number;
  rubricas: number;
}

/** `GET /api/jurado/tablero` (`TableroJuradoResponse`). */
export interface TableroJurado {
  categorias: CategoriaTablero[];
  jurado: { idJurado: number; nombre: null | string };
  resumen: { evaluados: number; parciales: number; pendientes: number; proyectos: number };
}

/**
 * `EvaluacionJuradoResponse.Criterio`: se califica de `minimo` a `maximo`, de
 * `paso` en `paso` (1 = enteros), o eligiendo uno de `niveles` si `soloNiveles`.
 * Los criterios antiguos llegan con mínimo 1, paso 1 y sin niveles.
 */
export interface CriterioHoja {
  descripcion: null | string;
  idCriterio: number;
  maximo: number;
  minimo: number;
  /**
   * Niveles con descripción. Los de rango (FEXCOIN) traen además `nombre` y `desde`;
   * `puntos` es entonces el tope del rango.
   */
  niveles: { desde?: null | number; descripcion: null | string; nombre?: null | string; puntos: number }[];
  nombre: string;
  paso: number;
  puntaje: null | number;
  soloNiveles: boolean;
}

export interface RubricaHoja {
  criterios: CriterioHoja[];
  evaluada: boolean;
  idRubrica: number;
  nombre: string;
  version: null | string;
}

/** `GET …/categorias/{c}/participantes/{p}/evaluacion` (`EvaluacionJuradoResponse`). */
export interface HojaEvaluacion {
  actividad: null | string;
  actualizado: null | string;
  /** Campos de feria (FEXCOIN); `null` en otras actividades o si no se cargaron. */
  carrera: null | string;
  facultad: null | string;
  /** Día de la feria en que se presenta (1, 2, …). */
  jornada: null | number;
  stand: null | string;
  categoria: string;
  estado: EstadoJurado;
  idCategoria: number;
  idParticipante: number;
  institucion: null | string;
  orden: null | number;
  proyecto: string;
  reevaluacionAutorizada: boolean;
  puntajeMaximo: number;
  rubricas: RubricaHoja[];
  total: null | number;
}

/** `GET /api/jurado/tablero` — lo que el jurado logueado tiene que evaluar. */
export async function obtenerTableroJurado() {
  return requestClient.get<TableroJurado>('/jurado/tablero');
}

/** Hoja de evaluación de un proyecto con lo ya calificado (para evaluar o corregir). */
export async function obtenerHojaEvaluacion(idCategoria: number, idParticipante: number) {
  return requestClient.get<HojaEvaluacion>(
    `/jurado/categorias/${idCategoria}/participantes/${idParticipante}/evaluacion`,
  );
}
