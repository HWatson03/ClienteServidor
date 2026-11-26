<script lang="ts" setup>
import type { ColumnsType } from 'ant-design-vue/es/table';

import type { CategoriaActividad } from '#/api/categorias-actividad';
import type { Rubrica } from '#/api/rubricas';
import type {
  RubricaCriterio,
  RubricaCriterioForm,
} from '#/api/rubricas-criterio';

import { computed, onMounted, ref, shallowRef } from 'vue';

import { Page } from '@vben/common-ui';
import { IconifyIcon } from '@vben/icons';

import { Button, Card, Table, Tooltip } from 'ant-design-vue';

import { listarCategoriasActividad } from '#/api/categorias-actividad';
import { listarRubricas } from '#/api/rubricas';
import {
  actualizarRubricaCriterio,
  crearRubricaCriterio,
  eliminarRubricaCriterio,
  listarRubricasCriterio,
} from '#/api/rubricas-criterio';
import SemfaBarraCrud from '#/components/semfa/semfa-barra-crud.vue';
import { actividadDeRubrica, useActividadTrabajo } from '#/composables/useActividadTrabajo';
import { useCrud } from '#/composables/useCrud';
import { useTablaLocal } from '#/composables/useTablaLocal';
import { limpiarEspacios } from '#/utils/formato';

import RubricaCriterioFormModal from './form-modal.vue';

defineOptions({ name: 'SemfaRubricaCriterio' });

const modalAbierto = ref(false);
const modalRef = ref<InstanceType<typeof RubricaCriterioFormModal>>();
const criterioSeleccionado = ref<null | RubricaCriterio>(null);

const { deLaActividad, idActividad, nombreActividad } = useActividadTrabajo();

const crud = useCrud<RubricaCriterio, RubricaCriterioForm>({
  etiqueta: (p) => (p.nombre.length > 60 ? `${p.nombre.slice(0, 60)}…` : p.nombre),
  guardar: (payload) => {
    // El id viaja en la URL del PUT, no en el cuerpo: el DTO de petición no lo expone.
    const { idRubricaCriterio, ...datos } = payload;
    return idRubricaCriterio === undefined
      ? crearRubricaCriterio(datos)
      : actualizarRubricaCriterio(idRubricaCriterio, datos);
  },
  idKey: 'idRubricaCriterio',
  listar: async () => {
    const [lista, rubs, cats] = await Promise.all([
      listarRubricasCriterio(),
      listarRubricas().catch(() => [] as Rubrica[]),
      listarCategoriasActividad().catch(() => [] as CategoriaActividad[]),
    ]);
    const mapa = new Map((cats ?? []).map((c) => [c.idCategoriaActividad, c.idActividad]));
    actividadDeRubricaId.value = new Map((rubs ?? []).map((r) => [r.idRubrica, actividadDeRubrica(r, mapa)]));
    return lista;
  },
  nombre: 'Criterio',
  remover: eliminarRubricaCriterio,
});

// ---------------------------------------------------------------- filas y filtro

/** idRubrica → actividad (de toda la actividad o de una de sus categorías). */
const actividadDeRubricaId = shallowRef(new Map<number, null | number | undefined>());

/** Solo los criterios de rúbricas de la actividad de trabajo. */
const filas = computed(() =>
  deLaActividad(crud.items.value, (c) =>
    c.idRubrica === null ? null : actividadDeRubricaId.value.get(c.idRubrica),
  ).map((c) => ({
    ...c,
    nombreLimpio: limpiarEspacios(c.nombre),
    rubrica: limpiarEspacios(c.nombreRubrica),
  })),
);

type Fila = (typeof filas.value)[number];

