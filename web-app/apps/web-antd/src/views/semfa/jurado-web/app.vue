<script lang="ts" setup>
import { computed, ref } from 'vue';
import { RouterView, useRoute, useRouter } from 'vue-router';

import { inicialesDeNombre } from '#/utils/formato';

import { confirmar } from './avisos';
import AvisosVue from './avisos.vue';
import { pendientesDeSubir, red, sincronizar } from './datos';
import Icono from './icono.vue';
import { cerrarSesion, sesion } from './sesion';

defineOptions({ name: 'JwApp' });

/**
 * Armazón de la app web ligera del jurado: una barra mínima (nombre, estado de la
 * conexión, tema y «Salir») y la pantalla. Igual que `layouts/jurado.vue` de la
 * administración, pero sin vben: la hoja de evaluación ocupa toda la pantalla.
 */
const route = useRoute();
const router = useRouter();

const pantallaCompleta = computed(() => route.name === 'JwHoja');
const logo = `${import.meta.env.BASE_URL}Logo_semfa.png`;

const oscuro = ref(document.documentElement.classList.contains('dark'));
function cambiarTema() {
  oscuro.value = !oscuro.value;
  document.documentElement.classList.toggle('dark', oscuro.value);
  try {
    localStorage.setItem('semfa.jw.tema', oscuro.value ? 'dark' : 'light');
  } catch {
    // nada
  }
}

/** Estado de la conexión en una línea: lo que el jurado necesita saber. */
const estadoRed = computed(() => {
  const n = pendientesDeSubir.value;
  if (sesion.value?.vencida) return { clase: 'is-alerta', icono: 'lock', texto: n > 0 ? `Sesión vencida · ${n} por enviar` : 'Sesión vencida' };
  if (red.subiendo) return { clase: 'is-proceso', icono: 'cloud-upload', texto: `Enviando ${n}…` };
  if (!red.conectado) return { clase: 'is-alerta', icono: 'wifi-off', texto: n > 0 ? `Sin señal · ${n} por enviar` : 'Sin señal' };
  if (n > 0) return { clase: 'is-proceso', icono: 'cloud-upload', texto: `${n} por enviar` };
  return { clase: 'is-ok', icono: 'wifi', texto: 'En línea' };
});

function tocarEstado() {
  if (sesion.value?.vencida) router.push({ name: 'JwIngresar', query: { usuario: sesion.value.usuario } });
  else void sincronizar(true);
}

async function salir() {
  const n = pendientesDeSubir.value;
  const ok = await confirmar({
    mensaje:
      n > 0
        ? `Tienes ${n} evaluación(es) guardadas en este celular que aún no llegaron al servidor. Se enviarán cuando vuelvas a ingresar con tu usuario en este mismo celular.`
        : 'Tendrás que volver a ingresar para seguir evaluando.',
    peligro: n > 0,
    textoAceptar: 'Salir',
    titulo: '¿Cerrar sesión?',
  });
  if (!ok) return;
  cerrarSesion();
  router.replace({ name: 'JwIngresar' });
}
</script>

<template>
  <div class="flex h-dvh flex-col bg-background text-foreground">
    <header
      v-if="sesion && !pantallaCompleta && route.name !== 'JwIngresar'"
      class="flex shrink-0 items-center gap-2 border-b border-border bg-card px-3 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))] sm:gap-3 sm:px-4"
    >
      <img :src="logo" alt="" class="size-8 shrink-0" />
      <div class="min-w-0 flex-1 leading-tight">
        <div class="truncate text-sm font-semibold">{{ sesion.nombre }}</div>
        <button :class="estadoRed.clase" class="jw-red" type="button" @click="tocarEstado">
          <Icono :class="{ 'animate-pulse': red.subiendo }" :icon="estadoRed.icono" class="size-3.5" />
          <span class="truncate">{{ estadoRed.texto }}</span>
        </button>
      </div>
      <span
        class="hidden size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary sm:flex"
        :title="sesion.nombre"
      >
        {{ inicialesDeNombre(sesion.nombre) || 'J' }}
      </span>
      <button :title="oscuro ? 'Tema claro' : 'Tema oscuro'" class="jw-barra-btn" type="button" @click="cambiarTema">
        <Icono :icon="oscuro ? 'sun' : 'moon'" class="size-5" />
      </button>
      <button class="jw-barra-btn" title="Salir" type="button" @click="salir">
        <Icono class="size-5" icon="log-out" />
      </button>
    </header>

    <main class="min-h-0 flex-1 overflow-y-auto">
      <RouterView />
    </main>

    <AvisosVue />
  </div>
</template>

<style scoped>
.jw-barra-btn {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  color: hsl(var(--muted-foreground));
  cursor: pointer;
  border-radius: 10px;
}

.jw-red {
  display: inline-flex;
  gap: 4px;
  align-items: center;
  max-width: 100%;
  padding: 1px 8px 1px 6px;
  margin-top: 2px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  border-radius: 9999px;
}

.jw-red.is-ok {
  color: rgb(4 120 87);
  background: rgb(16 185 129 / 14%);
}

.jw-red.is-proceso {
  color: rgb(3 105 161);
  background: rgb(14 165 233 / 14%);
}

.jw-red.is-alerta {
  color: rgb(180 83 9);
  background: rgb(245 158 11 / 16%);
}

:global(.dark) .jw-red.is-ok {
  color: rgb(110 231 183);
}

:global(.dark) .jw-red.is-proceso {
  color: rgb(125 211 252);
}

:global(.dark) .jw-red.is-alerta {
  color: rgb(252 211 77);
}
</style>
