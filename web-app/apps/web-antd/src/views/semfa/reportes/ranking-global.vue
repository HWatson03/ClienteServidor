<script lang="ts" setup>
import type { ColumnsType } from 'ant-design-vue/es/table';

import type { ResultadosCategoria } from '#/api/resultados';

import type { FiltroJornada, ProyectoConCategoria, ProyectoUbicado } from './compartido';

import { computed, ref, watch } from 'vue';

import { IconifyIcon } from '@vben/icons';

import { Button, Input, Table, Tooltip } from 'ant-design-vue';

import { useTablaLocal } from '#/composables/useTablaLocal';
import { normalizarTexto } from '#/utils/formato';

import {
  aplanarProyectos,
  descargarCsv,
  enEvaluacion,
  ESTADOS,
  fmt,
  fmtPorcentaje,
  promedio,
  r2,
  textoJornada,
  ubicar,
} from './compartido';

defineOptions({ name: 'SemfaRankingGlobal' });

/**
 * Rankings que cruzan categorías: «General» (todos los proyectos de evaluación
 * completa) y agrupados «Por facultad» / «Por carrera». Como cada categoría
 * puede tener otro puntaje máximo, se ordena por porcentaje
 * (puntaje / máximo × 100) y se muestran ambos. Solo se ubican los de
 * evaluación completa; los demás se listan aparte como «En evaluación».
 *
 * Es un ranking interno de consulta: el puesto oficial es el de su categoría.
 */
const props = defineProps<{
  actividad: string;
  categorias: ResultadosCategoria[];
  jornada: FiltroJornada;
  modo: 'carrera' | 'facultad' | 'general';
}>();

const proyectos = computed(() => aplanarProyectos(props.categorias, props.jornada));
const ubicados = computed(() => ubicar(proyectos.value));
const pendientes = computed(() => enEvaluacion(proyectos.value));

const { alCambiarTabla, busqueda, filtrados, paginacion } = useTablaLocal(ubicados, {
  camposBusqueda: ['nombre', 'categoria', 'carrera', 'facultad', 'siglaFacultad'],
});

// ------------------------------------------------------------------ grupos (facultad / carrera)

interface Grupo {
  clave: string;
  completos: number;
  nombre: string;
  /** Promedio de los porcentajes de los completos (`null` si ninguno). */
  promedio: null | number;
  proyectos: number;
  sigla: null | string;
  ubicados: ProyectoUbicado[];
  pendientes: ProyectoConCategoria[];
}

function grupoDe(p: ProyectoConCategoria): { nombre: string; sigla: null | string } {
  if (props.modo === 'facultad') {
    return { nombre: p.facultad ?? p.siglaFacultad ?? 'Sin facultad', sigla: p.siglaFacultad };
  }
  return { nombre: p.carrera ?? 'Sin carrera', sigla: p.siglaFacultad };
}

const grupos = computed<Grupo[]>(() => {
  if (props.modo === 'general') return [];
  const mapa = new Map<string, { nombre: string; lista: ProyectoConCategoria[]; sigla: null | string }>();
  for (const p of proyectos.value) {
    const g = grupoDe(p);
    const clave = normalizarTexto(g.nombre).trim();
    const actual = mapa.get(clave) ?? { lista: [], nombre: g.nombre, sigla: g.sigla };
    actual.lista.push(p);
    actual.sigla ??= g.sigla;
    mapa.set(clave, actual);
  }
  return [...mapa.entries()]
    .map(([clave, g]) => {
      const ubic = ubicar(g.lista);
      return {
        clave,
        completos: ubic.length,
        nombre: g.nombre,
        pendientes: enEvaluacion(g.lista),
        promedio: promedio(ubic.map((p) => p.porcentaje!)),
        proyectos: g.lista.length,
        sigla: g.sigla,
        ubicados: ubic,
      };
    })
    .sort((a, b) => (b.promedio ?? -1) - (a.promedio ?? -1) || a.nombre.localeCompare(b.nombre, 'es'));
});

