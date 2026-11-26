import type { InjectionKey } from 'vue';

import { inject } from 'vue';

/**
 * El centro de la actividad lo provee a las pantallas que muestra en sus pasos:
 * `SemfaPagina` deja de pintar la cabecera de `<Page>` y las pantallas pueden
 * ocultar lo que el centro ya muestra.
 */
export const SEMFA_EMBEBIDO: InjectionKey<boolean> = Symbol('semfa-embebido');

export function useEmbebido() {
  return inject(SEMFA_EMBEBIDO, false);
}
