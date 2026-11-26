<script lang="ts" setup>
import type { ResultadosCategoria, ResultadosJurado } from '#/api/resultados';

import { computed, ref, watch } from 'vue';

import { IconifyIcon } from '@vben/icons';

import { Segmented, Tooltip } from 'ant-design-vue';

import { PDF_RESULTADOS } from '#/api/resultados';

import BotonPdf from './boton-pdf.vue';
import {
  archivo,
  calificacionDe,
  codigoJurado,
  ESTADOS,
  fmt,
  fmtCorto,
  notaCriterio,
} from './compartido';

defineOptions({ name: 'SemfaReporteJurados' });

/**
 * Jurados de una categoría: el cuadro consolidado (todos juntos) y la planilla
 * de cada uno. Uso interno.
 */
const props = defineProps<{ categoria: ResultadosCategoria; jurados: ResultadosJurado[] }>();

type Vista = 'consolidado' | number;
const vista = ref<Vista>('consolidado');

watch(
  () => props.categoria,
  (cat) => {
    if (typeof vista.value === 'number' && !cat.jurados.some((j) => j.idJurado === vista.value)) {
      vista.value = 'consolidado';
    }
  },
);

const opciones = computed(() => [
  { label: 'Consolidado', value: 'consolidado' },
  ...props.categoria.jurados.map((j) => ({
    label: `${codigoJurado(props.categoria, j.idJurado)} · ${j.nombre.split(' ').slice(0, 2).join(' ')}`,
    value: j.idJurado,
  })),
]);

const jurado = computed(() =>
  typeof vista.value === 'number' ? props.categoria.jurados.find((j) => j.idJurado === vista.value) : undefined,
);
const ci = computed(() => props.jurados.find((j) => j.idJurado === jurado.value?.idJurado)?.ci);

/** En orden de presentación (el de la planilla del jurado). */
const enOrden = computed(() =>
  [...props.categoria.proyectos].sort(
    (a, b) => (a.orden ?? 1e9) - (b.orden ?? 1e9) || (a.nombre ?? '').localeCompare(b.nombre ?? '', 'es'),
  ),
);

/** Avance del jurado elegido en la categoría. */
const avance = computed(() => {
  const j = jurado.value;
  if (!j) return { completas: 0, total: 0 };
  const completas = props.categoria.proyectos.filter((p) => calificacionDe(p, j.idJurado)?.completa).length;
  return { completas, total: props.categoria.proyectos.length };
});
</script>

