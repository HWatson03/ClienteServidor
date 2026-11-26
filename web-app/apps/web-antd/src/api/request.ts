/**
 * Configuración de la capa HTTP.
 *
 * La API de este repositorio responde directamente con JSON y usa códigos
 * HTTP para indicar errores.
 *
 * La autenticación es JWT sin refresh token: el backend emite un token de larga
 * vida y `POST /auth/logout` es un endpoint de cortesía. Por eso
 * `enableRefreshToken` queda en `false` y ante un 401 se cierra la sesión.
 */
import type { RequestClientOptions } from '@vben/request';

import { useAppConfig } from '@vben/hooks';
import { preferences } from '@vben/preferences';
import {
  authenticateResponseInterceptor,
  defaultResponseInterceptor,
  errorMessageResponseInterceptor,
  RequestClient,
} from '@vben/request';
import { useAccessStore } from '@vben/stores';

import {
  avisar,
  avisosDeErrorSilenciados,
  describirError,
} from '#/composables/useAvisos';
import { useAuthStore } from '#/store';

const { apiURL } = useAppConfig(import.meta.env, import.meta.env.PROD);
const backendApiURL = apiURL.endsWith('/api') ? apiURL : `${apiURL}/api`;

function createRequestClient(baseURL: string, options?: RequestClientOptions) {
  const client = new RequestClient({
    ...options,
    baseURL,
  });

  /**
   * Cierre de sesión ante un token inválido o expirado.
   */
  async function doReAuthenticate() {
    const accessStore = useAccessStore();
    const authStore = useAuthStore();
    accessStore.setAccessToken(null);
    if (
      preferences.app.loginExpiredMode === 'modal' &&
      accessStore.isAccessChecked
    ) {
      accessStore.setLoginExpired(true);
    } else {
      await authStore.logout();
    }
  }

  function formatToken(token: null | string) {
    return token ? `Bearer ${token}` : null;
  }

  // Manejo de headers de la petición
  client.addRequestInterceptor({
    fulfilled: async (config) => {
      const accessStore = useAccessStore();

      config.headers.Authorization = formatToken(accessStore.accessToken);
      config.headers['Accept-Language'] = preferences.app.locale;
      return config;
    },
  });

  client.addResponseInterceptor(
    defaultResponseInterceptor({
      codeField: '',
      dataField: (response) => response,
      successCode: () => true,
    }),
  );

  // Manejo del token expirado
  client.addResponseInterceptor(
    authenticateResponseInterceptor({
      client,
      doReAuthenticate,
      // El backend no emite refresh token: un 401 implica volver a iniciar sesión.
      doRefreshToken: () =>
        Promise.reject(new Error('Refresh token no soportado')),
      enableRefreshToken: false,
      formatToken,
    }),
  );

  // Manejo de errores genérico: si no entró en ninguna lógica anterior, cae aquí
  client.addResponseInterceptor(
    errorMessageResponseInterceptor((msg: string, error) => {
      // Un lote que resume sus fallos pide silencio (`sinAvisosDeError`).
      if (avisosDeErrorSilenciados()) {
        return;
      }
      // Título según el código HTTP y el mensaje de negocio de `ApiResponse`.
      avisar({ tipo: 'error', ...describirError(error, msg) });
    }),
  );

  return client;
}

export const requestClient = createRequestClient(backendApiURL, {
  responseReturn: 'data',
});

export const baseRequestClient = new RequestClient({ baseURL: backendApiURL });
