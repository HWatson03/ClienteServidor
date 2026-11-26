<script lang="ts" setup>
import type { ColumnsType } from 'ant-design-vue/es/table';

import type { PasoActividad, ResumenActividad } from '#/api/actividades';

import { computed } from 'vue';

import { IconifyIcon } from '@vben/icons';

import { Button, Card, Table, Tooltip } from 'ant-design-vue';

import SemfaEstadoEvaluacion from '#/components/semfa/semfa-estado-evaluacion.vue';
import { useActividadTrabajo } from '#/composables/useActividadTrabajo';
import { ESTADOS_EVALUACION } from '#/utils/estado-evaluacion';

import { PASOS } from './pasos';

defineOptions({ name: 'SemfaActividadResumen' });

/**
 * Paso «Resumen» del centro de la actividad: qué tiene configurado cada categoría,
 * qué falta para que los jurados puedan evaluar y el botón para abrir o cerrar la
 * evaluación. Los datos los trae el centro (`GET /api/actividades/{id}/resumen`).
 */
const props = defineProps<{ cargando: boolean; resumen: null | ResumenActividad }>();

const emit = defineEmits<{ cambiado: []; ir: [paso: PasoActividad] }>();

const { actividad } = useActividadTrabajo();

const errores = computed(() => props.resumen?.avisos.filter((a) => a.nivel === 'ERROR') ?? []);
const advertencias = computed(() => props.resumen?.avisos.filter((a) => a.nivel === 'ADVERTENCIA') ?? []);
/** Avisos que solo informan (p. ej. la jornada en curso): no cuentan como pendientes. */
const informativos = computed(() => props.resumen?.avisos.filter((a) => a.nivel === 'INFO') ?? []);

const estado = computed(() => ESTADOS_EVALUACION[props.resumen?.estadoEvaluacion ?? 'ABIERTA']);

/** Qué hacer ahora, según el estado y lo que falta. */
const siguiente = computed(() => {
  const r = props.resumen;
  if (!r) return null;
  if (r.estadoEvaluacion === 'CERRADA') {
    return { icono: 'lucide:lock', texto: 'La evaluación está cerrada. Los resultados están en el Panel de evaluación.', tono: 'neutro' };
  }
  if (errores.value.length > 0) {
    return {
      icono: 'lucide:circle-alert',
      texto:
        errores.value.length === 1
          ? 'Falta 1 cosa para que los jurados puedan evaluar todo. Revísela abajo.'
          : `Faltan ${errores.value.length} cosas para que los jurados puedan evaluar todo. Revíselas abajo.`,
      tono: 'error',
    };
  }
  if (r.estadoEvaluacion === 'EN_PREPARACION') {
    return {
      icono: 'lucide:rocket',
      texto: 'Todo listo. Cuando quiera que los jurados empiecen, abra la evaluación.',
      tono: 'listo',
    };
  }
  return {
    icono: 'lucide:circle-play',
    texto: 'La evaluación está abierta: los jurados ya la ven en su app. Siga el avance en el Panel de evaluación.',
    tono: 'listo',
  };
});

const TONOS: Record<string, string> = {
  error: 'border-red-500/30 bg-red-500/5 text-red-700 dark:text-red-400',
  listo: 'border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400',
  neutro: 'border-border bg-muted/40 text-muted-foreground',
};

const tarjetas = computed(() => {
  const t = props.resumen?.totales;
  if (!t) return [];
  return [
    { icono: 'lucide:layers', paso: 'categorias' as const, titulo: 'Categorías', valor: `${t.categorias}` },
    { icono: 'lucide:users', paso: 'participantes' as const, titulo: 'Participantes', valor: `${t.inscritos}` },
    { icono: 'lucide:clipboard-list', paso: 'rubricas' as const, titulo: 'Rúbricas', valor: `${t.rubricas}` },
    { icono: 'lucide:gavel', paso: 'jurados' as const, titulo: 'Jurados', valor: `${t.jurados}` },
    {
      icono: 'lucide:check-check',
      paso: null,
      titulo: 'Evaluaciones',
      valor: `${t.evaluacionesHechas} / ${t.evaluacionesEsperadas}`,
    },
  ];
});

