<script setup lang="ts">
import { computed } from 'vue';

import { Page } from '@vben/common-ui';
import { useUserStore } from '@vben/stores';

const userStore = useUserStore();

const nombre = computed(
  () => userStore.userInfo?.realName || userStore.userInfo?.username || '—',
);
</script>

<template>
  <Page
    description="Cronómetro compartido y control de participantes por categoría."
    title="Panel de Control"
  >
    <div class="flex flex-col gap-4">
      <div class="rounded-lg border bg-white p-4 dark:bg-neutral-900">
        <div class="text-sm opacity-70">Coordinador</div>
        <div class="mt-1 font-medium">{{ nombre }}</div>
      </div>

      <div
        class="flex min-h-[40vh] flex-col items-center justify-center gap-2 rounded-lg border border-dashed text-center"
      >
        <div class="text-lg font-medium">Cronómetro</div>
        <div class="text-sm opacity-70">
          Se conectará por Server-Sent Events a `CronometroSseService` del
          backend.
        </div>
      </div>
    </div>
  </Page>
</template>
