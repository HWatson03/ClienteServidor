<script lang="ts" setup>
/**
 * «Proyectos que evalúa <jurado> en <categoría>»: limita una asignación
 * jurado × categoría a proyectos concretos (`PUT /jurado-asignaciones/{id}/proyectos`),
 * para repartir una categoría grande entre jurados o por día de feria.
 *
 * Lista vacía = toda la categoría (también los proyectos que se inscriban después).
 */
import type { Inscripcion } from '#/api/inscripciones';
import type { JuradoAsignacion } from '#/api/jurado-asignaciones';

import { computed, ref, watch } from 'vue';

import { IconifyIcon } from '@vben/icons';

import { Checkbox, Input, Tooltip } from 'ant-design-vue';

import { asignacionCubre, limitarProyectosAsignacion } from '#/api/jurado-asignaciones';
import SemfaModalForm from '#/components/semfa/semfa-modal-form.vue';
import { avisar } from '#/composables/useAvisos';
import { nombrePropio, normalizarTexto } from '#/utils/formato';

defineOptions({ name: 'SemfaJuradoProyectosModal' });

const props = defineProps<{
  asignacion: JuradoAsignacion | null;
  /** Las demás asignaciones activas de la misma categoría, para ver la cobertura. */
  demas: JuradoAsignacion[];
  /** Inscripciones activas de la categoría. */
  inscripciones: Inscripcion[];
  nombreCategoria: string;
  nombreJurado: string;
}>();

const emit = defineEmits<{ guardado: [asignacion: JuradoAsignacion] }>();

const visible = defineModel<boolean>('open', { required: true });

/** `todos` = toda la categoría (lista vacía); `algunos` = solo los marcados. */
const modo = ref<'algunos' | 'todos'>('todos');
const marcados = ref<Set<number>>(new Set());
const guardando = ref(false);

const busqueda = ref('');
/** Filtro por jornada: `null` todas, 0 = sin día. */
const jornada = ref<null | number>(null);
const carrera = ref<null | string>(null);
const soloMarcados = ref(false);

/** Firma de lo cargado al abrir, para saber si hay cambios. */
let original = '';

function firma() {
  return modo.value === 'todos' ? 'todos' : [...marcados.value].sort((a, b) => a - b).join(',');
}

watch(visible, (abierto) => {
  if (!abierto || !props.asignacion) return;
  const ids = props.asignacion.idsInscripcion ?? [];
  modo.value = ids.length === 0 ? 'todos' : 'algunos';
  marcados.value = new Set(ids);
  busqueda.value = '';
  jornada.value = null;
  carrera.value = null;
  soloMarcados.value = false;
  original = firma();
});

function comparar(a: null | string | undefined, b: null | string | undefined) {
  return (a ?? '').localeCompare(b ?? '', 'es', { numeric: true });
}

/** Proyectos ordenados por stand, luego por orden de presentación y nombre. */
const proyectos = computed(() =>
  [...props.inscripciones].sort(
    (a, b) =>
      (a.stand ? 0 : 1) - (b.stand ? 0 : 1) ||
      comparar(a.stand, b.stand) ||
      (a.orden ?? 1e9) - (b.orden ?? 1e9) ||
      comparar(a.nombreParticipante, b.nombreParticipante),
  ),
);

const estaMarcado = (id: number) => modo.value === 'todos' || marcados.value.has(id);

const jornadas = computed(() => {
  const cuenta = new Map<number, number>();
  for (const p of proyectos.value) cuenta.set(p.jornada ?? 0, (cuenta.get(p.jornada ?? 0) ?? 0) + 1);
  return [...cuenta.entries()].sort((a, b) => (a[0] || 99) - (b[0] || 99)).map(([dia, total]) => ({ dia, total }));
});

const carreras = computed(() => {
  const cuenta = new Map<string, number>();
  for (const p of proyectos.value) {
    const c = p.carrera?.trim() || 'Sin carrera';
    cuenta.set(c, (cuenta.get(c) ?? 0) + 1);
  }
  return [...cuenta.entries()].sort((a, b) => comparar(a[0], b[0])).map(([nombre, total]) => ({ nombre, total }));
});

