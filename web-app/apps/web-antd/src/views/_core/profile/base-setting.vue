<script lang="ts" setup>
import { computed } from 'vue';

import { useUserStore } from '@vben/stores';

import {
  Alert,
  Card,
  Descriptions,
  DescriptionsItem,
  Tag,
} from 'ant-design-vue';

const userStore = useUserStore();

const userInfo = computed(() => userStore.userInfo ?? null);
const rol = computed(() => userInfo.value?.roles?.[0] ?? '—');
</script>

<template>
  <Card title="Información de la cuenta">
    <Alert
      class="mb-4"
      message="La edición de perfil se añadirá cuando el backend exponga un endpoint de actualización de la propia cuenta. Por ahora los datos provienen de GET /api/auth/me."
      show-icon
      type="info"
    />

    <Descriptions bordered :column="1">
      <DescriptionsItem label="ID de usuario">
        {{ userInfo?.idUsuario ?? '—' }}
      </DescriptionsItem>
      <DescriptionsItem label="Usuario">
        {{ userInfo?.username ?? '—' }}
      </DescriptionsItem>
      <DescriptionsItem label="Nombre completo">
        {{ userInfo?.realName ?? '—' }}
      </DescriptionsItem>
      <DescriptionsItem label="Rol">
        <Tag color="green">{{ rol }}</Tag>
      </DescriptionsItem>
      <DescriptionsItem label="Ruta de inicio">
        {{ userInfo?.homePath ?? '—' }}
      </DescriptionsItem>
    </Descriptions>
  </Card>
</template>
