<script lang="ts" setup>
/**
 * Usuario y contraseña de una cuenta recién creada (o con contraseña nueva),
 * listos para copiar y entregar. Si la persona ya tenía cuenta, el backend la
 * reutiliza y la contraseña no cambia, así que solo se muestra el usuario.
 */
import type { Credenciales } from '#/utils/credenciales';

import { computed } from 'vue';

import { IconifyIcon } from '@vben/icons';

import { useClipboard } from '@vueuse/core';
import { Button, Tooltip } from 'ant-design-vue';

import { avisar } from '#/composables/useAvisos';

defineOptions({ name: 'SemfaCredenciales' });

const props = defineProps<{ credenciales: Credenciales }>();

const { copy } = useClipboard({ legacy: true });

const textoCompleto = computed(() =>
  [
    `Nombre: ${props.credenciales.nombre}`,
    `Usuario: ${props.credenciales.usuario}`,
    props.credenciales.contrasena
      ? `Contraseña: ${props.credenciales.contrasena}`
      : 'Contraseña: la misma que ya tenía',
  ].join('\n'),
);

async function copiar(texto: string, que: string) {
  await copy(texto);
  avisar({ duracion: 2500, tipo: 'exito', titulo: `${que} copiado al portapapeles` });
}
</script>

<template>
  <div class="rounded-xl border border-green-600/30 bg-green-600/5 px-4 py-3">
    <div class="mb-2 flex items-center justify-between gap-2">
      <div class="flex items-center gap-2 font-medium text-green-700 dark:text-green-500">
        <IconifyIcon class="size-4" icon="lucide:key-round" />
        Acceso de {{ credenciales.nombre }}
      </div>
      <Button
        class="semfa-btn semfa-btn--neutro"
        size="small"
        @click="copiar(textoCompleto, 'Acceso')"
      >
        <IconifyIcon class="size-3.5" icon="lucide:copy" />
        Copiar todo
      </Button>
    </div>

    <div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
      <div class="flex items-center justify-between gap-2 rounded-lg bg-card px-3 py-1.5">
        <div class="min-w-0">
          <div class="text-xs text-muted-foreground">Usuario</div>
          <div class="truncate font-mono font-medium">{{ credenciales.usuario }}</div>
        </div>
        <Tooltip title="Copiar usuario">
          <Button
            aria-label="Copiar usuario"
            size="small"
            type="text"
            @click="copiar(credenciales.usuario, 'Usuario')"
          >
            <IconifyIcon class="size-4" icon="lucide:copy" />
          </Button>
        </Tooltip>
      </div>

      <div class="flex items-center justify-between gap-2 rounded-lg bg-card px-3 py-1.5">
        <div class="min-w-0">
          <div class="text-xs text-muted-foreground">Contraseña</div>
          <div
            v-if="credenciales.contrasena"
            class="truncate font-mono font-medium"
          >
            {{ credenciales.contrasena }}
          </div>
          <div v-else class="text-sm text-muted-foreground">
            La misma que ya tenía
          </div>
        </div>
        <Tooltip v-if="credenciales.contrasena" title="Copiar contraseña">
          <Button
            aria-label="Copiar contraseña"
            size="small"
            type="text"
            @click="copiar(credenciales.contrasena, 'Contraseña')"
          >
            <IconifyIcon class="size-4" icon="lucide:copy" />
          </Button>
        </Tooltip>
      </div>
    </div>

    <p class="mb-0 mt-2 text-xs text-muted-foreground">
      Entréguelo ahora: por seguridad la contraseña no se vuelve a mostrar.
    </p>
  </div>
</template>
