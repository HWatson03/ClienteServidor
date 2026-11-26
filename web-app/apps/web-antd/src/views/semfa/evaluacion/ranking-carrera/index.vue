<script lang="ts" setup>
import type { ColumnsType } from 'ant-design-vue/es/table';

import type {
  RankingCarrera,
  RankingCarreraFila,
  RankingCarreraNivel,
  RankingCarreraResponse,
} from '#/api/ranking-carrera';

import { computed, onMounted, ref } from 'vue';

import { Page } from '@vben/common-ui';
import { IconifyIcon } from '@vben/icons';

import { Button, Card, Input, Table, Tooltip } from 'ant-design-vue';

import { obtenerRankingCarrera } from '#/api/ranking-carrera';
import { normalizarTexto } from '#/utils/formato';

defineOptions({ name: 'SemfaRankingCarrera' });

const cargando = ref(false);
const error = ref(false);
const datos = ref<null | RankingCarreraResponse>(null);
const actualizado = ref<Date>();
const busqueda = ref('');

async function cargar() {
  cargando.value = true;
  error.value = false;
  try {
    datos.value = (await obtenerRankingCarrera()) ?? null;
    actualizado.value = new Date();
  } catch {
    // El interceptor ya avisó; la vista solo deja el estado de error.
    error.value = true;
  } finally {
    cargando.value = false;
  }
}

function filasDe(nivel: RankingCarreraNivel | undefined): RankingCarreraFila[] {
  return nivel?.filas ?? [];
}

function tieneCategorias(c: RankingCarrera) {
  return c.basico?.categoriaId !== null || c.avanzado?.categoriaId !== null;
}

/** Carreras con al menos una categoría (Básico o Avanzado); el resto se lista aparte. */
const carreras = computed(() => (datos.value?.carreras ?? []).filter(tieneCategorias));
const sinCategorias = computed(() =>
  (datos.value?.carreras ?? []).filter((c) => !tieneCategorias(c)),
);

const visibles = computed(() => {
  const q = normalizarTexto(busqueda.value.trim());
  if (!q) return carreras.value;
  return carreras.value.filter((c) =>
    normalizarTexto(
      [c.carrera, ...filasDe(c.basico).map((f) => f.proyecto), ...filasDe(c.avanzado).map((f) => f.proyecto)].join(' '),
    ).includes(q),
  );
});

const resumen = computed(() => {
  const filas = carreras.value.flatMap((c) => [...filasDe(c.basico), ...filasDe(c.avanzado)]);
  return {
    carreras: carreras.value.length,
    completos: filas.filter((f) => f.completo).length,
    conGanador: carreras.value.filter((c) => c.ganadorNivel).length,
    proyectos: filas.length,
  };
});

/** 2 decimales, o guion si no hay valor (igual que el `fmt` del legacy). */
function fmt(valor: null | number | undefined): string {
  if (valor === null || valor === undefined || Number.isNaN(valor)) {
    return '—';
  }
  return Number(valor).toFixed(2);
}

const MEDALLAS: Record<number, string> = {
  1: 'bg-amber-400 text-white',
  2: 'bg-slate-400 text-white',
  3: 'bg-orange-700/80 text-white',
};

const NIVELES = [
  { clave: 'basico', color: 'text-sky-600', icono: 'lucide:sprout', titulo: 'Básico' },
  { clave: 'avanzado', color: 'text-violet-600', icono: 'lucide:rocket', titulo: 'Avanzado' },
] as const;

const columnas: ColumnsType<RankingCarreraFila> = [
  { align: 'center', key: 'posicion', title: '#', width: 52 },
  { dataIndex: 'proyecto', ellipsis: true, key: 'proyecto', title: 'Proyecto' },
  { align: 'right', key: 'promedio', title: 'Promedio', width: 92 },
  { align: 'center', key: 'jurados', title: 'Jurados', width: 84 },
];

function claseFila(fila: RankingCarreraFila): string {
  return fila.posicion === 1 ? 'semfa-ranking-primero' : '';
}

function imprimir() {
  window.print();
}

onMounted(cargar);
</script>

