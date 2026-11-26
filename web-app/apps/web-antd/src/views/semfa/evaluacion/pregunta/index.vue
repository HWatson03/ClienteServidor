<script lang="ts" setup>
import type { ColumnsType } from 'ant-design-vue/es/table';

import type { Ponderacion } from '#/api/ponderaciones';
import type { Pregunta, PreguntaForm } from '#/api/preguntas';

import { computed, onMounted, ref, shallowRef } from 'vue';

import { Page } from '@vben/common-ui';
import { IconifyIcon } from '@vben/icons';

import { Button, Card, Select, Table, Tooltip } from 'ant-design-vue';

import { listarPonderaciones } from '#/api/ponderaciones';
import {
  actualizarPregunta,
  crearPregunta,
  eliminarPregunta,
  listarPreguntas,
} from '#/api/preguntas';
import SemfaBarraCrud from '#/components/semfa/semfa-barra-crud.vue';
import { useCrud } from '#/composables/useCrud';
import { useTablaLocal } from '#/composables/useTablaLocal';
import { limpiarEspacios } from '#/utils/formato';

import PreguntaFormModal from './form-modal.vue';

defineOptions({ name: 'SemfaPregunta' });

type FormConId = PreguntaForm & { idPregunta?: number };

const modalAbierto = ref(false);
const modalRef = ref<InstanceType<typeof PreguntaFormModal>>();
const preguntaSeleccionada = ref<null | Pregunta>(null);

/** Para mostrar las ponderaciones de cada pregunta (con alguna no se elimina). */
const ponderaciones = shallowRef<Ponderacion[]>([]);

const crud = useCrud<Pregunta, FormConId>({
  etiqueta: (p) => (p.nombre.length > 60 ? `${p.nombre.slice(0, 60)}…` : p.nombre),
  guardar: (payload) => {
    const { idPregunta, ...data } = payload;
    return idPregunta === undefined ? crearPregunta(data) : actualizarPregunta(idPregunta, data);
  },
  idKey: 'idPregunta',
  listar: async () => {
    const [lista, pond] = await Promise.all([
      listarPreguntas(),
      listarPonderaciones().catch(() => [] as Ponderacion[]),
    ]);
    ponderaciones.value = pond ?? [];
    return lista;
  },
  nombre: 'Pregunta',
  remover: eliminarPregunta,
});

const filas = computed(() =>
  crud.items.value.map((p) => {
    const suyas = ponderaciones.value
      .filter((x) => x.idPregunta === p.idPregunta)
      .map((x) => x.numero ?? 0)
      .sort((a, b) => a - b);
    return { ...p, nombreLimpio: limpiarEspacios(p.nombre), valores: suyas };
  }),
);

type Fila = (typeof filas.value)[number];

const filtroCategoria = ref<number>();

const opcionesCategoria = computed(() => {
  const conteo = new Map<number, { nombre: string; total: number }>();
  for (const f of filas.value) {
    if (f.idCategoriaCriterio !== null) {
      conteo.set(f.idCategoriaCriterio, {
        nombre: f.categoriaCriterio ?? '—',
        total: (conteo.get(f.idCategoriaCriterio)?.total ?? 0) + 1,
      });
    }
  }
  return [...conteo.entries()].map(([value, { nombre, total }]) => ({
    label: `${nombre} (${total})`,
    value,
  }));
});

const filasFiltradas = computed(() =>
  filtroCategoria.value === undefined
    ? filas.value
    : filas.value.filter((f) => f.idCategoriaCriterio === filtroCategoria.value),
);

const { alCambiarTabla, busqueda, filtrados, numeroFila, paginacion } =
  useTablaLocal(filasFiltradas, {
    camposBusqueda: ['nombreLimpio', 'categoriaCriterio', 'tipoProyecto'],
  });

function comparar(a: null | string, b: null | string) {
  return (a ?? '').localeCompare(b ?? '', 'es', { numeric: true });
}

