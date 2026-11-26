<script lang="ts" setup>
import type { ResultadosCategoria, ResultadosProyecto, ResultadosRubrica } from '#/api/resultados';

import { computed, ref, watch } from 'vue';

import { IconifyIcon } from '@vben/icons';

import { Button, Input, Modal, Tooltip, message } from 'ant-design-vue';

import { autorizarReevaluacion, PDF_RESULTADOS } from '#/api/resultados';
import { normalizarTexto } from '#/utils/formato';

import BotonPdf from './boton-pdf.vue';
import {
  archivo,
  calificacionDe,
  codigoJurado,
  ESTADOS,
  fmt,
  fmtCorto,
  notaCriterio,
  promedio,
  subtotalRubrica,
} from './compartido';

defineOptions({ name: 'SemfaReporteProyecto' });

/**
 * Detalle de un proyecto: lo que le dio cada jurado en cada rúbrica y criterio.
 * Uso interno: no se publica (la TV y el acta solo muestran el puntaje final).
 */
const props = defineProps<{ actividadId: number; categoria: ResultadosCategoria }>();

const busqueda = ref('');
const idInscripcion = ref<number>();

/** En orden de presentación, como los ve el jurado. */
const lista = computed(() => {
  const q = normalizarTexto(busqueda.value.trim());
  return [...props.categoria.proyectos]
    .sort((a, b) => (a.orden ?? 1e9) - (b.orden ?? 1e9) || (a.nombre ?? '').localeCompare(b.nombre ?? '', 'es'))
    .filter((p) => !q || normalizarTexto(p.nombre).includes(q) || normalizarTexto(p.institucion).includes(q));
});

watch(
  () => props.categoria,
  (cat) => {
    if (!cat.proyectos.some((p) => p.idInscripcion === idInscripcion.value)) {
      idInscripcion.value = cat.proyectos[0]?.idInscripcion;
    }
  },
  { immediate: true },
);

const proyecto = computed(() => props.categoria.proyectos.find((p) => p.idInscripcion === idInscripcion.value));
const rankingDisponible = computed(() => props.categoria.proyectos.length > 0
  && props.categoria.completos === props.categoria.proyectos.length);
const conPuesto = computed(() => props.categoria.proyectos.filter((p) => p.puesto > 0).length);
const autorizando = ref<number>();

function habilitar(idJurado: number) {
  if (!proyecto.value) return;
  Modal.confirm({
    title: 'Habilitar una reevaluación',
    content: 'El jurado podrá reemplazar su calificación una sola vez. Después deberá reimprimirse y firmarse el reporte.',
    okText: 'Habilitar',
    cancelText: 'Cancelar',
    async onOk() {
      if (!proyecto.value) return;
      autorizando.value = idJurado;
      try {
        await autorizarReevaluacion(props.actividadId, proyecto.value.idInscripcion, idJurado);
        message.success('Reevaluación habilitada. El jurado debe reabrir su hoja; después del cambio, reimprima el reporte.');
      } finally {
        autorizando.value = undefined;
      }
    },
  });
}

/** Jurados con calificación para el proyecto, o asignados (pendientes). */
const jurados = computed(() => {
  const p = proyecto.value;
  if (!p) return [];
  return props.categoria.jurados.filter((j) => j.asignado || calificacionDe(p, j.idJurado));
});

function promedioCriterio(p: ResultadosProyecto, rubrica: ResultadosRubrica, idCriterio: number) {
  const valores = jurados.value
    .map((j) => calificacionDe(p, j.idJurado))
    .filter((c) => c?.completa)
    .map((c) => notaCriterio(c, rubrica.idRubrica, idCriterio))
    .filter((v): v is number => v !== undefined);
  return promedio(valores);
}

function promedioSubtotal(p: ResultadosProyecto, rubrica: ResultadosRubrica) {
  const valores = jurados.value
    .map((j) => calificacionDe(p, j.idJurado))
    .filter((c) => c?.completa)
    .map((c) => subtotalRubrica(c, rubrica.idRubrica))
    .filter((v): v is number => v !== undefined);
  return promedio(valores);
}
</script>