<template>
  <Page description="Evaluación / Ranking por carrera" title="Ranking por carrera">
    <Card :body-style="{ padding: '12px 16px' }" class="mb-3 overflow-hidden rounded-xl">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div class="flex min-w-0 items-center gap-3">
          <span
            class="flex size-10 shrink-0 items-center justify-center rounded-xl bg-amber-400/15 text-amber-500"
          >
            <IconifyIcon class="size-5" icon="lucide:trophy" />
          </span>
          <p class="m-0 max-w-3xl text-sm text-muted-foreground">
            1º de <strong>Básico</strong> y 1º de <strong>Avanzado</strong> por carrera. El
            <strong>ganador de la carrera</strong> es el de mayor promedio entre esos dos.
            El promedio (sobre 100) solo cuenta a los jurados que completaron todas las rúbricas.
          </p>
        </div>
        <div class="flex flex-wrap items-center gap-2 print:hidden">
          <Input
            v-model:value="busqueda"
            allow-clear
            class="w-60"
            placeholder="Buscar carrera o proyecto…"
          >
            <template #prefix>
              <IconifyIcon class="size-4 text-muted-foreground" icon="lucide:search" />
            </template>
          </Input>
          <Button :loading="cargando" class="semfa-btn semfa-btn--neutro" @click="cargar">
            <IconifyIcon v-if="!cargando" class="size-4" icon="lucide:refresh-cw" />
            Actualizar
          </Button>
          <Button
            :disabled="carreras.length === 0"
            class="semfa-btn semfa-btn--primario"
            @click="imprimir"
          >
            <IconifyIcon class="size-4" icon="lucide:printer" />
            Imprimir
          </Button>
        </div>
      </div>

      <div
        v-if="carreras.length > 0"
        class="mt-3 flex flex-wrap gap-x-6 gap-y-1 border-t border-border pt-3 text-sm"
      >
        <span><strong class="tabular-nums">{{ resumen.carreras }}</strong> carreras</span>
        <span><strong class="tabular-nums">{{ resumen.proyectos }}</strong> proyectos</span>
        <span>
          <strong class="tabular-nums text-emerald-600">{{ resumen.completos }}</strong>
          con evaluación completa
        </span>
        <span>
          <strong class="tabular-nums text-amber-500">{{ resumen.conGanador }}</strong>
          carreras con ganador
        </span>
        <span v-if="actualizado" class="ml-auto text-xs text-muted-foreground">
          Actualizado a las {{ actualizado.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' }) }}
        </span>
      </div>
    </Card>

    <div
      v-if="cargando && !datos"
      class="flex flex-col items-center gap-2 py-12 text-muted-foreground"
    >
      <IconifyIcon class="size-8 animate-spin opacity-60" icon="lucide:loader-circle" />
      Calculando ranking…
    </div>

    <div
      v-else-if="error && !datos"
      class="flex flex-col items-center gap-3 py-12 text-muted-foreground"
    >
      <IconifyIcon class="size-10 text-red-500 opacity-70" icon="lucide:circle-x" />
      No se pudo cargar el ranking.
      <Button class="semfa-btn semfa-btn--neutro" @click="cargar">Reintentar</Button>
    </div>

    <div
      v-else-if="carreras.length === 0"
      class="flex flex-col items-center gap-2 py-12 text-center text-muted-foreground"
    >
      <IconifyIcon class="size-10 opacity-60" icon="lucide:graduation-cap" />
      Ninguna carrera tiene categorías Básico o Avanzado todavía.
      <span class="text-xs">Se crean al clasificar los proyectos por nivel.</span>
    </div>

    <template v-else>
      <div
        v-if="visibles.length === 0"
        class="flex flex-col items-center gap-2 py-10 text-muted-foreground"
      >
        <IconifyIcon class="size-10 opacity-60" icon="lucide:search-x" />
        Ninguna carrera o proyecto coincide con la búsqueda.
      </div>

      <div class="flex flex-col gap-3">
        <Card
          v-for="carrera in visibles"
          :key="carrera.idCarrera ?? carrera.carrera ?? ''"
          :body-style="{ padding: '12px 16px' }"
          class="semfa-ranking-carrera overflow-hidden rounded-xl"
        >
          <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div class="flex items-center gap-2 text-base font-semibold">
              <IconifyIcon class="size-5 text-primary" icon="lucide:graduation-cap" />
              {{ carrera.carrera ?? '—' }}
            </div>
            <div
              v-if="carrera.ganadorNivel"
              class="flex max-w-full items-center gap-2 rounded-lg bg-amber-400/15 px-3 py-1 text-sm"
            >
              <IconifyIcon class="size-4 shrink-0 text-amber-500" icon="lucide:award" />
              <span class="truncate">
                <strong>{{ carrera.ganadorProyecto }}</strong>
                <span class="text-muted-foreground">
                  · {{ carrera.ganadorNivel === 'BASICO' ? 'Básico' : 'Avanzado' }} ·
                </span>
                <strong class="tabular-nums">{{ fmt(carrera.ganadorPromedio) }}</strong> pts
              </span>
            </div>
            <span v-else class="text-sm text-muted-foreground">Aún sin resultados</span>
          </div>

          <div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div v-for="n in NIVELES" :key="n.clave" class="min-w-0">
              <div class="mb-1.5 flex items-center justify-between text-sm">
                <span :class="n.color" class="flex items-center gap-1.5 font-semibold">
                  <IconifyIcon class="size-4" :icon="n.icono" />
                  {{ n.titulo }}
                </span>
                <span
                  v-if="carrera[n.clave]?.categoriaId !== null"
                  class="text-xs text-muted-foreground"
                >
                  {{ carrera[n.clave]?.juradosEsperados ?? 0 }} jurado(s) asignado(s)
                </span>
              </div>

              <div
                v-if="carrera[n.clave]?.categoriaId === null"
                class="rounded-lg border border-dashed border-border py-3 text-center text-sm text-muted-foreground"
              >
                Sin categoría de este nivel
              </div>
              <div
                v-else-if="filasDe(carrera[n.clave]).length === 0"
                class="rounded-lg border border-dashed border-border py-3 text-center text-sm text-muted-foreground"
              >
                Sin proyectos inscritos
              </div>
              <Table
                v-else
                :columns="columnas"
                :data-source="filasDe(carrera[n.clave])"
                :pagination="false"
                :row-class-name="claseFila"
                class="semfa-tabla"
                row-key="participanteId"
                size="small"
              >
                <template #bodyCell="{ column, record }">
                  <template v-if="column.key === 'posicion'">
                    <span
                      v-if="record.posicion > 0"
                      :class="MEDALLAS[record.posicion] ?? 'bg-muted text-muted-foreground'"
                      class="inline-flex size-6 items-center justify-center rounded-full text-xs font-bold tabular-nums"
                    >
                      {{ record.posicion }}
                    </span>
                    <span v-else class="text-muted-foreground">—</span>
                  </template>

                  <template v-else-if="column.key === 'proyecto'">
                    <Tooltip :title="record.proyecto" placement="topLeft">
                      <span :class="{ 'font-semibold': record.posicion === 1 }">
                        {{ record.proyecto ?? '—' }}
                      </span>
                    </Tooltip>
                  </template>

                  <template v-else-if="column.key === 'promedio'">
                    <span
                      :class="record.promedio === null ? 'text-muted-foreground' : 'font-semibold'"
                      class="tabular-nums"
                    >
                      {{ fmt(record.promedio) }}
                    </span>
                  </template>

                  <template v-else-if="column.key === 'jurados'">
                    <Tooltip
                      :title="
                        record.completo
                          ? 'Todos los jurados asignados completaron sus rúbricas'
                          : 'Jurados que completaron todas las rúbricas / asignados'
                      "
                    >
                      <span
                        :class="
                          record.completo
                            ? 'bg-emerald-500/15 text-emerald-700'
                            : 'bg-amber-400/15 text-amber-700'
                        "
                        class="inline-flex items-center gap-1 rounded-md px-1.5 text-xs font-medium tabular-nums"
                      >
                        <IconifyIcon
                          class="size-3"
                          :icon="record.completo ? 'lucide:circle-check' : 'lucide:clock'"
                        />
                        {{ record.juradosEvaluaron }}/{{ carrera[n.clave]?.juradosEsperados ?? 0 }}
                      </span>
                    </Tooltip>
                  </template>
                </template>
              </Table>
            </div>
          </div>
        </Card>
      </div>

      <p v-if="sinCategorias.length > 0" class="mt-3 text-xs text-muted-foreground print:hidden">
        Sin categorías (no participan): {{ sinCategorias.map((c) => c.carrera).join(', ') }}.
      </p>
    </template>
  </Page>
</template>

<style scoped>
:deep(.semfa-ranking-primero > td) {
  background: rgb(251 191 36 / 8%) !important;
}

@media print {
  .semfa-ranking-carrera {
    break-inside: avoid;
  }
}
</style>
