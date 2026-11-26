<script lang="ts" setup>
/**
 * Acciones de la cabecera de una tabla CRUD: buscador, recargar y «Agregar».
 * Va en el slot `#extra` del `Card`, así la tabla no pierde altura con una barra
 * aparte. El slot `#filtros` añade filtros propios de la vista antes del buscador.
 */
import { IconifyIcon } from '@vben/icons';

import { Button, Input, Tooltip } from 'ant-design-vue';

defineOptions({ name: 'SemfaBarraCrud' });

withDefaults(
  defineProps<{
    cargando: boolean;
    iconoAgregar?: string;
    placeholder?: string;
    textoAgregar: string;
  }>(),
  { iconoAgregar: 'lucide:plus', placeholder: 'Buscar…' },
);

defineEmits<{ agregar: []; recargar: [] }>();

const busqueda = defineModel<string>('busqueda', { required: true });
</script>

<template>
  <div class="flex items-center gap-2">
    <slot name="filtros"></slot>

    <Input
      v-model:value="busqueda"
      :placeholder="placeholder"
      allow-clear
      class="w-44 sm:w-64"
    >
      <template #prefix>
        <IconifyIcon class="size-4 text-muted-foreground" icon="lucide:search" />
      </template>
    </Input>

    <Tooltip title="Recargar lista">
      <Button
        :disabled="cargando"
        aria-label="Recargar lista"
        class="semfa-btn semfa-btn--neutro shrink-0"
        @click="$emit('recargar')"
      >
        <IconifyIcon
          :class="{ 'animate-spin': cargando }"
          class="size-4"
          icon="lucide:refresh-cw"
        />
      </Button>
    </Tooltip>

    <Button class="semfa-btn semfa-btn--primario" @click="$emit('agregar')">
      <IconifyIcon :icon="iconoAgregar" class="size-4" />
      <span class="hidden sm:inline">{{ textoAgregar }}</span>
    </Button>
  </div>
</template>