const etiquetaGrupo = computed(() => (props.modo === 'facultad' ? 'Facultad' : 'Carrera'));
const sinEstructura = computed(() => props.modo !== 'general'
  && proyectos.value.length > 0
  && proyectos.value.every((p) => (props.modo === 'facultad' ? !p.facultad && !p.siglaFacultad : !p.carrera)));

/** Bloque elegido en el resumen (para ir directo a él). */
const grupoActivo = ref<string>();
watch(() => props.modo, () => (grupoActivo.value = undefined));
const gruposVisibles = computed(() => (grupoActivo.value
  ? grupos.value.filter((g) => g.clave === grupoActivo.value)
  : grupos.value));

// ------------------------------------------------------------------ columnas

const columnasRanking = computed<ColumnsType<ProyectoUbicado>>(() => [
  { align: 'center', key: 'lugar', title: 'Puesto', width: 70 },
  { key: 'nombre', title: 'Proyecto / participante' },
  ...(props.modo === 'carrera' ? [] : [{ key: 'grupo', title: props.modo === 'facultad' ? 'Carrera' : 'Carrera · facultad', width: 220 }]),
  { key: 'categoria', title: 'Categoría', width: 190 },
  { align: 'right', key: 'puntaje', title: 'Puntaje', width: 120 },
  { align: 'right', key: 'porcentaje', title: '%', width: 130 },
]) as any;

const columnasPendientes: ColumnsType<ProyectoConCategoria> = [
  { key: 'nombre', title: 'Proyecto / participante' },
  { key: 'categoria', title: 'Categoría', width: 220 },
  { align: 'right', key: 'jurados', title: 'Jurados con calificación completa', width: 240 },
  { key: 'estado', title: 'Evaluación', width: 140 },
];

/** Máximo de pendientes como chips en cada bloque (el CSV los trae todos). */
const MAX_CHIPS = 24;

const columnasResumen: ColumnsType<Grupo> = [
  { align: 'center', key: 'n', title: '#', width: 50 },
  { key: 'nombre', title: 'Grupo' },
  { align: 'right', dataIndex: 'proyectos', key: 'proyectos', title: 'Proyectos', width: 100 },
  { align: 'right', key: 'completos', title: 'Evaluados completos', width: 170 },
  { align: 'right', key: 'promedio', title: 'Promedio %', width: 150 },
];

const MEDALLAS: Record<number, string> = {
  1: 'bg-amber-400 text-white',
  2: 'bg-slate-400 text-white',
  3: 'bg-orange-700/80 text-white',
};

// ------------------------------------------------------------------ CSV

const ENCABEZADO = ['Puesto', 'Proyecto', 'Categoría', 'Carrera', 'Facultad', 'Jornada', 'Stand', 'Puntaje', 'Puntaje máximo', '%', 'Evaluación', 'Jurados completos', 'Jurados asignados'];

function filaCsv(p: ProyectoConCategoria, lugar: null | number) {
  return [
    lugar, p.nombre, p.categoria, p.carrera, p.facultad ?? p.siglaFacultad,
    p.jornada ? textoJornada(p.jornada) : null, p.stand, r2(p.puntaje), p.puntajeMaximo, r2(p.porcentaje),
    ESTADOS[p.estado].texto, p.juradosCompletos, p.juradosAsignados,
  ];
}

function exportar() {
  const sufijo = props.jornada ? `-dia-${props.jornada}` : '';
  if (props.modo === 'general') {
    descargarCsv(`ranking-general-${props.actividad}${sufijo}`, ENCABEZADO, [
      ...filtrados.value.map((p) => filaCsv(p, p.lugar)),
      ...pendientes.value.map((p) => filaCsv(p, null)),
    ]);
    return;
  }
  descargarCsv(
    `ranking-por-${props.modo}-${props.actividad}${sufijo}`,
    [etiquetaGrupo.value, 'Promedio % del grupo', ...ENCABEZADO],
    gruposVisibles.value.flatMap((g) => [
      ...g.ubicados.map((p) => [g.nombre, r2(g.promedio), ...filaCsv(p, p.lugar)]),
      ...g.pendientes.map((p) => [g.nombre, r2(g.promedio), ...filaCsv(p, null)]),
    ]),
  );
}
</script>

