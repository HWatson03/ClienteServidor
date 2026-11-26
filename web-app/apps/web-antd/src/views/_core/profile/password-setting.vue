<script lang="ts" setup>
import { Alert, Card } from 'ant-design-vue';
</script>

<template>
  <Card title="Cambiar contraseña">
    <Alert
      message="El backend todavía no expone un endpoint de cambio de contraseña (POST /api/auth/password). Esta pantalla se habilitará cuando exista."
      show-icon
      type="warning"
    />
  </Card>
</template>
