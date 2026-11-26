<script setup lang="ts">
/**
 * Galería «coverflow» de la portada: la foto o video del centro grande y las laterales asomando,
 * atenuadas. Mezcla fotos, videos MP4 subidos y enlaces de Facebook/YouTube.
 *
 * Pensada para la red saturada de la feria:
 * - Al abrir solo se baja la imagen del centro; las vecinas, cuando la página terminó de cargar
 *   (y al moverse, las nuevas vecinas). `<picture>`: la versión liviana en pantallas ≤ 700 px.
 * - Un video nunca se carga solo: muestra su portada (o un fondo sobrio) con ▶, y el reproductor
 *   (`<video>` o iframe) existe únicamente mientras la ventana está abierta.
 * - Avanza sola (transform/opacity) salvo con el dedo encima, la pestaña oculta, fuera de la
 *   vista, un video abierto o «reducir movimiento».
 */
import type { MedioListo } from '../portada';

import { computed, onMounted, onUnmounted, ref, watch } from 'vue';

import { t } from '../i18n';
import VisorVideo from './visor-video.vue';

const props = defineProps<{ medios: MedioListo[]; titulo: string }>();

const INTERVALO_MS = 6_500;
const actual = ref(0);
const montadas = ref(new Set<number>([0]));
const encima = ref(false);
const visible = ref(true);
const abierto = ref<MedioListo | null>(null);
const raiz = ref<HTMLElement>();
const reducirMovimiento = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
let temporizador: ReturnType<typeof setTimeout> | undefined;
let observador: IntersectionObserver | undefined;
let inicioX: null | number = null;
let vecinasListas = false;

const total = computed(() => props.medios.length);

/** Distancia (con vuelta) de `i` al centro: 0 centro, ±1 laterales. */
function distancia(i: number) {
  const n = total.value;
  if (n < 2) return 0;
  let d = i - actual.value;
  if (d > n / 2) d -= n;
  if (d < -n / 2) d += n;
  // Con dos medios el otro siempre va a la derecha.
  if (n === 2 && d !== 0) d = 1;
  return d;
}

function montarVecinas() {
  const n = total.value;
  if (!n) return;
  const nuevas = new Set(montadas.value);
  nuevas.add(actual.value);
  if (vecinasListas && n > 1) {
    nuevas.add((actual.value + 1) % n);
    nuevas.add((actual.value - 1 + n) % n);
  }
  if (nuevas.size !== montadas.value.size) montadas.value = nuevas;
}

function ir(i: number) {
  if (!total.value) return;
  actual.value = (i + total.value) % total.value;
  montarVecinas();
  programar();
}

const corriendo = () => !encima.value && !abierto.value && visible.value && !reducirMovimiento
  && document.visibilityState === 'visible' && total.value > 1;

function programar() {
  clearTimeout(temporizador);
  if (corriendo()) temporizador = setTimeout(() => ir(actual.value + 1), INTERVALO_MS);
}

function alPresionar(e: PointerEvent) {
  inicioX = e.clientX;
}
function alSoltar(e: PointerEvent) {
  if (inicioX === null) return;
  const dx = e.clientX - inicioX;
  inicioX = null;
  if (Math.abs(dx) > 40) ir(actual.value + (dx < 0 ? 1 : -1));
}
function alTocarMedio(i: number) {
  const d = distancia(i);
  if (d !== 0) ir(i);
}
function abrir(m: MedioListo) {
  abierto.value = m;
  programar();
}
function cerrar() {
  abierto.value = null;
  programar();
}
function alCambiarVisibilidad() { programar(); }
function alCargarPagina() {
  // Las vecinas se piden cuando la página ya terminó lo importante.
  setTimeout(() => { vecinasListas = true; montarVecinas(); }, 1_200);
}

const CLAVE_VIDEO = { archivo: 'Video', facebook: 'Video de Facebook', youtube: 'Video de YouTube' } as const;
const etiqueta = (plataforma: keyof typeof CLAVE_VIDEO | undefined) => t(CLAVE_VIDEO[plataforma ?? 'archivo']);

watch(() => props.medios, () => { actual.value = 0; montadas.value = new Set([0]); montarVecinas(); programar(); });
watch(encima, programar);

