<script lang="ts" setup>
import type { ConPorSubir } from './datos';

import type { CategoriaTablero, ProyectoTablero } from '#/api/jurado';

import { computed, ref, watch } from 'vue';
import { useRouter } from 'vue-router';

import { coincideProyecto, terminosDeBusqueda } from '#/utils/busqueda-proyecto';
import { tiempoTranscurrido } from '#/utils/formato';
import { ESTADOS_JURADO, nivelDe, ubicacionFeria } from '#/views/semfa/jurado/escala';

import { confirmar } from './avisos';
import { descartar, paquete, rechazadas, red, reintentar, sincronizar, tablero } from './datos';
import Icono from './icono.vue';
import { sesion } from './sesion';

defineOptions({ name: 'JwLista' });

/**
 * Inicio del jurado (versión web ligera): la lista de proyectos que le toca evaluar,
 * leída del paquete guardado en el celular (abre al instante y sin señal). Misma
 * presentación que `views/semfa/jurado/mis-evaluaciones.vue`, más el estado de lo que
 * falta enviar al servidor.
 */
const router = useRouter();

const idCategoria = ref<number>();
const cargando = computed(() => red.sincronizando && !paquete.value);

watch(
  tablero,
  (t) => {
    if (t && !t.categorias.some((c) => c.idCategoria === idCategoria.value)) {
      idCategoria.value = (t.categorias.find((c) => c.pendientes > 0) ?? t.categorias[0])?.idCategoria;
    }
  },
  { immediate: true },
);

const categorias = computed(() => tablero.value?.categorias ?? []);
const categoria = computed<CategoriaTablero | undefined>(() =>
  categorias.value.find((c) => c.idCategoria === idCategoria.value),
);
const resumen = computed(() => tablero.value?.resumen);
const actividades = computed(() => [...new Set(categorias.value.map((c) => c.actividad))].join(' · '));
const siguiente = computed(() => categoria.value?.proyectos.find((p) => p.estado !== 'EVALUADO'));

function porcentaje(parte: number, total: number) {
  return total > 0 ? Math.round((parte * 100) / total) : 0;
}

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
    // nada
  }
});
const terminos = computed(() => terminosDeBusqueda(busqueda.value));
const buscando = computed(() => terminos.value.length > 0);
const totalProyectos = computed(() => categorias.value.reduce((n, c) => n + c.proyectos.length, 0));

interface Fila {
  c: CategoriaTablero;
  numero: number;
  p: ConPorSubir<ProyectoTablero>;
}
const filas = computed<Fila[]>(() => {
  const fuente = buscando.value ? categorias.value : categoria.value ? [categoria.value] : [];
  return fuente.flatMap((c) =>
    c.proyectos.flatMap((p, i) => (coincideProyecto(p, terminos.value) ? [{ c, numero: p.orden ?? i + 1, p }] : [])),
  );
});

function evaluar(c: CategoriaTablero, p: ProyectoTablero) {
  if (c.rubricas === 0) return;
  router.push({ name: 'JwHoja', params: { categoriaId: c.idCategoria, participanteId: p.idParticipante } });
}

async function descartarRechazada(clave: string, proyecto: string) {
  const ok = await confirmar({
    mensaje: `Se borrarán de este celular las notas de «${proyecto}» que el servidor rechazó. Si hace falta, administración puede habilitar una reevaluación.`,
    peligro: true,
    textoAceptar: 'Descartar',
    titulo: '¿Descartar esta evaluación?',
  });
  if (ok) descartar(clave);
}
</script>

