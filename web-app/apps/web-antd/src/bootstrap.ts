import { createApp, watchEffect } from 'vue';

import { registerAccessDirective } from '@vben/access';
import { registerLoadingDirective } from '@vben/common-ui/es/loading';
import { preferences } from '@vben/preferences';
import { initStores } from '@vben/stores';
import '@vben/styles';
import '@vben/styles/antd';

import { useTitle } from '@vueuse/core';

import { $t, setupI18n } from '#/locales';

import { initComponentAdapter } from './adapter/component';
import { initSetupVbenForm } from './adapter/form';
import App from './app.vue';
import { router } from './router';

import './styles/semfa.css';
import './styles/lestrade.css';

async function bootstrap(namespace: string) {
  // Inicializar adaptadores de componentes
  await initComponentAdapter();

  // Inicializar componentes de formulario
  await initSetupVbenForm();

  // // Configuración por defecto de modales
  // setDefaultModalProps({
  //   fullscreenButton: false,
  // });
  // // Configuración por defecto de drawers
  // setDefaultDrawerProps({
  //   zIndex: 1020,
  // });

  const app = createApp(App);

  // Registrar directiva v-loading
  registerLoadingDirective(app, {
    loading: 'loading', // Aquí se puede personalizar el nombre de la directiva, o pasar false explícitamente para no registrarla
    spinning: 'spinning',
  });

  // Configuración de internacionalización i18n
  await setupI18n(app);

  // Configurar pinia-store
  await initStores(app, { namespace });

  // Instalar directiva de permisos
  registerAccessDirective(app);

  // Inicializar tippy
  const { initTippy } = await import('@vben/common-ui/es/tippy');
  initTippy(app);

  // Configurar rutas y guards de navegación
  app.use(router);

  // Configurar plugin Motion
  const { MotionPlugin } = await import('@vben/plugins/motion');
  app.use(MotionPlugin);

  // Actualizar el título y el icono de la pestaña dinámicamente
  const iconoBase = document.querySelector<HTMLLinkElement>('link[rel="icon"]')?.getAttribute('href') ?? '';
  watchEffect(() => {
    const meta = router.currentRoute.value.meta;
    if (preferences.app.dynamicTitle) {
      const routeTitle = meta?.title;
      const pageTitle =
        (routeTitle ? `${$t(routeTitle)} - ` : '') + (meta?.tituloSufijo ?? preferences.app.name);
      useTitle(pageTitle);
    }
    // Las páginas pueden personalizar su icono; por defecto se conserva la marca Lestrade.
    const icono = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    const href = meta?.favicon ?? iconoBase;
    if (icono && icono.getAttribute('href') !== href) {
      // Se reemplaza el <link> en vez de cambiar su href: Firefox no siempre repinta el icono.
      const nuevo = document.createElement('link');
      nuevo.rel = 'icon';
      nuevo.type = href.endsWith('.svg') ? 'image/svg+xml' : href.endsWith('.png') ? 'image/png' : 'image/x-icon';
      nuevo.href = href;
      icono.replaceWith(nuevo);
    }
  });

  app.mount('#app');
}

export { bootstrap };
