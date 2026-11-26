<script setup lang="ts">
/**
 * Proyectos de la portada (cuando el editor los publica): «Destacados» (tarjetas con una portada
 * sobria generada en CSS con el color e ícono de su categoría: ninguna foto, para no repetir las de
 * la galería) y «Todos los proyectos» (buscador sin tildes + filtros; lista corta que crece con
 * «Ver más» para no cargar el DOM del celular). «Ver ubicación» emite `ubicar` (la portada abre el mapa).
 */
import type { StandPublico } from '#/api/feria-publico';

import { computed, ref } from 'vue';

import { normalizarTexto } from '#/utils/formato';

import { nombreCategoria, t } from '../i18n';
import { vRevelar } from '../revelar';
import { iconoCategoria } from './iconos';

const props = defineProps<{
  categorias: { color: string; id: number; nombre: string }[];
  destacados: number[];
  jornadas: number[];
  stands: StandPublico[];
  textoJornada: (j: null | number | undefined) => string;
  tituloDestacados: string;
  tituloTodos: string;
  version: number;
}>();
const emit = defineEmits<{ ubicar: [id: number] }>();

const POR_PAGINA = 30;
const busqueda = ref('');
const filtroCategoria = ref<null | number>(null);
const filtroDia = ref<null | number>(null);
const visibles = ref(POR_PAGINA);
const pista = ref<HTMLElement>();
const comparar = new Intl.Collator('es', { numeric: true, sensitivity: 'base' }).compare;

const categoriaDe = computed(() => new Map(props.categorias.map((c) => [c.id, c])));
const ordenados = computed(() => {
  void props.version;
  return [...props.stands].sort((a, b) => comparar(a.stand ?? '~', b.stand ?? '~') || comparar(a.proyecto ?? '', b.proyecto ?? ''));
});

const tarjetas = computed(() => {
  void props.version;
  const porId = new Map(props.stands.map((s) => [s.id, s]));
  const elegidos = props.destacados.map((id) => porId.get(id)).filter((s): s is StandPublico => Boolean(s));
  return (elegidos.length ? elegidos : ordenados.value.filter((s) => s.lat !== null)).slice(0, 12);
});

/** Nombre de la categoría en el idioma que se ve (las 10 del afiche se traducen; las demás, tal cual). */
const nombreDe = (id: number) => nombreCategoria(categoriaDe.value.get(id)?.nombre);
// El buscador encuentra la categoría en español y en el idioma que se ve.
const indice = computed(() => props.stands.map((s) => ({
  s, texto: normalizarTexto([s.stand, s.proyecto, s.carrera, s.siglaFacultad, categoriaDe.value.get(s.idCategoria)?.nombre, nombreDe(s.idCategoria), s.docente, ...(s.integrantes ?? [])].filter(Boolean).join(' ')),
})));
const filtrados = computed(() => {
  void props.version;
  const q = normalizarTexto(busqueda.value.trim()).split(/\s+/).filter(Boolean);
  const ids = new Set(indice.value.filter(({ s, texto }) => (filtroCategoria.value === null || s.idCategoria === filtroCategoria.value)
    && (filtroDia.value === null || (s.jornada ?? 1) === filtroDia.value)
    && q.every((t) => texto.includes(t))).map(({ s }) => s.id));
  return ordenados.value.filter((s) => ids.has(s.id));
});

function reiniciar() { visibles.value = POR_PAGINA; }
function desplazar(dir: number) {
  const el = pista.value;
  if (el) el.scrollBy({ left: dir * el.clientWidth * 0.85, behavior: 'smooth' });
}
const ESTADO = { E: 'Evaluado', N: 'Pendiente', P: 'En evaluación' } as const;
</script>

