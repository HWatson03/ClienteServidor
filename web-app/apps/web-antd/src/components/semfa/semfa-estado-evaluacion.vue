<script lang="ts" setup>
import type { Actividad, EstadoEvaluacionActividad } from '#/api/actividades';

import { computed, ref } from 'vue';

import { IconifyIcon } from '@vben/icons';

import { Dropdown, Menu, Spin } from 'ant-design-vue';

import { cambiarEstadoEvaluacion } from '#/api/actividades';
import { avisar, confirmar } from '#/composables/useAvisos';
import { useActividadTrabajoStore } from '#/store';
import { ESTADOS_EVALUACION, ORDEN_ESTADOS_EVALUACION } from '#/utils/estado-evaluacion';
import { limpiarEspacios } from '#/utils/formato';

defineOptions({ name: 'SemfaEstadoEvaluacion' });

/**
 * Estado de la evaluación de una actividad (en preparación / abierta / cerrada)
 * como etiqueta con menú para cambiarlo. Pide confirmación explicando qué verán
 * los jurados en su app.
 */
const props = defineProps<{
  actividad: Actividad;
  grande?: boolean;
  /** Problemas que impiden evaluar (del resumen): se advierten al abrir. */
  problemas?: number;
}>();

const emit = defineEmits<{ cambiado: [actividad: Actividad] }>();

const trabajo = useActividadTrabajoStore();
const guardando = ref(false);

const actual = computed(() => ESTADOS_EVALUACION[props.actividad.estadoEvaluacion] ?? ESTADOS_EVALUACION.ABIERTA);

const ACCION: Record<EstadoEvaluacionActividad, { boton: string; titulo: string }> = {
  ABIERTA: { boton: 'Abrir evaluación', titulo: 'Abrir la evaluación' },
  CERRADA: { boton: 'Cerrar evaluación', titulo: 'Cerrar la evaluación' },
  EN_PREPARACION: { boton: 'Volver a preparación', titulo: 'Volver a preparación' },
};

function mensajeDe(estado: EstadoEvaluacionActividad) {
  const nombre = limpiarEspacios(props.actividad.nombre);
  switch (estado) {
    case 'ABIERTA': {
      return props.actividad.estadoEvaluacion === 'CERRADA'
        ? `«${nombre}» volverá a aparecer en la app de sus jurados y podrán corregir sus calificaciones.`
        : `«${nombre}» aparecerá en la app de los jurados asignados y podrán empezar a calificar.${
            props.problemas
              ? ` Atención: el resumen muestra ${props.problemas} problema(s) que impiden evaluar parte de la actividad.`
              : ' Revise antes que categorías, rúbricas, jurados y orden de presentación estén listos.'
          }`;
    }
    case 'CERRADA': {
      return `Los jurados dejarán de ver «${nombre}» y el sistema rechazará nuevas calificaciones. Lo ya calificado se conserva para resultados y reportes. Puede reabrirla después.`;
    }
    default: {
      return `Los jurados dejarán de ver «${nombre}» mientras termina de configurarla. Lo ya calificado se conserva.`;
    }
  }
}

async function cambiar(estado: EstadoEvaluacionActividad) {
  if (estado === props.actividad.estadoEvaluacion || guardando.value) return;
  const ok = await confirmar({
    mensaje: mensajeDe(estado),
    peligro: estado === 'CERRADA',
    textoAceptar: ACCION[estado].boton,
    titulo: ACCION[estado].titulo,
  });
  if (!ok) return;
  guardando.value = true;
  try {
    const nueva = await cambiarEstadoEvaluacion(props.actividad.idActividad, estado);
    trabajo.reemplazar(nueva);
    emit('cambiado', nueva);
    avisar({
      mensaje: ESTADOS_EVALUACION[estado].ayuda,
      tipo: 'exito',
      titulo: `${limpiarEspacios(props.actividad.nombre)}: ${ESTADOS_EVALUACION[estado].texto.toLowerCase()}`,
    });
  } catch {
    // El interceptor ya avisó.
  } finally {
    guardando.value = false;
  }
}
</script>

<template>
  <Dropdown :disabled="guardando" :trigger="['click']">
    <button
      :class="[actual.clase, grande ? 'px-3 py-1.5 text-sm' : 'px-2 py-0.5 text-xs']"
      :title="`${actual.ayuda} Clic para cambiar.`"
      class="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full font-medium transition hover:brightness-95"
      type="button"
    >
      <Spin v-if="guardando" size="small" />
      <IconifyIcon v-else :icon="actual.icono" :class="grande ? 'size-4' : 'size-3.5'" />
      {{ actual.texto }}
      <IconifyIcon class="size-3 opacity-70" icon="lucide:chevron-down" />
    </button>
    <template #overlay>
      <Menu @click="({ key }) => cambiar(key as EstadoEvaluacionActividad)">
        <Menu.Item
          v-for="estado in ORDEN_ESTADOS_EVALUACION"
          :key="estado"
          :disabled="estado === actividad.estadoEvaluacion"
        >
          <div class="flex max-w-80 items-start gap-2 py-0.5">
            <span :class="ESTADOS_EVALUACION[estado].punto" class="mt-1.5 size-2 shrink-0 rounded-full"></span>
            <div>
              <div class="font-medium">
                {{ ESTADOS_EVALUACION[estado].texto }}
                <span v-if="estado === actividad.estadoEvaluacion" class="text-xs font-normal text-muted-foreground">· actual</span>
              </div>
              <div class="whitespace-normal text-xs text-muted-foreground">{{ ESTADOS_EVALUACION[estado].ayuda }}</div>
            </div>
          </div>
        </Menu.Item>
      </Menu>
    </template>
  </Dropdown>
</template>
