import type { Recordable, UserInfo } from '@vben/types';

import { ref } from 'vue';
import { useRouter } from 'vue-router';

import { LOGIN_PATH } from '@vben/constants';
import { preferences } from '@vben/preferences';
import { resetAllStores, useAccessStore, useUserStore } from '@vben/stores';

import { notification } from 'ant-design-vue';
import { defineStore } from 'pinia';

import { getUserInfoApi, homePathPorRol, loginApi, logoutApi } from '#/api';
import { describirError } from '#/composables/useAvisos';
import { $t } from '#/locales';

export const useAuthStore = defineStore('auth', () => {
  const accessStore = useAccessStore();
  const userStore = useUserStore();
  const router = useRouter();

  const loginLoading = ref(false);

  /**
   * Maneja el proceso de login de forma asíncrona
   * Asynchronously handle the login process
   * @param params datos del formulario de login
   */
  async function authLogin(
    params: Recordable<any>,
    onSuccess?: () => Promise<void> | void,
  ) {
    // Procesa el login del usuario de forma asíncrona y obtiene el accessToken
    let userInfo: null | UserInfo = null;
    try {
      loginLoading.value = true;
      const { accessToken, refreshToken } = await loginApi({
        nombreUsuario: params.username,
        contrasena: params.password,
      });

      // Si se obtuvo el accessToken correctamente
      if (accessToken) {
        accessStore.setAccessToken(accessToken);
        accessStore.setRefreshToken(refreshToken);

        userInfo = await fetchUserInfo();
        userInfo.token = accessToken;
        const roles = userInfo.roles ?? [];
        accessStore.setAccessCodes(roles);
        userInfo.homePath = homePathPorRol(roles[0]);

        userStore.setUserInfo(userInfo);

        if (accessStore.loginExpired) {
          accessStore.setLoginExpired(false);
        } else {
          onSuccess
            ? await onSuccess?.()
            : await router.push(
                userInfo.homePath || preferences.app.defaultHomePath,
              );
        }

        if (userInfo?.realName) {
          notification.success({
            description: `${$t('authentication.loginSuccessDesc')}:${userInfo?.realName}`,
            duration: 3,
            message: $t('authentication.loginSuccess'),
          });
        }
      }
    } catch (error) {
      const detalle = describirError(error, 'No se pudo iniciar sesión.');
      notification.error({ message: detalle.titulo, description: detalle.mensaje, duration: 5 });
    } finally {
      loginLoading.value = false;
    }

    return {
      userInfo,
    };
  }

  async function logout(redirect: boolean = true) {
    // El backend es stateless: se le avisa y se descarta el token local.
    try {
      await logoutApi();
    } catch {
      // no hacer nada
    }
    resetAllStores();
    accessStore.setLoginExpired(false);

    // Volver al login llevando la ruta actual
    await router.replace({
      path: LOGIN_PATH,
      query: redirect
        ? {
            redirect: encodeURIComponent(router.currentRoute.value.fullPath),
          }
        : {},
    });
  }

  async function fetchUserInfo() {
    const userInfo = await getUserInfoApi();
    userStore.setUserInfo(userInfo);
    return userInfo;
  }

  function $reset() {
    loginLoading.value = false;
  }

  return {
    $reset,
    authLogin,
    fetchUserInfo,
    loginLoading,
    logout,
  };
});
