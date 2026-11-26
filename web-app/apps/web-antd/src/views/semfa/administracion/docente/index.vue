<script lang="ts" setup>
import type { ColumnsType } from 'ant-design-vue/es/table';

import type { Docente, DocenteForm } from '#/api/docentes';

import { onMounted, ref } from 'vue';

import { Page } from '@vben/common-ui';
import { IconifyIcon } from '@vben/icons';

import { Button, Card, Table, Tooltip } from 'ant-design-vue';

import {
  actualizarDocente,
  crearDocente,
  eliminarDocente,
  listarDocentes,
} from '#/api/docentes';
import SemfaAvatar from '#/components/semfa/semfa-avatar.vue';
import SemfaBarraCrud from '#/components/semfa/semfa-barra-crud.vue';
import { useCrud } from '#/composables/useCrud';
import { useTablaLocal } from '#/composables/useTablaLocal';
import { iniciales } from '#/utils/formato';
import { edadDesde } from '#/utils/validacion';

import DocenteFormModal from './form-modal.vue';

defineOptions({ name: 'SemfaDocente' });

const modalAbierto = ref(false);
const modalRef = ref<InstanceType<typeof DocenteFormModal>>();
const docenteSeleccionado = ref<Docente | null>(null);

const crud = useCrud<Docente, DocenteForm>({
  etiqueta: ({ persona: p }) =>
    [p.nombres, p.paterno, p.materno].filter(Boolean).join(' '),
  guardar: (payload) => {
    // En la edición el id del docente va en la ruta del PUT. En un alta,
    // `idPersona` pide reutilizar una persona existente en vez de crear otra.
    const { idDocente, ...data } = payload;
    return idDocente === undefined
      ? crearDocente(data)
      : actualizarDocente(idDocente, data);
  },
  idKey: 'idDocente',
  listar: listarDocentes,
  nombre: 'Docente',
  remover: eliminarDocente,
});

const { alCambiarTabla, busqueda, filtrados, numeroFila, paginacion } =
  useTablaLocal(crud.items, {
    camposBusqueda: ['ci', 'nombreCompleto', 'email'],
  });

function comparar(a: null | string, b: null | string) {
  return (a ?? '').localeCompare(b ?? '', 'es', { numeric: true });
}

/** Columnas de `Tabla_Docentes` (#, Docente) más CI, correo y edad. */
const columnas: ColumnsType<Docente> = [
  { align: 'center', key: '#', title: '#', width: 64 },
  {
    dataIndex: 'ci',
    key: 'ci',
    sorter: (a, b) => comparar(a.ci, b.ci),
    title: 'CI',
    width: 130,
  },
  {
    dataIndex: 'nombreCompleto',
    key: 'nombreCompleto',
    sorter: (a, b) => comparar(a.nombreCompleto, b.nombreCompleto),
    title: 'Docente',
  },
  {
    dataIndex: 'email',
    ellipsis: true,
    key: 'email',
    sorter: (a, b) => comparar(a.email, b.email),
    title: 'Correo',
    width: 240,
  },
  {
    align: 'center',
    key: 'edad',
    sorter: (a, b) => (edadDesde(a.fecNacimiento) ?? 0) - (edadDesde(b.fecNacimiento) ?? 0),
    title: 'Edad',
    width: 90,
  },
  { align: 'center', key: 'opciones', title: 'Opciones', width: 220 },
];

function abrirRegistro() {
  docenteSeleccionado.value = null;
  modalAbierto.value = true;
}

function abrirEdicion(docente: Docente) {
  docenteSeleccionado.value = docente;
  modalAbierto.value = true;
}

/**
 * Solo actúa si el backend confirmó el guardado: cierra el modal o, con
 * «Guardar y nuevo», lo deja abierto y vacío para el siguiente docente.
 */
async function alGuardar(payload: DocenteForm, continuar: boolean) {
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
  <Page description="Personas / Docentes" title="Docentes">
    <Card :body-style="{ padding: 0 }" class="overflow-hidden rounded-xl">
      <template #title>
        <div class="flex items-center gap-2">
          <IconifyIcon class="size-5 text-primary" icon="lucide:presentation" />
          Registro Docente
        </div>
      </template>

      <template #extra>
        <SemfaBarraCrud
          v-model:busqueda="busqueda"
          :cargando="crud.cargando.value"
          icono-agregar="lucide:user-plus"
          placeholder="Buscar por CI, nombre o correo…"
          texto-agregar="Agregar Docente"
          @agregar="abrirRegistro"
          @recargar="crud.recargar"
        />
      </template>

      <Table
        :columns="columnas"
        :data-source="filtrados"
        :loading="crud.cargando.value"
        :pagination="paginacion"
        :scroll="{ x: 900 }"
        class="semfa-tabla"
        row-key="idDocente"
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

          <template v-else-if="column.key === 'nombreCompleto'">
            <div class="flex items-center gap-2">
              <SemfaAvatar
                :texto="iniciales(record.nombres, record.paterno, record.materno)"
              />
              <span class="truncate">{{ record.nombreCompleto ?? '—' }}</span>
            </div>
          </template>

          <template v-else-if="column.key === 'email'">
            <Tooltip v-if="record.email" :title="record.email" placement="topLeft">
              <span class="text-muted-foreground">{{ record.email }}</span>
            </Tooltip>
            <span v-else class="text-muted-foreground">—</span>
          </template>

          <template v-else-if="column.key === 'edad'">
            <span class="tabular-nums text-muted-foreground">
              {{ edadDesde(record.fecNacimiento) ?? '—' }}
            </span>
          </template>

          <template v-else-if="column.key === 'opciones'">
            <div class="flex justify-center gap-2">
              <Button
                class="semfa-btn semfa-btn--suave-primario"
                size="small"
                @click="abrirEdicion(record as Docente)"
              >
                <IconifyIcon class="size-3.5" icon="lucide:pencil" />
                Editar
              </Button>
              <Button
                class="semfa-btn semfa-btn--suave-peligro"
                size="small"
                @click="
                  crud.eliminar(
                    record as Docente,
                    record.nombreCompleto ?? 'el registro',
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
              No se encontraron docentes para «{{ busqueda.trim() }}»
            </span>
            <span v-else>Aún no hay docentes registrados</span>
          </div>
        </template>
      </Table>
    </Card>

    <DocenteFormModal
      ref="modalRef"
      v-model:open="modalAbierto"
      :docente="docenteSeleccionado"
      :docentes="crud.items.value"
      :guardando="crud.guardando.value"
      @guardar="alGuardar"
    />
  </Page>
</template>
