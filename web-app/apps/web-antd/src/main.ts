import { initPreferences, updatePreferences } from '@vben/preferences';
import { unmountGlobalLoading } from '@vben/utils';

import { overridesPreferences, preferencesExtension } from './preferences';

/**
 * Cargar y renderizar la página después de inicializar la aplicación
 */
async function initApplication() {
  // name define el identificador único del proyecto; se usa para aislar preferencias, prefijos de keys de almacenamiento y otros datos entre proyectos
  const env = import.meta.env.PROD ? 'prod' : 'dev';
  const appVersion = import.meta.env.VITE_APP_VERSION;
  const namespace = `${import.meta.env.VITE_APP_NAMESPACE}-${appVersion}-${env}`;

  // Inicializar preferencias de la app
  await initPreferences({
    extension: preferencesExtension,
    namespace,
    overrides: overridesPreferences,
  });
  // Las preferencias guardadas pueden conservar rutas /Logo_* de una versión anterior.
  const rutaPublica = import.meta.env.PROD ? '/vue/' : import.meta.env.BASE_URL;
  updatePreferences({ logo: { source: `${rutaPublica}lestrade-mark.svg`, sourceDark: `${rutaPublica}lestrade-mark.svg` } });

  // Arrancar la aplicación y montarla
  // Lógica principal y vistas de la app Vue
  const { bootstrap } = await import('./bootstrap');
  await bootstrap(namespace);

  // Remover y destruir el loading
  unmountGlobalLoading();
}

initApplication();
