import { reactive } from 'vue';

/**
 * Avisos y confirmaciones de la app web ligera del jurado, con la misma firma que
 * `composables/useAvisos.ts` (que depende de ant-design y no se carga aquí). Los pinta
 * `avisos.vue`, montado una vez en `app.vue`.
 */
export type TipoAviso = 'advertencia' | 'error' | 'exito' | 'info';

export interface Aviso {
  id: number;
  mensaje?: string;
  tipo: TipoAviso;
  titulo: string;
}

export interface Confirmacion {
  mensaje?: string;
  peligro?: boolean;
  resolver: (ok: boolean) => void;
  textoAceptar?: string;
  textoCancelar?: string;
  titulo: string;
}

export const estadoAvisos = reactive({
  avisos: [] as Aviso[],
  confirmacion: null as Confirmacion | null,
});

let siguienteId = 1;

export function cerrarAviso(id: number) {
  estadoAvisos.avisos = estadoAvisos.avisos.filter((a) => a.id !== id);
}

export function avisar(op: { duracion?: number; mensaje?: string; tipo?: TipoAviso; titulo: string }) {
  const id = siguienteId++;
  const tipo = op.tipo ?? 'info';
  estadoAvisos.avisos = [...estadoAvisos.avisos.slice(-2), { id, mensaje: op.mensaje, tipo, titulo: op.titulo }];
  // Los errores se quedan hasta que el jurado los cierre.
  const duracion = op.duracion ?? (tipo === 'error' ? 0 : 4500);
  if (duracion > 0) setTimeout(() => cerrarAviso(id), duracion);
}

export function confirmar(op: Omit<Confirmacion, 'resolver'>): Promise<boolean> {
  estadoAvisos.confirmacion?.resolver(false);
  return new Promise((resolver) => {
    estadoAvisos.confirmacion = {
      ...op,
      resolver: (ok) => {
        estadoAvisos.confirmacion = null;
        resolver(ok);
      },
    };
  });
}
