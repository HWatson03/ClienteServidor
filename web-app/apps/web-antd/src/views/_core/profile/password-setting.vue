<script lang="ts" setup>
import { computed, ref } from 'vue';

import { useUserStore } from '@vben/stores';
import { Alert, Button, Card, Form, FormItem, Input, message } from 'ant-design-vue';

import { cambiarContrasenaApi } from '#/api/core/auth';

const userStore = useUserStore();
const actual = ref('');
const nueva = ref('');
const confirmar = ref('');
const guardando = ref(false);
const puedeEnviar = computed(() => actual.value.length > 0 && nueva.value.length >= 8 && nueva.value === confirmar.value);

async function guardar() {
  if (!puedeEnviar.value || !userStore.userInfo?.username) return;
  guardando.value = true;
  try {
    await cambiarContrasenaApi({ nombreUsuario: userStore.userInfo.username, contrasenaActual: actual.value, contrasenaNueva: nueva.value });
    message.success('Contraseña actualizada. Inicia sesión nuevamente con tu nueva contraseña.');
    actual.value = '';
    nueva.value = '';
    confirmar.value = '';
  } catch (error: any) {
    message.error(error?.mensaje ?? error?.message ?? 'No se pudo cambiar la contraseña.');
  } finally {
    guardando.value = false;
  }
}
</script>

<template>
  <Card title="Cambiar contraseña">
    <Alert class="mb-4" message="Al cambiar la contraseña se cerrarán las sesiones activas de esta cuenta." show-icon type="info" />
    <Form layout="vertical" @finish="guardar">
      <FormItem label="Contraseña actual" required>
        <Input.Password v-model:value="actual" autocomplete="current-password" />
      </FormItem>
      <FormItem label="Nueva contraseña" required help="Debe tener al menos 8 caracteres.">
        <Input.Password v-model:value="nueva" autocomplete="new-password" />
      </FormItem>
      <FormItem label="Confirmar nueva contraseña" required :validate-status="confirmar && nueva !== confirmar ? 'error' : undefined" :help="confirmar && nueva !== confirmar ? 'Las contraseñas no coinciden.' : undefined">
        <Input.Password v-model:value="confirmar" autocomplete="new-password" />
      </FormItem>
      <Button type="primary" html-type="submit" :loading="guardando" :disabled="!puedeEnviar">Actualizar contraseña</Button>
    </Form>
  </Card>
</template>