<template>
  <div class="grid grid-cols-1 lg:grid-cols-[300px_minmax(0,1fr)]">
    <!-- Lista de proyectos -->
    <div class="border-b border-border lg:border-b-0 lg:border-r">
      <div class="p-3">
        <Input v-model:value="busqueda" allow-clear placeholder="Buscar proyecto…" size="small">
          <template #prefix><IconifyIcon class="size-4 text-muted-foreground" icon="lucide:search" /></template>
        </Input>
      </div>
      <div class="flex max-h-[240px] flex-col overflow-y-auto lg:max-h-[620px]">
        <button
          v-for="p in lista"
          :key="p.idInscripcion"
          :class="p.idInscripcion === idInscripcion ? 'bg-primary/10' : 'hover:bg-accent'"
          class="flex items-center gap-2 border-b border-border px-3 py-2 text-left last:border-b-0"
          type="button"
          @click="idInscripcion = p.idInscripcion"
        >
          <span class="w-6 shrink-0 text-center text-xs tabular-nums text-muted-foreground">{{ p.orden ?? '—' }}</span>
          <span class="min-w-0 flex-1">
            <span class="block truncate text-sm" :class="{ 'font-medium text-primary': p.idInscripcion === idInscripcion }">
              {{ p.nombre || '—' }}
            </span>
            <span class="block truncate text-xs text-muted-foreground">{{ p.institucion || '—' }}</span>
          </span>
          <span class="shrink-0 text-right text-xs tabular-nums">
            <span :class="p.puesto > 0 ? 'font-semibold' : 'text-muted-foreground'">{{ fmt(p.puntaje) }}</span>
            <span v-if="rankingDisponible && p.puesto > 0" class="block text-muted-foreground">{{ p.puesto }}°</span>
          </span>
        </button>
        <div v-if="lista.length === 0" class="px-4 py-8 text-center text-sm text-muted-foreground">Sin proyectos</div>
      </div>
    </div>

    <!-- Detalle -->
    <div v-if="proyecto" class="min-w-0 p-4">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div class="min-w-0">
          <div class="text-base font-semibold leading-tight">{{ proyecto.nombre }}</div>
          <div class="mt-0.5 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
            <span v-if="proyecto.institucion">{{ proyecto.institucion }}</span>
            <span v-if="proyecto.docenteGuia">Docente guía: {{ proyecto.docenteGuia }}</span>
            <span v-if="proyecto.orden">Orden {{ proyecto.orden }}</span>
          </div>
        </div>
        <div class="flex flex-wrap gap-2">
          <BotonPdf
            :clave="`informe-${proyecto.idInscripcion}`"
            :deshabilitado="proyecto.calificaciones.length === 0"
            :nombre="archivo('informe', proyecto.nombre)"
            :pdf="PDF_RESULTADOS.participante(proyecto.idInscripcion)"
            etiqueta="Informe del proyecto"
            tooltip="Rúbricas y criterios por jurado, con firmas (uso interno)"
          />
          <BotonPdf
            :clave="`informes-${categoria.idCategoria}`"
            :nombre="archivo('informes', categoria.nombre)"
            :pdf="PDF_RESULTADOS.participantes(categoria.idCategoria)"
            etiqueta="Todos los de la categoría"
            tooltip="Un informe por página, en orden de presentación"
          />
        </div>
      </div>

      <div class="mt-3 grid grid-cols-2 gap-2">
        <div class="rounded-lg border border-border px-3 py-2">
          <div class="text-xs text-muted-foreground">Puntaje final</div>
          <div class="text-lg font-semibold tabular-nums">
            {{ fmt(proyecto.puntaje) }}<span class="text-xs font-normal text-muted-foreground"> / {{ categoria.puntajeMaximo }}</span>
          </div>
        </div>
        <div v-if="rankingDisponible" class="rounded-lg border border-border px-3 py-2">
          <div class="text-xs text-muted-foreground">Puesto</div>
          <div class="text-lg font-semibold tabular-nums">
            <template v-if="proyecto.puesto > 0">
              {{ proyecto.puesto }}°<span class="text-xs font-normal text-muted-foreground"> de {{ conPuesto }}</span>
            </template>
            <span v-else class="text-sm font-normal text-muted-foreground">Sin puesto aún</span>
          </div>
        </div>
        <div class="rounded-lg border border-border px-3 py-2">
          <div class="text-xs text-muted-foreground">Calificaciones completas</div>
          <div class="flex items-center gap-2 text-lg font-semibold tabular-nums">
            {{ proyecto.juradosCompletos }}<span class="text-xs font-normal text-muted-foreground">/ {{ proyecto.juradosAsignados }}</span>
            <span :class="ESTADOS[proyecto.estado].clase" class="semfa-estado">{{ ESTADOS[proyecto.estado].texto }}</span>
          </div>
        </div>
      </div>

      <div class="mt-3 rounded-lg border border-border p-3">
        <div class="mb-2 text-sm font-semibold">Reportes breves para firma y comunicación</div>
        <div class="flex flex-wrap items-center gap-2">
          <BotonPdf
            :clave="`resumen-${proyecto.idInscripcion}`"
            :deshabilitado="proyecto.estado !== 'COMPLETO'"
            :nombre="archivo('resumen-evaluacion', proyecto.nombre)"
            :pdf="PDF_RESULTADOS.resumen(proyecto.idInscripcion)"
            etiqueta="Resumen general"
            tooltip="Total de cada jurado y promedio general; sin puesto"
          />
          <div v-for="j in jurados.filter((x) => x.asignado)" :key="j.idJurado" class="flex items-center gap-1">
            <BotonPdf
              :clave="`resumen-${proyecto.idInscripcion}-${j.idJurado}`"
              :deshabilitado="proyecto.estado !== 'COMPLETO'"
              :nombre="archivo('evaluacion', proyecto.nombre, j.nombre)"
              :pdf="PDF_RESULTADOS.resumen(proyecto.idInscripcion, j.idJurado)"
              :etiqueta="`Firma: ${j.nombre}`"
              tooltip="Puntaje total de este jurado, sin puesto"
            />
            <Button
              v-if="calificacionDe(proyecto, j.idJurado)?.completa"
              :loading="autorizando === j.idJurado"
              size="small"
              title="Habilitar una única corrección para este jurado"
              @click="habilitar(j.idJurado)"
            >Reevaluar</Button>
          </div>
        </div>
        <p v-if="proyecto.estado !== 'COMPLETO'" class="mt-2 text-xs text-muted-foreground">
          Los reportes para firma se habilitan cuando todos los jurados terminen esta evaluación.
        </p>
      </div>

      <div class="mt-3 overflow-x-auto">
        <table class="semfa-reporte-tabla">
          <thead>
            <tr>
              <th class="is-izq">Criterio</th>
              <th class="w-14">Máx.</th>
              <th v-for="j in jurados" :key="j.idJurado" class="w-20">
                <Tooltip :title="j.nombre + (j.asignado ? '' : ' (ya no asignado)')">
                  <span>{{ codigoJurado(categoria, j.idJurado) }}</span>
                </Tooltip>
              </th>
              <th class="w-20">Promedio</th>
            </tr>
          </thead>
          <tbody v-for="r in categoria.rubricas" :key="r.idRubrica">
            <tr class="semfa-reporte-rubrica">
              <td :colspan="3 + jurados.length">{{ r.nombre }} <span class="font-normal text-muted-foreground">(máx. {{ fmtCorto(r.maximo) }})</span></td>
            </tr>
            <tr v-for="c in r.criterios" :key="c.idCriterio">
              <td class="is-izq">{{ c.nombre }}</td>
              <td class="text-muted-foreground">{{ fmtCorto(c.maximo) }}</td>
              <td v-for="j in jurados" :key="j.idJurado">
                <span :class="{ 'text-amber-600': calificacionDe(proyecto, j.idJurado)?.completa === false }">
                  {{ fmtCorto(notaCriterio(calificacionDe(proyecto, j.idJurado), r.idRubrica, c.idCriterio)) }}
                </span>
              </td>
              <td class="font-medium">{{ fmt(promedioCriterio(proyecto, r, c.idCriterio)) }}</td>
            </tr>
            <tr class="semfa-reporte-subtotal">
              <td class="is-der">Subtotal</td>
              <td>{{ fmtCorto(r.maximo) }}</td>
              <td v-for="j in jurados" :key="j.idJurado">{{ fmt(subtotalRubrica(calificacionDe(proyecto, j.idJurado), r.idRubrica)) }}</td>
              <td>{{ fmt(promedioSubtotal(proyecto, r)) }}</td>
            </tr>
          </tbody>
          <tfoot>
            <tr>
              <td class="is-der">TOTAL</td>
              <td>{{ fmtCorto(categoria.puntajeMaximo) }}</td>
              <td v-for="j in jurados" :key="j.idJurado">
                <template v-if="calificacionDe(proyecto, j.idJurado)">
                  {{ fmt(calificacionDe(proyecto, j.idJurado)!.total) }}<span
                    v-if="!calificacionDe(proyecto, j.idJurado)!.completa"
                    class="text-amber-600"
                    >*</span>
                </template>
                <span v-else class="text-muted-foreground">Pend.</span>
              </td>
              <td class="text-primary">{{ fmt(proyecto.puntaje) }}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <div class="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span v-for="j in jurados" :key="j.idJurado">
          <strong class="text-foreground">{{ codigoJurado(categoria, j.idJurado) }}</strong> {{ j.nombre }}
        </span>
        <span class="basis-full">
          <span class="text-amber-600">*</span> calificación incompleta: se muestra, pero no se promedia.
        </span>
      </div>
    </div>
    <div v-else class="flex items-center justify-center p-10 text-sm text-muted-foreground">Elija un proyecto</div>
  </div>
</template>
