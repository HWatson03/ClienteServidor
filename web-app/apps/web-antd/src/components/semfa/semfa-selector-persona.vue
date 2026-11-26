<script lang="ts" setup>
/**
 * Selector de persona con búsqueda por nombre o CI y botones «Editar» / «Nueva»,
 * que abren el formulario de Persona encima sin salir del formulario actual.
 *
 * El padre carga la lista (`v-model:personas`) y pone el `FormItem` con sus
 * reglas; este componente la recarga tras un alta o edición y deja seleccionada
 * a la persona guardada.
 *
 * `etiquetas` marca cada opción (p. ej. «Ya es jurado»); una etiqueta de tipo
 * `bloqueo` deshabilita la opción.
 */
import type { EtiquetaPersona, PersonaRespaldo } from './tipos';

import type { Persona, PersonaForm } from '#/api/personas';

import { computed, ref } from 'vue';

import { IconifyIcon } from '@vben/icons';

import { Button, Select, Tooltip } from 'ant-design-vue';

import { actualizarPersona, crearPersona, listarPersonas } from '#/api/personas';
import { avisar } from '#/composables/useAvisos';
import { iniciales, inicialesDeNombre, normalizarTexto } from '#/utils/formato';
import PersonaFormModal from '#/views/semfa/administracion/persona/form-modal.vue';

import SemfaAvatar from './semfa-avatar.vue';

defineOptions({ name: 'SemfaSelectorPersona' });

const props = withDefaults(
  defineProps<{
    cargando?: boolean;
    disabled?: boolean;
    etiquetas?: (persona: Persona) => EtiquetaPersona[];
    /** Persona del registro en edición, por si ya no está activa en la lista. */
    respaldo?: null | PersonaRespaldo;
  }>(),
  { cargando: false, disabled: false, etiquetas: () => [], respaldo: null },
);

const emit = defineEmits<{
  /** Se editaron los datos de una persona: la vista puede recargar su tabla. */
  personaActualizada: [persona: Persona];
}>();

const valor = defineModel<number | undefined>('value');
const personas = defineModel<Persona[]>('personas', { required: true });

const selectRef = ref<{ focus: () => void }>();

const opciones = computed(() => {
  const lista = personas.value.map((p) => {
    const marcas = props.etiquetas(p);
    return {
      busqueda: `${p.nombreCompleto} ${p.ci ?? ''}`,
      ci: p.ci,
      disabled: marcas.some((m) => m.tipo === 'bloqueo'),
      etiquetas: marcas,
      iniciales: iniciales(p.nombres, p.paterno, p.materno),
      label: `${p.nombreCompleto} · CI ${p.ci ?? '—'}`,
      nombre: p.nombreCompleto,
      value: p.idPersona,
    };
  });
  const r = props.respaldo;
  if (r && !personas.value.some((p) => p.idPersona === r.idPersona)) {
    lista.unshift({
      busqueda: `${r.nombre ?? ''} ${r.ci ?? ''}`,
      ci: r.ci,
      disabled: false,
      etiquetas: [],
      iniciales: inicialesDeNombre(r.nombre),
      label: `${r.nombre ?? '—'} · CI ${r.ci ?? '—'}`,
      nombre: r.nombre ?? '—',
      value: r.idPersona,
    });
  }
  return lista;
});

const hayElegida = computed(() => opciones.value.some((o) => o.value === valor.value));

function filtrar(entrada: string, opcion: any) {
  return normalizarTexto(opcion?.busqueda).includes(normalizarTexto(entrada.trim()));
}

const CLASE_ETIQUETA = {
  aviso: 'bg-amber-500/10 text-amber-600',
  bloqueo: 'bg-red-500/10 text-red-600',
  info: 'bg-primary/10 text-primary',
} as const;

// ---------------------------------------------------------------- alta y edición rápidas

const modalAbierto = ref(false);
const guardando = ref(false);
/** `null` = alta de una persona nueva; si no, la persona que se está corrigiendo. */
const enEdicion = ref<null | Persona>(null);

function abrirNueva() {
  enEdicion.value = null;
  modalAbierto.value = true;
}

function abrirEditar() {
  enEdicion.value = personas.value.find((p) => p.idPersona === valor.value) ?? null;
  if (enEdicion.value) {
    modalAbierto.value = true;
  }
}

async function alGuardar(payload: PersonaForm) {
  guardando.value = true;
  try {
    const { idPersona, ...datos } = payload;
    const guardada =
      idPersona === undefined
        ? await crearPersona(datos)
        : await actualizarPersona(idPersona, datos);
    avisar(
      idPersona === undefined
        ? {
            mensaje: `Persona «${guardada.nombreCompleto}» se registró y quedó seleccionada.`,
            tipo: 'exito',
            titulo: 'Registro guardado',
          }
        : {
            mensaje: `Persona «${guardada.nombreCompleto}» se actualizó correctamente.`,
            tipo: 'exito',
            titulo: 'Cambios guardados',
          },
    );
    personas.value = (await listarPersonas()) ?? [];
    valor.value = guardada.idPersona;
    modalAbierto.value = false;
    if (idPersona !== undefined) {
      emit('personaActualizada', guardada);
    }
  } catch {
    // El interceptor de errores ya notificó; el modal de persona sigue abierto.
  } finally {
    guardando.value = false;
  }
}

defineExpose({ focus: () => selectRef.value?.focus() });
</script>

<template>
  <div class="flex gap-2">
    <Select
      ref="selectRef"
      v-model:value="valor"
      :disabled="disabled"
      :filter-option="filtrar"
      :loading="cargando"
      :options="opciones"
      class="min-w-0 flex-1"
      placeholder="Buscar persona por nombre o CI…"
      show-search
      size="large"
    >
      <template #option="{ ci, iniciales: ini, nombre, etiquetas: marcas }">
        <div class="flex items-center gap-3 py-0.5">
          <SemfaAvatar :texto="ini" tamano="md" />
          <div class="min-w-0 flex-1">
            <div class="truncate">{{ nombre }}</div>
            <div class="text-xs text-muted-foreground">CI {{ ci ?? '—' }}</div>
          </div>
          <span
            v-for="m in marcas as EtiquetaPersona[]"
            :key="m.texto"
            :class="CLASE_ETIQUETA[m.tipo]"
            :title="m.titulo"
            class="shrink-0 rounded-full px-2 py-0.5 text-xs"
          >
            {{ m.texto }}
          </span>
        </div>
      </template>
    </Select>

    <Tooltip title="Corregir nombre o CI de la persona elegida">
      <Button
        :disabled="disabled || !hayElegida"
        class="semfa-btn semfa-btn--neutro shrink-0"
        size="large"
        @click="abrirEditar"
      >
        <IconifyIcon class="size-4" icon="lucide:user-pen" />
        <span class="hidden sm:inline">Editar</span>
      </Button>
    </Tooltip>
    <Tooltip title="Registrar una persona que no está en la lista">
      <Button
        :disabled="disabled"
        class="semfa-btn semfa-btn--suave-primario shrink-0"
        size="large"
        @click="abrirNueva"
      >
        <IconifyIcon class="size-4" icon="lucide:user-plus" />
        <span class="hidden sm:inline">Nueva</span>
      </Button>
    </Tooltip>
  </div>

  <PersonaFormModal
    v-model:open="modalAbierto"
    :guardando="guardando"
    :permitir-continuar="false"
    :persona="enEdicion"
    :personas="personas"
    @guardar="alGuardar"
  />
</template>
