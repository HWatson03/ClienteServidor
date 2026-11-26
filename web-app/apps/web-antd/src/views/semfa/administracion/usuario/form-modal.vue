<script lang="ts" setup>
import type { FormInstance } from 'ant-design-vue';
import type { Rule } from 'ant-design-vue/es/form';

import type { Persona } from '#/api/personas';
import type { RolDisponible, Usuario, UsuarioForm } from '#/api/usuarios';
import type { EtiquetaPersona } from '#/components/semfa/tipos';

import { computed, nextTick, ref, watch } from 'vue';

import { IconifyIcon } from '@vben/icons';

import { Button, Form, FormItem, Input, Tooltip } from 'ant-design-vue';

import { listarPersonas } from '#/api/personas';
import { listarRoles } from '#/api/usuarios';
import SemfaAvatar from '#/components/semfa/semfa-avatar.vue';
import SemfaModalForm from '#/components/semfa/semfa-modal-form.vue';
import SemfaSelectorPersona from '#/components/semfa/semfa-selector-persona.vue';
import {
  FORMATO_USUARIO,
  fortalezaContrasena,
  generarContrasena,
  MINIMO_CONTRASENA,
  usuarioDisponible,
  usuarioSugerido,
} from '#/utils/credenciales';
import { resumenPersona } from '#/utils/formato';
import { infoRol, rolDeCuenta } from '#/utils/roles';

defineOptions({ name: 'UsuarioFormModal' });

const props = defineProps<{
  guardando: boolean;
  /** Id de la cuenta con sesión: sobre ella no se puede bloquear ni quitar ADMIN. */
  idUsuarioActual: null | number;
  usuario: null | Usuario;
  /** Cuentas existentes: usuario repetido y personas que ya tienen cuenta. */
  usuarios: Usuario[];
}>();

const emit = defineEmits<{
  guardar: [form: UsuarioForm, continuar: boolean];
}>();

const visible = defineModel<boolean>('open', { required: true });

const esEdicion = computed(() => props.usuario !== null);
const esPropia = computed(
  () => esEdicion.value && props.usuario?.idUsuario === props.idUsuarioActual,
);

const formRef = ref<FormInstance>();
const personaRef = ref<{ focus: () => void }>();

const cargandoOpciones = ref(false);
const personas = ref<Persona[]>([]);
const roles = ref<RolDisponible[]>([]);

const form = ref<UsuarioForm>({ bloqueado: false, contrasena: '', rol: '', usuario: '' });
/** En edición la contraseña se conserva salvo que se pida cambiarla. */
const cambiarContrasena = ref(false);
const verContrasena = ref(false);

const original = ref('');
const registradas = ref(0);

function instantanea() {
  const f = form.value;
  return JSON.stringify([f.idPersona, f.usuario, f.rol, f.bloqueado, f.contrasena]);
}

const hayCambios = computed(() => instantanea() !== original.value);

// ---------------------------------------------------------------- persona y usuario

const otrasCuentas = computed(() =>
  props.usuarios.filter((u) => u.idUsuario !== props.usuario?.idUsuario),
);

const cuentaPorPersona = computed(
  () => new Map(otrasCuentas.value.map((u) => [u.idPersona, u])),
);

function etiquetasPersona(persona: Persona): EtiquetaPersona[] {
  const cuenta = cuentaPorPersona.value.get(persona.idPersona);
  return cuenta
    ? [{ texto: `Ya tiene cuenta: ${cuenta.usuario}`, tipo: 'bloqueo' }]
    : [];
}

const personaElegida = computed(() => {
  const u = props.usuario;
  return resumenPersona(
    personas.value.find((p) => p.idPersona === form.value.idPersona),
    u && u.idPersona === form.value.idPersona
      ? { ci: u.ci, nombre: u.nombreCompleto }
      : undefined,
  );
});

const usuariosOcupados = computed(
  () => new Set(otrasCuentas.value.map((u) => u.usuario.toLowerCase())),
);

/** Usuario que se propone a partir de la persona (CI, correo o id). */
const sugerencia = computed(() => {
  const persona = personas.value.find((p) => p.idPersona === form.value.idPersona);
  return persona
    ? usuarioDisponible(usuarioSugerido(persona), usuariosOcupados.value)
    : '';
});

function alEscribirUsuario(evento: Event) {
  const input = evento.target as HTMLInputElement;
  const limpio = input.value.replaceAll(/\s+/g, '').toLowerCase();
  form.value.usuario = limpio;
  if (input.value !== limpio) {
    input.value = limpio;
  }
}

function usarSugerencia() {
  form.value.usuario = sugerencia.value;
  formRef.value?.validateFields(['usuario']).catch(() => {});
}

