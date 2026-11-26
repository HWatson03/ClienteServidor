<script lang="ts" setup>
import type { ColumnsType } from 'ant-design-vue/es/table';

import type {
  CategoriaCriterio,
  CategoriaCriterioForm,
} from '#/api/categorias-criterio';
import type { Pregunta } from '#/api/preguntas';

import { computed, onMounted, ref, shallowRef } from 'vue';

import { Page } from '@vben/common-ui';
import { IconifyIcon } from '@vben/icons';

import { Button, Card, Select, Table, Tooltip } from 'ant-design-vue';

import {
  actualizarCategoriaCriterio,
  crearCategoriaCriterio,
  eliminarCategoriaCriterio,
  listarCategoriasCriterio,
} from '#/api/categorias-criterio';
import { listarPreguntas } from '#/api/preguntas';
import SemfaBarraCrud from '#/components/semfa/semfa-barra-crud.vue';
import { useCrud } from '#/composables/useCrud';
import { useTablaLocal } from '#/composables/useTablaLocal';

import CategoriaCriterioFormModal from './form-modal.vue';

defineOptions({ name: 'SemfaCategoriaCriterio' });

type FormConId = CategoriaCriterioForm & { idCategoriaCriterio?: number };

const modalAbierto = ref(false);
const modalRef = ref<InstanceType<typeof CategoriaCriterioFormModal>>();
const categoriaSeleccionada = ref<CategoriaCriterio | null>(null);

/** Para contar las preguntas de cada categoría (con alguna no se elimina). */
const preguntas = shallowRef<Pregunta[]>([]);

const crud = useCrud<CategoriaCriterio, FormConId>({
  etiqueta: (p) => p.nombre,
  guardar: (payload) => {
    const { idCategoriaCriterio, ...data } = payload;
    return idCategoriaCriterio === undefined
      ? crearCategoriaCriterio(data)
      : actualizarCategoriaCriterio(idCategoriaCriterio, data);
  },
  idKey: 'idCategoriaCriterio',
  listar: async () => {
    const [lista, preg] = await Promise.all([
      listarCategoriasCriterio(),
      listarPreguntas().catch(() => [] as Pregunta[]),
    ]);
    preguntas.value = preg ?? [];
    return lista;
  },
  nombre: 'Categoría',
  remover: eliminarCategoriaCriterio,
});

const filas = computed(() =>
  crud.items.value.map((c) => ({
    ...c,
    preguntas: preguntas.value.filter((p) => p.idCategoriaCriterio === c.idCategoriaCriterio)
      .length,
  })),
);

type Fila = (typeof filas.value)[number];

const filtroTipo = ref<number>();

const opcionesTipo = computed(() => {
  const conteo = new Map<number, { nombre: string; total: number }>();
  for (const f of filas.value) {
    if (f.idTipoProyecto !== null) {
      conteo.set(f.idTipoProyecto, {
        nombre: f.tipoProyecto ?? '—',
        total: (conteo.get(f.idTipoProyecto)?.total ?? 0) + 1,
      });
    }
  }
  return [...conteo.entries()].map(([value, { nombre, total }]) => ({
    label: `${nombre} (${total})`,
    value,
  }));
});

const filasFiltradas = computed(() =>
  filtroTipo.value === undefined
    ? filas.value
    : filas.value.filter((f) => f.idTipoProyecto === filtroTipo.value),
);

const { alCambiarTabla, busqueda, filtrados, numeroFila, paginacion } =
  useTablaLocal(filasFiltradas, { camposBusqueda: ['nombre', 'tipoProyecto'] });

function comparar(a: null | string, b: null | string) {
  return (a ?? '').localeCompare(b ?? '', 'es', { numeric: true });
}

/**
 * Una fila por categoría con su tipo de proyecto (el legacy agrupaba en dos
 * niveles; es la misma información) más cuántas preguntas tiene.
 */