<template>
  <div class="p-4">
    <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
      <Segmented v-model:value="vista" :options="opciones" class="max-w-full overflow-x-auto" />
      <BotonPdf
        v-if="vista === 'consolidado'"
        :clave="`consolidado-${categoria.idCategoria}`"
        :nombre="archivo('cuadro-consolidado', categoria.nombre)"
        :pdf="PDF_RESULTADOS.consolidado(categoria.idCategoria)"
        etiqueta="Cuadro consolidado"
        tooltip="Total de cada jurado y puntaje general, con firmas de todos"
      />
      <BotonPdf
        v-else-if="jurado"
        :clave="`jurado-${jurado.idJurado}`"
        :nombre="archivo('planilla', jurado.nombre)"
        :pdf="PDF_RESULTADOS.jurado(jurado.idJurado)"
        etiqueta="Planilla del jurado"
        tooltip="Lo que calificó en cada una de sus categorías, para su firma"
      />
    </div>

    <div v-if="categoria.jurados.length === 0" class="flex flex-col items-center gap-2 py-10 text-muted-foreground">
      <IconifyIcon class="size-10 opacity-60" icon="lucide:user-x" />
      La categoría no tiene jurados asignados.
    </div>

    <!-- Consolidado -->
    <div v-else-if="vista === 'consolidado'" class="overflow-x-auto">
      <table class="semfa-reporte-tabla">
        <thead>
          <tr>
            <th class="is-izq">Proyecto / participante</th>
            <th v-for="j in categoria.jurados" :key="j.idJurado" class="w-20">
              <Tooltip :title="j.nombre + (j.asignado ? '' : ' (ya no asignado)')">
                <span>{{ codigoJurado(categoria, j.idJurado) }}</span>
              </Tooltip>
            </th>
            <th class="w-24">Puntaje final</th>
            <th class="w-32">Evaluación</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="p in categoria.proyectos" :key="p.idInscripcion">
            <td class="is-izq">{{ p.nombre || '—' }}</td>
            <td v-for="j in categoria.jurados" :key="j.idJurado">
              <template v-if="calificacionDe(p, j.idJurado)">
                <span :class="{ 'text-amber-600': !calificacionDe(p, j.idJurado)!.completa }">
                  {{ fmt(calificacionDe(p, j.idJurado)!.total) }}{{ calificacionDe(p, j.idJurado)!.completa ? '' : '*' }}
                </span>
              </template>
              <span v-else class="text-muted-foreground">—</span>
            </td>
            <td class="font-semibold text-primary">{{ fmt(p.puntaje) }}</td>
            <td>
              <span :class="ESTADOS[p.estado].clase" class="semfa-estado">{{ ESTADOS[p.estado].texto }}</span>
            </td>
          </tr>
          <tr v-if="categoria.proyectos.length === 0">
            <td :colspan="3 + categoria.jurados.length" class="py-6 text-muted-foreground">Sin proyectos inscritos</td>
          </tr>
        </tbody>
      </table>
      <div class="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span v-for="j in categoria.jurados" :key="j.idJurado">
          <strong class="text-foreground">{{ codigoJurado(categoria, j.idJurado) }}</strong> {{ j.nombre }}
        </span>
        <span class="basis-full"><span class="text-amber-600">*</span> calificación incompleta: no se promedia.</span>
      </div>
    </div>

    <!-- Planilla de un jurado -->
    <div v-else-if="jurado">
      <div class="mb-2 flex flex-wrap items-baseline gap-x-3 text-sm">
        <span class="font-semibold">{{ jurado.nombre }}</span>
        <span v-if="ci" class="text-xs text-muted-foreground">C.I. {{ ci }}</span>
        <span class="text-xs text-muted-foreground">
          {{ avance.completas }} de {{ avance.total }} proyecto(s) calificados por completo
        </span>
        <span v-if="!jurado.asignado" class="semfa-estado semfa-estado--pendiente">Ya no asignado</span>
      </div>
      <div class="overflow-x-auto">
        <table class="semfa-reporte-tabla">
          <thead>
            <tr>
              <th rowspan="2" class="w-10">N°</th>
              <th rowspan="2" class="is-izq">Proyecto / participante</th>
              <th v-for="r in categoria.rubricas" :key="r.idRubrica" :colspan="r.criterios.length" class="semfa-reporte-grupo">
                {{ r.nombre }}
              </th>
              <th rowspan="2" class="w-20">Total<br /><span class="font-normal text-muted-foreground">/ {{ fmtCorto(categoria.puntajeMaximo) }}</span></th>
            </tr>
            <tr>
              <template v-for="r in categoria.rubricas" :key="r.idRubrica">
                <th v-for="c in r.criterios" :key="c.idCriterio" class="w-16">
                  <Tooltip :title="`${c.nombre} (máx. ${fmtCorto(c.maximo)})`">
                    <span class="block max-w-[88px] truncate font-normal">{{ c.nombre }}</span>
                  </Tooltip>
                </th>
              </template>
            </tr>
          </thead>
          <tbody>
            <tr v-for="p in enOrden" :key="p.idInscripcion">
              <td class="tabular-nums text-muted-foreground">{{ p.orden ?? '—' }}</td>
              <td class="is-izq">{{ p.nombre || '—' }}</td>
              <template v-for="r in categoria.rubricas" :key="r.idRubrica">
                <td v-for="c in r.criterios" :key="c.idCriterio">
                  {{ fmtCorto(notaCriterio(calificacionDe(p, jurado.idJurado), r.idRubrica, c.idCriterio)) }}
                </td>
              </template>
              <td class="font-semibold">
                <template v-if="calificacionDe(p, jurado.idJurado)">
                  {{ fmt(calificacionDe(p, jurado.idJurado)!.total)
                  }}<span v-if="!calificacionDe(p, jurado.idJurado)!.completa" class="text-amber-600">*</span>
                </template>
                <span v-else class="font-normal text-muted-foreground">Pendiente</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
