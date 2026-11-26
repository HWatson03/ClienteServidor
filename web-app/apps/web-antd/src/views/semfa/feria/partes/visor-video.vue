<script setup lang="ts">
/**
 * Ventana para ver un video (MP4 subido, reel de Facebook, YouTube o la transmisión de TVU).
 * Solo existe mientras está abierta: al cerrarla se destruye el `<video>`/`<iframe>` y se corta
 * su descarga. Esc cierra y el foco vuelve al botón que la abrió.
 */
import { nextTick, onMounted, onUnmounted, ref } from 'vue';

import { t } from '../i18n';

const props = defineProps<{
  /** Abrir también fuera de la página (Facebook/TVU). */
  enlace?: string;
  /** `true` = iframe (Facebook, YouTube, TVU); `false` = `<video>` con el archivo. */
  iframe: boolean;
  /** Restricciones del iframe (TVU); sin valor, sin sandbox (los reproductores de Facebook/YouTube lo necesitan). */
  sandbox?: string;
  titulo: string;
  url: string;
  vertical?: boolean;
  /** Pastilla «● EN VIVO» en el título. */
  vivo?: boolean;
}>();
const emit = defineEmits<{ cerrar: [] }>();

const botonCerrar = ref<HTMLButtonElement>();
const pantalla = ref<HTMLElement>();
/** URL final: el reproductor de Facebook necesita el tamaño exacto (si no, deja una franja blanca). */
const urlFinal = ref('');
let anterior: Element | null = null;

function alPulsarTecla(e: KeyboardEvent) {
  if (e.key === 'Escape') { e.stopPropagation(); emit('cerrar'); }
}
onMounted(async () => {
  anterior = document.activeElement;
  document.addEventListener('keydown', alPulsarTecla, true);
  await nextTick();
  const caja = pantalla.value?.getBoundingClientRect();
  urlFinal.value = caja && props.url.startsWith('https://www.facebook.com/plugins/')
    ? `${props.url}&width=${Math.round(caja.width)}&height=${Math.round(caja.height)}`
    : props.url;
  botonCerrar.value?.focus();
});
onUnmounted(() => {
  document.removeEventListener('keydown', alPulsarTecla, true);
  if (anterior instanceof HTMLElement) anterior.focus({ preventScroll: true });
});
</script>

<template>
  <div class="vv" @click.self="emit('cerrar')">
    <section class="vv__ventana" :class="{ 'vv__ventana--vertical': vertical }" role="dialog" aria-modal="true" aria-labelledby="vv-titulo">
      <header class="vv__cabecera">
        <h2 id="vv-titulo"><i v-if="vivo" class="vv__vivo" aria-hidden="true"></i>{{ titulo }}</h2>
        <a v-if="enlace" :href="enlace" target="_blank" rel="noopener noreferrer">{{ t('Abrir aparte ↗') }}</a>
        <button ref="botonCerrar" type="button" :aria-label="t('Cerrar video')" :title="t('Cerrar (Esc)')" @click="emit('cerrar')">✕</button>
      </header>
      <div ref="pantalla" class="vv__pantalla">
        <iframe v-if="iframe && urlFinal" :src="urlFinal" :title="titulo" allow="autoplay; encrypted-media; fullscreen; picture-in-picture; web-share"
          allowfullscreen referrerpolicy="strict-origin-when-cross-origin" :sandbox="sandbox || undefined"></iframe>
        <video v-else-if="!iframe" :src="url" controls playsinline autoplay preload="metadata"></video>
      </div>
    </section>
  </div>
</template>

<style scoped>
.vv { position: fixed; z-index: 3000; inset: 0; display: grid; place-items: center; background: rgb(4 9 24 / 88%); padding: 16px; animation: vv-entrar .2s ease-out; }
.vv__ventana { display: flex; flex-direction: column; width: min(1100px, 100%, calc((100dvh - 110px) * 16 / 9)); min-width: min(300px, 100%); overflow: hidden; border: 1px solid rgb(255 255 255 / 12%); border-radius: 14px; background: #0b1736; box-shadow: 0 24px 60px rgb(0 0 0 / 55%); }
.vv__ventana--vertical { width: min(420px, 100%, calc((100dvh - 110px) * 9 / 16)); }
.vv__cabecera { display: flex; align-items: center; gap: 12px; padding: 8px 8px 8px 16px; }
.vv__cabecera h2 { display: flex; flex: 1; align-items: center; gap: 8px; min-width: 0; margin: 0; overflow: hidden; color: #fff; font-size: 16px; font-weight: 800; text-overflow: ellipsis; white-space: nowrap; }
.vv__cabecera a { color: #b9c6e4; font-size: 13px; font-weight: 700; white-space: nowrap; }
.vv__cabecera button { display: grid; width: 38px; height: 38px; flex: none; place-items: center; border: 1px solid rgb(255 255 255 / 16%); border-radius: 10px; background: #13244f; color: #fff; font-size: 16px; cursor: pointer; }
.vv__cabecera button:hover { background: #1b3168; }
.vv button:focus-visible, .vv a:focus-visible { outline: 3px solid #f5c518; outline-offset: 2px; }
.vv__vivo { width: 8px; height: 8px; flex: none; border-radius: 50%; background: #e11d2a; }
.vv__pantalla { position: relative; aspect-ratio: 16 / 9; background: #000; }
.vv__ventana--vertical .vv__pantalla { aspect-ratio: 9 / 16; }
.vv__pantalla iframe, .vv__pantalla video { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; background: #000; }
@keyframes vv-entrar { from { opacity: 0; } to { opacity: 1; } }
@media (max-width: 520px) {
  .vv { padding: 8px; }
  .vv__cabecera a { display: none; }
}
@media (prefers-reduced-motion: reduce) { .vv { animation: none; } }
</style>
