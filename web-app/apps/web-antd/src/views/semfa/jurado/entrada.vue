<script lang="ts" setup>
import type { ActividadJurado, DatosEntrada, ParticipanteEntrada } from '#/api/jurado';

import { computed, onMounted, ref } from 'vue';

import { Page } from '@vben/common-ui';

import { Button, Card, Empty, InputNumber, message, Modal, Progress, Tag } from 'ant-design-vue';

import {
  datosEntrada,
  guardarEntrada,
  listarActividadesJurado,
} from '#/api/jurado';
import { useCronometroSse } from '#/composables/useCronometroSse';

defineOptions({ name: 'SemfaJuradoEntrada' });

const actividades = ref<ActividadJurado[]>([]);
const datos = ref<DatosEntrada | null>(null);
const cargando = ref(false);

const evaluando = ref<null | ParticipanteEntrada>(null);
const puntajes = ref<Record<number, number>>({});
const guardando = ref(false);
const modalAbierto = ref(false);

const { conectado, cronometro } = useCronometroSse();

const orden = computed(() => (datos.value?.categoria.participantes ?? []).sort((a, b) => {
  const ea = a.evaluado ? 1 : 0;
  const eb = b.evaluado ? 1 : 0;
  return ea - eb;
}));

const evaluados = computed(
  () => (datos.value?.categoria.participantes ?? []).filter((p) => p.evaluado).length,
);

const progreso = computed(() => {
  const total = datos.value?.categoria.participantes.length ?? 0;
  return total === 0 ? 0 : Math.round((evaluados.value / total) * 100);
});

function formatearTiempo(segundos: null | number): string {
  if (segundos == null) {
    return '--:--';
  }
  const m = Math.floor(segundos / 60);
  const s = String(segundos % 60).padStart(2, '0');
  return `${m}:${s}`;
}

async function cargar() {
  cargando.value = true;
  try {
    actividades.value = await listarActividadesJurado();
    const primera = actividades.value[0];
    if (primera) {
      datos.value = await datosEntrada(primera.id);
    }
  } finally {
    cargando.value = false;
  }
}

function abrirEvaluacion(participante: ParticipanteEntrada) {
  evaluando.value = participante;
  const valores: Record<number, number> = {};
  for (const criterio of datos.value?.categoria.criterios ?? []) {
    valores[criterio.id] = participante.puntajes[criterio.id] ?? 0;
  }
  puntajes.value = valores;
  modalAbierto.value = true;
}

const totalCalculado = computed(() =>
  (datos.value?.categoria.criterios ?? []).reduce(
    (acc, criterio) => acc + (puntajes.value[criterio.id] ?? 0),
    0,
  ),
);

async function guardarEvaluacion() {
  if (!evaluando.value || !datos.value) {
    return;
  }
  const criteriosIncompletos = (datos.value.categoria.criterios ?? []).some(
    (criterio) => {
      const valor = puntajes.value[criterio.id] ?? 0;
      return valor < 0 || valor > criterio.maxPuntos;
    },
  );
  if (criteriosIncompletos) {
    message.warning('Revisa que cada criterio tenga un puntaje válido.');
    return;
  }

  guardando.value = true;
  try {
    await guardarEntrada({
      idParticipante: evaluando.value.id,
      puntajes: puntajes.value,
      total: totalCalculado.value,
    });
    message.success('Evaluación guardada correctamente.');
    evaluando.value = null;
    modalAbierto.value = false;
    const primera = actividades.value[0];
    if (primera) {
      datos.value = await datosEntrada(primera.id);
    }
  } finally {
    guardando.value = false;
  }
}

onMounted(cargar);
</script>

