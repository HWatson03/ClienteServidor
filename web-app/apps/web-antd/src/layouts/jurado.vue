<script lang="ts" setup>
import { computed } from 'vue';
import { RouterView, useRoute } from 'vue-router';

import { IconifyIcon } from '@vben/icons';
import { preferences, updatePreferences, usePreferences } from '@vben/preferences';
import { useUserStore } from '@vben/stores';

import { confirmar } from '#/composables/useAvisos';
import { useAuthStore } from '#/store';
import { inicialesDeNombre, limpiarEspacios } from '#/utils/formato';

defineOptions({ name: 'JuradoLayout' });

/**
 * Layout del jurado: sin sidebar, pestañas ni migas de administración. Solo una
 * barra con su nombre y «Salir», y la pantalla ocupando el resto (pensado para
 * el celular y para empaquetar la app en Android).
 *
 * Se monta fuera de `BasicLayout` con `meta.noBasicLayout` (ver
 * `router/routes/modules/semfa.ts`).
 */

const route = useRoute();
const userStore = useUserStore();
const authStore = useAuthStore();
const { isDark } = usePreferences();
const logo = computed(() =>
  isDark.value ? preferences.logo.sourceDark : preferences.logo.source,
);

const nombre = computed(
  () => limpiarEspacios(userStore.userInfo?.realName) || userStore.userInfo?.username || 'Jurado',
);

/**
 * Mientras evalúa, la hoja ocupa toda la pantalla (tiene su propio «volver»):
 * así cabe entera sin scroll incluso en celulares chicos.
 */
const pantallaCompleta = computed(() => route.name === 'JuradoEvaluar');

function cambiarTema() {
  updatePreferences({ theme: { mode: isDark.value ? 'light' : 'dark' } });
}

async function salir() {
  const ok = await confirmar({
    mensaje: 'Tendrás que volver a iniciar sesión para seguir evaluando.',
    textoAceptar: 'Salir',
    titulo: '¿Cerrar sesión?',
  });
  if (ok) await authStore.logout();
}
</script>

<template>
  <div class="flex h-dvh flex-col bg-background text-foreground">
    <header
      v-if="!pantallaCompleta"
      class="flex shrink-0 items-center gap-3 border-b border-border bg-card px-4 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))]"
    >
      <img v-if="logo" :src="logo" alt="" class="size-8 shrink-0" />
      <div class="min-w-0 flex-1 leading-tight">
        <div class="truncate text-sm font-semibold">{{ preferences.app.name }}</div>
        <div class="truncate text-xs text-muted-foreground">Jurado</div>
      </div>
      <span class="hidden max-w-48 truncate text-sm sm:block">{{ nombre }}</span>
      <span
        class="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary"
        :title="nombre"
      >
        {{ inicialesDeNombre(nombre) || 'J' }}
      </span>
      <button
        :title="isDark ? 'Tema claro' : 'Tema oscuro'"
        class="semfa-jurado-barra-btn"
        type="button"
        @click="cambiarTema"
      >
        <IconifyIcon :icon="isDark ? 'lucide:sun' : 'lucide:moon'" class="size-5" />
      </button>
      <button class="semfa-jurado-barra-btn" title="Salir" type="button" @click="salir">
        <IconifyIcon class="size-5" icon="lucide:log-out" />
      </button>
    </header>

    <main class="min-h-0 flex-1 overflow-y-auto">
      <RouterView />
    </main>
  </div>
</template>

<style scoped>
.semfa-jurado-barra-btn {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  color: hsl(var(--muted-foreground));
  cursor: pointer;
  border-radius: 10px;
  transition:
    background-color 0.15s ease,
    color 0.15s ease;
}

.semfa-jurado-barra-btn:hover {
  color: hsl(var(--primary));
  background: hsl(var(--primary) / 10%);
}
</style>
