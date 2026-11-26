<script lang="ts" setup>
/**
 * Cobertura de jurados: por categoría, cuántos jurados evaluarán cada proyecto.
 * Sirve para encontrar proyectos sin jurado (0, en rojo) o con menos jurados que
 * el resto tras repartir una categoría. Se calcula aquí con asignaciones +
 * inscripciones: una asignación cubre un proyecto si su `idsInscripcion` está
 * vacío (toda la categoría) o lo contiene.
 */
import type { ColumnsType } from 'ant-design-vue/es/table';

import type { Inscripcion } from '#/api/inscripciones';
import type { JuradoAsignacion } from '#/api/jurado-asignaciones';

import { computed, ref, watch } from 'vue';

import { IconifyIcon } from '@vben/icons';

import { Button, Input, Modal, Table, Tooltip } from 'ant-design-vue';

import { asignacionCubre } from '#/api/jurado-asignaciones';
import { useTablaLocal } from '#/composables/useTablaLocal';
import { nombrePropio } from '#/utils/formato';

defineOptions({ name: 'SemfaJuradoCobertura' });

const props = defineProps<{
  /** Asignaciones activas de la actividad de trabajo. */
  asignaciones: JuradoAsignacion[];
  categorias: { id: number; nombre: string }[];
  /** Inscripciones activas de la actividad de trabajo. */
  inscripciones: Inscripcion[];
}>();

const emit = defineEmits<{ repartir: [asignacion: JuradoAsignacion] }>();

const visible = defineModel<boolean>('open', { required: true });

interface FilaCobertura {
  carrera: null | string;
  idInscripcion: number;
  jornada: null | number;
  jurados: string[];
  menos: boolean;
  nombre: string;
  stand: null | string;
  total: number;
}

/** Por categoría: sus jurados y la cobertura de cada proyecto. */
const porCategoria = computed(() =>
  props.categorias.map((c) => {
    const asig = props.asignaciones.filter((a) => a.idCategoriaActividad === c.id);
    const proyectos = props.inscripciones.filter((i) => i.idCategoriaActividad === c.id);
    const filas = proyectos.map((p): FilaCobertura => {
      const jurados = asig.filter((a) => asignacionCubre(a, p)).map((a) => a.jurado ?? 'Jurado');
      return {
        carrera: p.carrera ?? null,
        idInscripcion: p.idInscripcion,
        jornada: p.jornada ?? null,
        jurados,
        menos: false,
        nombre: p.nombreParticipante ?? '—',
        stand: p.stand ?? null,
        total: jurados.length,
      };
    });
    const maximo = Math.max(0, ...filas.map((f) => f.total));
    for (const f of filas) f.menos = f.total > 0 && f.total < maximo;
    return {
      ...c,
      asignaciones: asig,
      filas,
      maximo,
      menos: filas.filter((f) => f.menos).length,
      minimo: filas.length > 0 ? Math.min(...filas.map((f) => f.total)) : 0,
      sinJurado: filas.filter((f) => f.total === 0).length,
      totalProyectos: proyectos.length,
    };
  }),
);

const idCategoria = ref<number>();
const filtro = ref<'menos' | 'sin' | null>(null);

// Al abrir, elige la primera categoría con problemas (o la primera).
watch(visible, (abierto) => {
  if (!abierto) return;
  const actual = porCategoria.value.find((c) => c.id === idCategoria.value);
  if (!actual || (actual.sinJurado === 0 && actual.menos === 0)) {
    idCategoria.value = (porCategoria.value.find((c) => c.sinJurado > 0 || c.menos > 0) ?? porCategoria.value[0])?.id;
  }
  filtro.value = null;
});

const categoria = computed(() => porCategoria.value.find((c) => c.id === idCategoria.value));

const totales = computed(() => ({
  proyectos: porCategoria.value.reduce((s, c) => s + c.totalProyectos, 0),
  sinJurado: porCategoria.value.reduce((s, c) => s + c.sinJurado, 0),
}));

const filas = computed<FilaCobertura[]>(() => {
  const todas = categoria.value?.filas ?? [];
  if (filtro.value === 'sin') return todas.filter((f) => f.total === 0);
  if (filtro.value === 'menos') return todas.filter((f) => f.menos || f.total === 0);
  return todas;
});

const { alCambiarTabla, busqueda, filtrados, numeroFila, paginacion } = useTablaLocal(filas, {
  camposBusqueda: ['nombre', 'stand', 'carrera'],
});

