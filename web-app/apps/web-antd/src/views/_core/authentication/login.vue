<script lang="ts" setup>
import type { VbenFormSchema } from '@vben/common-ui';

import { computed } from 'vue';

import { AuthenticationLogin, z } from '@vben/common-ui';
import { $t } from '@vben/locales';

import { useAuthStore } from '#/store';

defineOptions({ name: 'Login' });

const authStore = useAuthStore();

const formSchema = computed((): VbenFormSchema[] => {
  return [
    {
      component: 'VbenInput',
      componentProps: {
        placeholder: $t('authentication.usernameTip'),
      },
      fieldName: 'username',
      label: 'Usuario',
      rules: z.string().min(1, { message: 'Escribe tu usuario' }),
    },
    {
      component: 'VbenInputPassword',
      componentProps: {
        placeholder: $t('authentication.password'),
      },
      fieldName: 'password',
      label: 'Contraseña',
      rules: z.string().min(1, { message: 'Escribe tu contraseña' }),
    },
  ];
});
</script>

<template>
  <div>
    <AuthenticationLogin
      :form-schema="formSchema"
      :loading="authStore.loginLoading"
      :show-code-login="false"
      :show-forget-password="false"
      :show-qrcode-login="false"
      :show-register="false"
      :show-remember-me="false"
      :show-third-party-login="false"
      title="Lestrade"
      sub-title="Inicia sesión para acceder a tu espacio"
      @submit="authStore.authLogin"
    />
    <div class="mt-4 text-center text-sm">
      <RouterLink to="/auth/solicitar-acceso" class="text-primary">Solicitar una cuenta cliente</RouterLink>
    </div>
  </div>
</template>
