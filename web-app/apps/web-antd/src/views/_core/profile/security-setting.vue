<script setup lang="ts">
import { computed } from 'vue';

import { ProfileSecuritySetting } from '@vben/common-ui';

const formSchema = computed(() => {
  return [
    {
      value: true,
      fieldName: 'accountPassword',
      label: 'Contraseña de cuenta',
      description: 'Fortaleza de la contraseña: alta',
    },
    {
      value: true,
      fieldName: 'securityPhone',
      label: 'Teléfono de respaldo',
      description: 'Teléfono vinculado: 138****8293',
    },
    {
      value: true,
      fieldName: 'securityQuestion',
      label: 'Pregunta de seguridad',
      description:
        'No has configurado una pregunta de seguridad; protege tu cuenta con una',
    },
    {
      value: true,
      fieldName: 'securityEmail',
      label: 'Correo de respaldo',
      description: 'Correo vinculado: ant***sign.com',
    },
    {
      value: false,
      fieldName: 'securityMfa',
      label: 'Dispositivo MFA',
      description:
        'Sin dispositivo MFA vinculado; vincúlate uno para confirmación en dos pasos',
    },
  ];
});
</script>
<template>
  <ProfileSecuritySetting :form-schema="formSchema" />
</template>
