/**
 * Entrada aparte de las pantallas públicas de la feria (`feria.html`): portada `/fexcoin-vivo` y
 * mapa `/fexcoin-vivo/mapa`. No arranca la administración (vben, ant-design, login, menús):
 * solo Vue, un router mínimo y las dos vistas. Con la red saturada de la feria baja ~5 veces menos.
 *
 * El backend sirve `feria.html` para esas rutas (`VueController`). En desarrollo con Vite siguen
 * existiendo también dentro de la app principal (`router/routes/core.ts`).
 */
import { createApp, h, watchEffect } from 'vue';
import { createRouter, createWebHistory, RouterView } from 'vue-router';

import { iniciarIdioma, t } from '#/views/semfa/feria/i18n';

// Antes de montar: si el idioma no es español, su diccionario empieza a bajar junto con la vista.
iniciarIdioma(new URLSearchParams(window.location.search).get('lang'));

const router = createRouter({
  history: createWebHistory('/'),
  routes: [
    { component: () => import('#/views/semfa/feria/inicio.vue'), name: 'FeriaInicio', path: '/fexcoin-vivo' },
    { component: () => import('#/views/semfa/feria/mapa.vue'), name: 'FeriaMapa', path: '/fexcoin-vivo/mapa' },
    { path: '/feria', redirect: (to) => ({ path: '/fexcoin-vivo', query: to.query }) },
    { path: '/:resto(.*)*', redirect: '/fexcoin-vivo' },
  ],
  scrollBehavior: () => ({ top: 0 }),
});

// Título de la pestaña según la vista y el idioma (se rehace al cambiar cualquiera de los dos).
watchEffect(() => {
  document.title = t(router.currentRoute.value.name === 'FeriaMapa' ? 'Mapa FEXCOIN - UAP' : 'FEXCOIN ECUANA V5 - UAP');
});

createApp({ render: () => h(RouterView) }).use(router).mount('#app');
