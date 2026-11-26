<script lang="ts" setup>
import type { ColumnsType } from 'ant-design-vue/es/table';

import type {
  JuradoAsignacion,
  JuradoAsignacionForm,
} from '#/api/jurado-asignaciones';

import { computed, onMounted, ref } from 'vue';

import { Page } from '@vben/common-ui';
import { IconifyIcon } from '@vben/icons';

import { Button, Card, Select, Table } from 'ant-design-vue';

import {
  actualizarJuradoAsignacion,
  crearJuradoAsignacion,
  eliminarJuradoAsignacion,
  listarJuradoAsignaciones,
} from '#/api/jurado-asignaciones';
import SemfaAvatar from '#/components/semfa/semfa-avatar.vue';
import SemfaBarraCrud from '#/components/semfa/semfa-barra-crud.vue';
import { useActividadTrabajo } from '#/composables/useActividadTrabajo';
import {
  avisar,
  describirError,
  sinAvisosDeError,
} from '#/composables/useAvisos';
import { useCrud } from '#/composables/useCrud';
import { useTablaLocal } from '#/composables/useTablaLocal';
import {
  inicialesDeNombre,
  limpiarEspacios,
  nombrePropio,
} from '#/utils/formato';

import JuradoAsignacionFormModal from './form-modal.vue';

defineOptions({ name: 'SemfaJuradoAsignacion' });

const { deLaActividad, idActividad, nombreActividad } = useActividadTrabajo();

const modalAbierto = ref(false);
const modalRef = ref<InstanceType<typeof JuradoAsignacionFormModal>>();
const asignacionSeleccionada = ref<JuradoAsignacion | null>(null);

/** Solo para la edición: las altas van en lote desde `alGuardar`. */
const crud = useCrud<JuradoAsignacion, JuradoAsignacionForm>({
  guardar: (payload) =>
    actualizarJuradoAsignacion(
      asignacionSeleccionada.value!.idJuradoAsignacion,
      payload,
    ),
  idKey: 'idJuradoAsignacion',
  listar: listarJuradoAsignaciones,
  nombre: 'Asignación',
  remover: eliminarJuradoAsignacion,
});

// ---------------------------------------------------------------- filtro por categoría

/** Valor del filtro «actividad completa» (asignaciones sin categoría). */
const SIN_CATEGORIA = -1;

const filtroCategoria = ref<number>();

/** Solo las asignaciones de la actividad de trabajo (barra superior). */
const base = computed(() => deLaActividad(crud.items.value, (a) => a.idActividad));

const opcionesFiltro = computed(() => {
  const conteo = new Map<number, { etiqueta: string; total: number }>();
  for (const a of base.value) {
    const clave = a.idCategoriaActividad ?? SIN_CATEGORIA;
    const etiqueta =
      clave === SIN_CATEGORIA
        ? 'Toda la actividad'
        : nombrePropio(a.categoriaActividad);
    conteo.set(clave, {
      etiqueta,
      total: (conteo.get(clave)?.total ?? 0) + 1,
    });
  }
  return [...conteo.entries()]
    .sort(([, a], [, b]) => a.etiqueta.localeCompare(b.etiqueta, 'es'))
    .map(([value, { etiqueta, total }]) => ({
      label: `${etiqueta} (${total})`,
      value,
    }));
});

const filasFiltradas = computed(() =>
  filtroCategoria.value === undefined
    ? base.value
    : base.value.filter(
        (a) => (a.idCategoriaActividad ?? SIN_CATEGORIA) === filtroCategoria.value,
      ),
);

const { alCambiarTabla, busqueda, filtrados, numeroFila, paginacion } =
  useTablaLocal(filasFiltradas, {
    camposBusqueda: ['jurado', 'actividad', 'categoriaActividad'],
  });

// ---------------------------------------------------------------- columnas

function comparar(a: null | string, b: null | string) {
  return (a ?? '').localeCompare(b ?? '', 'es', { numeric: true });
}

/**
 * El legacy agrupaba la actividad y la categoría en una columna «Referencia»
 * única, con dos badges superpuestos cuando venían las dos. Aquí van separadas
 * porque las dos relaciones son independientes.
 */
const columnas: ColumnsType<JuradoAsignacion> = [
  { align: 'center', key: '#', title: '#', width: 64 },
  {
    dataIndex: 'jurado',
    key: 'jurado',
    sorter: (a, b) => comparar(a.jurado, b.jurado),
    title: 'Jurado',
    width: 280,
  },
  {
    dataIndex: 'categoriaActividad',
    key: 'categoriaActividad',
    sorter: (a, b) => comparar(a.categoriaActividad, b.categoriaActividad),
    title: 'Categoría',
  },
  { align: 'center', key: 'opciones', title: 'Opciones', width: 220 },
];

// ---------------------------------------------------------------- acciones

function abrirRegistro() {
  asignacionSeleccionada.value = null;
  modalAbierto.value = true;
}

function abrirEdicion(asignacion: JuradoAsignacion) {
  asignacionSeleccionada.value = asignacion;
  modalAbierto.value = true;
}

/**
 * Edición: una sola asignación por `useCrud`. Alta: una petición por pareja
 * jurado × categoría, en orden; las que fallan ya las notifica el interceptor
 * y no detienen al resto.
 */