<template>
  <div class="pr">
    <template v-if="tarjetas.length">
      <div class="pr__cab">
        <h3 id="fx-destacados">{{ tituloDestacados }}</h3>
        <div v-if="tarjetas.length > 1" class="pr__flechas">
          <button type="button" :aria-label="t('Ver anteriores')" @click="desplazar(-1)"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg></button>
          <button type="button" :aria-label="t('Ver siguientes')" @click="desplazar(1)"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7" /></svg></button>
        </div>
      </div>
      <ul ref="pista" v-revelar.grupo class="pr__pista" aria-labelledby="fx-destacados">
        <li v-for="s in tarjetas" :key="s.id" class="pr__tarjeta" :style="{ '--c': categoriaDe.get(s.idCategoria)?.color ?? '#1d4ed8' }">
          <div class="pr__portada" aria-hidden="true">
            <span class="pr__stand"><small>STAND</small>{{ s.stand || '—' }}</span>
            <svg class="pr__icono" viewBox="0 0 24 24"><path :d="iconoCategoria(categoriaDe.get(s.idCategoria)?.nombre)" /></svg>
            <span class="pr__estado" :class="`pr__estado--${s.estado.toLowerCase()}`">{{ t(ESTADO[s.estado]) }}</span>
          </div>
          <div class="pr__cuerpo">
            <h4 :title="s.proyecto ?? ''">{{ s.proyecto }}</h4>
            <p v-if="s.carrera || s.facultad"><i aria-hidden="true"></i>{{ s.carrera || s.facultad }}</p>
            <dl>
              <dt>{{ t('Categoría') }}</dt><dd>{{ nombreDe(s.idCategoria) }}</dd>
              <dt>{{ t('Jornada') }}</dt><dd>{{ textoJornada(s.jornada).replace(' · ', ' - ') }}</dd>
            </dl>
            <button type="button" class="pr__ubicar" :disabled="s.lat === null" @click="emit('ubicar', s.id)">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 22s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12z" /><circle cx="12" cy="10" r="2.6" /></svg>
              {{ s.lat === null ? t('Ubicación pendiente') : t('Ver ubicación') }}
            </button>
          </div>
        </li>
      </ul>
    </template>

    <h3 id="fx-todos" class="pr__titulo2">{{ tituloTodos }} <small>{{ filtrados.length }}</small></h3>
    <form class="pr__buscar" role="search" @submit.prevent>
      <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4.5 4.5" /></svg>
      <input v-model="busqueda" type="search" :placeholder="t('Buscar proyecto, stand, carrera o integrante')" :aria-label="t('Buscar proyecto, número de stand, carrera o integrante')"
        autocomplete="off" enterkeyhint="search" @input="reiniciar" />
    </form>
    <div class="pr__filtros" role="group" :aria-label="t('Filtrar proyectos')">
      <button v-for="j in jornadas" :key="`d${j}`" type="button" class="pr__filtro" :aria-pressed="filtroDia === j" @click="filtroDia = filtroDia === j ? null : j; reiniciar()">
        {{ textoJornada(j).replace(' · ', ' - ') }}
      </button>
      <button v-for="c in categorias" :key="c.id" type="button" class="pr__filtro" :style="{ '--c': c.color }" :aria-pressed="filtroCategoria === c.id"
        @click="filtroCategoria = filtroCategoria === c.id ? null : c.id; reiniciar()">
        <i></i>{{ nombreCategoria(c.nombre) }}
      </button>
    </div>
    <ul v-revelar class="pr__lista" aria-labelledby="fx-todos">
      <li v-for="s in filtrados.slice(0, visibles)" :key="s.id">
        <span class="pr__num" :title="t(ESTADO[s.estado])"><small>STAND</small>{{ s.stand || '—' }}</span>
        <span class="pr__fila"><strong>{{ s.proyecto }}</strong><small><i :style="{ background: categoriaDe.get(s.idCategoria)?.color }"></i>{{ nombreDe(s.idCategoria) }}<template v-if="s.carrera"> · {{ s.carrera }}</template></small></span>
        <button type="button" class="pr__ver" :disabled="s.lat === null" :aria-label="t('Ver ubicación de {x}', { x: s.proyecto ?? '' })" @click="emit('ubicar', s.id)">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 22s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12z" /><circle cx="12" cy="10" r="2.6" /></svg>
          <span>{{ t('Ver ubicación') }}</span>
        </button>
      </li>
      <li v-if="!filtrados.length" class="pr__vacio">{{ stands.length ? t('Sin coincidencias.') : t('Los proyectos aparecerán aquí muy pronto.') }}</li>
    </ul>
    <button v-if="filtrados.length > visibles" type="button" class="pr__mas" @click="visibles += POR_PAGINA">
      {{ t('Ver más ({n})', { n: filtrados.length - visibles }) }}
    </button>
  </div>
