<script lang="ts" setup>
import { onMounted } from 'vue';

import { useAccessStore, useUserStore } from '@vben/stores';

defineOptions({ name: 'JuradoIrAWeb' });

/**
 * Inicio del jurado en la administración: le pasa su sesión a la app web ligera
 * (`/evaluar`, `jurado.html`) y lo lleva ahí. Esa app pesa mucho menos, guarda sus
 * proyectos en el celular y envía sus notas aunque la señal se corte (como la APK).
 *
 * La clave y la forma son las de `views/semfa/jurado-web/sesion.ts`. Las pantallas
 * anteriores siguen en `/jurado/participantes` como respaldo.
 */
const accessStore = useAccessStore();
const userStore = useUserStore();

onMounted(() => {
  const token = accessStore.accessToken;
  const info = userStore.userInfo;
  if (token && info?.username) {
    try {
      localStorage.setItem(
        'semfa.jw.sesion',
        JSON.stringify({
          idUsuario: Number(info.userId) || null,
          nombre: (info.realName || info.username).replaceAll(/\s+/g, ' ').trim(),
          token,
          usuario: info.username,
        }),
      );
    } catch {
      // Sin almacenamiento: la app ligera pedirá ingresar.
    }
  }
  window.location.replace('/evaluar');
});
</script>

<template>
  <div class="flex h-full items-center justify-center text-sm text-muted-foreground">Abriendo tus evaluaciones…</div>
</template>
