<script lang="ts" setup>
import type { FormInstance } from 'ant-design-vue';
import type { Rule } from 'ant-design-vue/es/form';

import type { CategoriaActividad } from '#/api/categorias-actividad';
import type { Jurado, JuradoForm } from '#/api/jurados';
import type { Persona } from '#/api/personas';
import type { Usuario } from '#/api/usuarios';
import type { EtiquetaPersona } from '#/components/semfa/tipos';
import type { Credenciales } from '#/utils/credenciales';

import { computed, nextTick, ref, watch } from 'vue';

import { IconifyIcon } from '@vben/icons';

import { Button, Form, FormItem, Input, Tooltip } from 'ant-design-vue';

import { listarCategoriasActividad } from '#/api/categorias-actividad';
import { listarPersonas } from '#/api/personas';
import SemfaAvatar from '#/components/semfa/semfa-avatar.vue';
import SemfaCredenciales from '#/components/semfa/semfa-credenciales.vue';
import SemfaModalForm from '#/components/semfa/semfa-modal-form.vue';
import SemfaSelectorPersona from '#/components/semfa/semfa-selector-persona.vue';
import { useActividadTrabajoStore } from '#/store';
import {
  FORMATO_USUARIO,
  fortalezaContrasena,
  generarContrasena,
  usuarioDisponible,
  usuarioSugerido,
} from '#/utils/credenciales';
import { limpiarEspacios, nombrePropio, resumenPersona } from '#/utils/formato';
import { rolDeCuenta } from '#/utils/roles';


defineOptions({ name: 'JuradoFormModal' });

const props = defineProps<{
  guardando: boolean;
  jurado: Jurado | null;
  /** Jurados de la tabla: una persona que ya es jurado activo no se puede elegir. */
  jurados: Jurado[];
  /** Acceso del último jurado dado de alta con «Guardar y nuevo». */
  ultimasCredenciales: Credenciales | null;
  /** Cuentas existentes: si la persona ya tiene una, el backend la reutiliza. */
  usuarios: Usuario[];
}>();

const emit = defineEmits<{
  /** `continuar`: tras guardar, el modal queda abierto para otro jurado. */
  /** `categorias`: en un alta, categorías de la actividad de trabajo a asignarle. */
  guardar: [form: JuradoForm & { categorias?: number[] }, continuar: boolean];
  /** Se editaron los datos de una persona: la tabla debe recargar su nombre y CI. */
  personaActualizada: [];
}>();

const visible = defineModel<boolean>('open', { required: true });

const esEdicion = computed(() => props.jurado !== null);

const formRef = ref<FormInstance>();
const personaRef = ref<{ focus: () => void }>();

const cargandoPersonas = ref(false);
const personas = ref<Persona[]>([]);

const form = ref<JuradoForm>({});
const verContrasena = ref(false);

/** Valores al abrir el modal, para saber si hay cambios sin guardar. */
const original = ref('');

/** Jurados dados de alta con «Guardar y nuevo» desde que se abrió el modal. */
const registradas = ref(0);

// ---------------------------------------------------------------- asignación en la actividad

/**
 * En un alta, el jurado queda asignado a las categorías elegidas de la actividad
 * de trabajo: es lo que verá en la app del jurado (`GET /api/jurado/tablero`).
 */
const trabajo = useActividadTrabajoStore();
const categoriasActividad = ref<CategoriaActividad[]>([]);
const categoriasAsignar = ref<number[]>([]);

const nombreActividadTrabajo = computed(() => limpiarEspacios(trabajo.actividad?.nombre));

async function cargarCategorias() {
  categoriasActividad.value = ((await listarCategoriasActividad().catch(() => [])) ?? []).filter(
    (c) => c.idActividad === trabajo.idActividad,
  );
  // Quita las que ya no son de la actividad (cambió la actividad de trabajo).
  const ids = new Set(categoriasActividad.value.map((c) => c.idCategoriaActividad));
  categoriasAsignar.value = categoriasAsignar.value.filter((id) => ids.has(id));
}

function alternarCategoria(id: number) {
  categoriasAsignar.value = categoriasAsignar.value.includes(id)
    ? categoriasAsignar.value.filter((x) => x !== id)
    : [...categoriasAsignar.value, id];
}

function todasLasCategorias() {
  categoriasAsignar.value =
    categoriasAsignar.value.length === categoriasActividad.value.length
      ? []
      : categoriasActividad.value.map((c) => c.idCategoriaActividad);
}

function instantanea() {
  const { contrasena, idPersona, usuario } = form.value;
  return JSON.stringify([idPersona, usuario ?? '', contrasena ?? '']);
}

const hayCambios = computed(() => instantanea() !== original.value);

// ---------------------------------------------------------------- persona y cuenta

