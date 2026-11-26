<script lang="ts" setup>
import type { ColumnsType } from 'ant-design-vue/es/table';

import type { Persona, PersonaForm } from '#/api/personas';

import { onMounted, ref } from 'vue';

import { Page } from '@vben/common-ui';
import { IconifyIcon } from '@vben/icons';

import { Button, Card, Table } from 'ant-design-vue';

import {
  actualizarPersona,
  crearPersona,
  eliminarPersona,
  listarPersonas,
} from '#/api/personas';
import SemfaAvatar from '#/components/semfa/semfa-avatar.vue';
import SemfaBarraCrud from '#/components/semfa/semfa-barra-crud.vue';
import { useCrud } from '#/composables/useCrud';
import { useTablaLocal } from '#/composables/useTablaLocal';
import { iniciales } from '#/utils/formato';

import PersonaFormModal from './form-modal.vue';

defineOptions({ name: 'SemfaPersona' });

const modalAbierto = ref(false);
const modalRef = ref<InstanceType<typeof PersonaFormModal>>();
const personaSeleccionada = ref<null | Persona>(null);

const crud = useCrud<Persona, PersonaForm>({
  guardar: (payload) => {
    // El id decide alta o edición y, en la edición, viaja en la ruta del PUT:
    // `PersonaRequest` no lo acepta en el cuerpo.
    const { idPersona, ...data } = payload;
    return idPersona === undefined
      ? crearPersona(data)
      : actualizarPersona(idPersona, data);
  },
  etiqueta: (p) => [p.nombres, p.paterno, p.materno].filter(Boolean).join(' '),
  idKey: 'idPersona',
  listar: listarPersonas,
  nombre: 'Persona',
  remover: eliminarPersona,
});

const { alCambiarTabla, busqueda, filtrados, numeroFila, paginacion } =
  useTablaLocal(crud.items, { camposBusqueda: ['ci', 'nombreCompleto'] });

function comparar(a: null | string, b: null | string) {
  return (a ?? '').localeCompare(b ?? '', 'es', { numeric: true });
}

/** Columnas de `tabla.html`: #, CI, Nombre Completo, Opciones. */
const columnas: ColumnsType<Persona> = [
  { align: 'center', key: '#', title: '#', width: 64 },
  {
    dataIndex: 'ci',
    key: 'ci',
    sorter: (a, b) => comparar(a.ci, b.ci),
    title: 'CI',
    width: 160,
  },
  {
    dataIndex: 'nombreCompleto',
    key: 'nombreCompleto',
    sorter: (a, b) => comparar(a.nombreCompleto, b.nombreCompleto),
    title: 'Nombre Completo',
  },
  { align: 'center', key: 'opciones', title: 'Opciones', width: 220 },
];

function abrirRegistro() {
  personaSeleccionada.value = null;
  modalAbierto.value = true;
}

function abrirEdicion(persona: Persona) {
  personaSeleccionada.value = persona;
  modalAbierto.value = true;
}

/**
 * Solo actúa si el backend confirmó el guardado: cierra el modal o, con
 * «Guardar y nuevo», lo deja abierto y vacío para el siguiente registro.
 */
async function alGuardar(payload: PersonaForm, continuar: boolean) {
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
  <Page description="Menú / Persona" title="Persona">
    <Card :body-style="{ padding: 0 }" class="overflow-hidden rounded-xl">
      <template #title>
        <div class="flex items-center gap-2">
          <IconifyIcon class="size-5 text-primary" icon="lucide:users" />
          Registro Persona
        </div>
      </template>

      <template #extra>
        <SemfaBarraCrud
          v-model:busqueda="busqueda"
          :cargando="crud.cargando.value"
          icono-agregar="lucide:user-plus"
          placeholder="Buscar por CI o nombre…"
          texto-agregar="Agregar Persona"
          @agregar="abrirRegistro"
          @recargar="crud.recargar"
        />
      </template>

      <Table
        :columns="columnas"
        :data-source="filtrados"
        :loading="crud.cargando.value"
        :pagination="paginacion"
        class="semfa-tabla"
        row-key="idPersona"
        :scroll="{ x: 560 }"
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
              <span>{{ record.nombreCompleto }}</span>
            </div>
          </template>

          <template v-else-if="column.key === 'opciones'">
            <div class="flex justify-center gap-2">
              <Button
                class="semfa-btn semfa-btn--suave-primario"
                size="small"
                @click="abrirEdicion(record as Persona)"
              >
                <IconifyIcon class="size-3.5" icon="lucide:pencil" />
                Editar
              </Button>
              <Button
                class="semfa-btn semfa-btn--suave-peligro"
                size="small"
                @click="crud.eliminar(record as Persona, record.nombreCompleto)"
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
              No se encontraron personas para «{{ busqueda.trim() }}»
            </span>
            <span v-else>Aún no hay personas registradas</span>
          </div>
        </template>
      </Table>
    </Card>

    <PersonaFormModal
      ref="modalRef"
      v-model:open="modalAbierto"
      :guardando="crud.guardando.value"
      :persona="personaSeleccionada"
      :personas="crud.items.value"
      @guardar="alGuardar"
    />
  </Page>
</template>
