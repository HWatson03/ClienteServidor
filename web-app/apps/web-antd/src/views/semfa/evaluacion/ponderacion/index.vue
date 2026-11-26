<script lang="ts" setup>
import type { ColumnsType } from 'ant-design-vue/es/table';

import type { Ponderacion, PonderacionForm } from '#/api/ponderaciones';

import { computed, onMounted, ref } from 'vue';

import { Page } from '@vben/common-ui';
import { IconifyIcon } from '@vben/icons';

import { Button, Card, Select, Table, Tooltip } from 'ant-design-vue';

import {
  actualizarPonderacion,
  crearPonderacion,
  eliminarPonderacion,
  listarPonderaciones,
} from '#/api/ponderaciones';
import SemfaBarraCrud from '#/components/semfa/semfa-barra-crud.vue';
import { useCrud } from '#/composables/useCrud';
import { useTablaLocal } from '#/composables/useTablaLocal';
import { limpiarEspacios, normalizarTexto } from '#/utils/formato';

import PonderacionFormModal from './form-modal.vue';

defineOptions({ name: 'SemfaPonderacion' });

type FormConId = PonderacionForm & { idPonderacion?: number };

const modalAbierto = ref(false);
const modalRef = ref<InstanceType<typeof PonderacionFormModal>>();
const ponderacionSeleccionada = ref<null | Ponderacion>(null);

function recortar(texto: null | string, max = 50) {
  const limpio = limpiarEspacios(texto);
  return limpio.length > max ? `${limpio.slice(0, max)}…` : limpio;
}

const crud = useCrud<Ponderacion, FormConId>({
  etiqueta: (p) =>
    p.numeros.length === 1 ? String(p.numeros[0]) : `${p.numeros.join(', ')}`,
  guardar: (payload) => {
    const { idPonderacion, ...data } = payload;
    return idPonderacion === undefined
      ? crearPonderacion(data)
      : actualizarPonderacion(idPonderacion, data);
  },
  idKey: 'idPonderacion',
  listar: listarPonderaciones,
  nombre: 'Ponderación',
  remover: eliminarPonderacion,
});

/**
 * El legacy anidaba tres niveles (categoría → pregunta → ponderaciones). Aquí hay
 * una fila por ponderación, ordenada por pregunta y valor, con el contexto resuelto.
 */
const filas = computed(() =>
  crud.items.value
    .map((p) => ({ ...p, preguntaLimpia: limpiarEspacios(p.pregunta) }))
    .sort(
      (a, b) =>
        a.preguntaLimpia.localeCompare(b.preguntaLimpia, 'es') ||
        (a.numero ?? 0) - (b.numero ?? 0),
    ),
);

type Fila = (typeof filas.value)[number];

const filtroPregunta = ref<number>();

const opcionesPregunta = computed(() => {
  const conteo = new Map<number, { nombre: string; total: number }>();
  for (const f of filas.value) {
    if (f.idPregunta !== null) {
      conteo.set(f.idPregunta, {
        nombre: f.preguntaLimpia,
        total: (conteo.get(f.idPregunta)?.total ?? 0) + 1,
      });
    }
  }
  return [...conteo.entries()].map(([value, { nombre, total }]) => ({
    label: `${recortar(nombre, 40)} (${total})`,
    nombre,
    value,
  }));
});

function filtrarPregunta(entrada: string, opcion: any) {
  return normalizarTexto(opcion?.nombre).includes(normalizarTexto(entrada.trim()));
}

const filasFiltradas = computed(() =>
  filtroPregunta.value === undefined
    ? filas.value
    : filas.value.filter((f) => f.idPregunta === filtroPregunta.value),
);

const { alCambiarTabla, busqueda, filtrados, numeroFila, paginacion } =
  useTablaLocal(filasFiltradas, {
    camposBusqueda: ['preguntaLimpia', 'categoriaCriterio', 'tipoProyecto', 'numero'],
  });

function comparar(a: null | string, b: null | string) {
  return (a ?? '').localeCompare(b ?? '', 'es', { numeric: true });
}

