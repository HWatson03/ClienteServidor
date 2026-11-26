<script lang="ts" setup>
/**
 * Orden de presentación en un modal (desde Inscripciones). El editor es
 * `orden-editor.vue`, el mismo del paso «Orden» del centro de la actividad.
 */
import type { Inscripcion } from '#/api/inscripciones';

import { computed, ref, watch } from 'vue';

import SemfaModalForm from '#/components/semfa/semfa-modal-form.vue';
import { limpiarEspacios } from '#/utils/formato';

import OrdenEditor from './orden-editor.vue';

defineOptions({ name: 'InscripcionOrdenModal' });

defineProps<{
  guardando: boolean;
  /** Inscripciones activas de la actividad de trabajo. */
  inscripciones: Inscripcion[];
}>();

const emit = defineEmits<{
  guardar: [cambios: { idCategoriaActividad: number; ids: number[]; nombre: string }[]];
}>();

const visible = defineModel<boolean>('open', { required: true });

const editor = ref<InstanceType<typeof OrdenEditor>>();
const pendientes = computed(() => editor.value?.pendientes ?? []);

watch(visible, (abierto) => {
  if (abierto) editor.value?.reiniciar();
});
</script>

<template>
  <SemfaModalForm
    v-model:open="visible"
    :atajo-enter="false"
    :es-edicion="true"
    :guardando="guardando"
    :hay-cambios="pendientes.length > 0"
    :permitir-continuar="false"
    :width="760"
    icono="lucide:list-ordered"
    subtitulo="El orden en que se presentan: así los verán los jurados en su app."
    titulo="Orden de presentación"
    @guardar="editor?.guardar()"
  >
    <template #vista-previa>
      <div class="min-w-0 text-sm">
        <div class="font-medium">Arrastre, use las flechas o sortee</div>
        <div v-if="pendientes.length > 0" class="mt-1 text-xs text-amber-600">
          Por guardar: {{ pendientes.map((c) => limpiarEspacios(c.nombre)).join(', ') }}
        </div>
        <div v-else class="mt-0.5 text-xs text-muted-foreground">Sin cambios</div>
      </div>
    </template>

    <OrdenEditor
      ref="editor"
      :guardando="guardando"
      :inscripciones="inscripciones"
      @guardar="(c) => emit('guardar', c)"
    />
  </SemfaModalForm>
</template>
