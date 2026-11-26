<script lang="ts" setup>
import type { ColumnsType } from 'ant-design-vue/es/table';

import type { Proyecto, ProyectoForm, TipoProyectoGestion } from '#/api/proyectos';

import { onMounted, ref } from 'vue';

import { Page } from '@vben/common-ui';
import { IconifyIcon } from '@vben/icons';

import { Button, Card, message, Modal, Select, Table, Tag } from 'ant-design-vue';

import {
  abrirArchivoProyecto,
  actualizarProyecto,
  crearProyecto,
  eliminarProyecto,
  listarProyectosPorTipo,
  listarTiposProyectoGestion,
} from '#/api/proyectos';

import ProyectoFormModal from './form-modal.vue';

defineOptions({ name: 'SemfaProyecto' });

const tipos = ref<TipoProyectoGestion[]>([]);
const idTipo = ref<number | undefined>(undefined);
const proyectos = ref<Proyecto[]>([]);
const cargando = ref(false);
const guardando = ref(false);

const modalAbierto = ref(false);
const proyectoEditando = ref<null | Proyecto>(null);

const columnas: ColumnsType<Proyecto> = [
  { key: '#', title: '#', width: 60 },
  { dataIndex: 'nombreProyecto', key: 'nombreProyecto', title: 'Proyecto' },
  { dataIndex: 'nroStand', key: 'nroStand', title: 'Curso/Stand', width: 120 },
  { dataIndex: 'categoria', key: 'categoria', title: 'Categoría' },
  { dataIndex: 'programa', key: 'programa', title: 'Programa' },
  { key: 'jurados', title: 'Jurados', width: 220 },
  { key: 'opciones', title: 'OPCIONES', width: 240 },
];

async function cargarTipos() {
  cargando.value = true;
  try {
    tipos.value = await listarTiposProyectoGestion();
    const primero = tipos.value[0];
    if (primero) {
      await elegirTipo(primero.idTipoProyecto);
    }
  } finally {
    cargando.value = false;
  }
}

async function elegirTipo(id: number) {
  idTipo.value = id;
  cargando.value = true;
  try {
    proyectos.value = await listarProyectosPorTipo(id);
  } finally {
    cargando.value = false;
  }
}

function abrirNuevo() {
  proyectoEditando.value = null;
  modalAbierto.value = true;
}

function abrirEdicion(proyecto: Proyecto) {
  proyectoEditando.value = proyecto;
  modalAbierto.value = true;
}

function eliminar(proyecto: Proyecto) {
  Modal.confirm({
    cancelText: 'Cancelar',
    content: `¿Está seguro de eliminar el proyecto ${proyecto.nombreProyecto}?`,
    okButtonProps: { danger: true },
    okText: 'Eliminar',
    title: 'Eliminar proyecto',
    async onOk() {
      guardando.value = true;
      try {
        await eliminarProyecto(proyecto.idProyecto);
        message.success('Proyecto eliminado correctamente');
        if (idTipo.value) {
          await elegirTipo(idTipo.value);
        }
      } finally {
        guardando.value = false;
      }
    },
  });
}

async function alGuardar(payload: { archivo: File | null; datos: ProyectoForm }) {
  guardando.value = true;
  try {
    if (proyectoEditando.value) {
      await actualizarProyecto(
        proyectoEditando.value.idProyecto,
        payload.datos,
        payload.archivo,
      );
    } else {
      await crearProyecto(payload.datos, payload.archivo);
    }
    message.success('Proyecto guardado correctamente');
    modalAbierto.value = false;
    if (idTipo.value) {
      await elegirTipo(idTipo.value);
    }
  } catch {
    // El interceptor de errores ya notificó.
  } finally {
    guardando.value = false;
  }
}

onMounted(cargarTipos);
</script>

<template>
  <Page description="Registra proyectos por tipo de concurso, con respaldo PDF." title="Gestión de proyectos">
    <div class="flex flex-col gap-4">
      <Card>
        <div class="flex flex-wrap items-center gap-4">
          <div class="text-sm opacity-70">Tipo de proyecto</div>
          <Select
            :value="idTipo"
            class="min-w-64"
            :options="tipos.map((t) => ({ label: t.nombre, value: t.idTipoProyecto }))"
            placeholder="Selecciona un tipo de proyecto"
            @change="(valor: unknown) => elegirTipo(Number(valor))"
          />
          <Button type="primary" @click="abrirNuevo">
            <IconifyIcon icon="lucide:plus" />
            Nuevo proyecto
          </Button>
        </div>
      </Card>

      <Card :body-style="{ padding: 0 }">
        <Table
          :columns="columnas"
          :data-source="proyectos"
          :loading="cargando"
          :pagination="false"
          row-key="idProyecto"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === '#'">
              {{ (proyectos ?? []).indexOf(record as Proyecto) + 1 }}
            </template>

            <template v-else-if="column.key === 'nroStand'">
              <span>{{ record.nroStand || '—' }}</span>
            </template>

            <template v-else-if="column.key === 'categoria'">
              <span>{{ record.categoria || '—' }}</span>
            </template>

            <template v-else-if="column.key === 'programa'">
              <span>{{ record.programa || '—' }}</span>
            </template>

            <template v-else-if="column.key === 'jurados'">
              <span v-if="record.jurados.length === 0" class="text-gray-400">—</span>
              <div v-else class="flex flex-wrap gap-1">
                <Tag v-for="jurado in record.jurados.slice(0, 3)" :key="jurado.id">
                  {{ jurado.nombre }}
                </Tag>
                <Tag v-if="record.jurados.length > 3" color="blue">
                  +{{ record.jurados.length - 3 }}
                </Tag>
              </div>
            </template>

            <template v-else-if="column.key === 'opciones'">
              <div class="flex gap-2">
                <Button
                  v-if="record.nombreArchivo"
                  size="small"
                  type="primary"
                  @click="abrirArchivoProyecto(record.idProyecto)"
                >
                  <IconifyIcon icon="lucide:file-text" />
                  Ver PDF
                </Button>
                <Button
                  size="small"
                  type="primary"
                  @click="abrirEdicion(record as Proyecto)"
                >
                  <IconifyIcon icon="lucide:pencil" />
                  Editar
                </Button>
                <Button
                  danger
                  size="small"
                  type="primary"
                  @click="eliminar(record as Proyecto)"
                >
                  <IconifyIcon icon="lucide:trash-2" />
                  Eliminar
                </Button>
              </div>
            </template>
          </template>
        </Table>
      </Card>
    </div>

    <ProyectoFormModal
      v-model:open="modalAbierto"
      :proyecto="proyectoEditando"
      :guardando="guardando"
      @guardar="alGuardar"
    />
  </Page>
</template>