// Al elegir persona en un alta, se propone su usuario si aún no se escribió uno.
watch(
  () => form.value.idPersona,
  () => {
    if (!esEdicion.value && !form.value.usuario && sugerencia.value) {
      usarSugerencia();
    }
  },
);

// ---------------------------------------------------------------- rol y estado

const opcionesRol = computed(() =>
  roles.value.map((r) => ({
    ...infoRol(r.nombre),
    descripcion: r.descripcion,
    // Sobre la propia cuenta no se puede dejar de ser ADMIN (lo impide el backend).
    disabled: esPropia.value && r.nombre.toUpperCase() !== 'ADMIN',
    nombre: r.nombre,
  })),
);

function elegirRol(nombre: string) {
  form.value.rol = nombre;
  formRef.value?.validateFields(['rol']).catch(() => {});
}

/** Rol que tenía la cuenta al abrir, y si venía del `estado` legacy. */
const rolInicial = computed(() => (props.usuario ? rolDeCuenta(props.usuario) : null));

// ---------------------------------------------------------------- contraseña

const pideContrasena = computed(() => !esEdicion.value || cambiarContrasena.value);

const fortaleza = computed(() => fortalezaContrasena(form.value.contrasena ?? ''));

function generar() {
  form.value.contrasena = generarContrasena();
  verContrasena.value = true;
  formRef.value?.validateFields(['contrasena']).catch(() => {});
}

function alternarCambioContrasena() {
  cambiarContrasena.value = !cambiarContrasena.value;
  form.value.contrasena = '';
  verContrasena.value = false;
}

// ---------------------------------------------------------------- reglas

const rules = computed<Record<string, Rule[]>>(() => ({
  idPersona: [
    { message: 'Seleccione a la persona dueña de la cuenta.', required: true, trigger: 'change' },
  ],
  rol: [{ message: 'Elija el rol de la cuenta.', required: true, trigger: 'change' }],
  usuario: [
    {
      trigger: ['blur', 'change'],
      validator: async (_rule: Rule, valor: string) => {
        const usuario = (valor ?? '').trim();
        if (!usuario) {
          throw new Error('Defina el nombre de acceso.');
        }
        if (!FORMATO_USUARIO.test(usuario)) {
          throw new Error(
            'De 3 a 30 caracteres: minúsculas, números, punto, guion o guion bajo.',
          );
        }
        if (usuariosOcupados.value.has(usuario)) {
          throw new Error(`El usuario «${usuario}» ya existe.`);
        }
      },
    },
  ],
  ...(pideContrasena.value
    ? {
        contrasena: [
          { message: 'Defina la contraseña.', required: true, trigger: ['blur', 'change'] },
          {
            message: `Debe tener al menos ${MINIMO_CONTRASENA} caracteres.`,
            min: MINIMO_CONTRASENA,
            trigger: ['blur', 'change'],
          },
        ],
      }
    : {}),
}));

// ---------------------------------------------------------------- ciclo del modal

async function cargarOpciones() {
  cargandoOpciones.value = true;
  try {
    const [listaPersonas, listaRoles] = await Promise.all([
      listarPersonas(),
      listarRoles(),
    ]);
    personas.value = listaPersonas ?? [];
    roles.value = listaRoles ?? [];
  } finally {
    cargandoOpciones.value = false;
  }
}

function cargar(u: null | Usuario) {
  form.value = {
    bloqueado: u ? rolDeCuenta(u).bloqueada : false,
    contrasena: '',
    idPersona: u?.idPersona ?? undefined,
    // Las cuentas legacy no tienen rol en `UsrRol`: se propone el heredado.
    rol: (u && rolDeCuenta(u).rol) ?? '',
    usuario: u?.usuario ?? '',
  };
  cambiarContrasena.value = false;
  verContrasena.value = false;
  original.value = instantanea();
  nextTick(() => formRef.value?.clearValidate());
}

watch(visible, (abierto) => {
  if (!abierto) {
    return;
  }
  registradas.value = 0;
  cargar(props.usuario);
  cargarOpciones();
  setTimeout(() => personaRef.value?.focus(), 120);
});

function reiniciar() {
  registradas.value += 1;
  cargar(null);
  setTimeout(() => personaRef.value?.focus(), 120);
}

defineExpose({ reiniciar });

async function guardar(continuar: boolean) {
  try {
    await formRef.value?.validate();
  } catch {
    return;
  }
  emit(
    'guardar',
    {
      ...form.value,
      // Vacía = el backend conserva la contraseña actual.
      contrasena: pideContrasena.value ? form.value.contrasena : '',
      usuario: form.value.usuario.trim(),
    },
    continuar,
  );
}
</script>

