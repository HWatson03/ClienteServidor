<script lang="ts" setup>
import type { ColumnsType } from 'ant-design-vue/es/table';

import type { TipoProyectoFila, TipoProyectoForm } from '#/api/tipos-proyecto';

import { onMounted, ref } from 'vue';

import { Page } from '@vben/common-ui';
import { IconifyIcon } from '@vben/icons';

import { Button, Card, Table, Tooltip } from 'ant-design-vue';

import {
  actualizarTipoProyecto,
  crearTipoProyecto,
  eliminarTipoProyecto,
  listarTiposProyectoCrud,
} from '#/api/tipos-proyecto';
import SemfaBarraCrud from '#/components/semfa/semfa-barra-crud.vue';
import { useCrud } from '#/composables/useCrud';
import { useTablaLocal } from '#/composables/useTablaLocal';

import TipoProyectoFormModal from './form-modal.vue';

defineOptions({ name: 'SemfaTipoProyecto' });

const modalAbierto = ref(false);
const modalRef = ref<InstanceType<typeof TipoProyectoFormModal>>();
const tipoSeleccionado = ref<null | TipoProyectoFila>(null);

const crud = useCrud<TipoProyectoFila, TipoProyectoForm>({
  etiqueta: (p) => p.nombre,
  guardar: (payload) => {
    const { idTipoProyecto, ...data } = payload;
    return idTipoProyecto === undefined
      ? crearTipoProyecto(data)
      : actualizarTipoProyecto(idTipoProyecto, data);
  },
  idKey: 'idTipoProyecto',
  listar: listarTiposProyectoCrud,
  nombre: 'Tipo de proyecto',
  remover: eliminarTipoProyecto,
});

const { alCambiarTabla, busqueda, filtrados, numeroFila, paginacion } =
  useTablaLocal(crud.items, { camposBusqueda: ['nombre'] });

const columnas: ColumnsType<TipoProyectoFila> = [
  { align: 'center', key: '#', title: '#', width: 64 },
  {
    dataIndex: 'nombre',
    key: 'nombre',
    sorter: (a, b) => (a.nombre ?? '').localeCompare(b.nombre ?? '', 'es'),
    title: 'Tipo de proyecto',
  },
  {
    align: 'center',
    dataIndex: 'categoriasCriterio',
    key: 'categoriasCriterio',
    sorter: (a, b) => a.categoriasCriterio - b.categoriasCriterio,
    title: 'Categorías de criterio',
    width: 180,
  },
  { align: 'center', key: 'opciones', title: 'Opciones', width: 220 },
];

function abrirRegistro() {
  tipoSeleccionado.value = null;
  modalAbierto.value = true;
}

function abrirEdicion(tipo: TipoProyectoFila) {
  tipoSeleccionado.value = tipo;
  modalAbierto.value = true;
}

async function alGuardar(payload: TipoProyectoForm, continuar: boolean) {
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
  <Page description="Evaluación / Tipos de proyecto" title="Tipos de proyecto">
    <Card :body-style="{ padding: 0 }" class="overflow-hidden rounded-xl">
      <template #title>
        <div class="flex items-center gap-2">
          <IconifyIcon class="size-5 text-primary" icon="lucide:shapes" />
          Tipos de proyecto
        </div>
      </template>

      <template #extra>
        <SemfaBarraCrud
          v-model:busqueda="busqueda"
          :cargando="crud.cargando.value"
          icono-agregar="lucide:plus"
          placeholder="Buscar tipo…"
          texto-agregar="Agregar tipo"
          @agregar="abrirRegistro"
          @recargar="crud.recargar"
        />
      </template>

      <div class="flex items-start gap-2 border-b border-border px-4 py-2.5 text-xs text-muted-foreground">
        <IconifyIcon class="mt-0.5 size-3.5 shrink-0" icon="lucide:info" />
        Raíz del modelo de evaluación por preguntas: Tipo de proyecto → Categoría
        criterio → Pregunta → Ponderación. El panel actual del jurado evalúa con
        Rúbrica y Rúbrica criterio.
      </div>

      <Table
        :columns="columnas"
        :data-source="filtrados"
        :loading="crud.cargando.value"
        :pagination="paginacion"
        :scroll="{ x: 640 }"
        class="semfa-tabla"
        row-key="idTipoProyecto"
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
                <IconifyIcon class="size-3.5" icon="lucide:shapes" />
              </span>
              <span class="truncate font-medium">{{ record.nombre }}</span>
            </div>
          </template>

          <template v-else-if="column.key === 'categoriasCriterio'">
            <span
              :class="record.categoriasCriterio === 0 ? 'text-amber-600' : 'font-medium'"
              class="tabular-nums"
            >
              {{ record.categoriasCriterio }}
            </span>
          </template>

          <template v-else-if="column.key === 'opciones'">
            <div class="flex justify-center gap-2">
              <Button
                class="semfa-btn semfa-btn--suave-primario"
                size="small"
                @click="abrirEdicion(record as TipoProyectoFila)"
              >
                <IconifyIcon class="size-3.5" icon="lucide:pencil" />
                Editar
              </Button>
              <Tooltip
                :title="
                  record.categoriasCriterio > 0
                    ? `Tiene ${record.categoriasCriterio} categoría(s) de criterio: elimínelas primero`
                    : ''
                "
              >
                <Button
                  :disabled="record.categoriasCriterio > 0"
                  class="semfa-btn semfa-btn--suave-peligro"
                  size="small"
                  @click="crud.eliminar(record as TipoProyectoFila, record.nombre ?? 'el registro')"
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
            <span v-if="busqueda.trim()">No se encontraron tipos para «{{ busqueda.trim() }}»</span>
            <span v-else>Aún no hay tipos de proyecto: agregue el primero para crear categorías de criterio</span>
          </div>
        </template>
      </Table>
    </Card>

    <TipoProyectoFormModal
      ref="modalRef"
      v-model:open="modalAbierto"
      :guardando="crud.guardando.value"
      :tipo="tipoSeleccionado"
      :tipos="crud.items.value"
      @guardar="alGuardar"
    />
  </Page>
</template>
