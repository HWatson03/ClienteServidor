<script lang="ts" setup>
import type { ColumnsType } from 'ant-design-vue/es/table';

import type { Proyecto } from '#/api/proyectos';

import { onMounted, ref } from 'vue';

import { Page } from '@vben/common-ui';
import { IconifyIcon } from '@vben/icons';

import { Button, Card, Table, Tag } from 'ant-design-vue';

import { abrirArchivoProyecto, listarProyectosEvaluados } from '#/api/proyectos';

defineOptions({ name: 'SemfaProyectoEvaluados' });

const proyectos = ref<Proyecto[]>([]);
const cargando = ref(false);

/**
 * El legacy pintaba tarjetas con el nombre y el programa
 * (`proyecto/proyectos-evaluados.html`); aquí van en tabla porque la lista
 * crece con cada concurso evaluado y las tarjetas no se ordenan ni se filtran.
 */
const columnas: ColumnsType<Proyecto> = [
  { key: '#', title: '#', width: 60 },
  { dataIndex: 'nombreProyecto', key: 'nombreProyecto', title: 'Proyecto' },
  { dataIndex: 'tipoProyecto', key: 'tipoProyecto', title: 'Tipo' },
  { dataIndex: 'categoria', key: 'categoria', title: 'Categoría' },
  { dataIndex: 'programa', key: 'programa', title: 'Programa' },
  { dataIndex: 'promedioFinal', key: 'promedioFinal', title: 'Promedio', width: 100 },
  { key: 'opciones', title: 'OPCIONES', width: 140 },
];

async function cargar() {
  cargando.value = true;
  try {
    proyectos.value = await listarProyectosEvaluados();
  } finally {
    cargando.value = false;
  }
}

onMounted(cargar);
</script>

<template>
  <Page description="Proyectos que ya pasaron por evaluación." title="Proyectos evaluados">
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

          <template v-else-if="column.key === 'tipoProyecto'">
            <Tag color="blue">{{ record.tipoProyecto }}</Tag>
          </template>

          <template v-else-if="column.key === 'categoria'">
            <span>{{ record.categoria || '—' }}</span>
          </template>

          <template v-else-if="column.key === 'programa'">
            <span>{{ record.programa || '—' }}</span>
          </template>

          <template v-else-if="column.key === 'promedioFinal'">
            <span class="font-medium">{{ record.promedioFinal.toFixed(2) }}</span>
          </template>

          <template v-else-if="column.key === 'opciones'">
            <Button
              v-if="record.nombreArchivo"
              size="small"
              type="primary"
              @click="abrirArchivoProyecto(record.idProyecto)"
            >
              <IconifyIcon icon="lucide:file-text" />
              Ver PDF
            </Button>
            <span v-else class="text-gray-400">—</span>
          </template>
        </template>
      </Table>
    </Card>
  </Page>
</template>
