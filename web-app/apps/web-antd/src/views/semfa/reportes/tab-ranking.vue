<script lang="ts" setup>
import type { ColumnsType } from 'ant-design-vue/es/table';

import type { ResultadosCategoria, ResultadosProyecto } from '#/api/resultados';

import { computed } from 'vue';

import { IconifyIcon } from '@vben/icons';

import { Button, Input, Table, Tooltip } from 'ant-design-vue';

import { PDF_RESULTADOS } from '#/api/resultados';
import { useTablaLocal } from '#/composables/useTablaLocal';

import BotonExclusion from './boton-exclusion.vue';
import BotonPdf from './boton-pdf.vue';
import type { FiltroJornada } from './compartido';

import { archivo, descargarCsv, ESTADOS, fmt, r2, textoJornada } from './compartido';

defineOptions({ name: 'SemfaReporteRanking' });

/** Ranking de una categoría: solo el puntaje final (lo mismo que el acta y la TV). */
const props = defineProps<{ actividad: string; categoria: ResultadosCategoria; jornada?: FiltroJornada }>();
const emit = defineEmits<{ recargar: [] }>();

/** El puesto es el oficial de la categoría; la jornada solo filtra la vista. */
const proyectos = computed(() => props.categoria.proyectos
  .filter((p) => !props.jornada || p.jornada === props.jornada));
const { alCambiarTabla, busqueda, filtrados, paginacion } = useTablaLocal(proyectos, {
  camposBusqueda: ['nombre', 'institucion', 'carrera'],
});

function exportar() {
  const c = props.categoria;
  descargarCsv(
    `ranking-${c.nombre}${props.jornada ? `-dia-${props.jornada}` : ''}`,
    ['Puesto', 'Proyecto', 'Institución', 'Carrera', 'Facultad', 'Jornada', 'Stand', 'Puntaje final', 'Puntaje máximo', '%', 'Evaluación', 'Jurados completos', 'Jurados asignados'],
    filtrados.value.map((p) => [
      p.puesto || null, p.nombre, p.institucion, p.carrera, p.siglaFacultad ?? p.facultad,
      p.jornada ? textoJornada(p.jornada) : null, p.stand, r2(p.puntaje), c.puntajeMaximo,
      p.puntaje === null || c.puntajeMaximo <= 0 ? null : r2((p.puntaje * 100) / c.puntajeMaximo),
      ESTADOS[p.estado].texto, p.juradosCompletos, p.juradosAsignados,
    ]),
  );
}

const sinPuesto = computed(() => props.categoria.proyectos
  .filter((p) => p.puesto === 0 && p.estado !== 'SIN_JURADOS' && !p.exclusion).length);
/** Un proyecto sin jurados (no se presentó) o excluido del ranking no lo bloquea. */
const disponible = computed(() => props.categoria.completos > 0
  && props.categoria.proyectos.every((p) => p.estado === 'COMPLETO' || p.estado === 'SIN_JURADOS' || !!p.exclusion));

const columnas: ColumnsType<ResultadosProyecto> = [
  { align: 'center', key: 'puesto', title: 'Puesto', width: 76 },
  { dataIndex: 'nombre', ellipsis: true, key: 'nombre', title: 'Proyecto / participante' },
  { dataIndex: 'institucion', ellipsis: true, key: 'institucion', title: 'Institución', width: 260 },
  { align: 'right', key: 'puntaje', title: 'Puntaje final', width: 150 },
  { key: 'estado', title: 'Evaluación', width: 150 },
  { align: 'center', key: 'acciones', title: '', width: 56 },
];

const MEDALLAS: Record<number, string> = {
  1: 'bg-amber-400 text-white',
  2: 'bg-slate-400 text-white',
  3: 'bg-orange-700/80 text-white',
};

function porcentaje(p: ResultadosProyecto) {
  const max = props.categoria.puntajeMaximo;
  return p.puntaje === null || max <= 0 ? 0 : Math.min(100, (p.puntaje * 100) / max);
}
</script>