watch([idCategoria, filtro], () => {
  busqueda.value = '';
});

function comparar(a: null | string | undefined, b: null | string | undefined) {
  return (a ?? '').localeCompare(b ?? '', 'es', { numeric: true });
}

const columnas: ColumnsType<FilaCobertura> = [
  { align: 'center', key: '#', title: '#', width: 56 },
  { dataIndex: 'stand', key: 'stand', sorter: (a, b) => comparar(a.stand, b.stand), title: 'Stand', width: 90 },
  { dataIndex: 'nombre', ellipsis: true, key: 'nombre', sorter: (a, b) => comparar(a.nombre, b.nombre), title: 'Proyecto' },
  { dataIndex: 'carrera', ellipsis: true, key: 'carrera', sorter: (a, b) => comparar(a.carrera, b.carrera), title: 'Carrera', width: 200 },
  { align: 'center', dataIndex: 'jornada', key: 'jornada', sorter: (a, b) => (a.jornada ?? 99) - (b.jornada ?? 99), title: 'Día', width: 80 },
  {
    align: 'center',
    defaultSortOrder: 'ascend',
    key: 'total',
    sorter: (a, b) => a.total - b.total,
    title: 'Jurados',
    width: 100,
  },
];

function cobertura(a: JuradoAsignacion, total: number) {
  const k = (a.idsInscripcion ?? []).length;
  return k === 0 ? `Todos (${total})` : `${k} de ${total}`;
}
</script>

