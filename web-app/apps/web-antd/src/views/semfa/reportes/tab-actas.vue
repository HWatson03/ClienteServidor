<script lang="ts" setup>
import type { ColumnsType } from 'ant-design-vue/es/table';

import type { ResultadosCategoria } from '#/api/resultados';

import type { FiltroJornada, ProyectoConCategoria } from './compartido';

import { computed, ref, watch } from 'vue';

import { IconifyIcon } from '@vben/icons';

import { Button, Input, Select, Switch, Table, Tooltip } from 'ant-design-vue';

import { PDF_RESULTADOS } from '#/api/resultados';
import { useTablaLocal } from '#/composables/useTablaLocal';

import BotonPdf from './boton-pdf.vue';
import {
  aplanarProyectos,
  archivo,
  calificacionDe,
  codigoJurado,
  descargarCsv,
  ESTADOS,
  evaluacionCompleta,
  fmt,
  textoJornada,
} from './compartido';

defineOptions({ name: 'SemfaReporteActas' });

/**
 * Control de actas: qué proyectos ya tienen la calificación completa de todos
 * sus jurados (listos para imprimir el informe y que los jurados lo firmen) y,
 * de los demás, qué jurados de la categoría aún no completaron su calificación.
 *
 * El backend da por proyecto cuántos jurados le corresponden
 * (`juradosAsignados`) y cuáles (`juradosDelProyecto`): «Faltan» nombra solo a
 * los que cubren este proyecto y aún no completan.
 */
const props = defineProps<{ categorias: ResultadosCategoria[]; jornada: FiltroJornada }>();

const idCategoria = ref<number>();
const soloListos = ref(false);
watch(
  () => props.categorias,
  (lista) => {
    if (idCategoria.value !== undefined && !lista.some((c) => c.idCategoria === idCategoria.value)) {
      idCategoria.value = undefined;
    }
  },
);

const categoria = computed(() => props.categorias.find((c) => c.idCategoria === idCategoria.value));
const categoriasPorId = computed(() => new Map(props.categorias.map((c) => [c.idCategoria, c])));

interface FilaActa extends ProyectoConCategoria {
  /** Jurados asignados a la categoría sin calificación completa de este proyecto. */
  faltan: string[];
  /** Cuántos faltan según el backend (exacto). */
  nFaltan: number;
  listo: boolean;
}

const todas = computed<FilaActa[]>(() => {
  const base = aplanarProyectos(categoria.value ? [categoria.value] : props.categorias, props.jornada);
  return base
    .map((p) => {
      const cat = categoriasPorId.value.get(p.idCategoria)!;
      const listo = evaluacionCompleta(p);
      const faltan = listo
        ? []
        : cat.jurados.filter((j) => j.asignado
          && (!p.juradosDelProyecto || p.juradosDelProyecto.includes(j.idJurado))
          && !calificacionDe(p, j.idJurado)?.completa).map((j) => j.nombre);
      return { ...p, faltan, listo, nFaltan: Math.max(0, p.juradosAsignados - p.juradosCompletos) };
    })
    .sort((a, b) =>
      Number(b.listo) - Number(a.listo)
      || a.categoria.localeCompare(b.categoria, 'es')
      || (a.orden ?? 9999) - (b.orden ?? 9999)
      || (a.nombre ?? '').localeCompare(b.nombre ?? '', 'es'));
});

const listos = computed(() => todas.value.filter((p) => p.listo).length);
const visibles = computed(() => (soloListos.value ? todas.value.filter((p) => p.listo) : todas.value));

const { alCambiarTabla, busqueda, filtrados, paginacion } = useTablaLocal(visibles, {
  camposBusqueda: ['nombre', 'categoria', 'carrera', 'stand'],
});

