<script lang="ts" setup>
import type { ColumnsType } from 'ant-design-vue/es/table';

import type {
  CategoriaActividad,
  CategoriaActividadForm,
} from '#/api/categorias-actividad';
import type { Inscripcion } from '#/api/inscripciones';
import type { JuradoAsignacion } from '#/api/jurado-asignaciones';

import { computed, onMounted, ref, shallowRef } from 'vue';

import { IconifyIcon } from '@vben/icons';

import { Button, Card, Table, Tooltip } from 'ant-design-vue';

import {
  actualizarCategoriaActividad,
  crearCategoriaActividad,
  eliminarCategoriaActividad,
  listarCategoriasActividad,
} from '#/api/categorias-actividad';
import { listarInscripciones } from '#/api/inscripciones';
import { listarJuradoAsignaciones } from '#/api/jurado-asignaciones';
import SemfaBarraCrud from '#/components/semfa/semfa-barra-crud.vue';
import SemfaPagina from '#/components/semfa/semfa-pagina.vue';
import { useActividadTrabajo } from '#/composables/useActividadTrabajo';
import { useCrud } from '#/composables/useCrud';
import { useTablaLocal } from '#/composables/useTablaLocal';
import { nombrePropio } from '#/utils/formato';

import CategoriaActividadFormModal from './form-modal.vue';

defineOptions({ name: 'SemfaCategoriaActividad' });

const { deLaActividad, idActividad, nombreActividad } = useActividadTrabajo();

const modalAbierto = ref(false);
const modalRef = ref<InstanceType<typeof CategoriaActividadFormModal>>();
const categoriaSeleccionada = ref<CategoriaActividad | null>(null);

/** Para contar proyectos inscritos y jurados de cada categoría. */
const inscripciones = shallowRef<Inscripcion[]>([]);
const asignaciones = shallowRef<JuradoAsignacion[]>([]);

const crud = useCrud<CategoriaActividad, CategoriaActividadForm>({
  etiqueta: (p) => p.nombre,
  guardar: (payload) => {
    const { idCategoriaActividad, ...data } = payload;
    return idCategoriaActividad === undefined
      ? crearCategoriaActividad(data)
      : actualizarCategoriaActividad(idCategoriaActividad, data);
  },
  idKey: 'idCategoriaActividad',
  listar: async () => {
    const [lista, ins, asig] = await Promise.all([
      listarCategoriasActividad(),
      listarInscripciones().catch(() => [] as Inscripcion[]),
      listarJuradoAsignaciones().catch(() => [] as JuradoAsignacion[]),
    ]);
    inscripciones.value = ins ?? [];
    asignaciones.value = asig ?? [];
    return lista;
  },
  nombre: 'Categoría',
  remover: eliminarCategoriaActividad,
});

// ---------------------------------------------------------------- filas y filtro

const filas = computed(() =>
  crud.items.value.map((c) => ({
    ...c,
    jurados: asignaciones.value.filter(
      (a) => a.idCategoriaActividad === c.idCategoriaActividad,
    ).length,
    nombreBonito: nombrePropio(c.nombre),
    proyectos: inscripciones.value.filter(
      (i) => i.idCategoriaActividad === c.idCategoriaActividad,
    ).length,
  })),
);

type Fila = (typeof filas.value)[number];

/** Solo las categorías de la actividad de trabajo (barra superior). */
const filasFiltradas = computed(() => deLaActividad(filas.value, (f) => f.idActividad));

const { alCambiarTabla, busqueda, filtrados, numeroFila, paginacion } =
  useTablaLocal(filasFiltradas, {
    camposBusqueda: ['nombre', 'descripcion', 'nombreActividad', 'nombreCarrera', 'nivel'],
  });

function comparar(a: null | string, b: null | string) {
  return (a ?? '').localeCompare(b ?? '', 'es', { numeric: true });
}

/** Columnas de `tabla.html` (Nombre, Actividad) más su carrera y su uso. */
const columnas: ColumnsType<Fila> = [
  { align: 'center', key: '#', title: '#', width: 64 },
  {
    dataIndex: 'nombreBonito',
    defaultSortOrder: 'ascend',
    key: 'nombre',
    sorter: (a, b) => comparar(a.nombre, b.nombre),
    title: 'Categoría',
  },
  {
    dataIndex: 'nivel',
    key: 'nivel',
    sorter: (a, b) => comparar(a.nivel, b.nivel),
    title: 'Nivel',
    width: 120,
  },
  {
    align: 'center',
    dataIndex: 'proyectos',
    key: 'proyectos',
    sorter: (a, b) => a.proyectos - b.proyectos,
    title: 'Proyectos',
    width: 105,
  },
  {
    align: 'center',
    dataIndex: 'jurados',
    key: 'jurados',
    sorter: (a, b) => a.jurados - b.jurados,
    title: 'Jurados',
    width: 95,
  },
  { align: 'center', key: 'opciones', title: 'Opciones', width: 220 },
];