/** idPersona → su cuenta de usuario, si tiene. */
const cuentaPorPersona = computed(
  () => new Map(props.usuarios.map((u) => [u.idPersona, u])),
);

/** Personas que ya son jurado activo en otra fila (en edición se excluye la propia). */
const personasJurado = computed(
  () =>
    new Set(
      props.jurados
        .filter((j) => j.idJurado !== props.jurado?.idJurado)
        .map((j) => j.idPersona),
    ),
);

function etiquetasPersona(persona: Persona): EtiquetaPersona[] {
  const etiquetas: EtiquetaPersona[] = [];
  if (personasJurado.value.has(persona.idPersona)) {
    etiquetas.push({ texto: 'Ya es jurado', tipo: 'bloqueo' });
  }
  const cuenta = cuentaPorPersona.value.get(persona.idPersona);
  if (cuenta) {
    etiquetas.push({
      texto: cuenta.usuario,
      tipo: 'info',
      titulo: 'Ya tiene cuenta: se reutilizará',
    });
  }
  return etiquetas;
}

const personaElegida = computed(() => {
  const j = props.jurado;
  return resumenPersona(
    personas.value.find((p) => p.idPersona === form.value.idPersona),
    j && j.idPersona === form.value.idPersona
      ? { ci: j.ci, nombre: j.nombreCompleto }
      : undefined,
  );
});

/** Cuenta que ya tiene la persona elegida: el alta la reutiliza sin tocarla. */
const cuentaExistente = computed(() =>
  form.value.idPersona === undefined
    ? undefined
    : cuentaPorPersona.value.get(form.value.idPersona),
);

/** Rol con el que entraría la cuenta, con el mismo criterio que `RolResolver`. */
const rolCuenta = computed(() => {
  const c = cuentaExistente.value;
  if (!c) {
    return null;
  }
  const { bloqueada, rol } = rolDeCuenta(c);
  return bloqueada ? 'BLOQUEADA' : (rol ?? 'sin rol');
});

/** Una cuenta sin rol de jurado (o bloqueada) no entra al panel de evaluación. */
const cuentaSinRolJurado = computed(
  () => rolCuenta.value !== null && !rolCuenta.value.includes('JURADO'),
);

/** Hay que definir usuario y contraseña solo en un alta de persona sin cuenta. */
const pideAcceso = computed(() => !esEdicion.value && !cuentaExistente.value);

const usuariosOcupados = computed(
  () => new Set(props.usuarios.map((u) => u.usuario.toLowerCase())),
);

/** Usuario que asignará el backend si el campo queda vacío. */
const usuarioPorDefecto = computed(() => {
  const persona = personas.value.find((p) => p.idPersona === form.value.idPersona);
  return persona
    ? usuarioDisponible(usuarioSugerido(persona), usuariosOcupados.value)
    : '';
});

/** Usuario con el que quedará el jurado, para la vista previa. */
const usuarioFinal = computed(
  () =>
    cuentaExistente.value?.usuario ??
    (form.value.usuario?.trim() || usuarioPorDefecto.value),
);

const fortaleza = computed(() => fortalezaContrasena(form.value.contrasena ?? ''));

// ---------------------------------------------------------------- reglas