const columnas: ColumnsType<Fila> = [
  { align: 'center', key: '#', title: '#', width: 64 },
  {
    dataIndex: 'nombreLimpio',
    ellipsis: true,
    key: 'nombre',
    sorter: (a, b) => comparar(a.nombreLimpio, b.nombreLimpio),
    title: 'Pregunta',
  },
  {
    dataIndex: 'categoriaCriterio',
    ellipsis: true,
    key: 'categoria',
    sorter: (a, b) => comparar(a.categoriaCriterio, b.categoriaCriterio),
    title: 'Categoría',
    width: 200,
  },
  {
    dataIndex: 'tipoProyecto',
    ellipsis: true,
    key: 'tipo',
    title: 'Tipo de proyecto',
    width: 170,
  },
  { key: 'valores', title: 'Ponderaciones', width: 190 },
  { align: 'center', key: 'opciones', title: 'Opciones', width: 220 },
];

function abrirRegistro() {
  preguntaSeleccionada.value = null;
  modalAbierto.value = true;
}

function abrirEdicion(pregunta: Pregunta) {
  preguntaSeleccionada.value = pregunta;
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
  <Page description="Evaluación / Pregunta" title="Preguntas">
    <Card :body-style="{ padding: 0 }" class="overflow-hidden rounded-xl">
      <template #title>
        <div class="flex items-center gap-2">
          <IconifyIcon class="size-5 text-primary" icon="lucide:message-circle-question" />
          Preguntas de evaluación
        </div>
      </template>

      <template #extra>
        <SemfaBarraCrud
          v-model:busqueda="busqueda"
          :cargando="crud.cargando.value"
          icono-agregar="lucide:message-circle-plus"
          placeholder="Buscar pregunta o categoría…"
          texto-agregar="Agregar pregunta"
          @agregar="abrirRegistro"
          @recargar="crud.recargar"
        >
          <template v-if="opcionesCategoria.length > 1" #filtros>
            <Select
              v-model:value="filtroCategoria"
              :options="opcionesCategoria"
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
        :scroll="{ x: 1000 }"
        class="semfa-tabla"
        row-key="idPregunta"
        size="small"
        @change="alCambiarTabla"
      >
        <template #bodyCell="{ column, record, index }">
          <template v-if="column.key === '#'">
            <span class="tabular-nums text-muted-foreground">{{ numeroFila(index) }}</span>
          </template>

          <template v-else-if="column.key === 'nombre'">
            <Tooltip :title="record.nombreLimpio" placement="topLeft">
              <span class="font-medium">{{ record.nombreLimpio }}</span>
            </Tooltip>
          </template>

          <template v-else-if="column.key === 'categoria' || column.key === 'tipo'">
            <span class="text-muted-foreground">
              {{ (column.key === 'categoria' ? record.categoriaCriterio : record.tipoProyecto) ?? '—' }}
            </span>
          </template>

          <template v-else-if="column.key === 'valores'">
            <div v-if="record.valores.length > 0" class="flex flex-wrap gap-1">
              <span
                v-for="(v, i) in record.valores"
                :key="i"
                class="rounded bg-muted px-1.5 text-xs tabular-nums"
              >
                {{ v }}
              </span>
            </div>
            <span v-else class="text-xs text-amber-600">Sin ponderaciones</span>
          </template>

          <template v-else-if="column.key === 'opciones'">
            <div class="flex justify-center gap-2">
              <Button
                class="semfa-btn semfa-btn--suave-primario"
                size="small"
                @click="abrirEdicion(record as Pregunta)"
              >
                <IconifyIcon class="size-3.5" icon="lucide:pencil" />
                Editar
              </Button>
              <Tooltip
                :title="
                  record.valores.length > 0
                    ? `Tiene ${record.valores.length} ponderación(es): elimínelas primero`
                    : ''
                "
              >
                <Button
                  :disabled="record.valores.length > 0"
                  class="semfa-btn semfa-btn--suave-peligro"
                  size="small"
                  @click="crud.eliminar(record as Fila, record.nombreLimpio.slice(0, 60))"
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
            <span v-if="busqueda.trim() || filtroCategoria !== undefined">No hay preguntas con ese filtro</span>
            <span v-else>Aún no hay preguntas</span>
          </div>
        </template>
      </Table>
    </Card>

    <PreguntaFormModal
      ref="modalRef"
      v-model:open="modalAbierto"
      :guardando="crud.guardando.value"
      :pregunta="preguntaSeleccionada"
      :preguntas="crud.items.value"
      @guardar="alGuardar"
    />
  </Page>
</template>
