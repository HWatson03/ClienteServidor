import { requestClient } from '#/api/request';

/**
 * `api/dto/ResultadosActividadResponse.java`: resultados de una actividad con
 * todo el detalle, calculados en `ResultadosActividadService` (los mismos que
 * usan los PDF).
 *
 * Puntaje de un proyecto = promedio de los totales de los jurados que llenaron
 * todas las rúbricas. El puesto aparece al completar toda la categoría.
 */
export interface Resultados {
  actividad: ResultadosActividad;
  categorias: ResultadosCategoria[];
  /** `yyyy-MM-dd'T'HH:mm:ss`, hora de La Paz. */
  generado: string;
  jurados: ResultadosJurado[];
  /** La evaluación está `CERRADA`: resultados oficiales. */
  oficial: boolean;
}

export interface ResultadosActividad {
  estadoEvaluacion: string;
  fecha: null | string;
  idActividad: number;
  nombre: string;
}

export interface ResultadosCategoria {
  carrera: null | string;
  completos: number;
  idCategoria: number;
  /** Asignados primero; `asignado: false` = calificó aquí pero ya no está asignado. */
  jurados: { asignado: boolean; idJurado: number; nombre: string }[];
  nivel: null | string;
  nombre: string;
  /** Ordenados por puesto; sin puesto, al final. */
  proyectos: ResultadosProyecto[];
  /** Lo más que puede dar un jurado (suma de los máximos de los criterios). */
  puntajeMaximo: number;
  rubricas: ResultadosRubrica[];
}

export interface ResultadosRubrica {
  criterios: { idCriterio: number; maximo: number; nombre: string }[];
  idRubrica: number;
  maximo: number;
  nombre: string;
}

export type EstadoResultado = 'COMPLETO' | 'EN_PROCESO' | 'SIN_INICIAR' | 'SIN_JURADOS';

export interface ResultadosProyecto {
  calificaciones: ResultadosCalificacion[];
  /** Carrera del participante (`null` en actividades sin carrera). */
  carrera: null | string;
  categoriaParticipante: null | string;
  docenteGuia: null | string;
  estado: EstadoResultado;
  facultad: null | string;
  idInscripcion: number;
  idParticipante: number;
  institucion: null | string;
  /** Día de la feria en que se presenta (1, 2) o `null`. */
  jornada: null | number;
  /** Jurados que le corresponden a este proyecto (un jurado puede estar limitado a ciertos proyectos). */
  juradosAsignados: number;
  juradosCompletos: number;
  nombre: null | string;
  orden: null | number;
  /** 1..n al completar toda la categoría; `0` mientras sigue la evaluación. */
  puesto: number;
  puntaje: null | number;
  siglaFacultad: null | string;
  stand: null | string;
  /** Ids de los jurados que deben evaluar este proyecto (cubren su inscripción). */
  juradosDelProyecto?: number[];
  /**
   * Nota de acta cargada a mano: si existe, `puntaje` es esa nota llevada al
   * máximo de la categoría y el proyecto está `COMPLETO` sin jurados.
   */
  notaDirecta?: NotaActa | null;
  /** Excluido del ranking a mano: conserva su puntaje, `puesto` 0, no va al público. */
  exclusion?: ExclusionRanking | null;
}

/** `ResultadosActividadResponse.Exclusion`. */
export interface ExclusionRanking {
  /** `yyyy-MM-dd'T'HH:mm:ss`, hora de La Paz. */
  fecha: null | string;
  motivo: string;
  usuario: null | string;
}

/** `ResultadosActividadResponse.NotaActa`: la nota tal como vino escrita («8.5/10»). */
export interface NotaActa {
  escala: number;
  /** `yyyy-MM-dd'T'HH:mm:ss`, hora de La Paz. */
  fecha: null | string;
  observacion: null | string;
  texto: string;
  usuario: null | string;
  valor: number;
}

export interface ResultadosCalificacion {
  /** Llenó todas las rúbricas: cuenta en el puntaje. */
  completa: boolean;
  idJurado: number;
  /** `criterios`: idCriterio → puntaje (las claves llegan como texto). */
  rubricas: { criterios: Record<string, number>; idRubrica: number; subtotal: number }[];
  total: number;
}

export interface ResultadosJurado {
  categorias: number[];
  ci: null | string;
  evaluacionesEsperadas: number;
  evaluacionesHechas: number;
  idJurado: number;
  nombre: string;
}

/** Un proyecto con evaluación completa en la vista pública (nunca notas por jurado). */
export interface ResultadosPosicion {
  carrera: null | string;
  idInscripcion: number;
  institucion: null | string;
  nombre: null | string;
  /** `0` hasta que toda la categoría termine de evaluarse. */
  puesto: number;
  puntaje: number;
  siglaFacultad: null | string;
}