<template>
  <div>
    <div v-if="!disponible" class="p-8 text-center text-sm text-muted-foreground">
      El ranking de esta categoría se habilitará cuando todos los participantes terminen de ser evaluados.
      <span v-if="sinPuesto > 0"> Faltan {{ sinPuesto }}.</span>
    </div>
    <template v-else>
    <div class="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
      <div class="text-xs text-muted-foreground">
        Puntaje final = promedio de los totales de los jurados (máx. {{ categoria.puntajeMaximo }} pts).
        Solo los proyectos con todas sus evaluaciones tienen puesto.
        <span v-if="sinPuesto > 0" class="text-amber-600">{{ sinPuesto }} aún en evaluación.</span>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <Input v-model:value="busqueda" allow-clear placeholder="Buscar proyecto…" size="small" style="width: 220px">
          <template #prefix><IconifyIcon class="size-4 text-muted-foreground" icon="lucide:search" /></template>
        </Input>
        <Tooltip title="Exportar lo que se ve a Excel (CSV)">
          <Button class="semfa-btn semfa-btn--neutro" size="small" @click="exportar">
            <IconifyIcon class="size-3.5" icon="lucide:sheet" />
            CSV
          </Button>
        </Tooltip>
        <BotonPdf
          :clave="`ranking-${categoria.idCategoria}`"
          :nombre="archivo('acta-resultados', categoria.nombre)"
          :pdf="PDF_RESULTADOS.ranking(categoria.idCategoria)"
          etiqueta="Acta de la categoría"
          tooltip="Puesto y puntaje final, con firmas de los jurados (publicable)"
        />
        <BotonPdf
          :nombre="archivo('acta-resultados', actividad)"
          :pdf="PDF_RESULTADOS.ranking()"
          clave="ranking-todas"
          etiqueta="Todas las categorías"
          tooltip="Un acta por categoría en un solo PDF"
        />
      </div>
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
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'puesto'">
          <span
            v-if="record.puesto > 0"
            :class="MEDALLAS[record.puesto] ?? 'bg-muted text-muted-foreground'"
            class="inline-flex size-6 items-center justify-center rounded-full text-xs font-bold tabular-nums"
          >
            {{ record.puesto }}
          </span>
          <span v-else class="text-muted-foreground">—</span>
        </template>
        <template v-else-if="column.key === 'nombre'">
          <Tooltip :title="record.nombre" placement="topLeft">
            <span :class="{ 'font-semibold': record.puesto > 0 && record.puesto <= 3 }">{{ record.nombre || '—' }}</span>
          </Tooltip>
          <Tooltip v-if="record.exclusion" :title="record.exclusion.motivo">
            <span class="ml-1 rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-700">Excluido del ranking</span>
          </Tooltip>
          <div v-if="record.carrera" class="truncate text-[11px] text-muted-foreground">
            {{ record.carrera }}<template v-if="record.siglaFacultad"> · {{ record.siglaFacultad }}</template>
          </div>
        </template>
        <template v-else-if="column.key === 'institucion'">
          <Tooltip :title="record.institucion" placement="topLeft">
            <span class="text-muted-foreground">{{ record.institucion || '—' }}</span>
          </Tooltip>
        </template>
        <template v-else-if="column.key === 'puntaje'">
          <div class="flex items-center justify-end gap-2">
            <div class="semfa-barra w-14">
              <span :style="{ width: `${porcentaje(record as ResultadosProyecto)}%` }" class="bg-primary/70"></span>
            </div>
            <span
              :class="record.puesto > 0 ? 'font-semibold text-foreground' : 'text-muted-foreground'"
              class="w-14 text-right tabular-nums"
            >
              {{ fmt(record.puntaje) }}
            </span>
          </div>
        </template>
        <template v-else-if="column.key === 'estado'">
          <Tooltip :title="`${record.juradosCompletos} de ${record.juradosAsignados} jurado(s) con calificación completa`">
            <span :class="ESTADOS[record.estado as keyof typeof ESTADOS].clase" class="semfa-estado">
              {{ ESTADOS[record.estado as keyof typeof ESTADOS].texto }}
              <span v-if="record.estado === 'EN_PROCESO'" class="tabular-nums opacity-80">
                {{ record.juradosCompletos }}/{{ record.juradosAsignados }}
              </span>
            </span>
          </Tooltip>
        </template>
        <template v-else-if="column.key === 'acciones'">
          <BotonExclusion :proyecto="record as ResultadosProyecto" @cambio="emit('recargar')" />
        </template>
      </template>
      <template #emptyText>
        <div class="flex flex-col items-center gap-2 py-8 text-muted-foreground">
          <IconifyIcon class="size-10 opacity-60" icon="lucide:search-x" />
          {{ busqueda.trim() ? 'No hay proyectos con ese filtro' : 'Sin proyectos inscritos' }}
        </div>
      </template>
    </Table>
    </template>
  </div>
</template>
