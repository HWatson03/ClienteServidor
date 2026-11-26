/**
 * Avisos de resultado (éxito, error, advertencia, información) y confirmaciones
 * de las vistas SEMFA, con el mismo diseño que tablas y formularios.
 *
 * - `avisar()` apila un aviso que se cierra solo (barra de tiempo, pausa al pasar
 *   el ratón) o con su botón ✕. Lo pinta `components/semfa/semfa-avisos.vue`,
 *   montado una vez en `app.vue`.
 * - `confirmar()` pide confirmación antes de una acción, con los botones 3D.
 * - `describirError()` convierte un error de la API en título y mensaje; lo usa
 *   el interceptor de `api/request.ts`, así que todo error de red o del backend
 *   llega como aviso sin código extra en cada vista.
 */
import type { ButtonProps } from 'ant-design-vue';

import { readonly, ref } from 'vue';

import { Modal } from 'ant-design-vue';

export type TipoAviso = 'advertencia' | 'error' | 'exito' | 'info';

export interface OpcionesAviso {
  /** Botón extra dentro del aviso (p. ej. «Ver», «Reintentar»). */
  accion?: { alPulsar: () => void; texto: string };
  /** Líneas adicionales, p. ej. los motivos de cada fallo en un lote. */
  detalles?: string[];
  /** Milisegundos hasta cerrarse solo; `0` = solo se cierra a mano. */
  duracion?: number;
  mensaje?: string;
  tipo: TipoAviso;
  titulo: string;
}

export interface Aviso extends OpcionesAviso {
  duracion: number;
  id: number;
}

/** Los errores y advertencias duran más: suelen pedir leer y actuar. */
const DURACION: Record<TipoAviso, number> = {
  advertencia: 7000,
  error: 8000,
  exito: 4500,
  info: 5000,
};

/** A partir de aquí se descartan los más antiguos para no tapar la pantalla. */
const MAXIMO = 4;

const avisos = ref<Aviso[]>([]);
let siguienteId = 0;
let silencio = 0;

export function avisar(opciones: OpcionesAviso): number {
  siguienteId += 1;
  const aviso: Aviso = {
    ...opciones,
    duracion: opciones.duracion ?? DURACION[opciones.tipo],
    id: siguienteId,
  };
  avisos.value = [aviso, ...avisos.value].slice(0, MAXIMO);
  return aviso.id;
}

export function cerrarAviso(id: number) {
  avisos.value = avisos.value.filter((a) => a.id !== id);
}

/** Lista de avisos visibles, para `semfa-avisos.vue`. */
export function useAvisos() {
  return { avisos: readonly(avisos), cerrar: cerrarAviso };
}

// ---------------------------------------------------------------- errores de la API

/**
 * Ejecuta `fn` sin que el interceptor muestre un aviso por cada error: para
 * lotes (p. ej. varias altas seguidas) que resumen los fallos en un único aviso.
 */
export async function sinAvisosDeError<T>(fn: () => Promise<T>): Promise<T> {
  silencio += 1;
  try {
    return await fn();
  } finally {
    silencio -= 1;
  }
}

export function avisosDeErrorSilenciados() {
  return silencio > 0;
}

const TITULO_POR_ESTADO: Record<number, string> = {
  400: 'Datos no válidos',
  401: 'Sesión expirada',
  403: 'Sin permiso',
  404: 'No encontrado',
  409: 'Registro duplicado',
};

/**
 * Título según el código HTTP y el mensaje de negocio que manda el backend en
 * `ApiResponse.mensaje`. `respaldo` es el texto genérico de vben si no hay otro.
 */
export function describirError(error: any, respaldo = ''): { mensaje: string; titulo: string } {
  const estado: number | undefined = error?.response?.status;
  const datos = error?.response?.data ?? {};
  const mensaje: string =
    datos?.mensaje ?? datos?.message ?? respaldo ?? error?.message ?? '';
  let titulo = 'No se pudo completar la operación';
  if (!error?.response) {
    titulo = 'Sin conexión con el servidor';
  } else if (estado && TITULO_POR_ESTADO[estado]) {
    titulo = TITULO_POR_ESTADO[estado];
  } else if (estado && estado >= 500) {
    titulo = 'Error del servidor';
  }
  return { mensaje, titulo };
}

// ---------------------------------------------------------------- confirmación

export interface OpcionesConfirmar {
  mensaje: string;
  /** Acción destructiva: botón rojo e ícono de advertencia. */
  peligro?: boolean;
  textoAceptar?: string;
  textoCancelar?: string;
  titulo: string;
}

/**
 * Props de un botón de `Modal.confirm` con clases `semfa-btn`. antd reparte
 * `okButtonProps`/`cancelButtonProps` sobre su `Button`, así que `class` llega al
 * elemento, pero `ButtonProps` no lo declara en sus tipos.
 */
function botonSemfa(variante: string): ButtonProps {
  return { class: `semfa-btn semfa-btn--${variante}`, size: 'large' } as ButtonProps;
}

/**
 * Pregunta antes de actuar. Devuelve `true` si se aceptó. Mismo marco que los
 * formularios: botones `semfa-btn` y estilos `.semfa-confirmar` de `semfa.css`.
 */
export function confirmar(opciones: OpcionesConfirmar): Promise<boolean> {
  return new Promise((resolve) => {
    Modal.confirm({
      cancelButtonProps: botonSemfa('neutro'),
      cancelText: opciones.textoCancelar ?? 'Cancelar',
      centered: true,
      class: `semfa-confirmar${opciones.peligro ? ' semfa-confirmar--peligro' : ''}`,
      content: opciones.mensaje,
      okButtonProps: botonSemfa(opciones.peligro ? 'peligro' : 'primario'),
      okText: opciones.textoAceptar ?? 'Aceptar',
      onCancel: () => resolve(false),
      onOk: () => resolve(true),
      title: opciones.titulo,
      width: 460,
    });
  });
}
