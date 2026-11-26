import type { Actividad } from '#/api/actividades';

import { computed, ref } from 'vue';

import { defineStore } from 'pinia';

import { listarActividades } from '#/api/actividades';

const CLAVE = 'semfa.actividad.trabajo';

function leerGuardada(): number | undefined {
  try {
    const valor = Number(localStorage.getItem(CLAVE));
    return Number.isFinite(valor) && valor > 0 ? valor : undefined;
  } catch {
    return undefined;
  }
}

function guardar(id: number | undefined) {
  try {
    if (id === undefined) localStorage.removeItem(CLAVE);
    else localStorage.setItem(CLAVE, String(id));
  } catch {
    // Sin almacenamiento: solo no se recuerda entre sesiones.
  }
}

/**
 * Actividad de trabajo de la administración.
 *
 * Cada actividad (un concurso, una feria…) tiene sus propias categorías,
 * inscripciones, rúbricas y jurados. Para que no se mezclen, el administrador
 * elige una en la barra superior y las pantallas muestran y crean solo lo de esa
 * actividad. Los catálogos generales (personas, tipos y categorías de
 * participante, usuarios) no dependen de ella.
 *
 * Se recuerda en el navegador; si la guardada ya no existe, se usa la de fecha
 * más reciente.
 */
export const useActividadTrabajoStore = defineStore('actividad-trabajo', () => {
  const actividades = ref<Actividad[]>([]);
  const idActividad = ref<number | undefined>(leerGuardada());
  const cargando = ref(false);
  const cargada = ref(false);

  const actividad = computed(() => actividades.value.find((a) => a.idActividad === idActividad.value));

  /** Más recientes primero (por fecha y, sin fecha, por id). */
  const ordenadas = computed(() =>
    [...actividades.value].sort(
      (a, b) => (b.fecha ?? '').localeCompare(a.fecha ?? '') || b.idActividad - a.idActividad,
    ),
  );

  function elegir(id: number | undefined) {
    idActividad.value = id;
    guardar(id);
  }

  /** Relee las actividades (al entrar y cuando se crea, edita o elimina una). */
  async function cargar() {
    cargando.value = true;
    try {
      actividades.value = (await listarActividades()) ?? [];
      if (!actividades.value.some((a) => a.idActividad === idActividad.value)) {
        elegir(ordenadas.value[0]?.idActividad);
      }
      cargada.value = true;
    } catch {
      // El interceptor ya avisó.
    } finally {
      cargando.value = false;
    }
  }

  /** Toma la lista ya cargada por la pantalla Actividad (sin volver a pedirla). */
  function sincronizar(lista: Actividad[]) {
    actividades.value = lista;
    cargada.value = true;
    if (!lista.some((a) => a.idActividad === idActividad.value)) {
      elegir(ordenadas.value[0]?.idActividad);
    }
  }

  /** Pone al día una actividad que cambió (p. ej. su estado de evaluación). */
  function reemplazar(nueva: Actividad) {
    actividades.value = actividades.value.map((a) => (a.idActividad === nueva.idActividad ? nueva : a));
  }

  /** Carga solo la primera vez (las pantallas lo llaman al montarse). */
  async function asegurar() {
    if (!cargada.value && !cargando.value) await cargar();
  }

  function $reset() {
    actividades.value = [];
    cargada.value = false;
  }

  return {
    $reset,
    actividad,
    actividades,
    asegurar,
    cargada,
    cargando,
    cargar,
    elegir,
    idActividad,
    ordenadas,
    reemplazar,
    sincronizar,
  };
});