/** Con una categoría elegida, una columna por jurado (J1, J2… como en los PDF). */
const columnas = computed<ColumnsType<FilaActa>>(() => {
  const jurados = categoria.value?.jurados.filter((j) => j.asignado) ?? [];
  return [
    { align: 'center', key: 'listo', title: '', width: 44 },
    { key: 'nombre', title: 'Proyecto / participante' },
    ...(categoria.value ? [] : [{ key: 'categoria', title: 'Categoría', width: 180 }]),
    { key: 'jornada', title: 'Día · stand', width: 110 },
    { align: 'center', key: 'jurados', title: 'Jurados', width: 90 },
    ...jurados.map((j) => ({ align: 'center' as const, key: `j-${j.idJurado}`, title: codigoJurado(categoria.value!, j.idJurado), width: 52 })),
    ...(categoria.value ? [] : [{ key: 'faltan', title: 'Falta calificar', width: 240 }]),
    { align: 'right', key: 'puntaje', title: 'Puntaje', width: 90 },
    { align: 'right', key: 'acta', title: 'Acta / informe', width: 190 },
  ] as ColumnsType<FilaActa>;
});

function marcaJurado(p: FilaActa, idJurado: number) {
  const cal = calificacionDe(p, idJurado);
  if (cal?.completa) return { clase: 'text-emerald-600', icono: 'lucide:circle-check', texto: 'Calificación completa' };
  if (cal) return { clase: 'text-amber-600', icono: 'lucide:circle-dashed', texto: 'Calificación a medias' };
  return { clase: 'text-muted-foreground/60', icono: 'lucide:circle', texto: 'Sin calificar (o no le corresponde este proyecto)' };
}

function exportar() {
  descargarCsv(
    `control-actas${categoria.value ? `-${categoria.value.nombre}` : ''}${props.jornada ? `-dia-${props.jornada}` : ''}`,
    ['Listo para acta', 'Proyecto', 'Categoría', 'Carrera', 'Jornada', 'Stand', 'Jurados completos', 'Jurados asignados', 'Faltan', 'Jurados sin calificación completa', 'Puntaje', 'Evaluación'],
    filtrados.value.map((p) => [
      p.listo ? 'Sí' : 'No', p.nombre, p.categoria, p.carrera, p.jornada ? textoJornada(p.jornada) : null, p.stand,
      p.juradosCompletos, p.juradosAsignados, p.nFaltan, p.faltan.join(', '), p.puntaje, ESTADOS[p.estado].texto,
    ]),
  );
}
</script>

