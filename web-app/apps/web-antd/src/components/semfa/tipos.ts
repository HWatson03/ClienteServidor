/** Tipos de las props de los componentes `semfa-*`. */

export interface EtiquetaPersona {
  texto: string;
  tipo: 'aviso' | 'bloqueo' | 'info';
  /** Texto al pasar el ratón por la etiqueta. */
  titulo?: string;
}

export interface PersonaRespaldo {
  ci: null | string;
  idPersona: number;
  nombre: null | string;
}