onMounted(() => {
  if (raiz.value && 'IntersectionObserver' in window) {
    observador = new IntersectionObserver(([e]) => { visible.value = Boolean(e?.isIntersecting); programar(); }, { threshold: 0.3 });
    observador.observe(raiz.value);
  }
  document.addEventListener('visibilitychange', alCambiarVisibilidad);
  if (document.readyState === 'complete') alCargarPagina();
  else window.addEventListener('load', alCargarPagina, { once: true });
  programar();
});
onUnmounted(() => {
  clearTimeout(temporizador);
  observador?.disconnect();
  document.removeEventListener('visibilitychange', alCambiarVisibilidad);
  window.removeEventListener('load', alCargarPagina);
});
</script>

<template>
  <div ref="raiz" class="gm" role="region" :aria-roledescription="t('carrusel')" :aria-label="titulo"
    @pointerenter="(e) => { if (e.pointerType === 'mouse') encima = true; }" @pointerleave="encima = false">
    <div class="gm__escena" :class="{ 'gm__escena--uno': total < 2 }" @pointerdown="alPresionar" @pointerup="alSoltar" @pointercancel="inicioX = null">
      <figure v-for="(m, i) in medios" :key="m.clave" class="gm__item" :class="[`gm__item--d${Math.max(-2, Math.min(2, distancia(i)))}`]"
        :aria-hidden="distancia(i) !== 0" :aria-label="t('{i} de {n}', { i: i + 1, n: total })" @click="alTocarMedio(i)">
        <picture v-if="m.grande && montadas.has(i)">
          <source media="(max-width: 700px)" :srcset="m.pequena" />
          <img :src="m.grande" :alt="m.texto || t('Foto de la feria FEXCOIN')" :width="m.ancho || 1600" :height="m.alto || 900"
            :loading="i === actual ? 'eager' : 'lazy'" decoding="async" :fetchpriority="i === actual ? 'high' : 'low'" draggable="false" />
        </picture>
        <div v-else-if="!m.grande" class="gm__fondo" aria-hidden="true">
          <svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2.5" /><path d="M10 9.5v5l4.5-2.5z" /></svg>
          <span>{{ etiqueta(m.reproducir?.plataforma) }}</span>
        </div>
        <figcaption v-if="m.texto" class="gm__pie">{{ m.texto }}</figcaption>
        <button v-if="m.reproducir" type="button" class="gm__play" :aria-label="t('Reproducir: {x}', { x: m.texto || etiqueta(m.reproducir.plataforma) })" @click.stop="abrir(m)">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z" /></svg>
        </button>
      </figure>
      <button v-if="total > 1" type="button" class="gm__flecha gm__flecha--izq" :aria-label="t('Anterior')" @click="ir(actual - 1)">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
      </button>
      <button v-if="total > 1" type="button" class="gm__flecha gm__flecha--der" :aria-label="t('Siguiente')" @click="ir(actual + 1)">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7" /></svg>
      </button>
      <div class="gm__sobre"><slot></slot></div>
    </div>
    <div v-if="total > 1" class="gm__puntos">
      <button v-for="(m, i) in medios" :key="m.clave" type="button" class="gm__punto" :class="{ 'is-activo': i === actual }"
        :aria-label="t('Ver {i} de {n}', { i: i + 1, n: total })" :aria-current="i === actual" @click="ir(i)"></button>
    </div>
    <VisorVideo v-if="abierto?.reproducir" :titulo="abierto.texto || etiqueta(abierto.reproducir.plataforma)" :url="abierto.reproducir.url"
      :iframe="abierto.reproducir.iframe" :vertical="abierto.reproducir.vertical" @cerrar="cerrar" />
  </div>
</template>