/** `api/dto/ResultadosPublicosResponse.java`: solo puesto y puntaje final (pantalla TV). */
export interface ResultadosPublicos {
  actividad: ResultadosActividad;
  categorias: {
    /** Proyectos que aún no tienen todas sus evaluaciones. */
    enEvaluacion: number;
    idCategoria: number;
    inscritos: number;
    nombre: string;
    posiciones: ResultadosPosicion[];
    puntajeMaximo: number;
  }[];
  generado: string;
  oficial: boolean;
}

/** `GET /api/resultados/{idActividad}` */
export async function obtenerResultados(idActividad: number) {
  return requestClient.get<Resultados>(`/resultados/${idActividad}`);
}

/** `GET /api/resultados/{idActividad}/publico` */
export async function obtenerResultadosPublicos(idActividad: number) {
  return requestClient.get<ResultadosPublicos>(`/resultados/${idActividad}/publico`);
}

/** Rutas de los PDF, relativas a `/api/resultados/{idActividad}/pdf/`. */
export const PDF_RESULTADOS = {
  resumen: (idInscripcion: number, idJurado?: number) => ({
    params: { jurado: idJurado }, ruta: `resumen/${idInscripcion}`,
  }),
  /** Cuadro consolidado: total de cada jurado, puntaje final y puesto. */
  consolidado: (idCategoria?: number) => ({ params: { categoria: idCategoria }, ruta: 'consolidado' }),
  /** Planilla de un jurado, para su firma. */
  jurado: (idJurado: number) => ({ params: {}, ruta: `jurado/${idJurado}` }),
  /** Informe de un proyecto: rúbricas y criterios por jurado. */
  participante: (idInscripcion: number) => ({ params: {}, ruta: `participante/${idInscripcion}` }),
  /** Los informes de todos los proyectos de la categoría (o de la actividad). */
  participantes: (idCategoria?: number) => ({ params: { categoria: idCategoria }, ruta: 'participantes' }),
  /** Resultados por carrera → categoría: nota de cada jurado, promedio y puesto (sin `carrera`, todas). */
  porCarrera: (carrera?: string, sinEvaluar = true) => ({ params: { carrera, sinEvaluar }, ruta: 'por-carrera' }),
  /** Como `porCarrera` pero sin jurados: puntaje final y 1.º, 2.º y 3.º lugar resaltados. */
  puntajesCarrera: (carrera?: string, sinEvaluar = true) => ({
    params: { carrera, sinEvaluar }, ruta: 'puntajes-carrera',
  }),
  /** Cuadro de ganadores: los tres primeros de cada carrera y categoría. */
  ganadores: (carrera?: string) => ({ params: { carrera }, ruta: 'ganadores' }),
  /** Ranking general de cada carrera, uniendo sus categorías. */
  rankingCarrera: (carrera?: string, sinEvaluar = true) => ({ params: { carrera, sinEvaluar }, ruta: 'ranking-carrera' }),
  /** Acta de resultados: solo el puntaje final (publicable). */
  ranking: (idCategoria?: number) => ({ params: { categoria: idCategoria }, ruta: 'ranking' }),
};

export async function autorizarReevaluacion(idActividad: number, idInscripcion: number, idJurado: number) {
  return requestClient.post(`/resultados/${idActividad}/reevaluacion/${idInscripcion}/${idJurado}`);
}

export type PdfResultados = ReturnType<(typeof PDF_RESULTADOS)[keyof typeof PDF_RESULTADOS]>;

/**
 * Pide un PDF con el JWT. `abrir`: lo muestra en otra pestaña para revisarlo o
 * imprimirlo; si no, lo descarga con `nombre`. `membrete: false` deja en blanco
 * el espacio del membrete (para imprimir en hoja membretada).
 */
export async function obtenerPdfResultados(
  idActividad: number,
  pdf: PdfResultados,
  opciones: { abrir: boolean; membrete: boolean; nombre: string },
) {
  // Se abre la pestaña antes del `await`: después, el navegador la bloquea como popup.
  const pestana = opciones.abrir ? window.open('', '_blank') : null;
  try {
    const blob = await requestClient.download<Blob>(`/resultados/${idActividad}/pdf/${pdf.ruta}`, {
      params: { ...pdf.params, membrete: opciones.membrete },
    });
    const url = URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
    if (pestana) {
      pestana.location.href = url;
    } else {
      const enlace = document.createElement('a');
      enlace.href = url;
      enlace.download = opciones.nombre;
      document.body.append(enlace);
      enlace.click();
      enlace.remove();
    }
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (error) {
    pestana?.close();
    throw error;
  }
}
