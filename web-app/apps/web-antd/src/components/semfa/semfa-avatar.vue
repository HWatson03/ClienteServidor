<script lang="ts" setup>
/**
 * Círculo con iniciales, en el color primario. `sm` para filas de tabla, `lg`
 * para la vista previa de los formularios.
 */
defineOptions({ name: 'SemfaAvatar' });

withDefaults(
  defineProps<{
    tamano?: 'lg' | 'md' | 'sm';
    texto: string;
  }>(),
  { tamano: 'sm' },
);

const CLASES = {
  lg: 'size-12 text-base',
  md: 'size-9 text-sm',
  sm: 'size-6 text-[10px]',
} as const;
</script>

<template>
  <span
    :class="CLASES[tamano]"
    class="flex shrink-0 items-center justify-center rounded-full bg-primary/10 font-semibold text-primary"
  >
    {{ texto }}
  </span>
</template>