</template>

<style scoped>
.pr h3 { margin: 0; color: #fff; font-size: 18px; font-weight: 800; letter-spacing: .03em; text-transform: uppercase; }
.pr h3 small { margin-left: 4px; color: #8fa3cf; font-size: 14px; font-weight: 700; }
.pr__cab { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
.pr__flechas { display: flex; gap: 6px; }
.pr__flechas button { display: grid; width: 36px; height: 36px; place-items: center; border: 1px solid rgb(255 255 255 / 16%); border-radius: 50%; background: #0f1f45; color: #fff; cursor: pointer; }
.pr__flechas button:hover { background: #1b3168; }
.pr__flechas svg { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 2.2; stroke-linecap: round; stroke-linejoin: round; }
.pr__pista { display: flex; gap: 14px; margin: 0; overflow-x: auto; padding: 2px 2px 12px; list-style: none; scroll-snap-type: x mandatory; scrollbar-color: #2a3c6e transparent; scrollbar-width: thin; }
.pr__tarjeta { display: flex; flex: 0 0 min(300px, 84%); flex-direction: column; overflow: hidden; border: 1px solid rgb(255 255 255 / 12%); border-radius: 16px; background: #0f1f45; scroll-snap-align: start; box-shadow: 0 10px 24px rgb(0 0 0 / 25%); }
.pr__portada { position: relative; height: 104px; overflow: hidden; background: #13244f;
  background: linear-gradient(135deg, color-mix(in srgb, var(--c) 62%, #0b1736) 0%, color-mix(in srgb, var(--c) 22%, #0b1736) 100%); }
.pr__stand { position: absolute; top: 14px; left: 16px; display: flex; flex-direction: column; color: #fff; font-size: 38px; font-weight: 900; line-height: 1; }
.pr__stand small { color: rgb(255 255 255 / 70%); font-size: 10.5px; font-weight: 800; letter-spacing: .14em; }
.pr__icono { position: absolute; right: 14px; bottom: -10px; width: 96px; height: 96px; fill: none; stroke: rgb(255 255 255 / 28%); stroke-width: 1.2; stroke-linecap: round; stroke-linejoin: round; }
.pr__estado { position: absolute; top: 12px; right: 12px; border-radius: 999px; padding: 2px 9px; font-size: 11px; font-weight: 800; }
.pr__estado--n { background: rgb(255 255 255 / 16%); color: #fff; }
.pr__estado--p { background: rgb(245 197 24 / 26%); color: #fde68a; }
.pr__estado--e { background: rgb(200 16 46 / 75%); color: #fff; }
.pr__cuerpo { display: flex; flex: 1; flex-direction: column; gap: 6px; padding: 12px 14px 14px; }
.pr__cuerpo h4 { display: -webkit-box; margin: 0; overflow: hidden; color: #fff; font-size: 16px; font-weight: 800; line-height: 1.25; text-transform: uppercase; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
.pr__cuerpo p { display: flex; align-items: center; gap: 7px; margin: 0; overflow: hidden; color: #d5ddef; font-size: 13px; }
.pr__cuerpo p i { width: 9px; height: 9px; flex: none; border-radius: 2px; background: #1d4ed8; }
.pr__cuerpo dl { display: grid; grid-template-columns: auto 1fr; gap: 2px 10px; margin: 2px 0 8px; font-size: 13px; }
.pr__cuerpo dt { color: #7f93c2; }
.pr__cuerpo dd { margin: 0; overflow: hidden; color: #e8edf8; text-overflow: ellipsis; white-space: nowrap; }
.pr__ubicar { display: inline-flex; align-items: center; justify-content: center; gap: 8px; margin-top: auto; border: 0; border-radius: 10px; background: #c8102e; padding: 11px; color: #fff; font-size: 14px; font-weight: 800; letter-spacing: .04em; text-transform: uppercase; box-shadow: 0 4px 12px rgb(200 16 46 / 25%); cursor: pointer; }
.pr__ubicar:hover { background: #e11d2a; }
.pr__ubicar:disabled, .pr__ver:disabled { background: #1b2a52; box-shadow: none; color: #7f93c2; cursor: default; }
.pr__ubicar svg, .pr__ver svg { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 2.2; }
.pr__titulo2 { margin-top: 22px !important; }
.pr__buscar { display: flex; align-items: center; margin: 10px 0 8px; border: 1px solid rgb(255 255 255 / 16%); border-radius: 12px; background: #0b1736; }
.pr__buscar:focus-within { border-color: #4f74c9; box-shadow: 0 0 0 3px rgb(79 116 201 / 25%); }
.pr__buscar svg { width: 19px; height: 19px; flex: none; margin-left: 13px; fill: none; stroke: #8fa3cf; stroke-width: 2.2; stroke-linecap: round; }
.pr__buscar input { width: 100%; min-width: 0; border: 0; background: transparent; padding: 11px 12px 11px 9px; color: #fff; font-size: 15px; outline: none; }
.pr__buscar input::placeholder { color: #7f93c2; }
.pr__filtros { display: flex; gap: 7px; overflow-x: auto; padding-bottom: 6px; scrollbar-width: none; }
.pr__filtro { display: inline-flex; flex: none; align-items: center; gap: 6px; border: 1px solid rgb(255 255 255 / 16%); border-radius: 999px; background: #0f1f45; padding: 6px 12px; color: #e8edf8; font-size: 13px; font-weight: 700; white-space: nowrap; cursor: pointer; }
.pr__filtro i { width: 9px; height: 9px; border-radius: 2px; background: var(--c); }
.pr__filtro[aria-pressed='true'] { border-color: #e8edf8; background: #1b3168; color: #fff; }
.pr__lista { display: flex; flex-direction: column; gap: 6px; margin: 4px 0 0; padding: 0; list-style: none; }
.pr__lista > li { display: flex; align-items: center; gap: 12px; border: 1px solid rgb(255 255 255 / 8%); border-radius: 12px; background: #0f1f45; padding: 8px 10px; }
.pr__num { display: flex; flex: none; flex-direction: column; align-items: center; min-width: 52px; border-radius: 8px; background: #13244f; padding: 3px 6px; color: #fff; font-size: 16px; font-weight: 800; line-height: 1.1; }
.pr__num small { color: #7f93c2; font-size: 8.5px; letter-spacing: .12em; }
.pr__fila { display: flex; flex: 1; flex-direction: column; min-width: 0; }
.pr__fila strong, .pr__fila small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pr__fila strong { color: #fff; font-size: 14px; }
.pr__fila small { display: flex; align-items: center; gap: 5px; color: #8fa3cf; font-size: 12px; }
.pr__fila small i { width: 8px; height: 8px; flex: none; border-radius: 2px; }
.pr__ver { display: inline-flex; flex: none; align-items: center; gap: 6px; border: 0; border-radius: 9px; background: #c8102e; padding: 7px 12px; color: #fff; font-size: 12.5px; font-weight: 800; cursor: pointer; }
.pr__ver:hover { background: #e11d2a; }
.pr__mas { width: 100%; margin-top: 8px; border: 1px dashed rgb(255 255 255 / 22%); border-radius: 12px; background: none; padding: 10px; color: #b9c6e4; font-weight: 800; cursor: pointer; }
.pr__vacio { justify-content: center; padding: 14px; color: #8fa3cf; text-align: center; }
.pr button:focus-visible, .pr input:focus-visible { outline: 3px solid #f5c518; outline-offset: 2px; }
@media (max-width: 420px) {
  .pr__ver span { display: none; }
  .pr__ver { padding: 9px; }
}
</style>
