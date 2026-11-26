import type { RouteRecordRaw } from 'vue-router';

import { mergeRouteModules, traverseTreeValues } from '@vben/utils';

import { coreRoutes, fallbackNotFoundRoute } from './core';

const dynamicRouteFiles = import.meta.glob('./modules/**/*.ts', {
  eager: true,
});

// Puedes descomentar esto si lo necesitas y crear la carpeta correspondiente
// const externalRouteFiles = import.meta.glob('./external/**/*.ts', { eager: true });
// const staticRouteFiles = import.meta.glob('./static/**/*.ts', { eager: true });

/** Rutas dinámicas */
const dynamicRoutes: RouteRecordRaw[] = mergeRouteModules(dynamicRouteFiles);

/** Lista de rutas externas: páginas accesibles sin Layout, útiles para embeber en otros sistemas (no aparecen en el menú) */
// const externalRoutes: RouteRecordRaw[] = mergeRouteModules(externalRouteFiles);
// const staticRoutes: RouteRecordRaw[] = mergeRouteModules(staticRouteFiles);
const staticRoutes: RouteRecordRaw[] = [];
const externalRoutes: RouteRecordRaw[] = [];

/** Lista de rutas compuesta por rutas básicas, rutas externas y la ruta 404 de respaldo.
 *  No requieren validación de permisos (siempre visibles en el menú) */
const routes: RouteRecordRaw[] = [
  ...coreRoutes,
  ...externalRoutes,
  fallbackNotFoundRoute,
];

/** Lista de rutas básicas que no pasan por el control de permisos */
const coreRouteNames = traverseTreeValues(coreRoutes, (route) => route.name);

/** Lista de rutas con validación de permisos: incluye rutas dinámicas y estáticas */
const accessRoutes = [...dynamicRoutes, ...staticRoutes];
export { accessRoutes, coreRouteNames, routes };
