<script lang="ts" setup>
import type { ColumnsType } from 'ant-design-vue/es/table';

import type { Estudiante, EstudianteForm } from '#/api/estudiantes';

import { onMounted, ref } from 'vue';

import { Page } from '@vben/common-ui';
import { IconifyIcon } from '@vben/icons';

import { Button, Card, Table, Tooltip } from 'ant-design-vue';

import {
  actualizarEstudiante,
  crearEstudiante,
  eliminarEstudiante,
  listarEstudiantes,
} from '#/api/estudiantes';
import SemfaAvatar from '#/components/semfa/semfa-avatar.vue';
import SemfaBarraCrud from '#/components/semfa/semfa-barra-crud.vue';
import { useCrud } from '#/composables/useCrud';
import { useTablaLocal } from '#/composables/useTablaLocal';
import { inicialesDeNombre, limpiarEspacios } from '#/utils/formato';

import EstudianteFormModal from './form-modal.vue';

defineOptions({ name: 'SemfaEstudiante' });

const modalAbierto = ref(false);
const modalRef = ref<InstanceType<typeof EstudianteFormModal>>();
const estudianteSeleccionado = ref<Estudiante | null>(null);

const crud = useCrud<Estudiante, EstudianteForm>({
  guardar: (payload) =>
    payload.idEstudiante === undefined
      ? crearEstudiante(payload)
      : actualizarEstudiante(payload.idEstudiante, payload),
  idKey: 'idEstudiante',
  listar: listarEstudiantes,
  nombre: 'Estudiante',
  remover: eliminarEstudiante,
});

const { alCambiarTabla, busqueda, filtrados, numeroFila, paginacion } =
  useTablaLocal(crud.items, {
    camposBusqueda: ['ci', 'nombrePersona', 'proyecto', 'institucion'],
  });

function comparar(a: null | string, b: null | string) {
  return (a ?? '').localeCompare(b ?? '', 'es', { numeric: true });
}

/** Columnas de `tabla.html` (#, Persona, proyecto), con CI e institución aparte. */
const columnas: ColumnsType<Estudiante> = [
  { align: 'center', key: '#', title: '#', width: 64 },
  {
    dataIndex: 'ci',
    key: 'ci',
    sorter: (a, b) => comparar(a.ci, b.ci),
    title: 'CI',
    width: 130,
  },
  {
    dataIndex: 'nombrePersona',
    key: 'nombrePersona',
    sorter: (a, b) => comparar(a.nombrePersona, b.nombrePersona),
    title: 'Estudiante',
    width: 260,
  },
  {
    dataIndex: 'proyecto',
    ellipsis: true,
    key: 'proyecto',
    sorter: (a, b) => comparar(a.proyecto, b.proyecto),
    title: 'Proyecto',
  },
  {
    dataIndex: 'institucion',
    ellipsis: true,
    key: 'institucion',
    sorter: (a, b) => comparar(a.institucion, b.institucion),
    title: 'Institución',
    width: 220,
  },
  { align: 'center', key: 'opciones', title: 'Opciones', width: 220 },
];

function abrirRegistro() {
  estudianteSeleccionado.value = null;
  modalAbierto.value = true;
}

function abrirEdicion(estudiante: Estudiante) {
  estudianteSeleccionado.value = estudiante;
  modalAbierto.value = true;
}

/**
 * Solo actúa si el backend confirmó el guardado: cierra el modal o, con
 * «Guardar y nuevo», lo deja abierto para el siguiente estudiante.
 */
async function alGuardar(payload: EstudianteForm, continuar: boolean) {
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
  <Page description="Menú / Estudiante" title="Estudiante">
    <Card :body-style="{ padding: 0 }" class="overflow-hidden rounded-xl">
      <template #title>
        <div class="flex items-center gap-2">
          <IconifyIcon class="size-5 text-primary" icon="lucide:graduation-cap" />
          Registro Estudiante
        </div>
      </template>

      <template #extra>
        <SemfaBarraCrud
          v-model:busqueda="busqueda"
          :cargando="crud.cargando.value"
          icono-agregar="lucide:user-plus"
          placeholder="Buscar por CI, nombre o proyecto…"
          texto-agregar="Agregar Estudiante"
          @agregar="abrirRegistro"
          @recargar="crud.recargar"
        />
      </template>

      <Table
        :columns="columnas"
        :data-source="filtrados"
        :loading="crud.cargando.value"
        :pagination="paginacion"
        :scroll="{ x: 960 }"
        class="semfa-tabla"
        row-key="idEstudiante"
        size="middle"
        @change="alCambiarTabla"
      >
        <template #bodyCell="{ column, record, index }">
          <template v-if="column.key === '#'">
            <span class="tabular-nums text-muted-foreground">
              {{ numeroFila(index) }}
            </span>
          </template>

          <template v-else-if="column.key === 'ci'">
            <span class="font-medium tabular-nums">{{ record.ci ?? '—' }}</span>
          </template>

          <template v-else-if="column.key === 'nombrePersona'">
            <div class="flex items-center gap-2">
              <SemfaAvatar :texto="inicialesDeNombre(record.nombrePersona)" />
              <span class="truncate">{{ record.nombrePersona ?? '—' }}</span>
            </div>
          </template>

          <!-- Los nombres de proyecto son largos: una línea y el texto completo al pasar el ratón -->
          <template v-else-if="column.key === 'proyecto'">
            <Tooltip :title="limpiarEspacios(record.proyecto)" placement="topLeft">
              <span>{{ limpiarEspacios(record.proyecto) || '—' }}</span>
            </Tooltip>
          </template>

          <template v-else-if="column.key === 'institucion'">
            <Tooltip :title="record.institucion" placement="topLeft">
              <span class="text-muted-foreground">
                {{ limpiarEspacios(record.institucion) || '—' }}
              </span>
            </Tooltip>
          </template>

          <template v-else-if="column.key === 'opciones'">
            <div class="flex justify-center gap-2">
              <Button
                class="semfa-btn semfa-btn--suave-primario"
                size="small"
                @click="abrirEdicion(record as Estudiante)"
              >
                <IconifyIcon class="size-3.5" icon="lucide:pencil" />
                Editar
              </Button>
              <Button
                class="semfa-btn semfa-btn--suave-peligro"
                size="small"
                @click="
                  crud.eliminar(
                    record as Estudiante,
                    record.nombrePersona ?? 'el registro',
                  )
                "
              >
                <IconifyIcon class="size-3.5" icon="lucide:trash-2" />
                Eliminar
              </Button>
            </div>
          </template>
        </template>

        <template #emptyText>
          <div class="flex flex-col items-center gap-2 py-8 text-muted-foreground">
            <IconifyIcon class="size-10 opacity-60" icon="lucide:search-x" />
            <span v-if="busqueda.trim()">
              No se encontraron estudiantes para «{{ busqueda.trim() }}»
            </span>
            <span v-else>Aún no hay estudiantes registrados</span>
          </div>
        </template>
      </Table>
    </Card>

    <EstudianteFormModal
      ref="modalRef"
      v-model:open="modalAbierto"
      :estudiante="estudianteSeleccionado"
      :estudiantes="crud.items.value"
      :guardando="crud.guardando.value"
      @guardar="alGuardar"
      @persona-actualizada="crud.recargar"
    />
  </Page>
</template>
