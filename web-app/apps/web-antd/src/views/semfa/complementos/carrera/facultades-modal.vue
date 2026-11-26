<script lang="ts" setup>
/**
 * Catálogo de facultades (global: lo comparten todas las actividades). Lista
 * pequeña con alta, edición en la misma fila y borrado; el backend rechaza (409)
 * borrar una facultad que todavía tiene carreras, en esta u otra actividad.
 */
import type { Facultad } from '#/api/estructura';

import { computed, ref, watch } from 'vue';

import { IconifyIcon } from '@vben/icons';

import { Button, Input, Modal, Tooltip } from 'ant-design-vue';

import { actualizarFacultad, crearFacultad, eliminarFacultad } from '#/api/estructura';
import { avisar, confirmar } from '#/composables/useAvisos';
import { limpiarEspacios, nombrePropio, normalizarTexto } from '#/utils/formato';

defineOptions({ name: 'CarreraFacultadesModal' });

const props = defineProps<{
  /** Carreras de la actividad de trabajo por facultad (para avisar antes de borrar). */
  carrerasPorFacultad: Map<number, number>;
}>();

const emit = defineEmits<{ cambiado: [] }>();

const visible = defineModel<boolean>('open', { required: true });
const facultades = defineModel<Facultad[]>('facultades', { required: true });

const ocupado = ref(false);

/** Fila en edición (`0` = la de alta) y lo escrito en ella. */
const editando = ref<null | number>(null);
const borrador = ref({ nombre: '', sigla: '' });

const nombreBorrador = computed(() => limpiarEspacios(borrador.value.nombre).toUpperCase());

const errorBorrador = computed(() => {
  if (!nombreBorrador.value) return '';
  const repetida = facultades.value.find(
    (f) => f.idFacultad !== editando.value && normalizarTexto(f.nombre) === normalizarTexto(nombreBorrador.value),
  );
  return repetida ? `Ya existe «${nombrePropio(repetida.nombre)}».` : '';
});

watch(visible, (abierto) => {
  if (abierto) {
    editando.value = facultades.value.length === 0 ? 0 : null;
    borrador.value = { nombre: '', sigla: '' };
  }
});

function editar(f: Facultad | null) {
  editando.value = f?.idFacultad ?? 0;
  borrador.value = { nombre: f?.nombre ?? '', sigla: f?.sigla ?? '' };
}

async function guardar() {
  if (!nombreBorrador.value || errorBorrador.value || editando.value === null) return;
  const data = { nombre: nombreBorrador.value, sigla: limpiarEspacios(borrador.value.sigla).toUpperCase() };
  ocupado.value = true;
  try {
    if (editando.value === 0) {
      const f = await crearFacultad(data);
      facultades.value = [...facultades.value, f];
      avisar({ mensaje: `«${nombrePropio(f.nombre)}» ya está en el catálogo.`, tipo: 'exito', titulo: 'Facultad registrada' });
    } else {
      const f = await actualizarFacultad(editando.value, data);
      facultades.value = facultades.value.map((x) => (x.idFacultad === f.idFacultad ? f : x));
      avisar({ mensaje: `«${nombrePropio(f.nombre)}» se actualizó correctamente.`, tipo: 'exito', titulo: 'Cambios guardados' });
    }
    facultades.value = [...facultades.value].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
    editando.value = null;
    emit('cambiado');
  } catch {
    // El interceptor ya avisó.
  } finally {
    ocupado.value = false;
  }
}

async function eliminar(f: Facultad) {
  const aceptado = await confirmar({
    mensaje: `Se eliminará la facultad «${nombrePropio(f.nombre)}». Si todavía tiene carreras (en esta u otra actividad) no se podrá.`,
    peligro: true,
    textoAceptar: 'Eliminar',
    titulo: '¿Eliminar facultad?',
  });
  if (!aceptado) return;
  ocupado.value = true;
  try {
    await eliminarFacultad(f.idFacultad);
    facultades.value = facultades.value.filter((x) => x.idFacultad !== f.idFacultad);
    avisar({ mensaje: `«${nombrePropio(f.nombre)}» se eliminó correctamente.`, tipo: 'exito', titulo: 'Facultad eliminada' });
    emit('cambiado');
  } catch {
    // El interceptor ya avisó (409 si tiene carreras).
  } finally {
    ocupado.value = false;
  }
}
</script>