const visibles = computed(() => {
  const termino = normalizarTexto(busqueda.value.trim());
  return proyectos.value.filter(
    (p) =>
      (jornada.value === null || (p.jornada ?? 0) === jornada.value) &&
      (carrera.value === null || (p.carrera?.trim() || 'Sin carrera') === carrera.value) &&
      (!soloMarcados.value || estaMarcado(p.idInscripcion)) &&
      (!termino ||
        [p.nombreParticipante, p.stand, p.carrera, p.facultad].some((v) => normalizarTexto(v).includes(termino))),
  );
});

/** Jurados (los demás) que ya cubren cada proyecto. */
const otros = computed(() => {
  const mapa = new Map<number, number>();
  for (const p of proyectos.value) {
    mapa.set(p.idInscripcion, props.demas.filter((a) => asignacionCubre(a, p)).length);
  }
  return mapa;
});

const cantidadMarcada = computed(() =>
  modo.value === 'todos' ? proyectos.value.length : proyectos.value.filter((p) => marcados.value.has(p.idInscripcion)).length,
);

const hayCambios = computed(() => visible.value && firma() !== original);

/** Pasa a «solo los marcados» partiendo de lo que se ve marcado ahora. */
function aAlgunos() {
  if (modo.value === 'todos') {
    marcados.value = new Set(proyectos.value.map((p) => p.idInscripcion));
    modo.value = 'algunos';
  }
}

function alternar(id: number) {
  aAlgunos();
  const nuevo = new Set(marcados.value);
  if (nuevo.has(id)) nuevo.delete(id);
  else nuevo.add(id);
  marcados.value = nuevo;
}

function marcarVisibles(marcar: boolean) {
  aAlgunos();
  const nuevo = new Set(marcados.value);
  for (const p of visibles.value) {
    if (marcar) nuevo.add(p.idInscripcion);
    else nuevo.delete(p.idInscripcion);
  }
  marcados.value = nuevo;
}

/** Reparto por día: deja marcados solo los proyectos de esa jornada. */
function soloJornada(dia: number) {
  modo.value = 'algunos';
  marcados.value = new Set(proyectos.value.filter((p) => (p.jornada ?? 0) === dia).map((p) => p.idInscripcion));
  jornada.value = dia;
  carrera.value = null;
}

function todaLaCategoria() {
  modo.value = 'todos';
  marcados.value = new Set();
}

function textoDia(dia: number) {
  return dia === 0 ? 'Sin día' : `Día ${dia}`;
}

async function guardar() {
  if (!props.asignacion) return;
  if (modo.value === 'algunos' && cantidadMarcada.value === 0) {
    avisar({
      mensaje: 'Marque al menos un proyecto, o elija «Toda la categoría».',
      tipo: 'advertencia',
      titulo: 'Sin proyectos',
    });
    return;
  }
  // Marcar todos equivale a toda la categoría, que además incluye los que se inscriban después.
  const todos = modo.value === 'todos' || cantidadMarcada.value === proyectos.value.length;
  const ids = todos ? [] : proyectos.value.filter((p) => marcados.value.has(p.idInscripcion)).map((p) => p.idInscripcion);
  guardando.value = true;
  try {
    const actualizada = await limitarProyectosAsignacion(props.asignacion.idJuradoAsignacion, ids);
    avisar({
      mensaje: todos
        ? `Evalúa toda la categoría «${props.nombreCategoria}».`
        : `Evalúa ${ids.length} de ${proyectos.value.length} proyectos de «${props.nombreCategoria}».`,
      tipo: 'exito',
      titulo: props.nombreJurado,
    });
    visible.value = false;
    emit('guardado', actualizada);
  } catch {
    // El interceptor ya avisó.
  } finally {
    guardando.value = false;
  }
}
</script>