/** Rúbricas con sus puntos: filtran la tabla y muestran cómo se reparte la nota. */
const chipsRubrica = computed(() => {
  const mapa = new Map<number, { nombre: string; puntos: number; total: number }>();
  for (const f of filas.value) {
    if (f.idRubrica !== null) {
      const previo = mapa.get(f.idRubrica);
      mapa.set(f.idRubrica, {
        nombre: f.rubrica,
        puntos: (previo?.puntos ?? 0) + (Number(f.porcentaje) || 0),
        total: (previo?.total ?? 0) + 1,
      });
    }
  }
  return [...mapa.entries()]
    .map(([valor, datos]) => ({ valor, ...datos }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
});

const puntosTotales = computed(() => chipsRubrica.value.reduce((s, c) => s + c.puntos, 0));

const filtroRubrica = ref<number>();

const filasFiltradas = computed(() =>
  filtroRubrica.value === undefined
    ? filas.value
    : filas.value.filter((f) => f.idRubrica === filtroRubrica.value),
);

const { alCambiarTabla, busqueda, filtrados, numeroFila, paginacion } =
  useTablaLocal(filasFiltradas, { camposBusqueda: ['nombreLimpio', 'rubrica', 'descripcion'] });

function comparar(a: null | string, b: null | string) {
  return (a ?? '').localeCompare(b ?? '', 'es', { numeric: true });
}

/** Columnas de `tabla.html` (Rúbrica, criterio, Porcentaje, Descripción) más su uso. */
const columnas: ColumnsType<Fila> = [
  { align: 'center', key: '#', title: '#', width: 64 },
  {
    dataIndex: 'nombreLimpio',
    ellipsis: true,
    key: 'nombre',
    sorter: (a, b) => comparar(a.nombreLimpio, b.nombreLimpio),
    title: 'Criterio',
  },
  {
    dataIndex: 'rubrica',
    ellipsis: true,
    key: 'rubrica',
    sorter: (a, b) => comparar(a.rubrica, b.rubrica),
    title: 'Rúbrica',
    width: 220,
  },
  {
    align: 'center',
    dataIndex: 'porcentaje',
    key: 'porcentaje',
    sorter: (a, b) => a.porcentaje - b.porcentaje,
    title: 'Puntaje',
    width: 100,
  },
  {
    align: 'center',
    dataIndex: 'evaluaciones',
    key: 'evaluaciones',
    sorter: (a, b) => a.evaluaciones - b.evaluaciones,
    title: 'Calificado',
    width: 110,
  },
  { align: 'center', key: 'opciones', title: 'Opciones', width: 220 },
];

// ---------------------------------------------------------------- acciones

function abrirRegistro() {
  criterioSeleccionado.value = null;
  modalAbierto.value = true;
}

function abrirEdicion(criterio: RubricaCriterio) {
  criterioSeleccionado.value = criterio;
  modalAbierto.value = true;
}

async function alGuardar(payload: RubricaCriterioForm, continuar: boolean) {
  if (!(await crud.guardar(payload))) {
    return;
  }
  if (continuar) {
    modalRef.value?.reiniciar();
  } else {
    modalAbierto.value = false;
  }
}

onMounted(crud.recargar);
</script>

<template>
  <Page description="Evaluación / Rúbrica criterio" title="Criterios de rúbrica">
    <Card :body-style="{ padding: 0 }" class="overflow-hidden rounded-xl">
      <template #title>
        <div class="flex items-center gap-2">
          <IconifyIcon class="size-5 text-primary" icon="lucide:list-checks" />
          Criterios de evaluación
          <span v-if="nombreActividad" class="text-sm font-normal text-muted-foreground">· {{ nombreActividad }}</span>
        </div>
      </template>

      <template #extra>
        <SemfaBarraCrud
          v-model:busqueda="busqueda"
          :cargando="crud.cargando.value"
          icono-agregar="lucide:list-plus"
          placeholder="Buscar criterio o rúbrica…"
          texto-agregar="Agregar criterio"
          @agregar="abrirRegistro"
          @recargar="crud.recargar"
        />
      </template>

      <!-- Reparto de la nota: puntos por rúbrica (filtran la tabla) y total -->
      <div
        v-if="chipsRubrica.length > 0"
        class="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2.5"
      >
        <button
          :class="{ 'is-activo': filtroRubrica === undefined }"
          class="semfa-chip"
          type="button"
          @click="filtroRubrica = undefined"
        >
          Todas
          <span class="semfa-chip__total">{{ filas.length }}</span>
        </button>
        <button
          v-for="r in chipsRubrica"
          :key="r.valor"
          :class="{ 'is-activo': filtroRubrica === r.valor }"
          class="semfa-chip"
          type="button"
          @click="filtroRubrica = r.valor"
        >
          <IconifyIcon class="size-3.5" icon="lucide:clipboard-list" />
          {{ r.nombre }}
          <span class="semfa-chip__total">{{ r.total }} · {{ r.puntos }} pts</span>
        </button>
        <Tooltip
          :title="
            puntosTotales === 100
              ? 'Los criterios suman los 100 puntos de la nota'
              : 'La suma de los puntajes de los criterios debería ser 100'
          "
        >
          <span
            :class="puntosTotales === 100 ? 'bg-green-600/10 text-green-600' : 'bg-amber-500/10 text-amber-600'"
            class="ml-auto inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium"
          >
            <IconifyIcon
              :icon="puntosTotales === 100 ? 'lucide:circle-check' : 'lucide:triangle-alert'"
              class="size-3.5"
            />
            Total {{ puntosTotales }} / 100 pts
          </span>
        </Tooltip>
      </div>

      <Table
        :columns="columnas"
        :data-source="filtrados"
        :loading="crud.cargando.value"
        :pagination="paginacion"
        :scroll="{ x: 980 }"
        class="semfa-tabla"
        row-key="idRubricaCriterio"
        size="small"
        @change="alCambiarTabla"
      >
        <template #bodyCell="{ column, record, index }">
          <template v-if="column.key === '#'">
            <span class="tabular-nums text-muted-foreground">
              {{ numeroFila(index) }}
            </span>
          </template>

          <template v-else-if="column.key === 'nombre'">
            <Tooltip
              :title="record.descripcion ? `${record.nombreLimpio} — ${record.descripcion}` : record.nombreLimpio"
              placement="topLeft"
            >
              <span>{{ record.nombreLimpio }}</span>
            </Tooltip>
          </template>

          <template v-else-if="column.key === 'rubrica'">
            <span class="text-muted-foreground">{{ record.rubrica || '—' }}</span>
          </template>

          <template v-else-if="column.key === 'porcentaje'">
            <Tooltip
              :title="record.porcentaje > 10 ? 'El panel del jurado califica hasta 10: se recorta' : ''"
            >
              <span
                :class="record.porcentaje > 10 ? 'text-amber-600' : ''"
                class="font-medium tabular-nums"
              >
                {{ record.porcentaje }} pts
              </span>
            </Tooltip>
          </template>

          <template v-else-if="column.key === 'evaluaciones'">
            <span
              :class="record.evaluaciones > 0 ? 'text-green-600' : 'text-muted-foreground'"
              class="tabular-nums"
            >
              {{ record.evaluaciones > 0 ? `${record.evaluaciones} veces` : 'Aún no' }}
            </span>
          </template>

          <template v-else-if="column.key === 'opciones'">
            <div class="flex justify-center gap-2">
              <Button
                class="semfa-btn semfa-btn--suave-primario"
                size="small"
                @click="abrirEdicion(record as RubricaCriterio)"
              >
                <IconifyIcon class="size-3.5" icon="lucide:pencil" />
                Editar
              </Button>
              <!-- Calificado: el backend no deja eliminarlo (409) -->
              <Tooltip
                :title="
                  record.evaluaciones > 0
                    ? `Ya se calificó ${record.evaluaciones} veces: no se puede eliminar`
                    : ''
                "
              >
                <Button
                  :disabled="record.evaluaciones > 0"
                  class="semfa-btn semfa-btn--suave-peligro"
                  size="small"
                  @click="crud.eliminar(record as Fila, record.nombreLimpio.slice(0, 60))"
                >
                  <IconifyIcon class="size-3.5" icon="lucide:trash-2" />
                  Eliminar
                </Button>
              </Tooltip>
            </div>
          </template>
        </template>

        <template #emptyText>
          <div class="flex flex-col items-center gap-2 py-8 text-muted-foreground">
            <IconifyIcon class="size-10 opacity-60" icon="lucide:search-x" />
            <span v-if="idActividad === undefined">Elija una actividad en la barra superior</span>
            <span v-else-if="busqueda.trim() || filtroRubrica !== undefined">
              No hay criterios con ese filtro
            </span>
            <span v-else>Las rúbricas de {{ nombreActividad }} aún no tienen criterios</span>
          </div>
        </template>
      </Table>
    </Card>

    <RubricaCriterioFormModal
      ref="modalRef"
      v-model:open="modalAbierto"
      :criterio="criterioSeleccionado"
      :criterios="crud.items.value"
      :guardando="crud.guardando.value"
      @guardar="alGuardar"
    />
  </Page>
</template>
