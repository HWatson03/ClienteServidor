/** Actividad y categoría en la que se inscribe un proyecto recién creado. */
export interface InscripcionNueva {
  idActividad: number;
  idCategoriaActividad: number;
  /** Feria de varios días: jornada (1..N) y stand; opcionales. */
  jornada?: null | number;
  stand?: null | string;
}

/** Jornada y stand editados de la inscripción en la actividad de trabajo (solo si cambiaron). */
export interface DatosFeriaEditados {
  idInscripcion: number;
  jornada: null | number;
  stand: null | string;
}