<template>
  <Modal :footer="null" :open="visible" :width="640" centered @cancel="visible = false">
    <template #title>
      <div class="flex items-center gap-3">
        <span class="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <IconifyIcon class="size-5" icon="lucide:landmark" />
        </span>
        <div class="leading-tight">
          <div class="text-lg font-semibold">Facultades</div>
          <div class="text-sm font-normal text-muted-foreground">
            Catálogo común a todas las actividades; las carreras se agrupan en ellas.
          </div>
        </div>
      </div>
    </template>

    <div class="mt-4 flex flex-col gap-1.5">
      <!-- Edición en línea (alta o fila existente) -->
      <template v-for="f in [null, ...facultades]" :key="f?.idFacultad ?? 0">
        <div
          v-if="editando === (f?.idFacultad ?? 0)"
          class="flex flex-col gap-1 rounded-lg border border-primary/40 bg-primary/5 p-2"
        >
          <div class="flex flex-wrap gap-2">
            <Input
              v-model:value="borrador.nombre"
              :disabled="ocupado"
              :maxlength="200"
              :status="errorBorrador ? 'error' : undefined"
              autofocus
              class="min-w-0 flex-1"
              placeholder="Ej. FACULTAD DE CIENCIAS Y TECNOLOGÍA"
              @keydown.enter.prevent="guardar"
            >
              <template #prefix>
                <IconifyIcon class="size-4 text-muted-foreground" icon="lucide:landmark" />
              </template>
            </Input>
            <Input
              v-model:value="borrador.sigla"
              :disabled="ocupado"
              :maxlength="20"
              class="w-28"
              placeholder="Sigla: FCyT"
              @keydown.enter.prevent="guardar"
            />
            <Button
              :disabled="!nombreBorrador || !!errorBorrador"
              :loading="ocupado"
              class="semfa-btn semfa-btn--primario"
              @click="guardar"
            >
              <IconifyIcon class="size-4" icon="lucide:save" />
              {{ editando === 0 ? 'Agregar' : 'Guardar' }}
            </Button>
            <Button :disabled="ocupado" class="semfa-btn semfa-btn--neutro" @click="editando = null">✕</Button>
          </div>
          <span v-if="errorBorrador" class="text-xs text-red-600">{{ errorBorrador }}</span>
        </div>

        <div
          v-else-if="f"
          class="flex items-center gap-2 rounded-lg border border-border px-3 py-1.5"
        >
          <span
            :class="f.sigla ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'"
            class="w-16 shrink-0 truncate rounded-full px-2 py-0.5 text-center text-xs font-medium"
          >
            {{ f.sigla || '—' }}
          </span>
          <Tooltip :title="f.nombre" placement="topLeft">
            <span class="min-w-0 flex-1 truncate text-sm">{{ nombrePropio(f.nombre) }}</span>
          </Tooltip>
          <span class="shrink-0 text-xs tabular-nums text-muted-foreground">
            {{ props.carrerasPorFacultad.get(f.idFacultad) ?? 0 }} carrera(s)
          </span>
          <Tooltip title="Editar">
            <Button :disabled="ocupado" class="semfa-btn semfa-btn--suave-primario" size="small" @click="editar(f)">
              <IconifyIcon class="size-3.5" icon="lucide:pencil" />
            </Button>
          </Tooltip>
          <Tooltip
            :title="
              (props.carrerasPorFacultad.get(f.idFacultad) ?? 0) > 0
                ? 'Tiene carreras en esta actividad: muévalas o elimínelas primero'
                : 'Eliminar'
            "
          >
            <Button
              :disabled="ocupado || (props.carrerasPorFacultad.get(f.idFacultad) ?? 0) > 0"
              class="semfa-btn semfa-btn--suave-peligro"
              size="small"
              @click="eliminar(f)"
            >
              <IconifyIcon class="size-3.5" icon="lucide:trash-2" />
            </Button>
          </Tooltip>
        </div>
      </template>

      <button
        v-if="editando !== 0"
        :disabled="ocupado"
        class="semfa-chip mt-1 self-start border-dashed text-primary"
        type="button"
        @click="editar(null)"
      >
        <IconifyIcon class="size-3.5" icon="lucide:plus" />
        Nueva facultad
      </button>
      <p v-if="facultades.length === 0 && editando !== 0" class="m-0 text-sm text-muted-foreground">
        Aún no hay facultades. También se crean solas al «Importar» carreras.
      </p>
    </div>
  </Modal>
</template>
