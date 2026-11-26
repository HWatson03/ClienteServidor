<script lang="ts" setup>
import type { PdfResultados } from '#/api/resultados';

import { inject } from 'vue';

import { IconifyIcon } from '@vben/icons';

import { Button, Tooltip } from 'ant-design-vue';

import { CONTEXTO_PDF } from './compartido';

defineOptions({ name: 'SemfaBotonPdf' });

/**
 * Un PDF de resultados: «Ver» lo abre en otra pestaña (para revisarlo o
 * imprimirlo) y el ícono lo descarga.
 */
const props = defineProps<{
  clave: string;
  deshabilitado?: boolean;
  etiqueta: string;
  nombre: string;
  pdf: PdfResultados;
  tooltip?: string;
}>();

const contexto = inject(CONTEXTO_PDF)!;

function pedir(abrir: boolean) {
  contexto.pedir(props.clave, props.pdf, props.nombre, abrir);
}
</script>

<template>
  <span class="inline-flex">
    <Tooltip :title="tooltip">
      <Button
        :disabled="deshabilitado || (!!contexto.generando.value && contexto.generando.value !== clave)"
        :loading="contexto.generando.value === clave"
        class="semfa-btn semfa-btn--suave-primario rounded-r-none"
        size="small"
        @click="pedir(true)"
      >
        <IconifyIcon v-if="contexto.generando.value !== clave" class="size-3.5" icon="lucide:file-text" />
        {{ etiqueta }}
      </Button>
    </Tooltip>
    <Tooltip title="Descargar">
      <Button
        :disabled="deshabilitado || !!contexto.generando.value"
        class="semfa-btn semfa-btn--suave-primario -ml-px rounded-l-none px-2"
        size="small"
        @click="pedir(false)"
      >
        <IconifyIcon class="size-3.5" icon="lucide:download" />
      </Button>
    </Tooltip>
  </span>
</template>