const rules = computed<Record<string, Rule[]>>(() => ({
  idPersona: [
    { message: 'Seleccione a la persona.', required: true, trigger: 'change' },
  ],
  ...(pideAcceso.value
    ? {
        contrasena: [
          {
            message: 'Defina la contraseña del jurado.',
            required: true,
            trigger: ['blur', 'change'],
          },
          {
            message: 'Debe tener al menos 6 caracteres.',
            min: 6,
            trigger: ['blur', 'change'],
          },
        ],
        usuario: [
          {
            trigger: ['blur', 'change'],
            validator: async (_rule: Rule, valor: string) => {
              const usuario = (valor ?? '').trim();
              if (!usuario) {
                return;
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
      }
    : {}),
}));

// ---------------------------------------------------------------- formato al escribir

/** El backend guarda el usuario en minúsculas: se muestra igual desde el principio. */
function alEscribirUsuario(evento: Event) {
  const input = evento.target as HTMLInputElement;
  const limpio = input.value.replaceAll(/\s+/g, '').toLowerCase();
  form.value.usuario = limpio;
  if (input.value !== limpio) {
    input.value = limpio;
  }
}

function generar() {
  form.value.contrasena = generarContrasena();
  verContrasena.value = true;
  formRef.value?.validateFields(['contrasena']).catch(() => {});
}

// ---------------------------------------------------------------- ciclo del modal

/**
 * El legacy servía `personaService.listarPersona("A")` para el `select` de
 * persona; aquí se reutiliza el mismo endpoint del módulo de persona. Se
 * recarga en cada apertura para incluir lo registrado desde otras pantallas.
 */
async function cargarPersonas() {
  cargandoPersonas.value = true;
  try {
    personas.value = (await listarPersonas()) ?? [];
  } finally {
    cargandoPersonas.value = false;
  }
}

function enfocarPersona() {
  // Espera a que termine la animación de apertura del modal.
  setTimeout(() => personaRef.value?.focus(), 120);
}

function cargar(valores: JuradoForm) {
  form.value = { contrasena: '', usuario: '', ...valores };
  verContrasena.value = false;
  original.value = instantanea();
  nextTick(() => formRef.value?.clearValidate());
}

watch(visible, (abierto) => {
  if (!abierto) {
    return;
  }
  registradas.value = 0;
  cargar({
    idJurado: props.jurado?.idJurado,
    idPersona: props.jurado?.idPersona ?? undefined,
  });
  cargarPersonas();
  if (!esEdicion.value) cargarCategorias();
  enfocarPersona();
});

/** Tras «Guardar y nuevo»: formulario limpio y el acceso recién creado a la vista. */
function reiniciar() {
  registradas.value += 1;
  cargar({});
  enfocarPersona();
}

defineExpose({ reiniciar });

/** `SemfaModalForm` ya filtró si se puede guardar; aquí solo se valida y se emite. */
async function guardar(continuar: boolean) {
  try {
    await formRef.value?.validate();
  } catch {
    // Los errores se muestran en línea bajo cada campo.
    return;
  }
  // Con cuenta existente o en edición, el backend ignora usuario y contraseña.
  emit(
    'guardar',
    {
      contrasena: pideAcceso.value ? form.value.contrasena : undefined,
      idJurado: form.value.idJurado,
      idPersona: form.value.idPersona,
      usuario: pideAcceso.value ? form.value.usuario?.trim() || undefined : undefined,
      ...(esEdicion.value ? {} : { categorias: [...categoriasAsignar.value] }),
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
    :icono="esEdicion ? 'lucide:user-pen' : 'lucide:gavel'"
    :registradas="registradas"
    :subtitulo="
      esEdicion
        ? 'Cambie la persona asignada a este jurado.'
        : 'Elija a la persona y defina su acceso al panel de evaluación.'
    "
    :texto-contador="['jurado registrado', 'jurados registrados']"
    :titulo="esEdicion ? 'Modificar Jurado' : 'Registrar Jurado'"
    @guardar="guardar"
  >
    <!-- Vista previa: así aparecerá la fila en la tabla -->
    <template #vista-previa>
      <div class="flex items-center gap-4">
        <SemfaAvatar :texto="personaElegida?.iniciales ?? '?'" tamano="lg" />
        <div class="min-w-0">
          <div
            :class="{ 'text-muted-foreground': !personaElegida }"
            class="truncate text-base font-medium"
          >
            {{ personaElegida?.nombre ?? 'Jurado sin seleccionar' }}
            <span
              v-if="personaElegida"
              class="text-sm font-normal text-muted-foreground"
            >
              · CI {{ personaElegida.ci ?? '—' }}
            </span>
          </div>
          <div class="flex items-center gap-1 text-sm text-muted-foreground">
            <IconifyIcon class="size-3.5 shrink-0" icon="lucide:key-round" />
            <span v-if="usuarioFinal" class="font-mono">{{ usuarioFinal }}</span>
            <span v-else>Usuario pendiente</span>
          </div>
        </div>
      </div>
    </template>

    <SemfaCredenciales
      v-if="registradas > 0 && ultimasCredenciales"
      :credenciales="ultimasCredenciales"
      class="mb-4"
    />

    <Form
      ref="formRef"
      :disabled="guardando"
      :model="form"
      :rules="rules"
      layout="vertical"
    >
      <FormItem
        extra="Busque por nombre o CI. Las personas que ya son jurado no se pueden elegir."
        label="Persona"
        name="idPersona"
        required
      >
        <SemfaSelectorPersona
          ref="personaRef"
          v-model:personas="personas"
          v-model:value="form.idPersona"
          :cargando="cargandoPersonas"
          :disabled="guardando"
          :etiquetas="etiquetasPersona"
          :respaldo="
            jurado?.idPersona
              ? {
                  ci: jurado.ci,
                  idPersona: jurado.idPersona,
                  nombre: jurado.nombreCompleto,
                }
              : null
          "
          @persona-actualizada="$emit('personaActualizada')"
        />
      </FormItem>

      <!-- Edición: el backend no toca la cuenta en `PUT /api/jurados/{id}` -->
      <div
        v-if="esEdicion"
        class="flex items-start gap-2 rounded-lg bg-muted/40 px-3 py-2 text-sm text-muted-foreground"
      >
        <IconifyIcon class="mt-0.5 size-4 shrink-0" icon="lucide:info" />
        <span>
          El usuario y la contraseña del jurado no se cambian aquí; se gestionan
          en el módulo <b>Usuarios</b>.
        </span>
      </div>

      <!-- La persona ya tiene cuenta: el alta la reutiliza tal cual -->
      <div
        v-else-if="cuentaExistente"
        :class="
          cuentaSinRolJurado
            ? 'bg-amber-500/10 text-amber-700 dark:text-amber-500'
            : 'bg-primary/5 text-muted-foreground'
        "
        class="flex items-start gap-2 rounded-lg px-3 py-2 text-sm"
      >
        <IconifyIcon
          :icon="cuentaSinRolJurado ? 'lucide:triangle-alert' : 'lucide:circle-check'"
          class="mt-0.5 size-4 shrink-0"
        />
        <span>
          Ya tiene la cuenta
          <b class="font-mono">{{ cuentaExistente.usuario }}</b>
          y se reutilizará con su contraseña actual.
          <template v-if="rolCuenta === 'BLOQUEADA'">
            La cuenta está <b>bloqueada</b>: desbloquéela y asígnele el rol
            <b>JURADO</b> en Usuarios para que pueda entrar al panel de evaluación.
          </template>
          <template v-else-if="cuentaSinRolJurado">
            Su rol es <b>{{ rolCuenta }}</b>: para que entre al panel de
            evaluación, agréguele el rol <b>JURADO</b> en Usuarios.
          </template>
        </span>
      </div>

      <!-- Alta de una persona sin cuenta: se crea su acceso -->
      <div v-else class="grid grid-cols-1 gap-x-5 md:grid-cols-2">
        <FormItem
          :extra="
            usuarioPorDefecto
              ? `Opcional. Si lo deja vacío se usará «${usuarioPorDefecto}».`
              : 'Opcional. Si lo deja vacío se genera a partir del CI.'
          "
          label="Usuario"
          name="usuario"
        >
          <Input
            :maxlength="30"
            :placeholder="usuarioPorDefecto || 'Ej. jperez'"
            :value="form.usuario"
            autocomplete="off"
            size="large"
            @input="alEscribirUsuario"
          >
            <template #prefix>
              <IconifyIcon class="size-4 text-muted-foreground" icon="lucide:at-sign" />
            </template>
          </Input>
        </FormItem>

        <FormItem label="Contraseña" name="contrasena" required>
          <div class="flex gap-2">
            <Input.Password
              v-model:value="form.contrasena"
              v-model:visible="verContrasena"
              :maxlength="64"
              autocomplete="new-password"
              class="min-w-0 flex-1"
              placeholder="Mínimo 6 caracteres"
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
            <span v-else>Escríbala o genere una con la varita.</span>
          </template>
        </FormItem>
      </div>

      <!-- Alta: en qué categorías de la actividad de trabajo evaluará -->
      <FormItem
        v-if="!esEdicion"
        :extra="
          categoriasAsignar.length === 0
            ? 'Sin categorías no verá nada que evaluar en la app. Puede asignarlo después en «Asignación de jurados».'
            : 'Las verá en la app del jurado al iniciar sesión.'
        "
        :label="nombreActividadTrabajo ? `Evaluará en «${nombreActividadTrabajo}»` : 'Evaluará en'"
      >
        <div v-if="!trabajo.idActividad" class="text-sm text-amber-600">
          Elija una actividad en la barra superior para asignarle categorías.
        </div>
        <div v-else-if="categoriasActividad.length === 0" class="text-sm text-amber-600">
          La actividad aún no tiene categorías: créelas en «Categoría actividad».
        </div>
        <div v-else class="flex flex-wrap gap-2">
          <button
            v-if="categoriasActividad.length > 1"
            :class="{ 'is-activo': categoriasAsignar.length === categoriasActividad.length }"
            :disabled="guardando"
            class="semfa-chip"
            type="button"
            @click="todasLasCategorias"
          >
            <IconifyIcon class="size-4" icon="lucide:check-check" />
            Todas
          </button>
          <button
            v-for="c in categoriasActividad"
            :key="c.idCategoriaActividad"
            :class="{ 'is-activo': categoriasAsignar.includes(c.idCategoriaActividad) }"
            :disabled="guardando"
            class="semfa-chip"
            type="button"
            @click="alternarCategoria(c.idCategoriaActividad)"
          >
            <IconifyIcon
              :icon="categoriasAsignar.includes(c.idCategoriaActividad) ? 'lucide:check' : 'lucide:tag'"
              class="size-4"
            />
            {{ nombrePropio(c.nombre) }}
          </button>
        </div>
      </FormItem>
    </Form>
  </SemfaModalForm>
</template>
