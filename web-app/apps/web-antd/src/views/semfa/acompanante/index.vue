<script setup lang="ts">
import { useAuthStore } from '#/store';
import { Button } from 'ant-design-vue';
const auth = useAuthStore();
</script>

<template>
  <main class="flex min-h-screen items-center justify-center bg-slate-50 p-5 text-center dark:bg-slate-950">
    <div class="max-w-md rounded-xl border bg-white p-8 shadow dark:bg-slate-900">
      <div class="text-5xl">📍</div>
      <h1 class="mt-4 text-xl font-semibold">Acompañamiento de danzas</h1>
      <p class="mt-3">Esta cuenta comparte la ubicación desde la APK SEMFA instalada en el teléfono. Abra la app e inicie la ubicación cuando acompañe a su danza.</p>
      <Button class="semfa-btn semfa-btn--neutro mt-4" @click="auth.logout()">Salir</Button>
    </div>
  </main>
</template>
