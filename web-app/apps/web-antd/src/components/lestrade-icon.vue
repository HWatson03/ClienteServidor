<script setup lang="ts">
withDefaults(defineProps<{ name: string; size?: number }>(), { size: 18 });
</script>

<template>
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.8"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <template v-if="name === 'users'">
      <path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="10" cy="7" r="4" />
      <path d="M20 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
    </template>
    <template v-else-if="name === 'cloud'">
      <path d="M20 16.2A4.8 4.8 0 0 0 18.2 7a6.2 6.2 0 0 0-11.8 1.8A4.5 4.5 0 0 0 7 18h11a3.8 3.8 0 0 0 2-1.8Z" />
    </template>
    <template v-else-if="name === 'database'">
      <ellipse cx="12" cy="5" rx="8" ry="3" /><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" />
    </template>
    <template v-else-if="name === 'chart'">
      <path d="M11 3a9 9 0 1 0 10 10H11V3Z" /><path d="M14 3.1A9 9 0 0 1 20.9 10H14V3.1Z" />
    </template>
    <template v-else-if="name === 'folder-open'">
      <path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v1H8a2 2 0 0 0-1.9 1.4L4 18H3V7Z" /><path d="m6 20 2-7a2 2 0 0 1 1.9-1.4H22l-2.2 7a2 2 0 0 1-1.9 1.4H6Z" />
    </template>
    <template v-else-if="name === 'folder-plus'">
      <path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" /><path d="M12 11v6m-3-3h6" />
    </template>
    <template v-else-if="name === 'upload'">
      <path d="M12 16V4m-5 5 5-5 5 5" /><path d="M5 14v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5" />
    </template>
    <template v-else-if="name === 'folder'">
      <path d="M3 6a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6Z" />
    </template>
    <template v-else-if="name === 'download'">
      <path d="M12 3v12m-5-5 5 5 5-5" /><path d="M5 16v4a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-4" />
    </template>
    <template v-else>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" /><path d="M14 2v6h6M8 13h8m-8 4h8" />
    </template>
  </svg>
</template>