const columnas: ColumnsType<Fila> = [
  { align: 'center', key: '#', title: '#', width: 64 },
  {
    dataIndex: 'nombre',
    key: 'nombre',
    sorter: (a, b) => comparar(a.nombre, b.nombre),
    title: 'Categoría de criterio',
  },
  {
    dataIndex: 'tipoProyecto',
    key: 'tipoProyecto',
    sorter: (a, b) => comparar(a.tipoProyecto, b.tipoProyecto),
    title: 'Tipo de proyecto',
    width: 240,
  },
  {
    align: 'center',
    dataIndex: 'preguntas',
    key: 'preguntas',
    sorter: (a, b) => a.preguntas - b.preguntas,
    title: 'Preguntas',
    width: 110,
  },
  { align: 'center', key: 'opciones', title: 'Opciones', width: 220 },
];

function abrirRegistro() {
  categoriaSeleccionada.value = null;
  modalAbierto.value = true;
}

function abrirEdicion(categoria: CategoriaCriterio) {
  categoriaSeleccionada.value = categoria;
  modalAbierto.value = true;
}

async function alGuardar(payload: FormConId, continuar: boolean) {
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
  <Page description="Evaluación / Categoría criterio" title="Categorías de criterio">
    <Card :body-style="{ padding: 0 }" class="overflow-hidden rounded-xl">
      <template #title>
        <div class="flex items-center gap-2">
          <IconifyIcon class="size-5 text-primary" icon="lucide:folder-tree" />
          Categorías de criterio
        </div>
      </template>

      <template #extra>
        <SemfaBarraCrud
          v-model:busqueda="busqueda"
          :cargando="crud.cargando.value"
          icono-agregar="lucide:folder-plus"
          placeholder="Buscar categoría o tipo…"
          texto-agregar="Agregar categoría"
          @agregar="abrirRegistro"
          @recargar="crud.recargar"
        >
          <template v-if="opcionesTipo.length > 1" #filtros>
            <Select
              v-model:value="filtroTipo"
              :options="opcionesTipo"
              allow-clear
              class="hidden w-56 lg:block"
              placeholder="Todos los tipos"
            />
          </template>
        </SemfaBarraCrud>
      </template>

      <Table
        :columns="columnas"
        :data-source="filtrados"
        :loading="crud.cargando.value"
        :pagination="paginacion"
        :scroll="{ x: 760 }"
        class="semfa-tabla"
        row-key="idCategoriaCriterio"
        size="small"
        @change="alCambiarTabla"
      >
        <template #bodyCell="{ column, record, index }">
          <template v-if="column.key === '#'">
            <span class="tabular-nums text-muted-foreground">{{ numeroFila(index) }}</span>
          </template>

          <template v-else-if="column.key === 'nombre'">
            <div class="flex items-center gap-2">
              <span
                class="flex size-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary"
              >
                <IconifyIcon class="size-3.5" icon="lucide:folder-tree" />
              </span>
              <span class="truncate font-medium">{{ record.nombre }}</span>
            </div>
          </template>

          <template v-else-if="column.key === 'tipoProyecto'">
            <span class="text-muted-foreground">{{ record.tipoProyecto ?? '—' }}</span>
          </template>

          <template v-else-if="column.key === 'preguntas'">
            <span :class="record.preguntas === 0 ? 'text-amber-600' : ''" class="tabular-nums">
              {{ record.preguntas }}
            </span>
          </template>

          <template v-else-if="column.key === 'opciones'">
            <div class="flex justify-center gap-2">
              <Button
                class="semfa-btn semfa-btn--suave-primario"
                size="small"
                @click="abrirEdicion(record as CategoriaCriterio)"
              >
                <IconifyIcon class="size-3.5" icon="lucide:pencil" />
                Editar
              </Button>
              <Tooltip
                :title="record.preguntas > 0 ? `Tiene ${record.preguntas} pregunta(s): elimínelas primero` : ''"
              >
                <Button
                  :disabled="record.preguntas > 0"
                  class="semfa-btn semfa-btn--suave-peligro"
                  size="small"
                  @click="crud.eliminar(record as Fila, record.nombre ?? 'el registro')"
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
            <span v-if="busqueda.trim() || filtroTipo !== undefined">No hay categorías con ese filtro</span>
            <span v-else>Aún no hay categorías de criterio</span>
          </div>
        </template>
      </Table>
    </Card>

    <CategoriaCriterioFormModal
      ref="modalRef"
      v-model:open="modalAbierto"
      :categoria="categoriaSeleccionada"
      :categorias="crud.items.value"
      :guardando="crud.guardando.value"
      @guardar="alGuardar"
    />
  </Page>
</template>
