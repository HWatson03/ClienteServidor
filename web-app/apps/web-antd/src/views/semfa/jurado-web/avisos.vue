<script lang="ts" setup>
import { cerrarAviso, estadoAvisos } from './avisos';
import Icono from './icono.vue';

defineOptions({ name: 'JwAvisos' });

const ICONOS = {
  advertencia: 'triangle-alert',
  error: 'circle-x',
  exito: 'circle-check',
  info: 'circle-alert',
} as const;
</script>

<template>
  <div aria-live="polite" class="jw-avisos">
    <div v-for="a in estadoAvisos.avisos" :key="a.id" :class="`jw-aviso--${a.tipo}`" class="jw-aviso" role="status">
      <Icono :icon="ICONOS[a.tipo]" class="jw-aviso__icono size-5" />
      <div class="min-w-0 flex-1">
        <div class="font-semibold leading-snug">{{ a.titulo }}</div>
        <div v-if="a.mensaje" class="text-sm leading-snug opacity-85">{{ a.mensaje }}</div>
      </div>
      <button class="jw-aviso__cerrar" title="Cerrar" type="button" @click="cerrarAviso(a.id)">
        <Icono class="size-4" icon="x" />
      </button>
    </div>
  </div>

  <div v-if="estadoAvisos.confirmacion" class="jw-velo" @click.self="estadoAvisos.confirmacion.resolver(false)">
    <div aria-modal="true" class="jw-dialogo" role="alertdialog">
      <div class="text-lg font-semibold leading-snug">{{ estadoAvisos.confirmacion.titulo }}</div>
      <p v-if="estadoAvisos.confirmacion.mensaje" class="mb-0 mt-2 text-sm leading-relaxed text-muted-foreground">
        {{ estadoAvisos.confirmacion.mensaje }}
      </p>
      <div class="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button class="semfa-btn semfa-btn--neutro" type="button" @click="estadoAvisos.confirmacion.resolver(false)">
          {{ estadoAvisos.confirmacion.textoCancelar ?? 'Cancelar' }}
        </button>
        <button
          :class="estadoAvisos.confirmacion.peligro ? 'semfa-btn--peligro' : 'semfa-btn--primario'"
          class="semfa-btn"
          type="button"
          @click="estadoAvisos.confirmacion.resolver(true)"
        >
          {{ estadoAvisos.confirmacion.textoAceptar ?? 'Aceptar' }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.jw-avisos {
  position: fixed;
  top: max(10px, env(safe-area-inset-top));
  left: 50%;
  z-index: 60;
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: min(440px, calc(100vw - 20px));
  pointer-events: none;
  transform: translateX(-50%);
}

.jw-aviso {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  padding: 10px 8px 10px 12px;
  color: hsl(var(--foreground));
  pointer-events: auto;
  background: hsl(var(--card));
  border: 1px solid hsl(var(--border));
  border-left: 4px solid var(--jw-aviso);
  border-radius: 12px;
  box-shadow: 0 8px 24px -8px rgb(0 0 0 / 30%);
}

.jw-aviso__icono {
  margin-top: 1px;
  color: var(--jw-aviso);
}

.jw-aviso--exito { --jw-aviso: #10b981; }
.jw-aviso--info { --jw-aviso: hsl(var(--primary)); }
.jw-aviso--advertencia { --jw-aviso: #f59e0b; }
.jw-aviso--error { --jw-aviso: #ef4444; }

.jw-aviso__cerrar {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  color: hsl(var(--muted-foreground));
  cursor: pointer;
  border-radius: 8px;
}

.jw-velo {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: grid;
  place-items: center;
  padding: 16px;
  background: rgb(0 0 0 / 45%);
}

.jw-dialogo {
  width: min(420px, 100%);
  max-height: calc(100dvh - 32px);
  padding: 20px;
  overflow-y: auto;
  background: hsl(var(--card));
  border: 1px solid hsl(var(--border));
  border-radius: 18px;
  box-shadow: 0 20px 50px -12px rgb(0 0 0 / 45%);
}
</style>