async function alGuardar(asignaciones: JuradoAsignacionForm[], continuar: boolean) {
  if (asignacionSeleccionada.value) {
    if (await crud.guardar(asignaciones[0]!, { esEdicion: true })) {
      modalAbierto.value = false;
    }
    return;
  }

  // Un único aviso con el resumen, en lugar de uno por cada petición fallida.
  crud.guardando.value = true;
  let creadas = 0;
  const motivos = new Map<string, number>();
  try {
    await sinAvisosDeError(async () => {
      for (const asignacion of asignaciones) {
        try {
          await crearJuradoAsignacion(asignacion);
          creadas += 1;
        } catch (error) {
          const { mensaje, titulo } = describirError(error);
          const motivo = mensaje || titulo;
          motivos.set(motivo, (motivos.get(motivo) ?? 0) + 1);
        }
      }
    });
    await crud.recargar();
  } finally {
    crud.guardando.value = false;
  }

  const total = asignaciones.length;
  const detalles = [...motivos].map(([m, n]) => (n > 1 ? `${m} (${n})` : m));
  if (creadas === 0) {
    avisar({
      detalles,
      mensaje: `Ninguna de las ${total === 1 ? '' : `${total} `}asignaciones se pudo guardar.`,
      tipo: 'error',
      titulo: 'No se guardaron las asignaciones',
    });
    return;
  }
  avisar(
    creadas === total
      ? {
          mensaje:
            creadas === 1
              ? 'La asignación se registró correctamente.'
              : `Las ${creadas} asignaciones se registraron correctamente.`,
          tipo: 'exito',
          titulo: 'Jurados asignados',
        }
      : {
          detalles,
          mensaje: `Se guardaron ${creadas} de ${total}; las demás fallaron.`,
          tipo: 'advertencia',
          titulo: 'Asignación parcial',
        },
  );
  if (continuar) {
    modalRef.value?.reiniciar(creadas);
  } else {
    modalAbierto.value = false;
  }
}

onMounted(crud.recargar);
</script>

<template>
  <Page
    description="Menú / Asignación de jurados"
    title="Asignación de jurados"
  >
    <Card :body-style="{ padding: 0 }" class="overflow-hidden rounded-xl">
      <template #title>
        <div class="flex items-center gap-2">
          <IconifyIcon class="size-5 text-primary" icon="lucide:user-round-check" />
          Asignación de jurados
          <span v-if="nombreActividad" class="text-sm font-normal text-muted-foreground">· {{ nombreActividad }}</span>
        </div>
      </template>

      <template #extra>
        <SemfaBarraCrud
          v-model:busqueda="busqueda"
          :cargando="crud.cargando.value"
          icono-agregar="lucide:user-round-plus"
          placeholder="Buscar jurado o categoría…"
          texto-agregar="Asignar jurados"
          @agregar="abrirRegistro"
          @recargar="crud.recargar"
        >
          <template #filtros>
            <Select
              v-model:value="filtroCategoria"
              :options="opcionesFiltro"
              allow-clear
              class="hidden w-56 lg:block"
              placeholder="Todas las categorías"
            />
          </template>
        </SemfaBarraCrud>
      </template>

      <Table
        :columns="columnas"
        :data-source="filtrados"
        :loading="crud.cargando.value"
        :pagination="paginacion"
        :scroll="{ x: 900 }"
        class="semfa-tabla"
        row-key="idJuradoAsignacion"
        size="middle"
        @change="alCambiarTabla"
      >
        <template #bodyCell="{ column, record, index }">
          <template v-if="column.key === '#'">
            <span class="tabular-nums text-muted-foreground">
              {{ numeroFila(index) }}
            </span>
          </template>

          <template v-else-if="column.key === 'jurado'">
            <div class="flex items-center gap-2">
              <SemfaAvatar :texto="inicialesDeNombre(record.jurado)" />
              <span class="truncate">{{ record.jurado ?? '—' }}</span>
            </div>
          </template>

          <template v-else-if="column.key === 'categoriaActividad'">
            <span v-if="record.categoriaActividad">
              {{ nombrePropio(record.categoriaActividad) }}
            </span>
            <span
              v-else
              class="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary"
            >
              Toda la actividad
            </span>
          </template>


          <template v-else-if="column.key === 'opciones'">
            <div class="flex justify-center gap-2">
              <Button
                class="semfa-btn semfa-btn--suave-primario"
                size="small"
                @click="abrirEdicion(record as JuradoAsignacion)"
              >
                <IconifyIcon class="size-3.5" icon="lucide:pencil" />
                Editar
              </Button>
              <Button
                class="semfa-btn semfa-btn--suave-peligro"
                size="small"
                @click="
                  crud.eliminar(
                    record as JuradoAsignacion,
                    `${record.jurado ?? 'Jurado'} en ${
                      nombrePropio(record.categoriaActividad) ||
                      limpiarEspacios(record.actividad)
                    }`,
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
            <span v-if="idActividad === undefined">Elija una actividad en la barra superior</span>
            <span v-else-if="busqueda.trim() || filtroCategoria !== undefined">
              No hay asignaciones con ese filtro
            </span>
            <span v-else>{{ nombreActividad }} aún no tiene jurados asignados</span>
          </div>
        </template>
      </Table>
    </Card>

    <JuradoAsignacionFormModal
      ref="modalRef"
      v-model:open="modalAbierto"
      :asignacion="asignacionSeleccionada"
      :asignaciones="crud.items.value"
      :guardando="crud.guardando.value"
      @guardar="alGuardar"
    />
  </Page>
</template>
