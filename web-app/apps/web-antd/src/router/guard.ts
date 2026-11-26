import type { Router } from 'vue-router';

import { LOGIN_PATH } from '@vben/constants';
import { preferences } from '@vben/preferences';
import { useAccessStore, useUserStore } from '@vben/stores';
import { startProgress, stopProgress } from '@vben/utils';

import { accessRoutes, coreRouteNames } from '#/router/routes';
import { useAuthStore } from '#/store';

import { generateAccess } from './access';

/**
 * Resuelve una ruta de destino validando que el router la conozca.
 *
 * `homePath` y `query.redirect` pueden venir del estado persistido en
 * localStorage, es decir de una versión anterior de la app (p. ej. antes de un
 * renombrado de rutas). Si la ruta ya no existe, se cae al inicio por defecto
 * en lugar de dejar la pantalla en blanco.
 */
function resolveTarget(router: Router, candidate?: string) {
  const fallback = preferences.app.defaultHomePath;
  if (!candidate) {
    return fallback;
  }
  const path = decodeURIComponent(candidate);
  const resolved = router.resolve(path);
  return resolved.matched.length > 0 ? path : fallback;
}

/**
 * Configuración de guards comunes
 * @param router
 */
function setupCommonGuard(router: Router) {
  // Registrar páginas ya cargadas
  const loadedPaths = new Set<string>();

  router.beforeEach((to) => {
    to.meta.loaded = loadedPaths.has(to.path);

    // Barra de progreso de carga de página
    if (!to.meta.loaded && preferences.transition.progress) {
      startProgress();
    }
    return true;
  });

  router.afterEach((to) => {
    // Registrar si la página ya cargó; si ya cargó, las animaciones de cambio de página no se repiten

    loadedPaths.add(to.path);

    // Cerrar la barra de progreso de carga
    if (preferences.transition.progress) {
      stopProgress();
    }
  });
}

/**
 * Configuración del guard de acceso/permisos
 * @param router
 */
function setupAccessGuard(router: Router) {
  router.beforeEach(async (to, from) => {
    const accessStore = useAccessStore();
    const userStore = useUserStore();
    const authStore = useAuthStore();

    // Rutas básicas que no pasan por el control de permisos
    if (coreRouteNames.includes(to.name as string)) {
      if (to.path === LOGIN_PATH && accessStore.accessToken) {
        return resolveTarget(
          router,
          (to.query?.redirect as string) ||
            userStore.userInfo?.homePath ||
            undefined,
        );
      }
      return true;
    }

    // Validación del accessToken
    if (!accessStore.accessToken) {
      // Si la ruta declara explícitamente ignorar permisos, se permite el acceso
      if (to.meta.ignoreAccess) {
        return true;
      }

      // Sin permisos de acceso, redirigir al login
      if (to.fullPath !== LOGIN_PATH) {
        return {
          path: LOGIN_PATH,
          // Si no hace falta, eliminar el query directamente
          query:
            to.fullPath === preferences.app.defaultHomePath
              ? {}
              : { redirect: encodeURIComponent(to.fullPath) },
          // Llevar la página destino actual para volver a ella tras el login
          replace: true,
        };
      }
      return to;
    }

    // ¿Ya se generaron las rutas dinámicas?
    if (accessStore.isAccessChecked) {
      return true;
    }

    // Generar la tabla de rutas
    // Lista de roles del usuario autenticado actual
    const userInfo = userStore.userInfo || (await authStore.fetchUserInfo());
    const userRoles = userInfo.roles ?? [];

    // Generar menús y rutas
    const { accessibleMenus, accessibleRoutes } = await generateAccess({
      roles: userRoles,
      router,
      // se mostrará en el menú, pero al acceder será redirigido a 403
      routes: accessRoutes,
    });

    // Guardar información de menús y rutas
    accessStore.setAccessMenus(accessibleMenus);
    accessStore.setAccessRoutes(accessibleRoutes);
    accessStore.setIsAccessChecked(true);
    const redirectPath = resolveTarget(
      router,
      (from.query.redirect ??
        (to.path === preferences.app.defaultHomePath
          ? (userInfo.homePath ?? undefined)
          : to.fullPath)) as string,
    );

    return {
      ...router.resolve(redirectPath),
      replace: true,
    };
  });
}

/**
 * Configuración de guards del proyecto
 * @param router
 */
function createRouterGuard(router: Router) {
  /** Común */
  setupCommonGuard(router);
  /** Acceso/permisos */
  setupAccessGuard(router);
}

export { createRouterGuard };
