/**
 * Entrada aparte de la app web LIGERA del jurado (`jurado.html`, ruta `/evaluar`): para el
 * jurado que no tiene la APK (iPhone, otro celular, una PC prestada). No arranca la
 * administración (vben, ant-design, menús, íconos en línea): solo Vue, un router mínimo y
 * las tres pantallas, todo en un solo archivo para que, una vez abierta, funcione sin señal.
 *
 * Trabaja como la APK (`Docs/app-jurado/CONTEXTO-APK.md` §5.2): baja el paquete con todas sus
 * hojas, evalúa desde el celular y sube la cola con `evaluar-lote`. Ver
 * `views/semfa/jurado-web/datos.ts`.
 *
 * El backend sirve `jurado.html` en `/evaluar` y `/evaluar/**` (`VueController`); en desarrollo
 * lo hace un middleware de `vite.config.ts`.
 */
import { createApp } from 'vue';
import { createRouter, createWebHistory } from 'vue-router';

import App from '#/views/semfa/jurado-web/app.vue';
import Hoja from '#/views/semfa/jurado-web/hoja.vue';
import Ingresar from '#/views/semfa/jurado-web/ingresar.vue';
import Lista from '#/views/semfa/jurado-web/lista.vue';
import { apiURL } from '#/views/semfa/jurado-web/red';
import { sesion } from '#/views/semfa/jurado-web/sesion';

// Arranca la sincronización en cuanto haya sesión (vigila `sesion`).
import '#/views/semfa/jurado-web/datos';

import '#/views/semfa/jurado-web/estilos.css';

const router = createRouter({
  history: createWebHistory('/'),
  routes: [
    { component: Lista, meta: { title: 'Mis evaluaciones' }, name: 'JwLista', path: '/evaluar' },
    { component: Ingresar, meta: { publica: true, title: 'Ingresar' }, name: 'JwIngresar', path: '/evaluar/ingresar' },
    {
      component: Hoja,
      meta: { title: 'Evaluar' },
      name: 'JwHoja',
      path: '/evaluar/hoja/:categoriaId(\\d+)/:participanteId(\\d+)',
    },
    { path: '/:resto(.*)*', redirect: '/evaluar' },
  ],
});

router.beforeEach((to) => {
  // Con la sesión vencida igual se puede evaluar (las notas esperan en la cola).
  if (!to.meta.publica && !sesion.value) return { name: 'JwIngresar' };
  if (to.name === 'JwIngresar' && sesion.value && !sesion.value.vencida) return { name: 'JwLista' };
  return true;
});

router.afterEach((to) => {
  document.title = `${String(to.meta.title ?? 'Jurado')} · SEMFA`;
});

createApp(App).use(router).mount('#app');

/*
 * Service worker (solo producción y en HTTPS o localhost): guarda la página y sus archivos
 * para que, si el celular recarga sin señal, la app abra igual con lo descargado.
 */
if (import.meta.env.PROD && 'serviceWorker' in navigator && window.isSecureContext) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register(`${apiURL}/jurado-web/sw.js`, { scope: '/evaluar' })
      .then(async () => {
        // Lo ya cargado antes de que el SW tomara control también se guarda.
        const listo = await navigator.serviceWorker.ready;
        const archivos = performance
          .getEntriesByType('resource')
          .map((e) => e.name)
          .filter((u) => u.startsWith(location.origin) && !u.includes('/api/'));
        listo.active?.postMessage({ archivos: [location.origin + location.pathname, ...archivos], tipo: 'guardar' });
      })
      .catch(() => {
        // Sin SW la app funciona igual mientras la pestaña siga abierta.
      });
  });
}
