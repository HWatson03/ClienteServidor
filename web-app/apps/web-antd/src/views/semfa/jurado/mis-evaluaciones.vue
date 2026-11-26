<script lang="ts" setup>
import type { CategoriaTablero, ProyectoTablero, TableroJurado } from '#/api/jurado';

import { computed, onMounted, ref, shallowRef, watch } from 'vue';
import { useRouter } from 'vue-router';

import { IconifyIcon } from '@vben/icons';

import { obtenerTableroJurado } from '#/api/jurado';
import { coincideProyecto, terminosDeBusqueda } from '#/utils/busqueda-proyecto';
import { tiempoTranscurrido } from '#/utils/formato';

import { ESTADOS_JURADO, nivelDe, ubicacionFeria } from './escala';

defineOptions({ name: 'JuradoParticipantes' });

/**
 * Inicio del jurado: la lista de participantes que le toca evaluar. Un toque en
 * uno abre sus rúbricas. Sin adornos: avance arriba, categorías si tiene más de
 * una, y la lista.
 */

const router = useRouter();

const tablero = shallowRef<null | TableroJurado>(null);
const cargando = ref(false);
const idCategoria = ref<number>();

async function cargar() {
  cargando.value = true;
  try {
    const datos = await obtenerTableroJurado();
    tablero.value = datos;
    if (!datos.categorias.some((c) => c.idCategoria === idCategoria.value)) {
      idCategoria.value = (datos.categorias.find((c) => c.pendientes > 0) ?? datos.categorias[0])?.idCategoria;
    }
  } catch {
    // El interceptor ya avisó.
  } finally {
    cargando.value = false;
  }
}

onMounted(cargar);

const categorias = computed(() => tablero.value?.categorias ?? []);
const categoria = computed<CategoriaTablero | undefined>(() =>
  categorias.value.find((c) => c.idCategoria === idCategoria.value),
);
const resumen = computed(() => tablero.value?.resumen);
const actividades = computed(() => [...new Set(categorias.value.map((c) => c.actividad))].join(' · '));

/** La primera sin terminar, en orden: se marca como «Siguiente». */
const siguiente = computed(() => categoria.value?.proyectos.find((p) => p.estado !== 'EVALUADO'));

function porcentaje(parte: number, total: number) {
  return total > 0 ? Math.round((parte * 100) / total) : 0;
}

/*
 * Buscador: con texto busca en TODAS las categorías del jurado (cada fila dice la
 * suya); sin texto muestra la categoría elegida, como siempre. Se recuerda en la
 * pestaña para que al volver de evaluar siga la misma búsqueda.
 */
const CLAVE_BUSQUEDA = 'semfa-jurado-busqueda';
function leerBusqueda() {
  try {
    return sessionStorage.getItem(CLAVE_BUSQUEDA) ?? '';
  } catch {
    return '';
  }
}
const busqueda = ref(leerBusqueda());
watch(busqueda, (v) => {
  try {
    sessionStorage.setItem(CLAVE_BUSQUEDA, v);
  } catch {
    // Sin almacenamiento: la búsqueda solo dura mientras la pantalla esté abierta.
  }
});
const terminos = computed(() => terminosDeBusqueda(busqueda.value));
const buscando = computed(() => terminos.value.length > 0);
const totalProyectos = computed(() => categorias.value.reduce((n, c) => n + c.proyectos.length, 0));

interface Fila {
  c: CategoriaTablero;
  numero: number;
  p: ProyectoTablero;
}
const filas = computed<Fila[]>(() => {
  const fuente = buscando.value ? categorias.value : categoria.value ? [categoria.value] : [];
  return fuente.flatMap((c) =>
    c.proyectos.flatMap((p, i) => (coincideProyecto(p, terminos.value) ? [{ c, numero: p.orden ?? i + 1, p }] : [])),
  );
});

function evaluar(c: CategoriaTablero, p: ProyectoTablero) {
  if (c.rubricas === 0) return;
  router.push({
    name: 'JuradoEvaluar',
    params: { categoriaId: c.idCategoria, participanteId: p.idParticipante },
  });
}
</script>

