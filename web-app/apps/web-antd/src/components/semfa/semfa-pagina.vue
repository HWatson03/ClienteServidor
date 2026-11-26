<script lang="ts" setup>
import { inject } from 'vue';

import { Page } from '@vben/common-ui';

import { SEMFA_EMBEBIDO } from '#/composables/useEmbebido';

defineOptions({ name: 'SemfaPagina', inheritAttrs: false });

/**
 * `<Page>` de vben, salvo cuando la pantalla va dentro del centro de la actividad
 * (`views/semfa/actividad`): ahí no lleva cabecera ni márgenes propios, porque ya
 * los pone el centro.
 */
const embebido = inject(SEMFA_EMBEBIDO, false);
</script>

<template>
  <div v-if="embebido">
    <slot></slot>
  </div>
  <Page v-else v-bind="$attrs">
    <slot></slot>
  </Page>
</template>
