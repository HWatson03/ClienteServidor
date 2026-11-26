import type { Cronometro } from '#/api/jurado';

import { onMounted, onUnmounted, ref } from 'vue';

import { useAppConfig } from '@vben/hooks';

import { obtenerSseToken } from '#/api/jurado';

/**
 * Conexión al cronómetro compartido por Server-Sent Events.
 *
 * `EventSource` no puede enviar cabeceras `Authorization`, así que el backend
 * autentica la conexión con un token de un solo uso (`GET /api/jurado/sse-token`)
 * pasado por query string. Como el token se consume al abrir el stream, ante un
 * error se cierra el socket y se pide un token nuevo antes de reintentar.
 */
export function useCronometroSse() {
  const cronometro = ref<Cronometro | null>(null);
  const conectado = ref(false);

  let source: EventSource | null = null;
  let cerradoPorMi = false;
  let timer: null | ReturnType<typeof setTimeout> = null;

  const { apiURL } = useAppConfig(import.meta.env, import.meta.env.PROD);

  async function abrir() {
    if (cerradoPorMi) {
      return;
    }
    try {
      const { token } = await obtenerSseToken();
      source?.close();
      source = new EventSource(
        `${apiURL}/jurado/cronometro/stream?sseToken=${encodeURIComponent(token)}`,
      );

      source.addEventListener('cronometro', (evento) => {
        try {
          cronometro.value = JSON.parse((evento as MessageEvent).data);
        } catch {
          // Payload no-JSON (p.ej. el ping): se ignora.
        }
      });
      source.addEventListener('heartbeat', () => {
        conectado.value = true;
      });
      source.addEventListener('open', () => {
        conectado.value = true;
      });
      source.addEventListener('error', () => {
        // El reconnect automático reutilizaría el mismo token ya consumido:
        // cerramos y abrimos una conexión nueva con un token fresco.
        conectado.value = false;
        if (!cerradoPorMi) {
          source?.close();
          source = null;
          timer = setTimeout(abrir, 1500);
        }
      });
    } catch {
      // No se pudo pedir el token (p.ej. red caída): reintentar más tarde.
      timer = setTimeout(abrir, 5000);
    }
  }

  function detener() {
    cerradoPorMi = true;
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    source?.close();
    source = null;
  }

  onMounted(abrir);
  onUnmounted(detener);

  return { conectado, cronometro };
}