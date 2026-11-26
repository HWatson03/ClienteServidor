<script lang="ts" setup>
import type { ResultadosProyecto } from '#/api/resultados';

import { computed, ref } from 'vue';

import { IconifyIcon } from '@vben/icons';

import { Button, Form, Input, Tooltip } from 'ant-design-vue';

import { excluirDelRanking, quitarExclusionRanking } from '#/api/inscripciones';
import SemfaModalForm from '#/components/semfa/semfa-modal-form.vue';
import { avisar, confirmar } from '#/composables/useAvisos';

defineOptions({ name: 'SemfaBotonExclusion' });

/**
 * Saca un proyecto del ranking (p. ej. hay justificante de que no se presentó a
 * la feria pero se evaluó internamente) o lo devuelve. Conserva su puntaje; el
 * backend le quita el puesto y lo oculta del público, la TV y las actas.
 */
const props = defineProps<{ proyecto: ResultadosProyecto }>();
const emit = defineEmits<{ cambio: [] }>();

const abierto = ref(false);
const guardando = ref(false);
const motivo = ref('');
const excluido = computed(() => !!props.proyecto.exclusion);

async function alPulsar() {
  if (!excluido.value) {
    motivo.value = '';
    abierto.value = true;
    return;
  }
  const ok = await confirmar({
    mensaje: `«${props.proyecto.nombre ?? 'Proyecto'}» volverá a competir y a recibir puesto.`,
    textoAceptar: 'Volver al ranking',
    titulo: '¿Devolver al ranking?',
  });
  if (!ok) return;
  await quitarExclusionRanking(props.proyecto.idInscripcion);
  avisar({ tipo: 'exito', titulo: 'El proyecto vuelve al ranking' });
  emit('cambio');
}

async function guardar() {
  const texto = motivo.value.trim();
  if (!texto) return;
  guardando.value = true;
  try {
    await excluirDelRanking(props.proyecto.idInscripcion, texto);
    avisar({ mensaje: props.proyecto.nombre ?? undefined, tipo: 'exito', titulo: 'Proyecto excluido del ranking' });
    abierto.value = false;
    emit('cambio');
  } finally {
    guardando.value = false;
  }
}

const tooltip = computed(() => {
  const e = props.proyecto.exclusion;
  if (!e) return 'Excluir del ranking (no se presentó, evaluado internamente…)';
  const quien = [e.usuario, e.fecha?.slice(0, 10)].filter(Boolean).join(' · ');
  return `Excluido: ${e.motivo}${quien ? ` (${quien})` : ''}. Clic para devolverlo al ranking.`;
});
</script>

<template>
  <Tooltip :title="tooltip">
    <Button
      :class="excluido ? 'semfa-btn--suave-primario' : 'semfa-btn--suave-peligro'"
      class="semfa-btn"
      size="small"
      @click.stop="alPulsar"
    >
      <IconifyIcon :icon="excluido ? 'lucide:undo-2' : 'lucide:ban'" class="size-3.5" />
    </Button>
  </Tooltip>

  <SemfaModalForm
    v-model:open="abierto"
    :atajo-enter="false"
    :es-edicion="false"
    :guardando="guardando"
    :hay-cambios="motivo.trim().length > 0"
    :permitir-continuar="false"
    :subtitulo="proyecto.nombre ?? ''"
    :width="520"
    icono="lucide:ban"
    titulo="Excluir del ranking"
    @guardar="guardar"
  >
    <Form layout="vertical">
      <Form.Item
        extra="Conserva sus evaluaciones y su puntaje, pero no recibe puesto ni sale en la TV, el resultado público ni las actas. Se puede revertir."
        label="Motivo"
        required
      >
        <Input.TextArea
          v-model:value="motivo"
          :maxlength="250"
          :rows="3"
          placeholder="Ej.: Justificante: no se presentó a la feria, evaluado internamente"
          show-count
        />
      </Form.Item>
    </Form>
  </SemfaModalForm>
</template>
