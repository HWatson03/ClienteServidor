<script lang="ts" setup>
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import Icono from './icono.vue';
import { ErrorApi } from './red';
import { ingresar, sesion } from './sesion';

defineOptions({ name: 'JwIngresar' });

/**
 * Ingreso del jurado con su usuario y contraseña (los mismos de la APK). Si la sesión
 * venció, el usuario viene ya escrito y lo descargado y la cola se conservan.
 */
const route = useRoute();
const router = useRouter();

const usuario = ref(String(route.query.usuario ?? sesion.value?.usuario ?? ''));
const clave = ref('');
const verClave = ref(false);
const enviando = ref(false);
const error = ref('');
const campoClave = ref<HTMLInputElement>();
const logo = `${import.meta.env.BASE_URL}Logo_semfa.png`;

const vencida = computed(() => Boolean(sesion.value?.vencida));
const listo = computed(() => usuario.value.trim().length > 0 && clave.value.length > 0 && !enviando.value);

onMounted(() => {
  if (usuario.value) campoClave.value?.focus();
});

async function enviar() {
  if (!listo.value) return;
  enviando.value = true;
  error.value = '';
  try {
    await ingresar(usuario.value.trim(), clave.value);
    router.replace({ name: 'JwLista' });
  } catch (e) {
    error.value =
      e instanceof ErrorApi && e.status === 0
        ? 'No hay conexión con el servidor. Revisa tu señal o Wi-Fi e inténtalo de nuevo.'
        : e instanceof Error
          ? e.message
          : 'No se pudo ingresar.';
  } finally {
    enviando.value = false;
  }
}
</script>

<template>
  <div class="flex min-h-full flex-col items-center justify-center px-4 py-8">
    <form class="jw-ingreso w-full max-w-sm" @submit.prevent="enviar">
      <div class="mb-6 flex flex-col items-center gap-2 text-center">
        <img :src="logo" alt="" class="size-16" />
        <h1 class="m-0 text-2xl font-bold">SEMFA · Jurado</h1>
        <p class="m-0 text-sm text-muted-foreground">
          Evalúa desde el navegador de tu celular. Funciona aunque la señal se corte.
        </p>
      </div>

      <div v-if="vencida" class="mb-4 rounded-xl bg-amber-500/12 px-3 py-2 text-sm text-amber-700 dark:text-amber-300">
        Tu sesión venció. Vuelve a ingresar: tus evaluaciones guardadas en este celular se enviarán solas.
      </div>

      <label class="jw-campo">
        <Icono class="size-5 text-muted-foreground" icon="user" />
        <input
          v-model="usuario"
          aria-label="Usuario"
          autocapitalize="none"
          autocomplete="username"
          autocorrect="off"
          enterkeyhint="next"
          placeholder="Usuario"
          spellcheck="false"
          type="text"
          @keydown.enter.prevent="campoClave?.focus()"
        />
      </label>

      <label class="jw-campo mt-3">
        <Icono class="size-5 text-muted-foreground" icon="lock" />
        <input
          ref="campoClave"
          v-model="clave"
          :type="verClave ? 'text' : 'password'"
          aria-label="Contraseña"
          autocomplete="current-password"
          enterkeyhint="go"
          placeholder="Contraseña"
        />
        <button
          :title="verClave ? 'Ocultar contraseña' : 'Mostrar contraseña'"
          class="jw-campo__ojo"
          type="button"
          @click="verClave = !verClave"
        >
          <Icono :icon="verClave ? 'eye-off' : 'eye'" class="size-5" />
        </button>
      </label>

      <p v-if="error" class="mb-0 mt-3 text-sm text-red-600 dark:text-red-400" role="alert">{{ error }}</p>

      <button :disabled="!listo" class="semfa-btn semfa-btn--primario mt-5 w-full" type="submit">
        <Icono v-if="enviando" class="size-5 animate-spin" icon="loader-circle" />
        {{ enviando ? 'Ingresando…' : 'Ingresar' }}
      </button>

      <p class="mb-0 mt-6 text-center text-xs leading-relaxed text-muted-foreground">
        Usa el usuario y la contraseña que te dio la organización.<br />
        Después de ingresar, tus proyectos quedan guardados en el celular.
      </p>
    </form>
  </div>
</template>

<style scoped>
.jw-campo {
  display: flex;
  gap: 10px;
  align-items: center;
  min-height: 52px;
  padding: 0 6px 0 14px;
  background: hsl(var(--card));
  border: 1px solid hsl(var(--border));
  border-radius: 14px;
  box-shadow: 0 2px 0 hsl(var(--border));
}

.jw-campo:focus-within {
  border-color: hsl(var(--primary));
  box-shadow: 0 0 0 3px hsl(var(--primary) / 15%);
}

.jw-campo input {
  flex: 1;
  min-width: 0;
  height: 48px;
  font-size: 16px; /* 16px: iOS no hace zoom al enfocar */
  color: inherit;
  background: transparent;
  outline: none;
}

.jw-campo__ojo {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  color: hsl(var(--muted-foreground));
  cursor: pointer;
  border-radius: 10px;
}
</style>