// ---------------------------------------------------------------- acciones

function abrirRegistro() {
  categoriaSeleccionada.value = null;
  modalAbierto.value = true;
}

function abrirEdicion(categoria: CategoriaActividad) {
  categoriaSeleccionada.value = categoria;
  modalAbierto.value = true;
}

const usoDelSeleccionado = computed(() => {
  const f = filas.value.find(
    (x) => x.idCategoriaActividad === categoriaSeleccionada.value?.idCategoriaActividad,
  );
  return { jurados: f?.jurados ?? 0, proyectos: f?.proyectos ?? 0 };
});

async function alGuardar(payload: CategoriaActividadForm, continuar: boolean) {
  if (!(await crud.guardar(payload))) {
    return;
  }
  if (continuar) {
    modalRef.value?.reiniciar();
  } else {
    modalAbierto.value = false;
  }
}

/** El backend rechaza (409) borrar una categoría en uso: se explica antes. */
function motivoNoEliminar(f: Fila) {
  if (f.proyectos === 0 && f.jurados === 0) {
    return '';
  }
  const partes = [
    f.proyectos > 0 && `${f.proyectos} proyecto(s) inscrito(s)`,
    f.jurados > 0 && `${f.jurados} jurado(s) asignado(s)`,
  ].filter(Boolean);
  return `Tiene ${partes.join(' y ')}`;
}

onMounted(crud.recargar);
</script>

<template>
  <SemfaPagina description="Complementos / Categoría actividad" title="Categorías de actividad">
    <Card :body-style="{ padding: 0 }" class="overflow-hidden rounded-xl">
      <template #title>
        <div class="flex items-center gap-2">
          <IconifyIcon class="size-5 text-primary" icon="lucide:layers" />
          Categorías de actividad
          <span v-if="nombreActividad" class="text-sm font-normal text-muted-foreground">· {{ nombreActividad }}</span>
        </div>
      </template>

      <template #extra>
        <SemfaBarraCrud
          v-model:busqueda="busqueda"
          :cargando="crud.cargando.value"
          icono-agregar="lucide:layers-plus"
          placeholder="Buscar categoría, carrera o nivel…"
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
        :scroll="{ x: 960 }"
        class="semfa-tabla"
        row-key="idCategoriaActividad"
        size="middle"
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
                <IconifyIcon class="size-3.5" icon="lucide:layers" />
              </span>
              <Tooltip :title="record.descripcion" placement="topLeft">
                <span class="truncate font-medium">{{ record.nombreBonito }}</span>
              </Tooltip>
            </div>
          </template>

          <template v-else-if="column.key === 'nivel'">
            <Tooltip
              v-if="record.nivel"
              :title="`Carrera ${nombrePropio(record.nombreCarrera)}`"
            >
              <span class="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
                {{ nombrePropio(record.nivel) }}
              </span>
            </Tooltip>
            <span v-else class="text-muted-foreground">—</span>
          </template>


          <template v-else-if="column.key === 'proyectos' || column.key === 'jurados'">
            <span
              :class="record[column.key] === 0 ? 'text-amber-600' : ''"
              class="tabular-nums"
            >
              {{ record[column.key] }}
            </span>
          </template>

          <template v-else-if="column.key === 'opciones'">
            <div class="flex justify-center gap-2">
              <Button
                class="semfa-btn semfa-btn--suave-primario"
                size="small"
                @click="abrirEdicion(record as CategoriaActividad)"
              >
                <IconifyIcon class="size-3.5" icon="lucide:pencil" />
                Editar
              </Button>
              <Tooltip :title="motivoNoEliminar(record as Fila)">
                <Button
                  :disabled="!!motivoNoEliminar(record as Fila)"
                  class="semfa-btn semfa-btn--suave-peligro"
                  size="small"
                  @click="crud.eliminar(record as Fila, record.nombreBonito)"
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
            <span v-else-if="busqueda.trim()">No hay categorías con ese filtro</span>
            <span v-else>{{ nombreActividad }} aún no tiene categorías</span>
          </div>
        </template>
      </Table>
    </Card>

    <CategoriaActividadFormModal
      ref="modalRef"
      v-model:open="modalAbierto"
      :categoria="categoriaSeleccionada"
      :categorias="crud.items.value"
      :guardando="crud.guardando.value"
      :uso="usoDelSeleccionado"
      @guardar="alGuardar"
    />
  </SemfaPagina>
</template>
