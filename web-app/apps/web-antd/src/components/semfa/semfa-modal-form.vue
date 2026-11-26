<script lang="ts" setup>
/**
 * Marco común de los formularios de alta/edición SEMFA: cabecera con ícono,
 * pie con botones 3D, atajos de teclado y confirmación al descartar cambios.
 *
 * El formulario concreto va en el slot por defecto y, opcionalmente, una vista
 * previa del registro en `#vista-previa`. Este componente no valida: emite
 * `guardar(continuar)` y el formulario hijo valida y avisa a su vista.
 *
 * Atajos: Enter guarda (salvo dentro de un `Select`, un selector de fecha o un
 * área de texto) y Ctrl/⌘+Enter guarda y deja el formulario listo para otro registro.
 */
import { computed } from 'vue';

import { IconifyIcon } from '@vben/icons';

import { Button, Modal } from 'ant-design-vue';

import { confirmar } from '#/composables/useAvisos';

defineOptions({ name: 'SemfaModalForm' });

const props = withDefaults(
  defineProps<{
    /** `false` en formularios hechos de `Select`, donde Enter no debe guardar. */
    atajoEnter?: boolean;
    esEdicion: boolean;
    guardando: boolean;
    /** Si difiere de lo cargado al abrir: habilita guardar y pide confirmar al cerrar. */
    hayCambios: boolean;
    icono: string;
    /** `false` oculta «Guardar y nuevo» (p. ej. un alta rápida dentro de otro formulario). */
    permitirContinuar?: boolean;
    /** Registros hechos con «Guardar y nuevo» desde que se abrió. */
    registradas?: number;
    subtitulo?: string;
    /** Texto del contador en singular y plural: ['persona registrada', 'personas registradas']. */
    textoContador?: [string, string];
    titulo: string;
    width?: number;
  }>(),
  {
    atajoEnter: true,
    permitirContinuar: true,
    registradas: 0,
    subtitulo: '',
    textoContador: () => ['registro guardado', 'registros guardados'],
    width: 760,
  },
);

const emit = defineEmits<{ guardar: [continuar: boolean] }>();

const visible = defineModel<boolean>('open', { required: true });

/** «Guardar y nuevo» solo tiene sentido en altas. */
const conContinuar = computed(() => props.permitirContinuar && !props.esEdicion);

const puedeGuardar = computed(
  () => !props.guardando && (!props.esEdicion || props.hayCambios),
);

function guardar(continuar: boolean) {
  if (puedeGuardar.value) {
    emit('guardar', continuar && conContinuar.value);
  }
}

function alPulsarEnter(evento: KeyboardEvent) {
  const conControl = evento.ctrlKey || evento.metaKey;
  // En un `Select` o un selector de fecha, Enter elige la opción o la fecha, y
  // en un área de texto hace un salto de línea.
  const enSelector = (evento.target as HTMLElement).closest(
    '.ant-select, .ant-picker, textarea',
  );
  if (!conControl && (!props.atajoEnter || enSelector)) {
    return;
  }
  evento.preventDefault();
  guardar(conControl);
}

async function cerrar() {
  if (!props.hayCambios || props.guardando) {
    visible.value = false;
    return;
  }
  const descartar = await confirmar({
    mensaje: 'Los datos que escribió no se guardarán.',
    peligro: true,
    textoAceptar: 'Descartar',
    textoCancelar: 'Seguir editando',
    titulo: '¿Descartar los cambios?',
  });
  if (descartar) {
    visible.value = false;
  }
}
</script>

<template>
  <Modal
    :keyboard="false"
    :mask-closable="false"
    :open="visible"
    :width="width"
    centered
    @cancel="cerrar"
  >
    <template #title>
      <div class="flex items-center gap-3">
        <span
          class="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"
        >
          <IconifyIcon :icon="icono" class="size-5" />
        </span>
        <div class="leading-tight">
          <div class="text-lg font-semibold">{{ titulo }}</div>
          <div v-if="subtitulo" class="text-sm font-normal text-muted-foreground">
            {{ subtitulo }}
          </div>
        </div>
      </div>
    </template>

    <div
      v-if="$slots['vista-previa']"
      class="mb-5 mt-4 flex items-center gap-4 rounded-xl border border-border bg-muted/40 px-4 py-3"
    >
      <div class="min-w-0 flex-1">
        <slot name="vista-previa"></slot>
      </div>
      <span
        v-if="esEdicion && hayCambios"
        class="shrink-0 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary"
      >
        Con cambios
      </span>
    </div>

    <div @keydown.enter="alPulsarEnter">
      <slot></slot>
    </div>

    <template #footer>
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div class="text-left text-xs text-muted-foreground">
          <span
            v-if="registradas > 0"
            class="flex items-center gap-1 font-medium text-green-600"
          >
            <IconifyIcon class="size-4" icon="lucide:circle-check" />
            {{ registradas }}
            {{ registradas === 1 ? textoContador[0] : textoContador[1] }}
          </span>
          <span v-else class="hidden items-center gap-1 sm:flex">
            <IconifyIcon class="size-3.5" icon="lucide:keyboard" />
            <template v-if="atajoEnter">
              <kbd>Enter</kbd> guardar
              <template v-if="conContinuar"> · </template>
            </template>
            <template v-if="conContinuar">
              <kbd>Ctrl</kbd>+<kbd>Enter</kbd> guardar y nuevo
            </template>
            <template v-else-if="!atajoEnter">
              <kbd>Ctrl</kbd>+<kbd>Enter</kbd> guardar
            </template>
          </span>
        </div>

        <div class="flex gap-2">
          <Button
            :disabled="guardando"
            class="semfa-btn semfa-btn--neutro"
            size="large"
            @click="cerrar"
          >
            Cancelar
          </Button>
          <Button
            v-if="conContinuar"
            :disabled="guardando"
            class="semfa-btn semfa-btn--suave-primario"
            size="large"
            @click="guardar(true)"
          >
            <IconifyIcon class="size-4" icon="lucide:list-plus" />
            Guardar y nuevo
          </Button>
          <Button
            :disabled="esEdicion && !hayCambios"
            :loading="guardando"
            class="semfa-btn semfa-btn--primario"
            size="large"
            @click="guardar(false)"
          >
            <IconifyIcon v-if="!guardando" class="size-4" icon="lucide:save" />
            {{ esEdicion ? 'Guardar cambios' : 'Guardar' }}
          </Button>
        </div>
      </div>
    </template>
  </Modal>
</template>

<style scoped>
kbd {
  padding: 0 4px;
  font-family: inherit;
  font-size: 11px;
  background: hsl(var(--muted));
  border: 1px solid hsl(var(--border));
  border-radius: 4px;
  box-shadow: 0 1px 0 hsl(var(--border));
}
</style>
