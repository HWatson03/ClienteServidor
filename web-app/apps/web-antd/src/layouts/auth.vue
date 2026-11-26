<script lang="ts" setup>
import type { ToolbarType } from '@vben/layouts';

import { computed } from 'vue';

import { AuthPageLayout } from '@vben/layouts';
import { preferences } from '@vben/preferences';

import { $t } from '#/locales';

const appName = computed(() => preferences.app.name);
const logo = computed(() => preferences.logo.source);
const logoDark = computed(() => preferences.logo.sourceDark);
const logoMarca = `${import.meta.env.BASE_URL}lestrade-mark.svg`;
/**
 * Widgets visibles en la toolbar del login.
 * Se ocultan la paleta de colores ('color'), la herramienta de alineación
 * ('layout') y el cambio de idioma ('language'). Para restaurar alguno, basta
 * con agregarlo de vuelta acá; el default del framework es
 * `['color', 'language', 'layout', 'theme']`.
 */
const toolbarList: ToolbarType[] = ['theme'];
</script>

<template>
  <AuthPageLayout
    :app-name="appName"
    :logo="logo"
    :logo-dark="logoDark"
    :slogan-image="logoMarca"
    :page-description="$t('authentication.pageDesc')"
    :page-title="$t('authentication.pageTitle')"
    :toolbar-list="toolbarList"
  >
    <template #logo>
      <div class="absolute top-0 left-0 z-10 flex items-center gap-2 p-4 sm:p-6">
        <img :src="logoMarca" alt="" class="size-8" />
        <span class="max-w-44 text-sm font-semibold leading-tight text-foreground">Lestrade</span>
      </div>
    </template>
    <!-- Toolbar personalizada -->
    <!-- <template #toolbar></template> -->
  </AuthPageLayout>
</template>
