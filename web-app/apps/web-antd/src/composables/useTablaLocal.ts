import type { TablePaginationConfig } from 'ant-design-vue';

import type { Ref, ShallowRef } from 'vue';

import { computed, ref, watch } from 'vue';

import { normalizarTexto } from '#/utils/formato';

export interface TablaLocalOptions<T> {
  /** Campos en los que busca el texto del buscador. */
  camposBusqueda: (keyof T)[];
  /** Filas por página (10 por defecto). */
  tamano?: number;
}

/**
 * Búsqueda y paginación en el cliente sobre la lista que ya cargó `useCrud`,
 * al estilo DataTables: buscador, páginas de tamaño fijo y «Mostrando x–y de
 * N registros».
 *
 * Los endpoints actuales devuelven la lista completa, así que filtrar aquí evita
 * tocar el backend; si un módulo crece mucho habrá que paginar en la API.
 */
export function useTablaLocal<T extends Record<string, any>>(
  items: Ref<T[]> | ShallowRef<T[]>,
  options: TablaLocalOptions<T>,
) {
  const busqueda = ref('');
  const pagina = ref(1);
  const tamano = options.tamano ?? 10;

  const filtrados = computed(() => {
    const termino = normalizarTexto(busqueda.value.trim());
    if (!termino) {
      return items.value;
    }
    return items.value.filter((item) =>
      options.camposBusqueda.some((campo) =>
        normalizarTexto(item[campo]).includes(termino),
      ),
    );
  });

  // Una búsqueda nueva siempre empieza en la primera página.
  watch(busqueda, () => {
    pagina.value = 1;
  });

  // Si un borrado deja vacía la última página, retrocede a la anterior.
  watch(filtrados, (lista) => {
    const ultima = Math.max(1, Math.ceil(lista.length / tamano));
    if (pagina.value > ultima) {
      pagina.value = ultima;
    }
  });

  const paginacion = computed<TablePaginationConfig>(() => ({
    current: pagina.value,
    pageSize: tamano,
    showSizeChanger: false,
    showTotal: (total, [desde, hasta]) => {
      const texto =
        total === 0
          ? 'Sin registros'
          : `Mostrando ${desde}–${hasta} de ${total} registros`;
      // Como DataTables: si hay filtro, recuerda cuántos hay en total.
      return busqueda.value.trim() && total !== items.value.length
        ? `${texto} (filtrado de ${items.value.length})`
        : texto;
    },
    size: 'small',
    total: filtrados.value.length,
  }));

  /** Recibe el `change` de la tabla (cambio de página u orden). */
  function alCambiarTabla(p: TablePaginationConfig) {
    pagina.value = p.current ?? 1;
  }

  /** Número correlativo de la fila en toda la lista, no solo en la página. */
  function numeroFila(indiceEnPagina: number) {
    return (pagina.value - 1) * tamano + indiceEnPagina + 1;
  }

  return {
    alCambiarTabla,
    busqueda,
    filtrados,
    numeroFila,
    paginacion,
  };
}