<template>
  <div class="mx-auto flex max-w-3xl flex-col gap-3 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
    <!-- Avance -->
    <div v-if="resumen" class="semfa-lista-card rounded-2xl p-4">
      <div class="flex items-center justify-between gap-3">
        <div class="min-w-0">
          <div class="truncate text-xs text-muted-foreground">{{ actividades || 'Mis evaluaciones' }}</div>
          <div class="text-lg font-semibold">
            <span class="tabular-nums">{{ resumen.evaluados }}</span>
            <span class="font-normal text-muted-foreground"> de {{ resumen.proyectos }} evaluadas</span>
          </div>
        </div>
        <button :disabled="cargando" class="semfa-lista-icono" title="Actualizar" type="button" @click="cargar">
          <IconifyIcon :class="{ 'animate-spin': cargando }" class="size-5" icon="lucide:refresh-cw" />
        </button>
      </div>
      <div class="semfa-barra mt-2">
        <span :style="{ width: `${porcentaje(resumen.evaluados, resumen.proyectos)}%` }" class="bg-emerald-500"></span>
      </div>
    </div>

    <!-- Categorías -->
    <div v-if="categorias.length > 1" class="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
      <button
        v-for="c in categorias"
        :key="c.idCategoria"
        :class="{ 'is-activo': c.idCategoria === idCategoria }"
        class="semfa-chip shrink-0 py-1.5"
        type="button"
        @click="idCategoria = c.idCategoria"
      >
        <IconifyIcon v-if="c.pendientes === 0" class="size-4" icon="lucide:circle-check" />
        {{ c.nombre }}
        <span class="tabular-nums opacity-75">{{ c.evaluados }}/{{ c.proyectos.length }}</span>
      </button>
    </div>

    <!-- Buscador (se muestra si hay más de 8 proyectos en total) -->
    <div v-if="totalProyectos > 8" class="semfa-lista-buscar">
      <IconifyIcon class="size-5 shrink-0 text-muted-foreground" icon="lucide:search" />
      <input
        v-model="busqueda"
        aria-label="Buscar proyecto"
        autocomplete="off"
        class="min-w-0 flex-1 bg-transparent text-base outline-none"
        enterkeyhint="search"
        placeholder="Buscar proyecto, carrera o stand…"
        type="search"
      />
      <button
        v-if="busqueda"
        class="semfa-lista-icono size-8"
        title="Borrar búsqueda"
        type="button"
        @click="busqueda = ''"
      >
        <IconifyIcon class="size-4" icon="lucide:x" />
      </button>
    </div>
    <div v-if="buscando" class="-mt-1 px-1 text-xs text-muted-foreground">
      <template v-if="filas.length > 0">
        {{ filas.length }} resultado{{ filas.length === 1 ? '' : 's' }}{{ categorias.length > 1 ? ' en todas tus categorías' : '' }}
      </template>
      <template v-else>Ningún proyecto coincide con «{{ busqueda.trim() }}».</template>
    </div>

    <!-- Estados vacíos -->
    <div v-if="!tablero && cargando" class="flex flex-col items-center gap-2 py-16 text-muted-foreground">
      <IconifyIcon class="size-8 animate-spin opacity-60" icon="lucide:loader-circle" />
      Cargando…
    </div>
    <div
      v-else-if="tablero && categorias.length === 0"
      class="flex flex-col items-center gap-2 py-16 text-center text-muted-foreground"
    >
      <IconifyIcon class="size-10 opacity-60" icon="lucide:clipboard-x" />
      Aún no tienes participantes asignados.
      <span class="text-xs">El administrador te los asigna en «Asignación de jurados».</span>
    </div>
    <div
      v-else-if="!buscando && categoria && categoria.rubricas === 0"
      class="flex items-center gap-2 rounded-xl bg-amber-500/10 px-4 py-3 text-sm text-amber-700"
    >
      <IconifyIcon class="size-5 shrink-0" icon="lucide:triangle-alert" />
      Esta categoría todavía no tiene rúbricas: no se puede evaluar.
    </div>
    <div
      v-else-if="!buscando && categoria && categoria.proyectos.length === 0"
      class="py-16 text-center text-muted-foreground"
    >
      Esta categoría no tiene participantes inscritos.
    </div>

    <!-- Participantes -->
    <div v-if="filas.length > 0" class="semfa-lista-card overflow-hidden rounded-2xl">
      <button
        v-for="{ c, numero, p } in filas"
        :key="p.idInscripcion"
        :class="{ 'semfa-lista-fila--siguiente': siguiente?.idInscripcion === p.idInscripcion }"
        :disabled="c.rubricas === 0"
        class="semfa-lista-fila flex w-full items-center gap-3 px-4 py-3 text-left sm:gap-4 sm:px-5 sm:py-4"
        type="button"
        @click="evaluar(c, p)"
      >
        <span
          :class="
            p.estado === 'EVALUADO'
              ? 'bg-emerald-500/15 text-emerald-600'
              : siguiente?.idInscripcion === p.idInscripcion
                ? 'bg-primary text-white'
                : 'bg-muted text-muted-foreground'
          "
          class="flex size-11 shrink-0 items-center justify-center rounded-full text-base font-bold tabular-nums sm:size-12"
        >
          <IconifyIcon v-if="p.estado === 'EVALUADO'" class="size-5" icon="lucide:check" />
          <template v-else>{{ numero }}</template>
        </span>

        <span class="min-w-0 flex-1">
          <span class="line-clamp-2 block text-[15px] font-medium leading-snug sm:text-lg">{{ p.nombre }}</span>
          <span class="block truncate text-xs text-muted-foreground sm:text-sm">
            <template v-if="siguiente?.idInscripcion === p.idInscripcion">
              <span class="font-medium text-primary">Siguiente · </span>
            </template>
            <template v-if="buscando && categorias.length > 1">{{ c.nombre }} · </template>{{ p.institucion || '—' }}
          </span>
          <span v-if="ubicacionFeria(p)" class="flex items-center gap-1 truncate text-xs text-muted-foreground sm:text-sm">
            <IconifyIcon class="size-3.5 shrink-0" icon="lucide:map-pin" />
            <span class="truncate">{{ ubicacionFeria(p) }}</span>
          </span>
        </span>

        <span v-if="p.total !== null" class="shrink-0 text-right leading-tight">
          <span
            :class="
              p.estado === 'EVALUADO'
                ? [nivelDe(p.total, c.puntajeMaximo)?.clase, 'semfa-nivel-texto']
                : 'text-amber-600'
            "
            class="text-lg font-semibold tabular-nums"
          >
            {{ p.total }}
          </span>
          <span class="block text-[11px] text-muted-foreground">
            {{ p.estado === 'EVALUADO' ? tiempoTranscurrido(p.actualizado) : ESTADOS_JURADO[p.estado].texto }}
          </span>
        </span>

        <IconifyIcon class="size-5 shrink-0 text-muted-foreground" icon="lucide:chevron-right" />
      </button>
    </div>
  </div>
