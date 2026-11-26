<script lang="ts" setup>
/**
 * Editor del orden de presentación de los participantes de cada categoría (el
 * orden en que desfilan o exponen). La app del jurado los lista en este orden.
 *
 * Se arrastran las filas o se usan las flechas; «Sortear» los mezcla al azar
 * (para un sorteo) y «Por nombre» los ordena alfabéticamente. No guarda nada:
 * quien lo usa (el modal de Inscripciones o el paso «Orden» del centro de la
 * actividad) llama a `guardar()` y recibe en `guardar` las categorías cambiadas.
 */
import type { Inscripcion } from '#/api/inscripciones';

import { computed, ref, watch } from 'vue';

import { IconifyIcon } from '@vben/icons';

import { Button, Tooltip } from 'ant-design-vue';

import { limpiarEspacios, nombrePropio } from '#/utils/formato';

defineOptions({ name: 'InscripcionOrdenEditor' });

const props = defineProps<{
  guardando: boolean;
  /** Inscripciones activas de la actividad de trabajo. */
  inscripciones: Inscripcion[];
}>();

const emit = defineEmits<{
  guardar: [cambios: { idCategoriaActividad: number; ids: number[]; nombre: string }[]];
}>();

function comparar(a: null | string, b: null | string) {
  return (a ?? '').localeCompare(b ?? '', 'es', { numeric: true });
}

/** Mismo orden que el tablero del jurado: por `orden` (sin número al final) y nombre. */
function ordenGuardado(lista: Inscripcion[]) {
  return [...lista].sort(
    (a, b) =>
      (a.orden ?? Number.MAX_SAFE_INTEGER) - (b.orden ?? Number.MAX_SAFE_INTEGER) ||
      comparar(limpiarEspacios(a.nombreParticipante), limpiarEspacios(b.nombreParticipante)),
  );
}

/** Categorías de la actividad con sus inscritos en el orden guardado. */
const categorias = computed(() => {
  const mapa = new Map<number, { id: number; inscritos: Inscripcion[]; nombre: string }>();
  for (const i of props.inscripciones) {
    const c = mapa.get(i.idCategoriaActividad) ?? {
      id: i.idCategoriaActividad,
      inscritos: [],
      nombre: nombrePropio(i.nombreCategoriaActividad),
    };
    c.inscritos.push(i);
    mapa.set(i.idCategoriaActividad, c);
  }
  return [...mapa.values()]
    .map((c) => ({ ...c, inscritos: ordenGuardado(c.inscritos) }))
    .sort((a, b) => comparar(a.nombre, b.nombre));
});

const porId = computed(() => new Map(props.inscripciones.map((i) => [i.idInscripcion, i])));

/** Orden en edición por categoría (ids de inscripción). */
const listas = ref<Record<number, number[]>>({});
const elegida = ref<number>();

/** Vuelve al orden guardado (al abrir el modal o tras recargar). */
function reiniciar() {
  listas.value = Object.fromEntries(
    categorias.value.map((c) => [c.id, c.inscritos.map((i) => i.idInscripcion)]),
  );
  if (!categorias.value.some((c) => c.id === elegida.value)) {
    elegida.value = categorias.value[0]?.id;
  }
}

// Al llegar datos nuevos (p. ej. tras guardar y recargar) se parte de lo guardado.
watch(() => props.inscripciones, reiniciar, { immediate: true });

const categoria = computed(() => categorias.value.find((c) => c.id === elegida.value));
const filas = computed(() =>
  (listas.value[elegida.value ?? -1] ?? [])
    .map((id) => porId.value.get(id))
    .filter((i): i is Inscripcion => !!i),
);

/** La categoría cambió o aún tiene inscritos sin número (guardar lo fija). */
function pendiente(id: number) {
  const c = categorias.value.find((x) => x.id === id);
  if (!c) return false;
  const actual = listas.value[id] ?? [];
  return (
    c.inscritos.some((i) => i.orden === null) ||
    c.inscritos.some((i, n) => i.idInscripcion !== actual[n])
  );
}

const pendientes = computed(() => categorias.value.filter((c) => pendiente(c.id)));
const sinDefinir = computed(() => categoria.value?.inscritos.some((i) => i.orden === null) ?? false);

// ---------------------------------------------------------------- mover

function fijar(ids: number[]) {
  if (elegida.value !== undefined) {
    listas.value = { ...listas.value, [elegida.value]: ids };
  }
}

function mover(desde: number, hasta: number) {
  const ids = [...(listas.value[elegida.value ?? -1] ?? [])];
  if (hasta < 0 || hasta >= ids.length || desde === hasta) return;
  const [id] = ids.splice(desde, 1);
  ids.splice(hasta, 0, id!);
  fijar(ids);
}

function sortear() {
  const ids = [...(listas.value[elegida.value ?? -1] ?? [])];
  for (let n = ids.length - 1; n > 0; n--) {
    const m = Math.floor(Math.random() * (n + 1));
    [ids[n], ids[m]] = [ids[m]!, ids[n]!];
  }
  fijar(ids);
}