<style scoped>
.gm { --h: clamp(220px, 34vw, 440px); position: relative; }
.gm__escena { position: relative; height: var(--h); overflow: hidden; touch-action: pan-y; user-select: none; }
.gm__item {
  position: absolute; top: 0; left: 50%; width: min(calc(var(--h) * 16 / 9), 74%); height: 100%; margin: 0; overflow: hidden;
  border: 1px solid rgb(255 255 255 / 14%); border-radius: 16px; background: #13244f; box-shadow: 0 12px 30px rgb(0 0 0 / 35%);
  transition: transform .6s cubic-bezier(.22,.8,.3,1), opacity .6s; will-change: transform;
}
.gm__escena--uno .gm__item { width: min(calc(var(--h) * 16 / 9), 100%); }
.gm__item--d0 { z-index: 3; transform: translateX(-50%); }
.gm__item--d1 { z-index: 2; cursor: pointer; opacity: .42; transform: translateX(calc(-50% + 76%)) scale(.82); }
.gm__item--d-1 { z-index: 2; cursor: pointer; opacity: .42; transform: translateX(calc(-50% - 76%)) scale(.82); }
.gm__item--d2 { z-index: 1; opacity: 0; transform: translateX(calc(-50% + 140%)) scale(.7); visibility: hidden; }
.gm__item--d-2 { z-index: 1; opacity: 0; transform: translateX(calc(-50% - 140%)) scale(.7); visibility: hidden; }
.gm__item picture, .gm__item img { display: block; width: 100%; height: 100%; }
.gm__item img { object-fit: cover; }
.gm__fondo { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; height: 100%;
  background: linear-gradient(160deg, #13244f 0%, #0b1736 70%), #0b1736; color: #b9c6e4; font-size: 13px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; }
.gm__fondo::before { position: absolute; inset: auto 0 0; height: 3px; background: linear-gradient(90deg, #c8102e 0 50%, #1d4ed8 50%); content: ''; }
.gm__fondo svg { width: 46px; height: 46px; fill: none; stroke: #8fa3cf; stroke-width: 1.3; }
.gm__fondo svg path { fill: #8fa3cf; stroke: none; }
.gm__pie { position: absolute; top: 0; right: 0; left: 0; padding: 10px 14px 26px; background: linear-gradient(rgb(6 12 30 / 72%), transparent); color: #e8edf8; font-size: 13.5px; font-weight: 600; text-align: left; }
.gm__item:not(.gm__item--d0) .gm__pie, .gm__item:not(.gm__item--d0) .gm__play { display: none; }
.gm__play { position: absolute; top: 50%; left: 50%; display: grid; width: 68px; height: 68px; place-items: center; border: 2px solid rgb(255 255 255 / 85%); border-radius: 50%;
  background: rgb(200 16 46 / 92%); color: #fff; box-shadow: 0 8px 24px rgb(0 0 0 / 40%); cursor: pointer; transform: translate(-50%, -50%); transition: transform .2s; }
.gm__play:hover { transform: translate(-50%, -50%) scale(1.06); }
.gm__play svg { width: 30px; height: 30px; margin-left: 4px; fill: currentColor; }
.gm__flecha { position: absolute; z-index: 4; top: 50%; display: grid; width: 40px; height: 40px; place-items: center; border: 1px solid rgb(255 255 255 / 18%); border-radius: 50%;
  background: rgb(11 23 54 / 82%); color: #fff; cursor: pointer; transform: translateY(-50%); }
.gm__flecha:hover { background: #1b3168; }
.gm__flecha svg { width: 20px; height: 20px; fill: none; stroke: currentColor; stroke-width: 2.2; stroke-linecap: round; stroke-linejoin: round; }
.gm__flecha--izq { left: 8px; }
.gm__flecha--der { right: 8px; }
.gm__sobre { position: absolute; z-index: 4; bottom: 14px; left: 50%; transform: translateX(-50%); pointer-events: none; }
.gm__sobre > :deep(*) { pointer-events: auto; }
.gm__puntos { display: flex; justify-content: center; gap: 6px; margin-top: 12px; }
.gm__punto { width: 8px; height: 8px; border: 0; border-radius: 999px; background: rgb(255 255 255 / 22%); padding: 0; cursor: pointer; transition: width .3s, background .3s; }
.gm__punto.is-activo { width: 22px; background: #e11d2a; }
.gm button:focus-visible { outline: 3px solid #f5c518; outline-offset: 2px; }
@media (max-width: 700px) {
  .gm { --h: clamp(200px, 60vw, 340px); }
  .gm__item { width: 84%; }
  .gm__item--d1 { transform: translateX(calc(-50% + 70%)) scale(.84); }
  .gm__item--d-1 { transform: translateX(calc(-50% - 70%)) scale(.84); }
  .gm__flecha { width: 34px; height: 34px; }
  .gm__flecha--izq { left: 2px; }
  .gm__flecha--der { right: 2px; }
  .gm__play { width: 58px; height: 58px; }
  .gm__sobre { bottom: 8px; }
}
@media (prefers-reduced-motion: reduce) { .gm__item, .gm__punto, .gm__play { transition: none; } }
</style>
