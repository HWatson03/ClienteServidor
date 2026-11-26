import { computed, onMounted } from 'vue';

import { storeToRefs } from 'pinia';

import { useActividadTrabajoStore } from '#/store';
import { limpiarEspacios } from '#/utils/formato';

/**
 * Actividad de trabajo elegida en la barra superior (ver `store/actividad-trabajo.ts`).
 * Las pantallas de configuración filtran sus filas con `idActividad` y sus
 * formularios solo ofrecen esa actividad.
 */
export function useActividadTrabajo() {
  const store = useActividadTrabajoStore();
  const { actividad, cargada, idActividad } = storeToRefs(store);

  onMounted(() => store.asegurar());

  const nombreActividad = computed(() => limpiarEspacios(actividad.value?.nombre));

  /** Filtra una lista por la actividad de trabajo (vacía si no hay ninguna elegida). */
  function deLaActividad<T>(lista: T[], idDe: (item: T) => null | number | undefined): T[] {
    const id = idActividad.value;
    return id === undefined ? [] : lista.filter((item) => idDe(item) === id);
  }

  return { actividad, cargada, deLaActividad, idActividad, nombreActividad, store };
}

/**
 * Actividad de una rúbrica: la suya si es de toda la actividad, o la de su
 * categoría si es de una categoría (`actividadDeCategoria`: idCategoria → idActividad).
 */
export function actividadDeRubrica(
  r: { idActividad: null | number; idCategoriaActividad: null | number },
  actividadDeCategoria: Map<number, null | number>,
): null | number | undefined {
  if (r.idActividad !== null) return r.idActividad;
  return r.idCategoriaActividad === null ? null : actividadDeCategoria.get(r.idCategoriaActividad);
}
