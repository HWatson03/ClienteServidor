<script lang="ts" setup>
import type { ColumnsType } from 'ant-design-vue/es/table';

import type { Participante } from '#/api/participantes';
import type {
  TipoParticipante,
  TipoParticipanteForm,
} from '#/api/tipos-participante';

import { computed, onMounted, ref, shallowRef } from 'vue';

import { Page } from '@vben/common-ui';
import { IconifyIcon } from '@vben/icons';

import { Button, Card, Table, Tooltip } from 'ant-design-vue';

import { listarParticipantes } from '#/api/participantes';
import {
  actualizarTipoParticipante,
  crearTipoParticipante,
  eliminarTipoParticipante,
  listarTiposParticipante,
} from '#/api/tipos-participante';
import SemfaBarraCrud from '#/components/semfa/semfa-barra-crud.vue';
import { useCrud } from '#/composables/useCrud';
import { useTablaLocal } from '#/composables/useTablaLocal';

import TipoParticipanteFormModal from './form-modal.vue';

defineOptions({ name: 'SemfaTipoParticipante' });

const modalAbierto = ref(false);
const modalRef = ref<InstanceType<typeof TipoParticipanteFormModal>>();
const tipoSeleccionado = ref<null | TipoParticipante>(null);

/** Para contar cuántos proyectos usan cada tipo. */
const participantes = shallowRef<Participante[]>([]);

const crud = useCrud<TipoParticipante, TipoParticipanteForm>({
  etiqueta: (p) => p.nombre,
  guardar: (payload) => {
    const { idTipoParticipante, ...data } = payload;
    return idTipoParticipante === undefined
      ? crearTipoParticipante(data)
      : actualizarTipoParticipante(idTipoParticipante, data);
  },
  idKey: 'idTipoParticipante',
  listar: async () => {
    const [tipos, lista] = await Promise.all([
      listarTiposParticipante(),
      listarParticipantes().catch(() => [] as Participante[]),
    ]);
    participantes.value = lista ?? [];
    return tipos;
  },
  nombre: 'Tipo de participante',
  remover: eliminarTipoParticipante,
});

const filas = computed(() =>
  crud.items.value.map((t) => ({
    ...t,
    proyectos: participantes.value.filter(
      (p) => p.idTipoParticipante === t.idTipoParticipante,
    ).length,
  })),
);

type Fila = (typeof filas.value)[number];

const { alCambiarTabla, busqueda, filtrados, numeroFila, paginacion } =
  useTablaLocal(filas, { camposBusqueda: ['nombre', 'descripcion'] });

function comparar(a: null | string, b: null | string) {
  return (a ?? '').localeCompare(b ?? '', 'es', { numeric: true });
}

/** Columnas de `tabla.html` (Nombre, Descripción) más cuántos proyectos lo usan. */
const columnas: ColumnsType<Fila> = [
  { align: 'center', key: '#', title: '#', width: 64 },
  {
    dataIndex: 'nombre',
    key: 'nombre',
    sorter: (a, b) => comparar(a.nombre, b.nombre),
    title: 'Tipo',
    width: 260,
  },
  {
    dataIndex: 'descripcion',
    ellipsis: true,
    key: 'descripcion',
    title: 'Descripción',
  },
  {
    align: 'center',
    dataIndex: 'proyectos',
    key: 'proyectos',
    sorter: (a, b) => a.proyectos - b.proyectos,
    title: 'Proyectos',
    width: 110,
  },
  { align: 'center', key: 'opciones', title: 'Opciones', width: 220 },
];

function abrirRegistro() {
  tipoSeleccionado.value = null;
  modalAbierto.value = true;
}

function abrirEdicion(tipo: TipoParticipante) {
  tipoSeleccionado.value = tipo;
  modalAbierto.value = true;
}

const proyectosDelSeleccionado = computed(
  () =>
    filas.value.find(
      (f) => f.idTipoParticipante === tipoSeleccionado.value?.idTipoParticipante,
    )?.proyectos ?? 0,
);

async function alGuardar(payload: TipoParticipanteForm, continuar: boolean) {
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
  <Page description="Complementos / Tipo participante" title="Tipos de participante">
    <Card :body-style="{ padding: 0 }" class="overflow-hidden rounded-xl">
      <template #title>
        <div class="flex items-center gap-2">
          <IconifyIcon class="size-5 text-primary" icon="lucide:tags" />
          Tipos de participante
        </div>
      </template>

      <template #extra>
        <SemfaBarraCrud
          v-model:busqueda="busqueda"
          :cargando="crud.cargando.value"
          icono-agregar="lucide:plus"
          placeholder="Buscar por nombre o descripción…"
          texto-agregar="Agregar tipo"
          @agregar="abrirRegistro"
          @recargar="crud.recargar"
        />
      </template>

      <Table
        :columns="columnas"
        :data-source="filtrados"
        :loading="crud.cargando.value"
        :pagination="paginacion"
        :scroll="{ x: 760 }"
        class="semfa-tabla"
        row-key="idTipoParticipante"
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
            <div class="flex items-center gap-2">
              <span
                class="flex size-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary"
              >
                <IconifyIcon class="size-3.5" icon="lucide:tag" />
              </span>
              <span class="truncate font-medium">{{ record.nombre }}</span>
            </div>
          </template>

          <template v-else-if="column.key === 'descripcion'">
            <Tooltip v-if="record.descripcion" :title="record.descripcion" placement="topLeft">
              <span class="text-muted-foreground">{{ record.descripcion }}</span>
            </Tooltip>
            <span v-else class="text-muted-foreground">—</span>
          </template>

          <template v-else-if="column.key === 'proyectos'">
            <span
              :class="record.proyectos === 0 ? 'text-muted-foreground' : 'font-medium'"
              class="tabular-nums"
            >
              {{ record.proyectos }}
            </span>
          </template>

          <template v-else-if="column.key === 'opciones'">
            <div class="flex justify-center gap-2">
              <Button
                class="semfa-btn semfa-btn--suave-primario"
                size="small"
                @click="abrirEdicion(record as TipoParticipante)"
              >
                <IconifyIcon class="size-3.5" icon="lucide:pencil" />
                Editar
              </Button>
              <!-- El backend no deja eliminar un tipo en uso (409) -->
              <Tooltip
                :title="
                  record.proyectos > 0
                    ? `Lo usan ${record.proyectos} proyecto(s): cámbieles el tipo primero`
                    : ''
                "
              >
                <Button
                  :disabled="record.proyectos > 0"
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
            <span v-if="busqueda.trim()">
              No se encontraron tipos para «{{ busqueda.trim() }}»
            </span>
            <span v-else>Aún no hay tipos de participante</span>
          </div>
        </template>
      </Table>
    </Card>

    <TipoParticipanteFormModal
      ref="modalRef"
      v-model:open="modalAbierto"
      :guardando="crud.guardando.value"
      :proyectos-que-lo-usan="proyectosDelSeleccionado"
      :tipo-participante="tipoSeleccionado"
      :tipos="crud.items.value"
      @guardar="alGuardar"
    />
  </Page>
</template>