<template>
  <Page description="Panel de evaluación de la entrada universitaria con cronómetro compartido." title="Entrada universitaria">
    <div class="flex flex-col gap-4">
      <!-- Cronómetro flotante -->
      <div
        class="fixed right-4 top-24 z-50 w-64 rounded-lg border border-neutral-200 p-3 shadow-lg dark:border-neutral-700"
        :class="{
          'bg-white dark:bg-neutral-900': !cronometro,
          'bg-emerald-50 dark:bg-emerald-950': cronometro?.estado === 'verde',
          'bg-amber-50 dark:bg-amber-950': cronometro?.estado === 'amarillo',
        }"
      >
        <div class="flex items-center justify-between">
          <span class="text-xs opacity-70">Cronómetro</span>
          <Tag :color="conectado ? 'green' : 'red'">
            {{ conectado ? 'en vivo' : 'sin conexión' }}
          </Tag>
        </div>
        <div class="mt-1 truncate text-sm font-medium">
          {{ cronometro?.participanteNombre ?? 'Sin presentación activa' }}
        </div>
        <div class="mt-1 text-2xl font-bold">
          {{ formatearTiempo(cronometro?.tiempoRestante ?? null) }}
        </div>
      </div>

      <Card v-if="datos">
        <template #title>{{ datos.nombreActividad }}</template>
        <div class="mb-3">
          <Tag color="geekblue">{{ datos.categoria.nombreCategoria }}</Tag>
          <span class="ml-2 text-sm opacity-70">
            {{ evaluados }} de {{ datos.categoria.participantes.length }} evaluados
          </span>
        </div>
        <Progress :percent="progreso" />
      </Card>

      <Card v-if="datos">
        <template #title>Participantes</template>
        <Empty v-if="datos.categoria.participantes.length === 0" description="Sin participantes" />
        <div v-else class="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <Card v-for="participante in orden" :key="participante.id" hoverable size="small">
            <div class="flex flex-col gap-2">
              <div class="flex items-center justify-between">
                <div class="font-medium">{{ participante.nombre }}</div>
                <Tag :color="participante.evaluado ? 'green' : 'orange'">
                  {{ participante.evaluado ? 'Evaluado' : 'Pendiente' }}
                </Tag>
              </div>
              <div class="text-sm opacity-70">{{ participante.institucion }}</div>
              <Button
                :type="participante.evaluado ? 'default' : 'primary'"
                @click="abrirEvaluacion(participante)"
              >
                {{ participante.evaluado ? 'Reevaluar' : 'Evaluar' }}
              </Button>
            </div>
          </Card>
        </div>
      </Card>

      <Empty v-else-if="!cargando" description="No tienes asignaciones para evaluar" />
    </div>

    <Modal
      v-model:open="modalAbierto"
      :title="`Evaluar: ${evaluando?.nombre ?? ''}`"
      :footer="null"
      width="640"
    >
      <template v-if="evaluando && datos">
        <div class="mb-3">
          <span class="text-sm opacity-70">Rúbrica:</span>
          <span class="ml-1 font-medium">{{ datos.categoria.nombreCategoria }}</span>
        </div>

        <div v-for="criterio in datos.categoria.criterios" :key="criterio.id" class="mb-4">
          <div class="mb-1 flex items-center justify-between">
            <span class="text-sm font-medium">{{ criterio.nombre }}</span>
            <span class="text-xs opacity-60">máx {{ criterio.maxPuntos }}</span>
          </div>
          <p v-if="criterio.descripcion" class="text-xs opacity-60">
            {{ criterio.descripcion }}
          </p>
          <InputNumber
            v-model:value="puntajes[criterio.id]"
            :max="criterio.maxPuntos"
            :min="0"
            :precision="2"
            class="mt-2 w-full"
          />
        </div>

        <div class="mb-4 flex items-center justify-between rounded bg-neutral-50 px-3 py-2 dark:bg-neutral-800">
          <span class="text-sm">Total</span>
          <span class="text-lg font-semibold">{{ totalCalculado.toFixed(2) }}</span>
        </div>

        <div class="flex justify-end gap-2">
          <Button @click="evaluando = null; modalAbierto = false">
            Cancelar
          </Button>
          <Button type="primary" :loading="guardando" @click="guardarEvaluacion">
            Guardar evaluación
          </Button>
        </div>
      </template>
    </Modal>
  </Page>
</template>