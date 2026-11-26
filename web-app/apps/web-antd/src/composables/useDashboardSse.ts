import type { Ref } from 'vue';

import { onUnmounted, ref, watch } from 'vue';

import { useAppConfig } from '@vben/hooks';

import { obtenerSseTokenDashboard } from '#/api/dashboard-evaluacion';

/**
 * Avisos en vivo del dashboard de evaluación: cada vez que un jurado guarda una
 * evaluación de la actividad, el backend emite `EVALUACION_GUARDADA` y se llama a
 * `alCambiar` (agrupando ráfagas: un jurado guarda varias rúbricas seguidas).
 *
 * Igual que `useCronometroSse`: `EventSource` no envía `Authorization`, así que se
 * pide un token de un solo uso y, ante un error, se abre otra conexión con un
 * token nuevo (el reconnect automático reutilizaría el ya consumido).
 */
export function useDashboardSse(idActividad: Ref<number | undefined>, alCambiar: () => void) {
  const conectado = ref(false);

  let source: EventSource | null = null;
  let reintento: null | ReturnType<typeof setTimeout> = null;
  let rafaga: null | ReturnType<typeof setTimeout> = null;
  let generacion = 0;

  const { apiURL } = useAppConfig(import.meta.env, import.meta.env.PROD);

  function cerrar() {
    generacion++;
    if (reintento) clearTimeout(reintento);
    if (rafaga) clearTimeout(rafaga);
    reintento = null;
    rafaga = null;
    source?.close();
    source = null;
    conectado.value = false;
  }

  async function abrir(id: number) {
    const mia = generacion;
    try {
      const { token } = await obtenerSseTokenDashboard();
      if (mia !== generacion) return; // cambió la actividad mientras tanto
      source = new EventSource(
        `${apiURL}/dashboard-evaluacion/${id}/stream?sseToken=${encodeURIComponent(token)}`,
      );
      source.addEventListener('open', () => {
        conectado.value = true;
      });
      source.addEventListener('ping', () => {
        conectado.value = true;
      });
      source.addEventListener('message', () => {
        if (rafaga) clearTimeout(rafaga);
        rafaga = setTimeout(alCambiar, 1200);
      });
      source.addEventListener('error', () => {
        if (mia !== generacion) return;
        conectado.value = false;
        source?.close();
        source = null;
        reintento = setTimeout(() => abrir(id), 3000);
      });
    } catch {
      if (mia === generacion) {
        reintento = setTimeout(() => abrir(id), 8000);
      }
    }
  }

  watch(
    idActividad,
    (id) => {
      cerrar();
      if (id !== undefined) abrir(id);
    },
    { immediate: true },
  );

  onUnmounted(cerrar);

  return { conectado };
}