<template>
  <div class="mx-auto flex max-w-3xl flex-col gap-3 p-3 pb-[max(1rem,env(safe-area-inset-bottom))] sm:p-4">
    <!-- Sesión vencida: puede seguir evaluando, pero para enviar hay que volver a ingresar. -->
    <button
      v-if="sesion?.vencida"
      class="flex items-center gap-3 rounded-xl bg-amber-500/12 px-4 py-3 text-left text-sm text-amber-800 dark:text-amber-200"
      type="button"
      @click="router.push({ name: 'JwIngresar', query: { usuario: sesion.usuario } })"
    >
      <Icono class="size-5 shrink-0" icon="lock" />
      <span class="flex-1">
        <strong>Tu sesión venció.</strong> Puedes seguir evaluando; toca aquí para ingresar de nuevo y enviar lo guardado.
      </span>
      <Icono class="size-5 shrink-0" icon="chevron-right" />
    </button>

    <!-- Rechazadas por el servidor: no se reintentan solas. -->
    <div
      v-for="r in rechazadas"
      :key="r.clave"
      class="flex flex-col gap-2 rounded-xl border border-red-500/30 bg-red-500/8 px-4 py-3 text-sm"
    >
      <div class="flex items-start gap-2">
        <Icono class="mt-0.5 size-5 shrink-0 text-red-600 dark:text-red-400" icon="circle-x" />
        <div class="min-w-0 flex-1">
          <div class="font-semibold">No se pudo registrar «{{ r.proyecto }}» ({{ r.total }} pts)</div>
          <div class="text-muted-foreground">{{ r.mensaje }}</div>
        </div>
      </div>
      <div class="flex gap-2">
        <button class="semfa-btn semfa-btn--neutro flex-1 min-h-10! text-sm!" type="button" @click="reintentar(r.clave)">
          Reintentar
        </button>
        <button
          class="semfa-btn semfa-btn--neutro flex-1 min-h-10! text-sm!"
          type="button"
          @click="descartarRechazada(r.clave, r.proyecto)"
        >
          Descartar
        </button>
      </div>
    </div>

    <!-- Avance -->
    <div v-if="resumen" class="jw-card rounded-2xl p-4">
      <div class="flex items-center justify-between gap-3">
        <div class="min-w-0">
          <div class="truncate text-xs text-muted-foreground">{{ actividades || 'Mis evaluaciones' }}</div>
          <div class="text-lg font-semibold">
            <span class="tabular-nums">{{ resumen.evaluados }}</span>
            <span class="font-normal text-muted-foreground"> de {{ resumen.proyectos }} evaluadas</span>
          </div>
        </div>
        <button
          :disabled="red.sincronizando"
          class="jw-icono-btn"
          title="Actualizar"
          type="button"
          @click="sincronizar(true)"
        >
          <Icono :class="{ 'animate-spin': red.sincronizando }" class="size-5" icon="refresh-cw" />
        </button>
      </div>
      <div class="semfa-barra mt-2">
        <span :style="{ width: `${porcentaje(resumen.evaluados, resumen.proyectos)}%` }" class="bg-emerald-500"></span>
      </div>
      <div v-if="red.recibido" class="mt-2 flex items-center gap-1 text-[11px] text-muted-foreground">
        <Icono class="size-3.5" icon="circle-check" />
        Listo para evaluar sin señal · actualizado {{ tiempoTranscurrido(new Date(red.recibido).toISOString()) }}
      </div>
    </div>

    <!-- Categorías -->
    <div v-if="categorias.length > 1" class="-mx-3 flex gap-2 overflow-x-auto px-3 pb-1 sm:-mx-4 sm:px-4">
      <button
        v-for="c in categorias"
        :key="c.idCategoria"
        :class="{ 'is-activo': c.idCategoria === idCategoria }"
        class="semfa-chip shrink-0 py-1.5"
        type="button"
        @click="idCategoria = c.idCategoria"
      >
        <Icono v-if="c.pendientes === 0" class="size-4" icon="circle-check" />
        {{ c.nombre }}
        <span class="tabular-nums opacity-75">{{ c.evaluados }}/{{ c.proyectos.length }}</span>
      </button>
    </div>

    <!-- Buscador -->
    <div v-if="totalProyectos > 8" class="jw-buscar">
      <Icono class="size-5 text-muted-foreground" icon="search" />
      <input
        v-model="busqueda"
        aria-label="Buscar proyecto"
        autocomplete="off"
        class="min-w-0 flex-1 bg-transparent text-base outline-none"
        enterkeyhint="search"
        placeholder="Buscar proyecto, carrera o stand…"
        type="search"
      />
      <button v-if="busqueda" class="jw-icono-btn size-8" title="Borrar búsqueda" type="button" @click="busqueda = ''">
        <Icono class="size-4" icon="x" />
      </button>
    </div>
    <div v-if="buscando" class="-mt-1 px-1 text-xs text-muted-foreground">
      <template v-if="filas.length > 0">
        {{ filas.length }} resultado{{ filas.length === 1 ? '' : 's' }}{{ categorias.length > 1 ? ' en todas tus categorías' : '' }}
      </template>
      <template v-else>Ningún proyecto coincide con «{{ busqueda.trim() }}».</template>
    </div>

    <!-- Estados vacíos -->
    <div v-if="cargando" class="flex flex-col items-center gap-2 py-16 text-muted-foreground">
      <Icono class="size-8 animate-spin opacity-60" icon="loader-circle" />
      Descargando tus proyectos…
    </div>
    <div v-else-if="!tablero" class="flex flex-col items-center gap-3 py-16 text-center text-muted-foreground">
      <Icono class="size-10 opacity-60" icon="cloud-off" />
      Aún no se descargaron tus proyectos.
      <span class="text-xs">Necesitas señal una vez; después funciona aunque se corte.</span>
      <button class="semfa-btn semfa-btn--primario" type="button" @click="sincronizar(true)">
        <Icono class="size-5" icon="refresh-cw" />
        Reintentar
      </button>
    </div>
    <div v-else-if="categorias.length === 0" class="flex flex-col items-center gap-2 py-16 text-center text-muted-foreground">
      <Icono class="size-10 opacity-60" icon="clipboard-x" />
      No tienes evaluaciones abiertas en este momento.
      <span class="text-xs">Cuando la organización abra la evaluación (o el día de tus proyectos), aparecerán aquí.</span>
    </div>
    <div
      v-else-if="!buscando && categoria && categoria.rubricas === 0"
      class="flex items-center gap-2 rounded-xl bg-amber-500/10 px-4 py-3 text-sm text-amber-700"
    >
      <Icono class="size-5" icon="triangle-alert" />
      Esta categoría todavía no tiene rúbricas: no se puede evaluar.
    </div>
    <div v-else-if="!buscando && categoria && categoria.proyectos.length === 0" class="py-16 text-center text-muted-foreground">
      Esta categoría no tiene participantes para hoy.
    </div>

    <!-- Participantes -->
    <div v-if="filas.length > 0" class="jw-card overflow-hidden rounded-2xl">
      <button
        v-for="{ c, numero, p } in filas"
        :key="p.idInscripcion"
        :class="{ 'jw-fila--siguiente': siguiente?.idInscripcion === p.idInscripcion }"
        :disabled="c.rubricas === 0"
        class="jw-fila flex w-full items-center gap-3 px-3 py-3 text-left sm:gap-4 sm:px-5 sm:py-4"
        type="button"
        @click="evaluar(c, p)"
      >
        <span
          :class="
            p.estado === 'EVALUADO'
              ? p.porSubir
                ? 'bg-sky-500/15 text-sky-600'
                : 'bg-emerald-500/15 text-emerald-600'
              : siguiente?.idInscripcion === p.idInscripcion
                ? 'bg-primary text-white'
                : 'bg-muted text-muted-foreground'
          "
          class="flex size-11 shrink-0 items-center justify-center rounded-full text-base font-bold tabular-nums sm:size-12"
        >
          <Icono v-if="p.estado === 'EVALUADO'" :icon="p.porSubir ? 'cloud-upload' : 'check'" class="size-5" />
          <template v-else>{{ numero }}</template>
        </span>

        <span class="min-w-0 flex-1">
          <span class="line-clamp-2 block text-[15px] font-medium leading-snug sm:text-lg">{{ p.nombre }}</span>
          <span class="block truncate text-xs text-muted-foreground sm:text-sm">
            <span v-if="siguiente?.idInscripcion === p.idInscripcion" class="font-medium text-primary">Siguiente · </span>
            <template v-if="buscando && categorias.length > 1">{{ c.nombre }} · </template>{{ p.institucion || '—' }}
          </span>
          <span v-if="ubicacionFeria(p)" class="flex items-center gap-1 truncate text-xs text-muted-foreground sm:text-sm">
            <Icono class="size-3.5" icon="map-pin" />
            <span class="truncate">{{ ubicacionFeria(p) }}</span>
          </span>
        </span>

        <span v-if="p.total !== null" class="shrink-0 text-right leading-tight">
          <span
            :class="p.estado === 'EVALUADO' ? [nivelDe(p.total, c.puntajeMaximo)?.clase, 'semfa-nivel-texto'] : 'text-amber-600'"
            class="text-lg font-semibold tabular-nums"
          >
            {{ p.total }}
          </span>
          <span :class="{ 'text-sky-600 dark:text-sky-400': p.porSubir }" class="block text-[11px] text-muted-foreground">
            {{
              p.porSubir
                ? 'Por enviar'
                : p.estado === 'EVALUADO'
                  ? tiempoTranscurrido(p.actualizado)
                  : ESTADOS_JURADO[p.estado].texto
            }}
          </span>
        </span>

        <Icono class="size-5 text-muted-foreground" icon="chevron-right" />
      </button>
    </div>
  </div>
</template>

<style scoped>
.jw-card {
  background: hsl(var(--card));
  border: 1px solid hsl(var(--border));
  box-shadow: 0 2px 0 hsl(var(--border));
}

.jw-buscar {
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

.jw-buscar:focus-within {
  border-color: hsl(var(--primary));
  box-shadow: 0 0 0 3px hsl(var(--primary) / 15%);
}

.jw-buscar input::-webkit-search-cancel-button {
  display: none;
}

.jw-icono-btn {
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

.jw-fila {
  min-height: 72px;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.jw-fila + .jw-fila {
  border-top: 1px solid hsl(var(--border));
}

.jw-fila:active:not(:disabled) {
  background: hsl(var(--primary) / 6%);
}

.jw-fila:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.jw-fila--siguiente {
  background: hsl(var(--primary) / 5%);
  box-shadow: inset 3px 0 0 hsl(var(--primary));
}
</style>