const columnas: ColumnsType<Fila> = [
  { align: 'center', key: '#', title: '#', width: 64 },
  {
    align: 'center',
    dataIndex: 'numero',
    key: 'numero',
    sorter: (a, b) => (a.numero ?? 0) - (b.numero ?? 0),
    title: 'Valor',
    width: 90,
  },
  {
    dataIndex: 'preguntaLimpia',
    ellipsis: true,
    key: 'pregunta',
    sorter: (a, b) => comparar(a.preguntaLimpia, b.preguntaLimpia),
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
  { align: 'center', key: 'opciones', title: 'Opciones', width: 220 },
];

function abrirRegistro() {
  ponderacionSeleccionada.value = null;
  modalAbierto.value = true;
}

function abrirEdicion(ponderacion: Ponderacion) {
  ponderacionSeleccionada.value = ponderacion;
  modalAbierto.value = true;
}

/** Cierra el modal (o lo limpia con «Guardar y nuevo») solo si el backend confirmó. */
async function alGuardar(payload: FormConId, continuar: boolean) {
  if (!(await crud.guardar(payload))) {
    return;
  }
  if (continuar) {
    modalRef.value?.reiniciar(payload.numeros.length);
  } else {
    modalAbierto.value = false;
  }
}

function eliminar(fila: Fila) {
  crud.eliminar(
    fila,
    `${fila.numero ?? ''} de «${recortar(fila.pregunta, 40)}»`,
    'Si algún jurado ya la usó para puntuar, el sistema no permitirá eliminarla.',
  );
}

onMounted(crud.recargar);
</script>

<template>
  <Page description="Evaluación / Ponderación" title="Ponderaciones">
    <Card :body-style="{ padding: 0 }" class="overflow-hidden rounded-xl">
      <template #title>
        <div class="flex items-center gap-2">
          <IconifyIcon class="size-5 text-primary" icon="lucide:scale" />
          Ponderaciones por pregunta
        </div>
      </template>

      <template #extra>
        <SemfaBarraCrud
          v-model:busqueda="busqueda"
          :cargando="crud.cargando.value"
          icono-agregar="lucide:plus"
          placeholder="Buscar valor, pregunta o categoría…"
          texto-agregar="Agregar ponderaciones"
          @agregar="abrirRegistro"
          @recargar="crud.recargar"
        >
          <template v-if="opcionesPregunta.length > 1" #filtros>
            <Select
              v-model:value="filtroPregunta"
              :filter-option="filtrarPregunta"
              :options="opcionesPregunta"
              allow-clear
              class="hidden w-64 lg:block"
              placeholder="Todas las preguntas"
              show-search
            />
          </template>
        </SemfaBarraCrud>
      </template>

      <Table
        :columns="columnas"
        :data-source="filtrados"
        :loading="crud.cargando.value"
        :pagination="paginacion"
        :scroll="{ x: 980 }"
        class="semfa-tabla"
        row-key="idPonderacion"
        size="small"
        @change="alCambiarTabla"
      >
        <template #bodyCell="{ column, record, index }">
          <template v-if="column.key === '#'">
            <span class="tabular-nums text-muted-foreground">{{ numeroFila(index) }}</span>
          </template>

          <template v-else-if="column.key === 'numero'">
            <span
              class="inline-flex min-w-8 justify-center rounded-md bg-primary/10 px-2 font-semibold text-primary tabular-nums"
            >
              {{ record.numero ?? '—' }}
            </span>
          </template>

          <template v-else-if="column.key === 'pregunta'">
            <Tooltip :title="record.preguntaLimpia" placement="topLeft">
              <span class="font-medium">{{ record.preguntaLimpia || '—' }}</span>
            </Tooltip>
          </template>

          <template v-else-if="column.key === 'categoria' || column.key === 'tipo'">
            <span class="text-muted-foreground">
              {{ (column.key === 'categoria' ? record.categoriaCriterio : record.tipoProyecto) ?? '—' }}
            </span>
          </template>

          <template v-else-if="column.key === 'opciones'">
            <div class="flex justify-center gap-2">
              <Button
                class="semfa-btn semfa-btn--suave-primario"
                size="small"
                @click="abrirEdicion(record as Ponderacion)"
              >
                <IconifyIcon class="size-3.5" icon="lucide:pencil" />
                Editar
              </Button>
              <Button
                class="semfa-btn semfa-btn--suave-peligro"
                size="small"
                @click="eliminar(record as Fila)"
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
            <span v-if="busqueda.trim() || filtroPregunta !== undefined">No hay ponderaciones con ese filtro</span>
            <span v-else>Aún no hay ponderaciones</span>
          </div>
        </template>
      </Table>
    </Card>

    <PonderacionFormModal
      ref="modalRef"
      v-model:open="modalAbierto"
      :guardando="crud.guardando.value"
      :ponderacion="ponderacionSeleccionada"
      :ponderaciones="crud.items.value"
      @guardar="alGuardar"
    />
  </Page>
</template>
