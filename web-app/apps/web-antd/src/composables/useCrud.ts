import type { Recordable } from '@vben/types';

import { ref, shallowRef } from 'vue';

import { avisar, confirmar } from '#/composables/useAvisos';

export interface CrudOptions<T, Q> {
  /**
   * Ejecuta el alta o la edición. El backend decide según haya o no `id` en el
   * cuerpo, así que basta con diferenciar dentro de la implementación.
   */
  guardar: (payload: Q) => Promise<unknown>;
  /** Etiqueta de la entidad en los mensajes, p. ej. 'Persona'. */
  nombre: string;
  /**
   * Texto que identifica al registro en el aviso de resultado, p. ej. el nombre
   * completo: «Persona «Juan Pérez» se registró correctamente».
   */
  etiqueta?: (payload: Q) => string | undefined;
  /** Borra un registro por id (el backend hace borrado lógico). */
  remover?: (id: number) => Promise<unknown>;
  /** Obtiene la lista de registros. */
  listar: () => Promise<T[]>;
  /** Campo que identifica cada fila. */
  idKey: keyof T;
}

/**
 * Estado compartido de un CRUD: lista, alta/edición y borrado con confirmación,
 * recargando tras cada operación.
 *
 * Reemplaza el patrón repetido de las vistas legacy por entidad
 * (`cargarTabla*`, `eliminarRegistroAlert` y el `recargarTabla` que le pasaban).
 */
export function useCrud<T extends Record<string, any>, Q extends Recordable<any>>(
  options: CrudOptions<T, Q>,
) {
  const items = shallowRef<T[]>([]);
  const cargando = ref(false);
  const guardando = ref(false);

  async function recargar() {
    cargando.value = true;
    try {
      items.value = (await options.listar()) ?? [];
    } finally {
      cargando.value = false;
    }
  }

  /**
   * Guarda el payload (alta o edición según lo resuelva el backend) y avisa del
   * resultado. Los errores los avisa el interceptor de `api/request.ts`.
   *
   * Devuelve `true` solo si la operación terminó bien, para que el formulario
   * pueda cerrar el modal únicamente en ese caso y no perder lo capturado.
   *
   * `esEdicion` se deduce del id en el payload; se puede forzar cuando el
   * formulario no lo lleva (el id viaja en la URL).
   */
  async function guardar(
    payload: Q,
    opciones: { esEdicion?: boolean } = {},
  ): Promise<boolean> {
    const esEdicion =
      opciones.esEdicion ??
      (payload as Record<string, unknown>)[options.idKey as string] !== undefined;
    guardando.value = true;
    try {
      await options.guardar(payload);
      const etiqueta = options.etiqueta?.(payload)?.trim();
      avisar({
        mensaje: `${options.nombre}${etiqueta ? ` «${etiqueta}»` : ''} se ${
          esEdicion ? 'actualizó' : 'registró'
        } correctamente.`,
        tipo: 'exito',
        titulo: esEdicion ? 'Cambios guardados' : 'Registro guardado',
      });
      await recargar();
      return true;
    } catch {
      // El interceptor de errores ya avisó; solo se restablece el estado.
      return false;
    } finally {
      guardando.value = false;
    }
  }

  /**
   * Pide confirmación, borra el registro y avisa del resultado. `etiqueta` es el
   * texto legible del registro, p. ej. el nombre completo; `advertencia`, lo que
   * depende de él (p. ej. «Tiene 10 categorías…»), se añade a la confirmación.
   */
  async function eliminar(item: T, etiqueta: string, advertencia?: string) {
    if (!options.remover) {
      return;
    }
    const aceptado = await confirmar({
      mensaje: `Se eliminará ${options.nombre.toLowerCase()} «${etiqueta}». ${
        advertencia ? `${advertencia} ` : ''
      }Esta acción no se puede deshacer desde esta pantalla.`,
      peligro: true,
      textoAceptar: 'Eliminar',
      titulo: `¿Eliminar ${options.nombre.toLowerCase()}?`,
    });
    if (!aceptado) {
      return;
    }
    guardando.value = true;
    try {
      await options.remover(item[options.idKey] as number);
      avisar({
        mensaje: `${options.nombre} «${etiqueta}» se eliminó correctamente.`,
        tipo: 'exito',
        titulo: 'Registro eliminado',
      });
      await recargar();
    } catch {
      // El interceptor de errores ya avisó.
    } finally {
      guardando.value = false;
    }
  }

  return { cargando, eliminar, guardando, guardar, items, recargar };
}