function porNombre() {
  fijar(
    [...filas.value]
      .sort((a, b) => comparar(limpiarEspacios(a.nombreParticipante), limpiarEspacios(b.nombreParticipante)))
      .map((i) => i.idInscripcion),
  );
}

function restablecer() {
  fijar(categoria.value?.inscritos.map((i) => i.idInscripcion) ?? []);
}

// Arrastrar: la fila se mueve mientras pasa sobre las demás.
const arrastrando = ref<null | number>(null);

function alIniciarArrastre(indice: number, evento: DragEvent) {
  arrastrando.value = indice;
  if (evento.dataTransfer) {
    evento.dataTransfer.effectAllowed = 'move';
    evento.dataTransfer.setData('text/plain', String(indice));
  }
}

function alPasarSobre(indice: number) {
  if (arrastrando.value === null || arrastrando.value === indice) return;
  mover(arrastrando.value, indice);
  arrastrando.value = indice;
}

function guardar() {
  emit(
    'guardar',
    pendientes.value.map((c) => ({ idCategoriaActividad: c.id, ids: listas.value[c.id] ?? [], nombre: c.nombre })),
  );
}

defineExpose({ guardar, pendientes, reiniciar });
</script>

<template>
  <div>
  <div v-if="categorias.length === 0" class="py-6 text-center text-muted-foreground">
    Esta actividad aún no tiene inscritos.
  </div>

  <template v-else>
    <div class="mb-2 flex flex-wrap gap-1.5">
      <button
        v-for="c in categorias"
        :key="c.id"
        :class="{ 'is-activo': elegida === c.id }"
        :disabled="guardando"
        class="semfa-chip"
        type="button"
        @click="elegida = c.id"
      >
        <span v-if="pendiente(c.id)" class="size-1.5 rounded-full bg-amber-500" title="Sin guardar"></span>
        {{ c.nombre }}
        <span class="semfa-chip__total">{{ c.inscritos.length }}</span>
      </button>
    </div>

    <div class="mb-2 flex flex-wrap items-center gap-2">
      <Tooltip title="Mezcla al azar (para un sorteo). Revise y guarde.">
        <Button :disabled="guardando || filas.length < 2" class="semfa-btn semfa-btn--neutro" size="small" @click="sortear">
          <IconifyIcon class="size-3.5" icon="lucide:shuffle" />
          Sortear
        </Button>
      </Tooltip>
      <Button :disabled="guardando || filas.length < 2" class="semfa-btn semfa-btn--neutro" size="small" @click="porNombre">
        <IconifyIcon class="size-3.5" icon="lucide:arrow-down-a-z" />
        Por nombre
      </Button>
      <Button
        :disabled="guardando || !categoria || !pendiente(categoria.id) || sinDefinir"
        class="semfa-btn semfa-btn--neutro"
        size="small"
        @click="restablecer"
      >
        <IconifyIcon class="size-3.5" icon="lucide:undo-2" />
        Deshacer
      </Button>
      <span class="ml-auto text-xs text-muted-foreground">Arrastre las filas o use las flechas</span>
    </div>

    <p v-if="sinDefinir" class="mb-2 rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-700">
      <IconifyIcon class="mr-1 inline size-3.5" icon="lucide:info" />
      Esta categoría aún no tiene orden: la app los lista por nombre. Ordénelos y guarde para fijarlo.
    </p>

    <ol class="m-0 max-h-[46vh] list-none overflow-y-auto rounded-lg border border-border p-0">
      <li
        v-for="(i, n) in filas"
        :key="i.idInscripcion"
        :class="arrastrando === n ? 'bg-primary/10' : 'hover:bg-muted/60'"
        class="flex cursor-grab items-center gap-3 border-b border-border px-3 py-1.5 last:border-b-0"
        draggable="true"
        @dragend="arrastrando = null"
        @dragenter.prevent="alPasarSobre(n)"
        @dragover.prevent
        @dragstart="alIniciarArrastre(n, $event)"
        @drop.prevent="arrastrando = null"
      >
        <IconifyIcon class="size-4 shrink-0 text-muted-foreground" icon="lucide:grip-vertical" />
        <span
          class="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold tabular-nums text-primary"
        >
          {{ n + 1 }}
        </span>
        <Tooltip :title="limpiarEspacios(i.nombreParticipante)" placement="topLeft">
          <span class="min-w-0 flex-1 truncate font-medium">{{ limpiarEspacios(i.nombreParticipante) }}</span>
        </Tooltip>
        <span v-if="i.orden !== null && i.orden !== n + 1" class="shrink-0 text-xs text-amber-600">
          antes {{ i.orden }}
        </span>
        <div class="flex shrink-0 gap-1">
          <Button :disabled="guardando || n === 0" size="small" title="Subir" type="text" @click="mover(n, n - 1)">
            <IconifyIcon class="size-4" icon="lucide:chevron-up" />
          </Button>
          <Button
            :disabled="guardando || n === filas.length - 1"
            size="small"
            title="Bajar"
            type="text"
            @click="mover(n, n + 1)"
          >
            <IconifyIcon class="size-4" icon="lucide:chevron-down" />
          </Button>
        </div>
      </li>
    </ol>
  </template>
  </div>
</template>