<template>
  <SemfaModalForm
    v-model:open="visible"
    :atajo-enter="false"
    :es-edicion="true"
    :guardando="guardando"
    :hay-cambios="hayCambios"
    :permitir-continuar="false"
    :subtitulo="`${nombreJurado} en «${nombreCategoria}»`"
    :width="880"
    icono="lucide:list-checks"
    titulo="Proyectos que evalúa"
    @guardar="guardar"
  >
    <template #vista-previa>
      <div class="flex flex-wrap items-center gap-2 text-sm">
        <IconifyIcon class="size-4 text-primary" icon="lucide:gavel" />
        <span class="font-medium">{{ nombreJurado }}</span>
        <span class="text-muted-foreground">evaluará</span>
        <span
          :class="modo === 'todos' ? 'bg-primary/10 text-primary' : 'bg-amber-500/15 text-amber-700'"
          class="rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums"
        >
          {{ modo === 'todos' ? `Todos (${proyectos.length})` : `${cantidadMarcada} de ${proyectos.length} proyectos` }}
        </span>
        <span v-if="modo === 'todos'" class="text-xs text-muted-foreground">
          · también los que se inscriban después
        </span>
      </div>
    </template>

    <div v-if="proyectos.length === 0" class="py-10 text-center text-muted-foreground">
      «{{ nombreCategoria }}» aún no tiene proyectos inscritos.
    </div>

    <template v-else>
      <!-- Reparto rápido por día -->
      <div
        v-if="jornadas.length > 1 || jornadas[0]?.dia !== 0"
        class="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-primary/40 bg-primary/5 px-3 py-2"
      >
        <IconifyIcon class="size-4 text-primary" icon="lucide:calendar-range" />
        <span class="text-sm font-medium">Repartir por día:</span>
        <button
          v-for="j in jornadas.filter((x) => x.dia !== 0)"
          :key="j.dia"
          class="semfa-chip"
          :title="`Deja marcados solo los ${j.total} proyectos del ${textoDia(j.dia)}`"
          type="button"
          @click="soloJornada(j.dia)"
        >
          Solo {{ textoDia(j.dia) }}
          <span class="semfa-chip__total tabular-nums">{{ j.total }}</span>
        </button>
        <button class="semfa-chip" type="button" @click="todaLaCategoria">
          <IconifyIcon class="size-3.5" icon="lucide:layers" />
          Toda la categoría
        </button>
      </div>

      <!-- Búsqueda y filtros -->
      <div class="mb-2 flex flex-wrap items-center gap-2">
        <Input v-model:value="busqueda" allow-clear class="max-w-xs" placeholder="Buscar stand, proyecto o carrera…">
          <template #prefix>
            <IconifyIcon class="size-4 text-muted-foreground" icon="lucide:search" />
          </template>
        </Input>
        <template v-if="jornadas.length > 1">
          <button :class="{ 'is-activo': jornada === null }" class="semfa-chip" type="button" @click="jornada = null">
            Todos los días
          </button>
          <button
            v-for="j in jornadas"
            :key="j.dia"
            :class="{ 'is-activo': jornada === j.dia }"
            class="semfa-chip"
            type="button"
            @click="jornada = jornada === j.dia ? null : j.dia"
          >
            {{ textoDia(j.dia) }}
            <span class="tabular-nums opacity-75">{{ j.total }}</span>
          </button>
        </template>
        <button
          :class="{ 'is-activo': soloMarcados }"
          class="semfa-chip"
          type="button"
          @click="soloMarcados = !soloMarcados"
        >
          <IconifyIcon class="size-3.5" icon="lucide:check-square" />
          Solo marcados
        </button>
      </div>
      <div v-if="carreras.length > 1" class="mb-2 flex gap-1.5 overflow-x-auto pb-1">
        <button
          v-for="c in carreras"
          :key="c.nombre"
          :class="{ 'is-activo': carrera === c.nombre }"
          class="semfa-chip shrink-0 whitespace-nowrap"
          type="button"
          @click="carrera = carrera === c.nombre ? null : c.nombre"
        >
          {{ nombrePropio(c.nombre) }}
          <span class="tabular-nums opacity-75">{{ c.total }}</span>
        </button>
      </div>

      <!-- Acciones sobre lo visible -->
      <div class="mb-2 flex flex-wrap items-center gap-2 text-sm">
        <span class="text-muted-foreground">
          {{ visibles.length }} visible(s)
          <template v-if="visibles.length !== proyectos.length"> de {{ proyectos.length }}</template>
        </span>
        <span class="flex-1"></span>
        <button
          :disabled="visibles.length === 0"
          class="semfa-chip"
          type="button"
          @click="marcarVisibles(true)"
        >
          <IconifyIcon class="size-3.5" icon="lucide:square-check" />
          Marcar visibles
        </button>
        <button
          :disabled="visibles.length === 0"
          class="semfa-chip"
          type="button"
          @click="marcarVisibles(false)"
        >
          <IconifyIcon class="size-3.5" icon="lucide:square" />
          Desmarcar visibles
        </button>
        <button :class="{ 'is-activo': modo === 'todos' }" class="semfa-chip" type="button" @click="todaLaCategoria">
          <IconifyIcon class="size-3.5" icon="lucide:layers" />
          Toda la categoría
        </button>
      </div>

      <!-- Lista -->
      <div class="max-h-[46vh] overflow-y-auto rounded-xl border border-border">
        <div
          v-for="p in visibles"
          :key="p.idInscripcion"
          :class="{ 'bg-primary/5': estaMarcado(p.idInscripcion) }"
          class="semfa-proyecto-fila flex cursor-pointer select-none items-center gap-3 px-3 py-1.5"
          @click="alternar(p.idInscripcion)"
        >
          <Checkbox :checked="estaMarcado(p.idInscripcion)" class="pointer-events-none" />
          <span class="w-14 shrink-0 font-mono text-xs font-semibold tabular-nums">{{ p.stand || '—' }}</span>
          <Tooltip :title="p.nombreParticipante" placement="topLeft">
            <span class="min-w-0 flex-1 truncate text-sm">{{ p.nombreParticipante ?? '—' }}</span>
          </Tooltip>
          <span class="hidden w-44 shrink-0 truncate text-xs text-muted-foreground md:block" :title="p.carrera ?? ''">
            {{ p.carrera ? nombrePropio(p.carrera) : '—' }}
          </span>
          <span
            v-if="p.jornada != null"
            class="shrink-0 rounded-full bg-sky-500/10 px-2 py-0.5 text-xs font-medium text-sky-700"
          >
            Día {{ p.jornada }}
          </span>
          <Tooltip title="Jurados que lo evaluarán con este cambio">
            <span
              :class="
                (otros.get(p.idInscripcion) ?? 0) + (estaMarcado(p.idInscripcion) ? 1 : 0) === 0
                  ? 'bg-red-500/15 text-red-600'
                  : 'bg-muted text-muted-foreground'
              "
              class="inline-flex w-12 shrink-0 items-center justify-center gap-1 rounded-full px-1.5 py-0.5 text-xs tabular-nums"
            >
              <IconifyIcon class="size-3" icon="lucide:gavel" />
              {{ (otros.get(p.idInscripcion) ?? 0) + (estaMarcado(p.idInscripcion) ? 1 : 0) }}
            </span>
          </Tooltip>
        </div>
        <div v-if="visibles.length === 0" class="py-8 text-center text-sm text-muted-foreground">
          Ningún proyecto coincide con el filtro.
        </div>
      </div>
    </template>
  </SemfaModalForm>
</template>

<style scoped>
.semfa-proyecto-fila + .semfa-proyecto-fila {
  border-top: 1px solid hsl(var(--border));
}

.semfa-proyecto-fila:hover {
  background: hsl(var(--primary) / 8%);
}
</style>