<template>
  <div>
    <div class="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
      <div class="max-w-3xl text-xs text-muted-foreground">
        Ordenado por porcentaje (puntaje ÷ máximo de su categoría), porque las categorías pueden tener máximos distintos.
        Solo se ubican los proyectos con todas sus evaluaciones; es un ranking de consulta, el puesto oficial es el de su
        categoría.
        <span v-if="pendientes.length > 0" class="text-amber-600">{{ pendientes.length }} aún en evaluación.</span>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <Input
          v-if="modo === 'general'"
          v-model:value="busqueda"
          allow-clear
          placeholder="Buscar proyecto, carrera…"
          size="small"
          style="width: 220px"
        >
          <template #prefix><IconifyIcon class="size-4 text-muted-foreground" icon="lucide:search" /></template>
        </Input>
        <Tooltip title="Exportar lo que se ve a Excel (CSV), con los que siguen en evaluación al final">
          <Button :disabled="proyectos.length === 0" class="semfa-btn semfa-btn--neutro" size="small" @click="exportar">
            <IconifyIcon class="size-3.5" icon="lucide:sheet" />
            CSV
          </Button>
        </Tooltip>
      </div>
    </div>

    <div v-if="proyectos.length === 0" class="p-8 text-center text-sm text-muted-foreground">
      No hay proyectos {{ jornada ? `en el día ${jornada}` : 'inscritos' }}.
    </div>

    <!-- General -->
    <template v-else-if="modo === 'general'">
      <Table
        :columns="columnasRanking"
        :data-source="filtrados"
        :pagination="paginacion"
        class="semfa-tabla"
        row-key="idInscripcion"
        size="small"
        @change="alCambiarTabla"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'lugar'">
            <span
              :class="MEDALLAS[record.lugar] ?? 'bg-muted text-muted-foreground'"
              class="inline-flex size-6 items-center justify-center rounded-full text-xs font-bold tabular-nums"
            >{{ record.lugar }}</span>
          </template>
          <template v-else-if="column.key === 'nombre'">
            <Tooltip :title="record.nombre" placement="topLeft">
              <div :class="{ 'font-semibold': record.lugar <= 3 }" class="truncate">{{ record.nombre || '—' }}</div>
            </Tooltip>
            <div v-if="record.jornada || record.stand" class="text-[11px] text-muted-foreground">
              {{ textoJornada(record.jornada) }}<template v-if="record.stand"> · Stand {{ record.stand }}</template>
            </div>
          </template>
          <template v-else-if="column.key === 'grupo'">
            <Tooltip :title="record.facultad" placement="topLeft">
              <div class="truncate text-muted-foreground">
                {{ record.carrera || '—' }}<template v-if="record.siglaFacultad"> · {{ record.siglaFacultad }}</template>
              </div>
            </Tooltip>
          </template>
          <template v-else-if="column.key === 'categoria'">
            <Tooltip :title="record.categoria" placement="topLeft">
              <div class="truncate text-muted-foreground">{{ record.categoria }}</div>
            </Tooltip>
          </template>
          <template v-else-if="column.key === 'puntaje'">
            <span class="tabular-nums">{{ fmt(record.puntaje) }}</span>
            <span class="text-[11px] text-muted-foreground"> / {{ record.puntajeMaximo }}</span>
          </template>
          <template v-else-if="column.key === 'porcentaje'">
            <div class="flex items-center justify-end gap-2">
              <div class="semfa-barra w-12"><span :style="{ width: `${record.porcentaje}%` }" class="bg-primary/70"></span></div>
              <span class="w-14 text-right font-semibold tabular-nums">{{ fmtPorcentaje(record.porcentaje) }}</span>
            </div>
          </template>
        </template>
        <template #emptyText>
          <div class="flex flex-col items-center gap-2 py-8 text-muted-foreground">
            <IconifyIcon class="size-10 opacity-60" icon="lucide:hourglass" />
            {{ busqueda.trim() ? 'No hay proyectos con ese filtro' : 'Todavía ningún proyecto tiene su evaluación completa' }}
          </div>
        </template>
      </Table>

      <div v-if="pendientes.length > 0" class="border-t border-border px-4 py-3">
        <div class="mb-2 flex items-center gap-2 text-sm font-semibold">
          <IconifyIcon class="size-4 text-amber-600" icon="lucide:hourglass" />
          En evaluación ({{ pendientes.length }})
        </div>
        <Table
          :columns="columnasPendientes"
          :data-source="pendientes"
          :pagination="pendientes.length > 10 ? { pageSize: 10, showSizeChanger: false } : false"
          class="semfa-tabla"
          row-key="idInscripcion"
          size="small"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'nombre'">
              <Tooltip :title="record.nombre" placement="topLeft">
                <div class="truncate">{{ record.nombre || '—' }}</div>
              </Tooltip>
            </template>
            <template v-else-if="column.key === 'categoria'">
              <Tooltip :title="record.categoria" placement="topLeft">
                <div class="truncate text-muted-foreground">{{ record.categoria }}</div>
              </Tooltip>
            </template>
            <template v-else-if="column.key === 'jurados'">
              <span class="tabular-nums">{{ record.juradosCompletos }} de {{ record.juradosAsignados }} jurados</span>
            </template>
            <template v-else-if="column.key === 'estado'">
              <span :class="ESTADOS[record.estado as keyof typeof ESTADOS].clase" class="semfa-estado">
                {{ ESTADOS[record.estado as keyof typeof ESTADOS].texto }}
              </span>
            </template>
          </template>
        </Table>
      </div>
    </template>

    <!-- Por facultad / por carrera -->
    <template v-else>
      <div v-if="sinEstructura" class="mx-4 mb-3 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
        Los proyectos de esta actividad no tienen {{ modo === 'facultad' ? 'facultad' : 'carrera' }} registrada: todos
        quedan en un solo grupo.
      </div>
      <Table
        :columns="columnasResumen"
        :custom-row="(g: Grupo) => ({ onClick: () => (grupoActivo = grupoActivo === g.clave ? undefined : g.clave), style: 'cursor: pointer' })"
        :data-source="grupos"
        :pagination="grupos.length > 10 ? { pageSize: 10, showSizeChanger: false } : false"
        :row-class-name="(g: Grupo) => (g.clave === grupoActivo ? 'ant-table-row-selected' : '')"
        class="semfa-tabla px-4"
        row-key="clave"
        size="small"
      >
        <template #headerCell="{ column }">
          <template v-if="column.key === 'nombre'">{{ etiquetaGrupo }}</template>
        </template>
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'n'">
            <span class="tabular-nums text-muted-foreground">{{ record.promedio === null ? '—' : grupos.indexOf(record as Grupo) + 1 }}</span>
          </template>
          <template v-else-if="column.key === 'nombre'">
            <Tooltip :title="record.nombre" placement="topLeft">
              <span class="font-medium">{{ record.nombre }}</span>
              <span v-if="record.sigla && modo === 'facultad' && record.sigla !== record.nombre" class="text-muted-foreground"> ({{ record.sigla }})</span>
              <span v-else-if="record.sigla && modo === 'carrera'" class="text-muted-foreground"> · {{ record.sigla }}</span>
            </Tooltip>
          </template>
          <template v-else-if="column.key === 'completos'">
            <span class="tabular-nums">{{ record.completos }}</span>
            <span class="text-[11px] text-muted-foreground"> / {{ record.proyectos }}</span>
          </template>
          <template v-else-if="column.key === 'promedio'">
            <div class="flex items-center justify-end gap-2">
              <div class="semfa-barra w-12"><span :style="{ width: `${record.promedio ?? 0}%` }" class="bg-primary/70"></span></div>
              <span class="w-14 text-right font-semibold tabular-nums">{{ fmtPorcentaje(record.promedio) }}</span>
            </div>
          </template>
        </template>
      </Table>
      <div class="px-4 pb-1 pt-2 text-[11px] text-muted-foreground">
        Pulse una fila para ver solo ese bloque<template v-if="grupoActivo"> ·
          <a @click="grupoActivo = undefined">ver todos</a></template>.
      </div>

      <section v-for="g in gruposVisibles" :key="g.clave" class="mt-3 border-t border-border">
        <div class="flex flex-wrap items-center justify-between gap-2 bg-muted/40 px-4 py-2">
          <div class="min-w-0 font-semibold">
            {{ g.nombre }}
            <span v-if="g.sigla && g.sigla !== g.nombre" class="font-normal text-muted-foreground"> · {{ g.sigla }}</span>
          </div>
          <div class="text-xs text-muted-foreground">
            {{ g.completos }} de {{ g.proyectos }} evaluados · promedio
            <span class="font-semibold text-foreground">{{ fmtPorcentaje(g.promedio) }}</span>
          </div>
        </div>
        <Table
          v-if="g.ubicados.length > 0"
          :columns="columnasRanking"
          :data-source="g.ubicados"
          :pagination="g.ubicados.length > 10 ? { pageSize: 10, showSizeChanger: false } : false"
          class="semfa-tabla"
          row-key="idInscripcion"
          size="small"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'lugar'">
              <span
                :class="MEDALLAS[record.lugar] ?? 'bg-muted text-muted-foreground'"
                class="inline-flex size-6 items-center justify-center rounded-full text-xs font-bold tabular-nums"
              >{{ record.lugar }}</span>
            </template>
            <template v-else-if="column.key === 'nombre'">
              <Tooltip :title="record.nombre" placement="topLeft">
                <div :class="{ 'font-semibold': record.lugar <= 3 }" class="truncate">{{ record.nombre || '—' }}</div>
              </Tooltip>
            </template>
            <template v-else-if="column.key === 'grupo'">
              <div class="truncate text-muted-foreground">{{ record.carrera || '—' }}</div>
            </template>
            <template v-else-if="column.key === 'categoria'">
              <Tooltip :title="record.categoria" placement="topLeft">
                <div class="truncate text-muted-foreground">{{ record.categoria }}</div>
              </Tooltip>
            </template>
            <template v-else-if="column.key === 'puntaje'">
              <span class="tabular-nums">{{ fmt(record.puntaje) }}</span>
              <span class="text-[11px] text-muted-foreground"> / {{ record.puntajeMaximo }}</span>
            </template>
            <template v-else-if="column.key === 'porcentaje'">
              <span class="font-semibold tabular-nums">{{ fmtPorcentaje(record.porcentaje) }}</span>
            </template>
          </template>
        </Table>
        <div v-else class="px-4 py-3 text-xs text-muted-foreground">Todavía ningún proyecto con evaluación completa.</div>
        <div v-if="g.pendientes.length > 0" class="flex flex-wrap items-center gap-1.5 px-4 py-2">
          <span class="text-xs font-medium text-amber-600">En evaluación:</span>
          <Tooltip v-for="p in g.pendientes.slice(0, MAX_CHIPS)" :key="p.idInscripcion" :title="`${p.categoria} · ${ESTADOS[p.estado].texto}`">
            <span class="inline-flex max-w-72 items-center gap-1.5 rounded-md border border-border px-2 py-0.5 text-xs">
              <span class="truncate">{{ p.nombre || '—' }}</span>
              <span class="shrink-0 tabular-nums text-muted-foreground">{{ p.juradosCompletos }} de {{ p.juradosAsignados }}</span>
            </span>
          </Tooltip>
          <span v-if="g.pendientes.length > MAX_CHIPS" class="text-xs text-muted-foreground">
            y {{ g.pendientes.length - MAX_CHIPS }} más
          </span>
        </div>
      </section>
    </template>
  </div>
</template>