<template>
  <Modal v-model:open="visible" :footer="null" :width="1080" centered>
    <template #title>
      <div class="flex items-center gap-3">
        <span class="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <IconifyIcon class="size-5" icon="lucide:shield-check" />
        </span>
        <div class="leading-tight">
          <div class="text-lg font-semibold">Cobertura de jurados</div>
          <div class="text-sm font-normal text-muted-foreground">
            {{ totales.proyectos }} proyecto(s) ·
            <span :class="totales.sinJurado > 0 ? 'font-medium text-red-600' : 'text-emerald-600'">
              {{ totales.sinJurado > 0 ? `${totales.sinJurado} sin jurado` : 'todos tienen jurado' }}
            </span>
          </div>
        </div>
      </div>
    </template>

    <div v-if="porCategoria.length === 0" class="py-10 text-center text-muted-foreground">
      La actividad aún no tiene categorías.
    </div>

    <template v-else>
      <!-- Categorías -->
      <div class="mb-3 mt-3 flex flex-wrap gap-1.5">
        <button
          v-for="c in porCategoria"
          :key="c.id"
          :class="{ 'is-activo': c.id === idCategoria }"
          class="semfa-chip"
          type="button"
          @click="idCategoria = c.id"
        >
          <IconifyIcon
            v-if="c.sinJurado > 0"
            class="size-3.5 text-red-500"
            icon="lucide:circle-alert"
          />
          <IconifyIcon
            v-else-if="c.menos > 0"
            class="size-3.5 text-amber-500"
            icon="lucide:triangle-alert"
          />
          <IconifyIcon v-else-if="c.totalProyectos > 0" class="size-3.5 text-emerald-500" icon="lucide:circle-check" />
          {{ c.nombre }}
          <span class="tabular-nums opacity-75">{{ c.totalProyectos }}</span>
        </button>
      </div>

      <template v-if="categoria">
        <!-- Jurados de la categoría -->
        <div class="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-muted/40 px-3 py-2 text-sm">
          <IconifyIcon class="size-4 text-primary" icon="lucide:gavel" />
          <span v-if="categoria.asignaciones.length === 0" class="text-red-600">
            Ningún jurado asignado a «{{ categoria.nombre }}».
          </span>
          <template v-else>
            <span class="text-muted-foreground">{{ categoria.asignaciones.length }} jurado(s):</span>
            <Tooltip
              v-for="a in categoria.asignaciones"
              :key="a.idJuradoAsignacion"
              title="Elegir qué proyectos evalúa"
            >
              <button
                class="inline-flex items-center gap-1 rounded-full border border-border bg-card px-2 py-0.5 text-xs hover:border-primary hover:text-primary"
                type="button"
                @click="emit('repartir', a)"
              >
                {{ a.jurado ?? 'Jurado' }}
                <span
                  :class="(a.idsInscripcion ?? []).length === 0 ? 'text-primary' : 'text-amber-600'"
                  class="font-semibold tabular-nums"
                >
                  {{ cobertura(a, categoria.totalProyectos) }}
                </span>
                <IconifyIcon class="size-3" icon="lucide:list-checks" />
              </button>
            </Tooltip>
          </template>
          <span class="flex-1"></span>
          <span v-if="categoria.totalProyectos > 0" class="text-xs text-muted-foreground">
            {{ categoria.minimo === categoria.maximo ? categoria.minimo : `${categoria.minimo}–${categoria.maximo}` }}
            jurado(s) por proyecto
          </span>
        </div>

        <!-- Filtros -->
        <div class="mb-2 flex flex-wrap items-center gap-2">
          <button :class="{ 'is-activo': filtro === null }" class="semfa-chip" type="button" @click="filtro = null">
            Todos
            <span class="tabular-nums opacity-75">{{ categoria.totalProyectos }}</span>
          </button>
          <button
            :class="{ 'is-activo': filtro === 'sin' }"
            :disabled="categoria.sinJurado === 0"
            class="semfa-chip"
            type="button"
            @click="filtro = filtro === 'sin' ? null : 'sin'"
          >
            Sin jurado
            <span class="tabular-nums opacity-75">{{ categoria.sinJurado }}</span>
          </button>
          <button
            :class="{ 'is-activo': filtro === 'menos' }"
            :disabled="categoria.menos + categoria.sinJurado === 0"
            class="semfa-chip"
            type="button"
            @click="filtro = filtro === 'menos' ? null : 'menos'"
          >
            Menos jurados que el resto
            <span class="tabular-nums opacity-75">{{ categoria.menos + categoria.sinJurado }}</span>
          </button>
          <span class="flex-1"></span>
          <Input v-model:value="busqueda" allow-clear class="max-w-60" placeholder="Buscar stand, proyecto o carrera…">
            <template #prefix>
              <IconifyIcon class="size-4 text-muted-foreground" icon="lucide:search" />
            </template>
          </Input>
        </div>

        <Table
          :columns="columnas"
          :data-source="filtrados"
          :pagination="paginacion"
          class="semfa-tabla"
          row-key="idInscripcion"
          size="small"
          @change="alCambiarTabla"
        >
          <template #bodyCell="{ column, record, index }">
            <template v-if="column.key === '#'">
              <span class="tabular-nums text-muted-foreground">{{ numeroFila(index) }}</span>
            </template>
            <template v-else-if="column.key === 'stand'">
              <span class="font-mono text-xs font-semibold">{{ record.stand || '—' }}</span>
            </template>
            <template v-else-if="column.key === 'nombre'">
              <Tooltip :title="record.nombre" placement="topLeft">
                <span>{{ record.nombre }}</span>
              </Tooltip>
            </template>
            <template v-else-if="column.key === 'carrera'">
              <span class="text-muted-foreground">{{ record.carrera ? nombrePropio(record.carrera) : '—' }}</span>
            </template>
            <template v-else-if="column.key === 'jornada'">
              <span
                v-if="record.jornada != null"
                class="rounded-full bg-sky-500/10 px-2 py-0.5 text-xs font-medium text-sky-700"
              >
                Día {{ record.jornada }}
              </span>
              <span v-else class="text-muted-foreground">—</span>
            </template>
            <template v-else-if="column.key === 'total'">
              <Tooltip :title="record.jurados.length > 0 ? record.jurados.join(' · ') : 'Ninguna asignación lo incluye'">
                <span
                  :class="
                    record.total === 0
                      ? 'bg-red-500/15 text-red-600'
                      : record.menos
                        ? 'bg-amber-500/15 text-amber-700'
                        : 'bg-emerald-500/10 text-emerald-700'
                  "
                  class="inline-flex min-w-10 items-center justify-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums"
                >
                  <IconifyIcon class="size-3" icon="lucide:gavel" />
                  {{ record.total }}
                </span>
              </Tooltip>
            </template>
          </template>

          <template #emptyText>
            <div class="py-6 text-muted-foreground">
              {{ categoria.totalProyectos === 0 ? 'Esta categoría no tiene proyectos inscritos.' : 'Ningún proyecto coincide.' }}
            </div>
          </template>
        </Table>
      </template>
    </template>

    <div class="mt-2 flex justify-end">
      <Button class="semfa-btn semfa-btn--neutro" @click="visible = false">Cerrar</Button>
    </div>
  </Modal>
</template>