</template>

<style scoped>
.semfa-lista-card {
  background: hsl(var(--card));
  border: 1px solid hsl(var(--border));
  box-shadow: 0 2px 0 hsl(var(--border));
}

.semfa-lista-buscar {
  position: sticky;
  top: 0;
  z-index: 2;
  display: flex;
  gap: 8px;
  align-items: center;
  min-height: 48px;
  padding: 4px 6px 4px 14px;
  background: hsl(var(--card));
  border: 1px solid hsl(var(--border));
  border-radius: 14px;
  box-shadow: 0 2px 0 hsl(var(--border));
}

.semfa-lista-buscar:focus-within {
  border-color: hsl(var(--primary));
  box-shadow: 0 0 0 3px hsl(var(--primary) / 15%);
}

.semfa-lista-buscar input::-webkit-search-cancel-button {
  display: none;
}

.semfa-lista-icono {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  color: hsl(var(--muted-foreground));
  cursor: pointer;
  background: hsl(var(--muted));
  border-radius: 12px;
}

.semfa-lista-icono:hover:not(:disabled) {
  color: hsl(var(--primary));
}

.semfa-lista-fila {
  min-height: 72px;
  cursor: pointer;
  transition: background-color 0.15s ease;
  -webkit-tap-highlight-color: transparent;
}

.semfa-lista-fila + .semfa-lista-fila {
  border-top: 1px solid hsl(var(--border));
}

.semfa-lista-fila:hover:not(:disabled),
.semfa-lista-fila:active:not(:disabled) {
  background: hsl(var(--primary) / 6%);
}

.semfa-lista-fila:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.semfa-lista-fila--siguiente {
  background: hsl(var(--primary) / 5%);
  box-shadow: inset 3px 0 0 hsl(var(--primary));
}
</style>