<template>
  <SemfaModalForm
    v-model:open="visible"
    :es-edicion="esEdicion"
    :guardando="guardando"
    :hay-cambios="hayCambios"
    :icono="esEdicion ? 'lucide:user-cog' : 'lucide:key-round'"
    :registradas="registradas"
    :subtitulo="
      esEdicion
        ? 'Cambie el acceso, el rol o el estado de la cuenta.'
        : 'Cree el acceso de una persona al sistema.'
    "
    :texto-contador="['cuenta creada', 'cuentas creadas']"
    :titulo="esEdicion ? 'Modificar cuenta' : 'Registrar cuenta'"
    :width="820"
    @guardar="guardar"
  >
    <!-- Vista previa -->
    <template #vista-previa>
      <div class="flex items-center gap-4">
        <SemfaAvatar :texto="personaElegida?.iniciales ?? '?'" tamano="lg" />
        <div class="min-w-0">
          <div
            :class="{ 'text-muted-foreground': !personaElegida }"
            class="truncate text-base font-medium"
          >
            {{ personaElegida?.nombre ?? 'Persona sin elegir' }}
          </div>
          <div class="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-muted-foreground">
            <span class="flex items-center gap-1 font-mono">
              <IconifyIcon class="size-3.5" icon="lucide:at-sign" />
              {{ form.usuario || 'usuario' }}
            </span>
            <span v-if="form.rol" class="flex items-center gap-1">
              <IconifyIcon :icon="infoRol(form.rol).icono" class="size-3.5" />
              {{ infoRol(form.rol).etiqueta }}
            </span>
            <span
              :class="form.bloqueado ? 'text-red-600' : 'text-green-600'"
              class="flex items-center gap-1"
            >
              <IconifyIcon
                :icon="form.bloqueado ? 'lucide:lock' : 'lucide:lock-open'"
                class="size-3.5"
              />
              {{ form.bloqueado ? 'Bloqueada' : 'Activa' }}
            </span>
          </div>
        </div>
      </div>
    </template>

    <!-- Acceso de la última cuenta creada con «Guardar y nuevo» -->
    <slot v-if="registradas > 0" name="credenciales"></slot>

    <div
      v-if="esPropia"
      class="mb-4 flex items-start gap-2 rounded-lg bg-primary/5 px-3 py-2 text-sm text-muted-foreground"
    >
      <IconifyIcon class="mt-0.5 size-4 shrink-0 text-primary" icon="lucide:info" />
      <span>
        Es <b>su propia cuenta</b>: no puede bloquearla ni quitarse el rol de
        administrador, porque perdería el acceso a esta pantalla.
      </span>
    </div>

    <Form
      ref="formRef"
      :disabled="guardando"
      :model="form"
      :rules="rules"
      layout="vertical"
    >
      <FormItem
        extra="Cada persona puede tener una sola cuenta."
        label="Persona"
        name="idPersona"
        required
      >
        <SemfaSelectorPersona
          ref="personaRef"
          v-model:personas="personas"
          v-model:value="form.idPersona"
          :cargando="cargandoOpciones"
          :disabled="guardando"
          :etiquetas="etiquetasPersona"
          :respaldo="
            usuario?.idPersona
              ? {
                  ci: usuario.ci,
                  idPersona: usuario.idPersona,
                  nombre: usuario.nombreCompleto,
                }
              : null
          "
        />
      </FormItem>

      <!-- Rol -->
      <FormItem
        :extra="
          rolInicial?.heredado && rolInicial.rol
            ? 'Esta cuenta tenía el rol guardado a la antigua; al guardar queda registrado en la tabla de roles.'
            : undefined
        "
        label="Rol"
        name="rol"
        required
      >
        <div class="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <button
            v-for="r in opcionesRol"
            :key="r.nombre"
            :class="
              form.rol === r.nombre
                ? 'border-primary bg-primary/5 shadow-[0_2px_0_hsl(var(--primary)/0.35)]'
                : 'border-border bg-card hover:-translate-y-px hover:border-primary/40 hover:shadow-md'
            "
            :disabled="guardando || r.disabled"
            class="flex items-start gap-2.5 rounded-xl border px-3 py-2.5 text-left transition disabled:cursor-not-allowed disabled:opacity-50"
            type="button"
            @click="elegirRol(r.nombre)"
          >
            <span
              :class="form.rol === r.nombre ? 'bg-primary text-white' : 'bg-primary/10 text-primary'"
              class="flex size-8 shrink-0 items-center justify-center rounded-lg"
            >
              <IconifyIcon :icon="r.icono" class="size-4" />
            </span>
            <span class="min-w-0">
              <span class="block font-medium">{{ r.etiqueta }}</span>
              <span
                v-if="r.descripcion"
                class="block text-xs leading-snug text-muted-foreground"
              >
                {{ r.descripcion }}
              </span>
            </span>
          </button>
          <span
            v-if="!cargandoOpciones && roles.length === 0"
            class="text-sm text-amber-600 sm:col-span-3"
          >
            No hay roles registrados. Ejecute <code>proyecto/db/05_roles_base.sql</code>.
          </span>
        </div>
      </FormItem>

      <div class="grid grid-cols-1 gap-x-5 md:grid-cols-2">
        <!-- Usuario -->
        <FormItem
          label="Nombre de acceso"
          name="usuario"
          required
        >
          <Input
            :maxlength="30"
            :placeholder="sugerencia || 'Ej. jmamani'"
            :value="form.usuario"
            autocomplete="off"
            size="large"
            @input="alEscribirUsuario"
          >
            <template #prefix>
              <IconifyIcon class="size-4 text-muted-foreground" icon="lucide:at-sign" />
            </template>
          </Input>
          <template #extra>
            <span v-if="sugerencia && form.usuario !== sugerencia">
              Sugerido:
              <button
                class="cursor-pointer border-0 bg-transparent p-0 font-mono text-primary underline-offset-2 hover:underline"
                type="button"
                @click="usarSugerencia"
              >
                {{ sugerencia }}
              </button>
            </span>
            <span v-else>Se guarda en minúsculas.</span>
          </template>
        </FormItem>

        <!-- Estado -->
        <FormItem label="Estado de la cuenta" name="bloqueado">
          <div class="flex h-10 items-center gap-2">
            <button
              :class="{ 'is-activo': !form.bloqueado }"
              :disabled="guardando"
              class="semfa-chip"
              type="button"
              @click="form.bloqueado = false"
            >
              <IconifyIcon class="size-3.5" icon="lucide:lock-open" />
              Activa
            </button>
            <Tooltip :title="esPropia ? 'No puede bloquear su propia cuenta' : ''">
              <button
                :class="{ 'is-activo': form.bloqueado }"
                :disabled="guardando || esPropia"
                class="semfa-chip"
                type="button"
                @click="form.bloqueado = true"
              >
                <IconifyIcon class="size-3.5" icon="lucide:lock" />
                Bloqueada
              </button>
            </Tooltip>
          </div>
        </FormItem>
      </div>

      <!-- Contraseña -->
      <div
        v-if="esEdicion && !cambiarContrasena"
        class="flex items-center justify-between gap-3 rounded-lg bg-muted/40 px-3 py-2 text-sm text-muted-foreground"
      >
        <span class="flex items-center gap-2">
          <IconifyIcon class="size-4" icon="lucide:lock" />
          Se conserva la contraseña actual.
        </span>
        <Button
          :disabled="guardando"
          class="semfa-btn semfa-btn--suave-primario"
          size="small"
          @click="alternarCambioContrasena"
        >
          <IconifyIcon class="size-3.5" icon="lucide:key-round" />
          Cambiar contraseña
        </Button>
      </div>

      <FormItem
        v-else
        :label="esEdicion ? 'Nueva contraseña' : 'Contraseña'"
        name="contrasena"
        required
      >
        <div class="flex gap-2">
          <Input.Password
            v-model:value="form.contrasena"
            v-model:visible="verContrasena"
            :maxlength="64"
            :placeholder="`Mínimo ${MINIMO_CONTRASENA} caracteres`"
            autocomplete="new-password"
            class="min-w-0 flex-1"
            size="large"
          >
            <template #prefix>
              <IconifyIcon class="size-4 text-muted-foreground" icon="lucide:lock" />
            </template>
          </Input.Password>
          <Tooltip title="Generar una contraseña segura">
            <Button
              :disabled="guardando"
              aria-label="Generar contraseña"
              class="semfa-btn semfa-btn--suave-primario shrink-0"
              size="large"
              @click="generar"
            >
              <IconifyIcon class="size-4" icon="lucide:wand-sparkles" />
            </Button>
          </Tooltip>
          <Tooltip v-if="esEdicion" title="Conservar la contraseña actual">
            <Button
              :disabled="guardando"
              aria-label="No cambiar la contraseña"
              class="semfa-btn semfa-btn--neutro shrink-0"
              size="large"
              @click="alternarCambioContrasena"
            >
              <IconifyIcon class="size-4" icon="lucide:undo-2" />
            </Button>
          </Tooltip>
        </div>
        <template #extra>
          <div v-if="form.contrasena" class="mt-1 flex items-center gap-2">
            <div class="flex h-1.5 w-24 gap-1">
              <span
                v-for="n in 3"
                :key="n"
                :class="n <= fortaleza.nivel ? fortaleza.color : 'bg-muted'"
                class="flex-1 rounded-full"
              ></span>
            </div>
            <span>{{ fortaleza.texto }}</span>
          </div>
          <span v-else>Escríbala o genere una con la varita. Se guarda cifrada.</span>
        </template>
      </FormItem>
    </Form>
  </SemfaModalForm>
</template>