type FilaCategoria = ResumenActividad['categorias'][number];

const columnas: ColumnsType<FilaCategoria> = [
  { dataIndex: 'nombre', ellipsis: true, key: 'nombre', title: 'Categoría' },
  { align: 'center', key: 'inscritos', title: 'Participantes', width: 130 },
  { align: 'center', key: 'orden', title: 'Orden', width: 105 },
  { align: 'center', key: 'rubricas', title: 'Rúbricas', width: 115 },
  { align: 'center', key: 'puntos', title: 'Puntos', width: 80 },
  { align: 'center', key: 'jurados', title: 'Jurados', width: 85 },
  { align: 'center', key: 'evaluaciones', title: 'Evaluaciones', width: 120 },
];

const MAL = 'font-semibold text-red-600';
const OJO = 'font-medium text-amber-600';
</script>

<template>
  <div class="flex flex-col gap-3">
    <!-- Qué sigue -->
    <div
      v-if="siguiente"
      :class="TONOS[siguiente.tono]"
      class="flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3"
    >
      <IconifyIcon :icon="siguiente.icono" class="size-6 shrink-0" />
      <div class="min-w-0 flex-1 text-sm font-medium">{{ siguiente.texto }}</div>
      <div class="flex items-center gap-2">
        <span class="text-xs opacity-80">Evaluación:</span>
        <SemfaEstadoEvaluacion
          v-if="actividad"
          :actividad="actividad"
          :problemas="errores.length"
          grande
          @cambiado="emit('cambiado')"
        />
        <span v-else :class="estado.clase" class="rounded-full px-3 py-1 text-sm">{{ estado.texto }}</span>
      </div>
    </div>

    <!-- Totales: cada uno lleva a su paso -->
    <div class="grid grid-cols-2 gap-3 md:grid-cols-5">
      <component
        :is="t.paso ? 'button' : 'div'"
        v-for="t in tarjetas"
        :key="t.titulo"
        :class="t.paso ? 'cursor-pointer hover:border-primary/60 hover:shadow-sm' : ''"
        class="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 text-left transition"
        type="button"
        @click="t.paso && emit('ir', t.paso)"
      >
        <span class="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <IconifyIcon :icon="t.icono" class="size-5" />
        </span>
        <div class="min-w-0">
          <div class="text-xs text-muted-foreground">{{ t.titulo }}</div>
          <div class="text-lg font-semibold tabular-nums">{{ t.valor }}</div>
        </div>
      </component>
    </div>

    <div class="grid gap-3 2xl:grid-cols-[minmax(0,2fr)_minmax(360px,1fr)]">
      <!-- Por categoría -->
      <Card :body-style="{ padding: 0 }" class="overflow-hidden rounded-xl">
        <template #title>
          <div class="flex items-center gap-2">
            <IconifyIcon class="size-5 text-primary" icon="lucide:table-2" />
            Por categoría
          </div>
        </template>
        <Table
          :columns="columnas"
          :data-source="resumen?.categorias ?? []"
          :loading="cargando"
          :pagination="false"
          :scroll="{ x: 860 }"
          class="semfa-tabla"
          row-key="idCategoria"
          size="small"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'nombre'">
              <span class="font-medium">{{ record.nombre }}</span>
            </template>
            <template v-else-if="column.key === 'inscritos'">
              <span :class="record.inscritos === 0 ? MAL : ''" class="tabular-nums">{{ record.inscritos }}</span>
            </template>
            <template v-else-if="column.key === 'orden'">
              <span v-if="record.inscritos === 0" class="text-muted-foreground">—</span>
              <span v-else-if="record.sinOrden === 0" class="text-green-600">
                <IconifyIcon class="inline size-4" icon="lucide:check" /> Definido
              </span>
              <span v-else :class="OJO">{{ record.sinOrden === record.inscritos ? 'Por nombre' : `${record.sinOrden} sin nº` }}</span>
            </template>
            <template v-else-if="column.key === 'rubricas'">
              <span :class="record.rubricas === 0 ? MAL : ''" class="tabular-nums">
                {{ record.rubricas }}
                <span class="text-xs text-muted-foreground">({{ record.criterios }} crit.)</span>
              </span>
            </template>
            <template v-else-if="column.key === 'puntos'">
              <Tooltip :title="record.puntajeMaximo === 100 ? 'Suma 100 puntos' : 'Lo normal es que sume 100'">
                <span :class="record.rubricas === 0 ? MAL : record.puntajeMaximo === 100 ? 'text-green-600' : OJO" class="tabular-nums">
                  {{ record.puntajeMaximo }}
                </span>
              </Tooltip>
            </template>
            <template v-else-if="column.key === 'jurados'">
              <span :class="record.jurados === 0 ? MAL : ''" class="tabular-nums">{{ record.jurados }}</span>
            </template>
            <template v-else-if="column.key === 'evaluaciones'">
              <span class="tabular-nums">
                {{ record.evaluacionesHechas }}<span class="text-muted-foreground"> / {{ record.evaluacionesEsperadas }}</span>
              </span>
            </template>
          </template>
          <template #emptyText>
            <div class="flex flex-col items-center gap-2 py-6 text-muted-foreground">
              <IconifyIcon class="size-8 opacity-60" icon="lucide:layers" />
              Aún no hay categorías.
              <Button class="semfa-btn semfa-btn--suave-primario" size="small" @click="emit('ir', 'categorias')">
                Crear categorías
              </Button>
            </div>
          </template>
        </Table>
      </Card>

      <!-- Qué falta -->
      <Card :body-style="{ padding: '8px 12px' }" class="rounded-xl">
        <template #title>
          <div class="flex items-center gap-2">
            <IconifyIcon class="size-5 text-primary" icon="lucide:list-checks" />
            Por revisar
            <span v-if="resumen" class="text-sm font-normal text-muted-foreground">
              {{ errores.length }} pendiente(s) · {{ advertencias.length }} aviso(s)
              <template v-if="informativos.length > 0"> · {{ informativos.length }} nota(s)</template>
            </span>
          </div>
        </template>
        <div v-if="resumen && errores.length + advertencias.length === 0" class="flex items-center gap-2 py-4 text-green-600">
          <IconifyIcon class="size-5" icon="lucide:party-popper" />
          Todo configurado.
        </div>
        <ul class="m-0 list-none p-0">
          <li
            v-for="(a, n) in resumen?.avisos ?? []"
            :key="n"
            class="flex items-start gap-2 border-b border-border py-2 last:border-b-0"
          >
            <IconifyIcon
              :class="a.nivel === 'ERROR' ? 'text-red-500' : a.nivel === 'INFO' ? 'text-sky-500' : 'text-amber-500'"
              :icon="a.nivel === 'ERROR' ? 'lucide:circle-x' : a.nivel === 'INFO' ? 'lucide:info' : 'lucide:triangle-alert'"
              class="mt-0.5 size-4 shrink-0"
            />
            <span class="min-w-0 flex-1 text-sm">{{ a.mensaje }}</span>
            <Button class="shrink-0" size="small" type="link" @click="emit('ir', a.paso)">
              {{ PASOS.find((p) => p.clave === a.paso)?.titulo ?? 'Ir' }}
              <IconifyIcon class="ml-0.5 inline size-3.5" icon="lucide:arrow-right" />
            </Button>
          </li>
        </ul>
      </Card>
    </div>
  </div>
</template>
