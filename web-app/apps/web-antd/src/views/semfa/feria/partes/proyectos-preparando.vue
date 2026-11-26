<script setup lang="ts">
/**
 * Mientras los proyectos no se publican: un aviso «se están preparando» con lo que viene (cifras que
 * suben y las categorías revelándose una a una al llegar a la vista). Solo transform/opacity; sin
 * animación con «reducir movimiento». Los textos vienen del editor de la portada.
 */
import { computed, onMounted, onUnmounted, ref } from 'vue';

import { nombreCategoria, numero, t } from '../i18n';
import { iconoCategoria } from './iconos';

const props = defineProps<{ categorias: string[]; cifra: string; dias: number; texto: string; titulo: string }>();

const raiz = ref<HTMLElement>();
const visible = ref(false);
const reducirMovimiento = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
const cifraNumero = computed(() => Number.parseInt(props.cifra.replaceAll(/\D/g, ''), 10) || 0);
const mostrada = ref(0);
let observador: IntersectionObserver | undefined;
let cuadro = 0;

function contar() {
  const meta = cifraNumero.value;
  if (reducirMovimiento || !meta) { mostrada.value = meta; return; }
  const t0 = performance.now();
  const paso = (t: number) => {
    const k = Math.min(1, (t - t0) / 1_400);
    mostrada.value = Math.round(meta * (1 - (1 - k) ** 3));
    if (k < 1) cuadro = requestAnimationFrame(paso);
  };
  cuadro = requestAnimationFrame(paso);
}

const cifras = computed(() => [
  ...(cifraNumero.value ? [{ clave: 'p', etiqueta: t('proyectos'), valor: `+${numero(mostrada.value)}` }] : []),
  ...(props.categorias.length ? [{ clave: 'c', etiqueta: t('categorías'), valor: String(props.categorias.length) }] : []),
  ...(props.dias ? [{ clave: 'd', etiqueta: t('día de feria|días de feria', { n: props.dias }), valor: String(props.dias) }] : []),
]);

onMounted(() => {
  if (!raiz.value || !('IntersectionObserver' in window)) { visible.value = true; mostrada.value = cifraNumero.value; return; }
  observador = new IntersectionObserver(([e]) => {
    if (!e?.isIntersecting) return;
    visible.value = true;
    contar();
    observador?.disconnect();
  }, { threshold: 0.25 });
  observador.observe(raiz.value);
});
onUnmounted(() => { observador?.disconnect(); cancelAnimationFrame(cuadro); });
</script>

<template>
  <div ref="raiz" class="pp" :class="{ 'is-visible': visible }">
    <div class="pp__aviso">
      <span class="pp__estado"><span class="pp__puntos" aria-hidden="true"><i></i><i></i><i></i></span>{{ t('En preparación') }}</span>
      <h3>{{ titulo }}</h3>
      <p v-if="texto">{{ texto }}</p>
      <ul v-if="cifras.length" class="pp__cifras">
        <li v-for="c in cifras" :key="c.clave"><b>{{ c.valor }}</b><small>{{ c.etiqueta }}</small></li>
      </ul>
      <div class="pp__barra" aria-hidden="true"><span></span></div>
    </div>
    <ul v-if="categorias.length" class="pp__categorias" :aria-label="t('Categorías de la feria')">
      <li v-for="(c, i) in categorias" :key="c" :style="{ '--i': i }">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path :d="iconoCategoria(c)" /></svg>
        <span>{{ nombreCategoria(c) }}</span>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.pp { display: grid; gap: 16px; }
@media (min-width: 900px) { .pp { grid-template-columns: minmax(0, 5fr) minmax(0, 7fr); align-items: stretch; } }
.pp__aviso { display: flex; flex-direction: column; gap: 10px; border: 1px solid rgb(255 255 255 / 12%); border-radius: 16px; background: #0f1f45; padding: 20px; }
.pp__estado { display: inline-flex; align-self: flex-start; align-items: center; gap: 8px; border: 1px solid rgb(245 197 24 / 40%); border-radius: 999px; background: rgb(245 197 24 / 10%); padding: 3px 11px; color: #f5d469; font-size: 11.5px; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; }
.pp__puntos { display: inline-flex; gap: 3px; }
.pp__puntos i { width: 5px; height: 5px; border-radius: 50%; background: currentColor; animation: pp-punto 1.2s ease-in-out infinite; }
.pp__puntos i:nth-child(2) { animation-delay: .15s; }
.pp__puntos i:nth-child(3) { animation-delay: .3s; }
.pp h3 { margin: 0; color: #fff; font-size: clamp(20px, 2.2vw, 26px); font-weight: 900; line-height: 1.15; }
.pp p { margin: 0; color: #c3cde6; font-size: 15px; line-height: 1.55; }
.pp__cifras { display: flex; flex-wrap: wrap; gap: 10px; margin: 6px 0 0; padding: 0; list-style: none; }
.pp__cifras li { display: flex; flex: 1 1 90px; flex-direction: column; border: 1px solid rgb(255 255 255 / 10%); border-radius: 12px; background: #0b1736; padding: 10px 12px; }
.pp__cifras b { color: #fff; font-size: 28px; font-weight: 900; font-variant-numeric: tabular-nums; line-height: 1.05; }
.pp__cifras li:first-child b { color: #ff5a68; }
.pp__cifras small { color: #8fa3cf; font-size: 11.5px; font-weight: 700; text-transform: uppercase; }
.pp__barra { position: relative; height: 4px; margin-top: auto; overflow: hidden; border-radius: 999px; background: #1b2a52; }
.pp__barra span { position: absolute; inset: 0; width: 40%; border-radius: inherit; background: linear-gradient(90deg, transparent, #c8102e, transparent); animation: pp-barra 2.4s ease-in-out infinite; }
.pp__categorias { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 10px; margin: 0; padding: 0; list-style: none; }
.pp__categorias li { display: flex; align-items: center; gap: 10px; min-height: 64px; border: 1px solid rgb(255 255 255 / 10%); border-radius: 12px; background: #0f1f45; padding: 10px 12px; color: #e8edf8; font-size: 13.5px; font-weight: 700; line-height: 1.25;
  opacity: 0; transform: translateY(10px); transition: opacity .5s ease-out, transform .5s ease-out; transition-delay: calc(var(--i) * 90ms); }
.is-visible .pp__categorias li { opacity: 1; transform: none; }
.pp__categorias svg { width: 30px; height: 30px; flex: none; border-radius: 8px; background: #13244f; padding: 5px; fill: none; stroke: #ff7a86; stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round; }
.pp__categorias li:nth-child(even) svg { stroke: #8fb0ff; }
@keyframes pp-punto { 0%, 100% { opacity: .3; transform: translateY(0); } 50% { opacity: 1; transform: translateY(-2px); } }
@keyframes pp-barra { from { transform: translateX(-100%); } to { transform: translateX(250%); } }
@media (max-width: 420px) { .pp__categorias { grid-template-columns: 1fr 1fr; } .pp__categorias li { font-size: 12.5px; } }
@media (prefers-reduced-motion: reduce) {
  .pp__puntos i, .pp__barra span { animation: none; }
  .pp__categorias li { opacity: 1; transform: none; transition: none; }
}
</style>
