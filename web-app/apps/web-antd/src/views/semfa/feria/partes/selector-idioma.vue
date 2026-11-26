<script setup lang="ts">
/**
 * Selector de idioma de la cabecera pública (ES · EN · PT). En pantallas anchas, tres botones
 * (`aria-pressed`); en el celular, una pastilla «ES ▾» que es un `<select>` nativo invisible encima
 * (la lista la dibuja el teléfono: cómoda, accesible y sin código extra). Al elegir: cambia el
 * idioma (y lo recuerda) y deja `?lang=` en la dirección solo si no es español (para compartir).
 *
 * También muestra, una sola vez, la sugerencia del idioma del navegador («Ver em português?»): es un
 * componente aparte que solo se descarga si hay algo que sugerir.
 */
import type { Idioma } from '../i18n';

import { defineAsyncComponent } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { cambiarIdioma, esIdioma, idiomaPedido, IDIOMAS, NOMBRE_IDIOMA, sugerencia, t } from '../i18n';

const AvisoIdioma = defineAsyncComponent(() => import('./aviso-idioma.vue'));

const route = useRoute();
const router = useRouter();

function elegir(i: unknown) {
  if (!esIdioma(i)) return;
  void cambiarIdioma(i);
  const lang = i === 'es' ? undefined : i;
  if (route.query.lang !== lang) void router.replace({ query: { ...route.query, lang } });
}
const corto = (i: Idioma) => i.toUpperCase();
</script>

<template>
  <div class="si">
    <div class="si__botones" role="group" :aria-label="t('Idioma')">
      <button v-for="i in IDIOMAS" :key="i" type="button" :lang="i" :aria-pressed="idiomaPedido === i" :aria-label="NOMBRE_IDIOMA[i]" :title="NOMBRE_IDIOMA[i]" @click="elegir(i)">
        {{ corto(i) }}
      </button>
    </div>
    <label class="si__compacto">
      <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z" /></svg>
      <span aria-hidden="true">{{ corto(idiomaPedido) }}</span>
      <select :value="idiomaPedido" :aria-label="t('Idioma')" @change="elegir(($event.target as HTMLSelectElement).value)">
        <option v-for="i in IDIOMAS" :key="i" :value="i" :lang="i">{{ NOMBRE_IDIOMA[i] }}</option>
      </select>
    </label>

    <AvisoIdioma v-if="sugerencia" @elegir="elegir" />
  </div>
</template>

<style scoped>
.si { flex: none; }
.si button { font-family: inherit; cursor: pointer; }
.si button:focus-visible, .si__compacto:focus-within { outline: 3px solid #f5c518; outline-offset: 2px; }
.si__botones, .si__compacto { display: flex; border: 1px solid rgb(255 255 255 / 18%); border-radius: 8px; color: #b9c6e4; font-size: 12.5px; font-weight: 800; letter-spacing: .04em; }
.si__botones button { min-width: 34px; min-height: 30px; border: 0; background: none; color: inherit; font: inherit; }
.si__botones button + button { border-left: 1px solid rgb(255 255 255 / 12%); }
.si__botones button:hover { color: #fff; }
.si__botones [aria-pressed='true'] { background: #e8edf8; color: #0b1736; }
.si__compacto { position: relative; display: none; align-items: center; gap: 4px; min-height: 32px; padding: 0 8px; color: #e8edf8; }
.si__compacto svg { width: 15px; height: 15px; fill: none; stroke: currentColor; stroke-width: 1.8; }
.si__compacto select { position: absolute; inset: 0; width: 100%; opacity: 0; cursor: pointer; }
@media (max-width: 700px) {
  .si__botones { display: none; }
  .si__compacto { display: flex; }
}
@media (max-width: 400px) { .si__compacto { padding: 0 7px; } .si__compacto svg { display: none; } }
</style>