<template>
  <div>
    <div class="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
      <div class="flex flex-wrap items-center gap-2">
        <Select
          v-model:value="idCategoria"
          :options="categorias.map((c) => ({ label: c.nombre, value: c.idCategoria }))"
          allow-clear
          option-filter-prop="label"
          placeholder="Todas las categorías"
          show-search
          size="small"
          style="width: 260px"
        />
        <label class="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
          <Switch v-model:checked="soloListos" size="small" />
          Solo listos para imprimir
        </label>
        <span class="semfa-estado semfa-estado--ok">
          <IconifyIcon class="size-3.5" icon="lucide:printer" />
          {{ listos }} de {{ todas.length }} listos
        </span>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <Input v-model:value="busqueda" allow-clear placeholder="Buscar proyecto, stand…" size="small" style="width: 220px">
          <template #prefix><IconifyIcon class="size-4 text-muted-foreground" icon="lucide:search" /></template>
        </Input>
        <Tooltip title="Exportar lo que se ve a Excel (CSV)">
          <Button :disabled="filtrados.length === 0" class="semfa-btn semfa-btn--neutro" size="small" @click="exportar">
            <IconifyIcon class="size-3.5" icon="lucide:sheet" />
            CSV
          </Button>
        </Tooltip>
        <BotonPdf
          v-if="categoria"
          :clave="`informes-${categoria.idCategoria}`"
          :nombre="archivo('informes', categoria.nombre)"
          :pdf="PDF_RESULTADOS.participantes(categoria.idCategoria)"
          etiqueta="Todos los de la categoría"
          tooltip="Un informe por página, en orden de presentación"
        />
      </div>
    </div>

    <Table
      :columns="columnas"
      :data-source="filtrados"
      :pagination="paginacion"
      :scroll="categoria && categoria.jurados.length > 4 ? { x: 900 + categoria.jurados.length * 52 } : undefined"
      class="semfa-tabla"
      row-key="idInscripcion"
      size="small"
      @change="alCambiarTabla"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'listo'">
          <Tooltip :title="record.listo ? 'Todos sus jurados completaron: listo para imprimir y firmar' : `Faltan ${record.nFaltan} jurado(s)`">
            <IconifyIcon
              :class="record.listo ? 'text-emerald-600' : 'text-amber-500'"
              :icon="record.listo ? 'lucide:circle-check-big' : 'lucide:clock'"
              class="size-5"
            />
          </Tooltip>
        </template>
        <template v-else-if="column.key === 'nombre'">
          <Tooltip :title="record.nombre" placement="topLeft">
            <div :class="{ 'font-semibold': record.listo }" class="truncate">{{ record.nombre || '—' }}</div>
          </Tooltip>
          <div v-if="record.carrera" class="truncate text-[11px] text-muted-foreground">
            {{ record.carrera }}<template v-if="record.siglaFacultad"> · {{ record.siglaFacultad }}</template>
          </div>
        </template>
        <template v-else-if="column.key === 'categoria'">
          <Tooltip :title="record.categoria" placement="topLeft">
            <div class="truncate text-muted-foreground">{{ record.categoria }}</div>
          </Tooltip>
        </template>
        <template v-else-if="column.key === 'jornada'">
          <span class="text-muted-foreground">
            {{ textoJornada(record.jornada) }}<template v-if="record.stand"> · {{ record.stand }}</template>
          </span>
        </template>
        <template v-else-if="column.key === 'jurados'">
          <span :class="record.listo ? 'text-emerald-600' : ''" class="font-semibold tabular-nums">
            {{ record.juradosCompletos }}<span class="text-xs font-normal text-muted-foreground">/{{ record.juradosAsignados }}</span>
          </span>
        </template>
        <template v-else-if="String(column.key).startsWith('j-')">
          <Tooltip
            :title="`${categoria?.jurados.find((j) => `j-${j.idJurado}` === column.key)?.nombre}: ${marcaJurado(record as FilaActa, Number(String(column.key).slice(2))).texto}`"
          >
            <IconifyIcon
              :class="marcaJurado(record as FilaActa, Number(String(column.key).slice(2))).clase"
              :icon="marcaJurado(record as FilaActa, Number(String(column.key).slice(2))).icono"
              class="size-4"
            />
          </Tooltip>
        </template>
        <template v-else-if="column.key === 'faltan'">
          <span v-if="record.listo" class="text-xs text-emerald-600">Completo</span>
          <span v-else-if="record.estado === 'SIN_JURADOS'" class="text-xs text-red-600">Sin jurados asignados</span>
          <Tooltip
            v-else
            :title="record.faltan.length > record.nFaltan
              ? `Faltan ${record.nFaltan}. Jurados de la categoría sin calificación completa (alguno puede no corresponderle): ${record.faltan.join(', ')}`
              : record.faltan.join(', ')"
            placement="topLeft"
          >
            <div class="truncate text-xs">
              <span class="font-semibold text-amber-600">Faltan {{ record.nFaltan }}:</span>
              {{ record.faltan.join(', ') || '—' }}
            </div>
          </Tooltip>
        </template>
        <template v-else-if="column.key === 'puntaje'">
          <span :class="record.listo ? 'font-semibold' : 'text-muted-foreground'" class="tabular-nums">
            {{ record.listo ? fmt(record.puntaje) : '—' }}
          </span>
        </template>
        <template v-else-if="column.key === 'acta'">
          <BotonPdf
            :clave="`informe-${record.idInscripcion}`"
            :deshabilitado="!record.listo"
            :nombre="archivo('informe', record.nombre)"
            :pdf="PDF_RESULTADOS.participante(record.idInscripcion)"
            :tooltip="record.listo ? 'Informe del proyecto: rúbricas y criterios por jurado, con firmas' : 'Se habilita cuando todos sus jurados completen'"
            etiqueta="Imprimir acta"
          />
        </template>
      </template>
      <template #emptyText>
        <div class="flex flex-col items-center gap-2 py-8 text-muted-foreground">
          <IconifyIcon class="size-10 opacity-60" icon="lucide:file-check" />
          {{ soloListos ? 'Todavía ningún proyecto está listo para el acta' : busqueda.trim() ? 'No hay proyectos con ese filtro' : 'Sin proyectos' }}
        </div>
      </template>
    </Table>
  </div>
</template>
