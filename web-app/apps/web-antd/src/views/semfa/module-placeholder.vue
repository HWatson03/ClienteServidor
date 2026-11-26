<script lang="ts" setup>
import { computed } from 'vue';
import { useRoute } from 'vue-router';

import { Page } from '@vben/common-ui';

/**
 * Marcador de posición para módulos aún no implementados. Muestra el nombre
 * del módulo y el endpoint que le corresponde cuando exista.
 */
const route = useRoute();

const modulo = computed(() => String(route.meta.title ?? 'Módulo'));
const descripcion = computed(() => (route.meta.description as string) ?? '');
const endpoint = computed(() => (route.meta.endpoint as string) ?? '');
</script>

<template>
  <Page :description="descripcion" :title="modulo">
    <div
      class="flex min-h-[50vh] flex-col items-center justify-center gap-3 rounded-lg border border-dashed text-center"
    >
      <div class="text-5xl">🚧</div>
      <div class="text-lg font-medium">{{ modulo }}</div>
      <div class="text-sm opacity-70">
        Módulo pendiente. La CRUD y sus llamadas a la API se implementarán en
        una fase posterior.
      </div>
      <div
        v-if="endpoint"
        class="mt-2 rounded bg-black/5 px-3 py-1 font-mono text-xs dark:bg-white/10"
      >
        {{ endpoint }}
      </div>
    </div>
  </Page>
</template>
