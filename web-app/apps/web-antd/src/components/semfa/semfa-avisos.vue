<script lang="ts" setup>
/**
 * Pila de avisos de `useAvisos`, arriba a la derecha y por encima de los modales.
 * Se monta una sola vez en `app.vue`.
 *
 * El tiempo lo lleva la animación CSS de la barra inferior: al terminar cierra el
 * aviso, y al pasar el ratón se pausa (`animation-play-state`), así no hay
 * temporizadores que sincronizar.
 */
import type { TipoAviso } from '#/composables/useAvisos';

import { IconifyIcon } from '@vben/icons';

import { Button } from 'ant-design-vue';

import { useAvisos } from '#/composables/useAvisos';

defineOptions({ name: 'SemfaAvisos' });

const { avisos, cerrar } = useAvisos();

const ICONO: Record<TipoAviso, string> = {
  advertencia: 'lucide:triangle-alert',
  error: 'lucide:circle-x',
  exito: 'lucide:circle-check',
  info: 'lucide:info',
};

function ejecutar(id: number, alPulsar: () => void) {
  alPulsar();
  cerrar(id);
}
</script>

<template>
  <Teleport to="body">
    <div aria-live="polite" class="semfa-avisos">
      <TransitionGroup name="semfa-aviso">
        <div
          v-for="aviso in avisos"
          :key="aviso.id"
          :class="`semfa-aviso--${aviso.tipo}`"
          :role="aviso.tipo === 'error' ? 'alert' : 'status'"
          class="semfa-aviso"
        >
          <div class="flex items-start gap-3 px-4 pb-3 pt-3.5">
            <span class="semfa-aviso__icono">
              <IconifyIcon :icon="ICONO[aviso.tipo]" class="size-5" />
            </span>

            <div class="min-w-0 flex-1">
              <div class="text-base font-semibold leading-tight">
                {{ aviso.titulo }}
              </div>
              <div
                v-if="aviso.mensaje"
                class="mt-1 text-sm leading-snug text-muted-foreground"
              >
                {{ aviso.mensaje }}
              </div>
              <ul
                v-if="aviso.detalles?.length"
                class="mb-0 mt-1.5 list-disc space-y-0.5 pl-4 text-xs text-muted-foreground"
              >
                <li v-for="(d, i) in aviso.detalles" :key="i">{{ d }}</li>
              </ul>

              <div
                v-if="aviso.accion || aviso.tipo === 'error'"
                class="mt-2.5 flex gap-2"
              >
                <Button
                  v-if="aviso.accion"
                  class="semfa-btn semfa-btn--suave-primario"
                  size="small"
                  @click="ejecutar(aviso.id, aviso.accion.alPulsar)"
                >
                  {{ aviso.accion.texto }}
                </Button>
                <Button
                  v-if="aviso.tipo === 'error'"
                  class="semfa-btn semfa-btn--neutro"
                  size="small"
                  @click="cerrar(aviso.id)"
                >
                  Entendido
                </Button>
              </div>
            </div>

            <button
              aria-label="Cerrar aviso"
              class="semfa-aviso__cerrar"
              type="button"
              @click="cerrar(aviso.id)"
            >
              <IconifyIcon class="size-4" icon="lucide:x" />
            </button>
          </div>

          <!-- Tiempo restante: al acabar la animación se cierra -->
          <div
            v-if="aviso.duracion > 0"
            :style="{ animationDuration: `${aviso.duracion}ms` }"
            class="semfa-aviso__tiempo"
            @animationend="cerrar(aviso.id)"
          ></div>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>
