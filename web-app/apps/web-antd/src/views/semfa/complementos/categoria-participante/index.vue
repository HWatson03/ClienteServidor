<script lang="ts" setup>
import type { ColumnsType } from 'ant-design-vue/es/table';

import type {
  CategoriaParticipante,
  CategoriaParticipanteForm,
} from '#/api/categorias-participante';
import type { Participante } from '#/api/participantes';

import { computed, onMounted, ref, shallowRef } from 'vue';

import { Page } from '@vben/common-ui';
import { IconifyIcon } from '@vben/icons';

import { Button, Card, Table, Tooltip } from 'ant-design-vue';

import {
  actualizarCategoriaParticipante,
  crearCategoriaParticipante,
  eliminarCategoriaParticipante,
  listarCategoriasParticipante,
} from '#/api/categorias-participante';
import { listarParticipantes } from '#/api/participantes';
import SemfaBarraCrud from '#/components/semfa/semfa-barra-crud.vue';
import { useCrud } from '#/composables/useCrud';
import { useTablaLocal } from '#/composables/useTablaLocal';

import CategoriaParticipanteFormModal from './form-modal.vue';

defineOptions({ name: 'SemfaCategoriaParticipante' });

const modalAbierto = ref(false);
const modalRef = ref<InstanceType<typeof CategoriaParticipanteFormModal>>();
const categoriaSeleccionada = ref<CategoriaParticipante | null>(null);

/** Para contar cuántos proyectos usan cada categoría. */
const participantes = shallowRef<Participante[]>([]);

const crud = useCrud<CategoriaParticipante, CategoriaParticipanteForm>({
  etiqueta: (p) => p.nombre,
  guardar: (payload) => {
    const { idCategoriaParticiapnte, ...data } = payload;
    return idCategoriaParticiapnte === undefined
      ? crearCategoriaParticipante(data)
      : actualizarCategoriaParticipante(idCategoriaParticiapnte, data);
  },
  idKey: 'idCategoriaParticiapnte',
  listar: async () => {
    const [categorias, lista] = await Promise.all([
      listarCategoriasParticipante(),
      listarParticipantes().catch(() => [] as Participante[]),
    ]);
    participantes.value = lista ?? [];
    return categorias;
  },
  nombre: 'Categoría de participante',
  remover: eliminarCategoriaParticipante,
});

const filas = computed(() =>
  crud.items.value.map((c) => ({
    ...c,
    proyectos: participantes.value.filter(
      (p) => p.idCategoriaParticiapnte === c.idCategoriaParticiapnte,
    ).length,
  })),
);

type Fila = (typeof filas.value)[number];

const { alCambiarTabla, busqueda, filtrados, numeroFila, paginacion } =
  useTablaLocal(filas, { camposBusqueda: ['nombre', 'descripcion'] });

function comparar(a: null | string, b: null | string) {
  return (a ?? '').localeCompare(b ?? '', 'es', { numeric: true });
}

/** Columnas de `tabla.html` (Nombre, Descripción) más cuántos proyectos la usan. */
const columnas: ColumnsType<Fila> = [
  { align: 'center', key: '#', title: '#', width: 64 },
  {
    dataIndex: 'nombre',
    key: 'nombre',
    sorter: (a, b) => comparar(a.nombre, b.nombre),
    title: 'Categoría',
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
  categoriaSeleccionada.value = null;
  modalAbierto.value = true;
}

function abrirEdicion(categoria: CategoriaParticipante) {
  categoriaSeleccionada.value = categoria;
  modalAbierto.value = true;
}

const proyectosDelSeleccionado = computed(
  () =>
    filas.value.find(
      (f) =>
        f.idCategoriaParticiapnte ===
        categoriaSeleccionada.value?.idCategoriaParticiapnte,
    )?.proyectos ?? 0,
);

async function alGuardar(payload: CategoriaParticipanteForm, continuar: boolean) {
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
  <Page
    description="Complementos / Categoría participante"
    title="Categorías de participante"
  >
    <Card :body-style="{ padding: 0 }" class="overflow-hidden rounded-xl">
      <template #title>
        <div class="flex items-center gap-2">
          <IconifyIcon class="size-5 text-primary" icon="lucide:shapes" />
          Categorías de participante
        </div>
      </template>

      <template #extra>
        <SemfaBarraCrud
          v-model:busqueda="busqueda"
          :cargando="crud.cargando.value"
          icono-agregar="lucide:plus"
          placeholder="Buscar por nombre o descripción…"
          texto-agregar="Agregar categoría"
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
        row-key="idCategoriaParticiapnte"
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
                <IconifyIcon class="size-3.5" icon="lucide:shapes" />
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
                @click="abrirEdicion(record as CategoriaParticipante)"
              >
                <IconifyIcon class="size-3.5" icon="lucide:pencil" />
                Editar
              </Button>
              <!-- El backend no deja eliminar una categoría en uso (409) -->
              <Tooltip
                :title="
                  record.proyectos > 0
                    ? `La usan ${record.proyectos} proyecto(s): cámbieles la categoría primero`
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
              No se encontraron categorías para «{{ busqueda.trim() }}»
            </span>
            <span v-else>Aún no hay categorías de participante</span>
          </div>
        </template>
      </Table>
    </Card>

    <CategoriaParticipanteFormModal
      ref="modalRef"
      v-model:open="modalAbierto"
      :categoria="categoriaSeleccionada"
      :categorias="crud.items.value"
      :guardando="crud.guardando.value"
      :proyectos-que-la-usan="proyectosDelSeleccionado"
      @guardar="alGuardar"
    />
  </Page>
</template>
