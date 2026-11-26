<script setup lang="ts">
import { reactive, ref } from 'vue';
import { Button, Card, Form, FormItem, Input, message } from 'ant-design-vue';
import { RouterLink } from 'vue-router';
import { solicitarAcceso } from '#/api/usuarios';

const enviando = ref(false);
const enviado = ref(false);
const datos = reactive({ nombres: '', apellidoPaterno: '', apellidoMaterno: '', ci: '', correo: '', telefono: '', nombreUsuario: '', contrasena: '', confirmarContrasena: '' });

async function enviar() {
  if (Object.entries(datos).some(([k, v]) => k !== 'confirmarContrasena' && !v.trim())) {
    message.warning('Completa todos los datos solicitados.'); return;
  }
  if (!datos.correo.includes('@') || datos.contrasena.length < 8) { message.warning('Revisa el correo y usa una contraseña de al menos 8 caracteres.'); return; }
  if (datos.contrasena !== datos.confirmarContrasena) { message.warning('Las contraseñas no coinciden.'); return; }
  enviando.value = true;
  try {
    const { confirmarContrasena, ...solicitud } = datos;
    await solicitarAcceso(solicitud);
    enviado.value = true;
  } catch { /* el interceptor presenta el mensaje del servidor */ }
  finally { enviando.value = false; }
}
</script>

<template>
  <div class="mx-auto flex min-h-full max-w-2xl items-center px-4 py-8">
    <Card class="w-full" :title="enviado ? 'Solicitud enviada' : 'Solicitar una cuenta cliente'">
      <template v-if="enviado">
        <p class="mb-5">Recibimos tus datos. El administrador revisará la solicitud y habilitará tu cuenta si es aprobada.</p>
        <RouterLink to="/auth/login">Volver al inicio de sesión</RouterLink>
      </template>
      <template v-else>
        <p class="mb-4 text-muted-foreground">Completa tus datos personales y el acceso que deseas usar. La cuenta queda pendiente de aprobación.</p>
        <Form layout="vertical">
          <div class="grid gap-x-4 md:grid-cols-2">
            <FormItem label="Nombres"><Input v-model:value="datos.nombres" :maxlength="100" /></FormItem>
            <FormItem label="Apellido paterno"><Input v-model:value="datos.apellidoPaterno" :maxlength="100" /></FormItem>
            <FormItem label="Apellido materno"><Input v-model:value="datos.apellidoMaterno" :maxlength="100" /></FormItem>
            <FormItem label="Cédula de identidad"><Input v-model:value="datos.ci" :maxlength="30" /></FormItem>
            <FormItem label="Correo electrónico"><Input v-model:value="datos.correo" type="email" :maxlength="180" /></FormItem>
            <FormItem label="Teléfono"><Input v-model:value="datos.telefono" :maxlength="40" /></FormItem>
          </div>
          <div class="mb-2 mt-2 font-medium">Datos de usuario y contraseña</div>
          <FormItem label="Nombre de usuario"><Input v-model:value="datos.nombreUsuario" :maxlength="50" autocomplete="username" /></FormItem>
          <FormItem label="Contraseña"><Input.Password v-model:value="datos.contrasena" autocomplete="new-password" /></FormItem>
          <FormItem label="Confirmar contraseña"><Input.Password v-model:value="datos.confirmarContrasena" autocomplete="new-password" /></FormItem>
          <Button type="primary" block :loading="enviando" @click="enviar">Enviar solicitud</Button>
          <div class="mt-4 text-center"><RouterLink to="/auth/login">Volver al inicio de sesión</RouterLink></div>
        </Form>
      </template>
    </Card>
  </div>
</template>
