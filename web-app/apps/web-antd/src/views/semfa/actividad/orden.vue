<script lang="ts" setup>
import type { Inscripcion } from '#/api/inscripciones';
import type { CambioOrden } from '#/views/semfa/complementos/inscripcion/orden';

import { computed, onMounted, ref, shallowRef } from 'vue';

import { IconifyIcon } from '@vben/icons';

import { Button, Card, Spin } from 'ant-design-vue';

import { listarInscripciones } from '#/api/inscripciones';
import { useActividadTrabajo } from '#/composables/useActividadTrabajo';
import { guardarOrdenes } from '#/views/semfa/complementos/inscripcion/orden';
import OrdenEditor from '#/views/semfa/complementos/inscripcion/orden-editor.vue';

defineOptions({ name: 'SemfaActividadOrden' });

/** Paso «Orden» del centro de la actividad: el orden en que se presentan. */
const emit = defineEmits<{ cambiado: [] }>();

const { deLaActividad } = useActividadTrabajo();

const todas = shallowRef<Inscripcion[]>([]);
const inscripciones = computed(() => deLaActividad(todas.value, (i) => i.idActividad));
const cargando = ref(false);
const guardando = ref(false);
const editor = ref<InstanceType<typeof OrdenEditor>>();
const pendientes = computed(() => editor.value?.pendientes ?? []);

async function cargar() {
  cargando.value = true;
  try {
    todas.value = (await listarInscripciones()) ?? [];
  } finally {
    cargando.value = false;
  }
}

async function guardar(cambios: CambioOrden[]) {
  guardando.value = true;
  try {
    await guardarOrdenes(cambios);
    await cargar();
    emit('cambiado');
  } finally {
    guardando.value = false;
  }
}

onMounted(cargar);
</script>

<template>
  <Card :body-style="{ padding: '16px' }" class="rounded-xl">
    <template #title>
      <div class="flex items-center gap-2">
        <IconifyIcon class="size-5 text-primary" icon="lucide:list-ordered" />
        Orden de presentación
      </div>
    </template>
    <template #extra>
      <span class="hidden text-xs text-muted-foreground md:inline">
        Así los listará la app del jurado, en cada categoría
      </span>
    </template>

    <Spin :spinning="cargando">
      <OrdenEditor ref="editor" :guardando="guardando" :inscripciones="inscripciones" @guardar="guardar" />
    </Spin>

    <div class="mt-3 flex flex-wrap items-center justify-end gap-2 border-t border-border pt-3">
      <span v-if="pendientes.length > 0" class="mr-auto text-xs text-amber-600">
        Por guardar: {{ pendientes.map((c) => c.nombre).join(', ') }}
      </span>
      <Button
        :disabled="guardando || pendientes.length === 0"
        class="semfa-btn semfa-btn--neutro"
        @click="editor?.reiniciar()"
      >
        Descartar
      </Button>
      <Button
        :disabled="pendientes.length === 0"
        :loading="guardando"
        class="semfa-btn semfa-btn--primario"
        @click="editor?.guardar()"
      >
        <IconifyIcon v-if="!guardando" class="size-4" icon="lucide:save" />
        Guardar orden
      </Button>
    </div>
  </Card>
</template>
