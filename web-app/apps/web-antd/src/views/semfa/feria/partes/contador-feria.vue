<script setup lang="ts">
/**
 * Contador sobre la galería: cuenta regresiva (días : horas : min : seg) hasta el inicio; durante
 * la feria, proyectos evaluados y visitantes (los números suben con una animación corta); después,
 * el resumen final. Solo late cada segundo antes del inicio y con la pestaña visible.
 */
import type { ResumenFeria } from '#/api/feria-publico';
import type { FaseFeria } from '../portada';

import { computed, onMounted, onUnmounted, ref, watch } from 'vue';

import { numero, t } from '../i18n';

const props = defineProps<{ fase: FaseFeria; inicio: number; resumen: null | ResumenFeria; visitas: null | number }>();

const ahora = ref(Date.now());
let tic: ReturnType<typeof setInterval> | undefined;
const reducirMovimiento = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

function reloj() {
  clearInterval(tic);
  tic = undefined;
  if (props.fase === 'antes' && document.visibilityState === 'visible') tic = setInterval(() => { ahora.value = Date.now(); }, 1_000);
  ahora.value = Date.now();
}
watch(() => props.fase, reloj);

const falta = computed(() => {
  const s = Math.max(0, Math.floor((props.inicio - ahora.value) / 1000));
  return { d: Math.floor(s / 86_400), h: Math.floor((s % 86_400) / 3600), m: Math.floor((s % 3600) / 60), s: s % 60 };
});
const dos = (n: number) => String(n).padStart(2, '0');
const cajas = computed(() => [
  { clave: 'd', etiqueta: t('día|días', { n: falta.value.d }), valor: dos(falta.value.d) },
  { clave: 'h', etiqueta: t('horas'), valor: dos(falta.value.h) },
  { clave: 'm', etiqueta: t('min'), valor: dos(falta.value.m) },
  { clave: 's', etiqueta: t('seg'), valor: dos(falta.value.s) },
]);

/** Número que sube hasta su valor nuevo (requestAnimationFrame, ~0,9 s). */
function animado(fuente: () => number) {
  const mostrado = ref(fuente());
  let cuadro = 0;
  watch(fuente, (nuevo) => {
    cancelAnimationFrame(cuadro);
    const desde = mostrado.value;
    if (reducirMovimiento || document.visibilityState !== 'visible') { mostrado.value = nuevo; return; }
    const t0 = performance.now();
    const paso = (t: number) => {
      const k = Math.min(1, (t - t0) / 900);
      mostrado.value = Math.round(desde + (nuevo - desde) * (1 - (1 - k) ** 3));
      if (k < 1) cuadro = requestAnimationFrame(paso);
    };
    cuadro = requestAnimationFrame(paso);
  });
  return mostrado;
}
const evaluados = animado(() => props.resumen?.evaluados ?? 0);
const visitantes = animado(() => props.visitas ?? 0);
const total = computed(() => props.resumen?.total ?? 0);
const fmt = numero;

function alCambiarVisibilidad() { reloj(); }
onMounted(() => { reloj(); document.addEventListener('visibilitychange', alCambiarVisibilidad); });
onUnmounted(() => { clearInterval(tic); document.removeEventListener('visibilitychange', alCambiarVisibilidad); });
</script>

<template>
  <div class="cn" role="timer" aria-live="off">
    <template v-if="fase === 'antes'">
      <span class="cn__titulo">{{ t('La feria empieza en') }}</span>
      <div class="cn__cajas" :aria-label="t('Falta {n} día, {h} horas y {m} minutos|Faltan {n} días, {h} horas y {m} minutos', { h: falta.h, m: falta.m, n: falta.d })">
        <template v-for="(c, i) in cajas" :key="c.clave">
          <span v-if="i" class="cn__dos" aria-hidden="true">:</span>
          <span class="cn__caja" aria-hidden="true"><b>{{ c.valor }}</b><small>{{ c.etiqueta }}</small></span>
        </template>
      </div>
    </template>
    <template v-else>
      <span class="cn__titulo">{{ fase === 'durante' ? t('En vivo ahora') : t('¡Gracias por visitarnos!') }}</span>
      <div class="cn__cajas">
        <span v-if="total" class="cn__caja cn__caja--ancha"><b>{{ fmt(evaluados) }}<i> / {{ fmt(total) }}</i></b><small>{{ t('proyectos evaluados') }}</small></span>
        <span v-if="visitas !== null" class="cn__caja cn__caja--ancha"><b>{{ fmt(visitantes) }}</b><small>{{ t('visitantes') }}</small></span>
      </div>
    </template>
  </div>
</template>

<style scoped>
.cn { display: flex; flex-direction: column; align-items: center; gap: 4px; border: 1px solid rgb(255 255 255 / 14%); border-radius: 14px; background: rgb(8 17 42 / 86%); padding: 6px 10px 8px; box-shadow: 0 8px 22px rgb(0 0 0 / 35%); }
.cn__titulo { color: #b9c6e4; font-size: 10.5px; font-weight: 800; letter-spacing: .14em; text-transform: uppercase; }
.cn__cajas { display: flex; align-items: center; gap: 4px; }
.cn__caja { display: flex; flex-direction: column; align-items: center; min-width: 54px; border: 1px solid rgb(255 255 255 / 12%); border-radius: 8px; background: #13244f; padding: 3px 6px 2px; }
.cn__caja--ancha { min-width: 110px; }
.cn__caja b { color: #fff; font-size: 26px; font-weight: 800; font-variant-numeric: tabular-nums; line-height: 1.1; }
.cn__caja b i { color: #8fa3cf; font-size: .6em; font-style: normal; }
.cn__caja small { color: #8fa3cf; font-size: 10px; font-weight: 700; text-transform: uppercase; }
.cn__dos { color: #8fa3cf; font-size: 22px; font-weight: 800; }
@media (max-width: 400px) {
  .cn__caja { min-width: 44px; padding: 2px 4px; }
  .cn__caja b { font-size: 20px; }
  .cn__dos { font-size: 16px; }
}
</style>
