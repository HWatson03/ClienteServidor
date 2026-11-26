<script lang="ts" setup>
import type { ColumnsType } from 'ant-design-vue/es/table';

import type { Usuario, UsuarioForm } from '#/api/usuarios';
import type { Credenciales } from '#/utils/credenciales';

import { computed, onMounted, ref } from 'vue';

import { Page } from '@vben/common-ui';
import { IconifyIcon } from '@vben/icons';
import { useUserStore } from '@vben/stores';

import { Button, Card, Modal, Select, Table, Tooltip } from 'ant-design-vue';

import {
  actualizarUsuario,
  crearUsuario,
  eliminarUsuario,
  listarUsuarios,
} from '#/api/usuarios';
import SemfaAvatar from '#/components/semfa/semfa-avatar.vue';
import SemfaBarraCrud from '#/components/semfa/semfa-barra-crud.vue';
import SemfaCredenciales from '#/components/semfa/semfa-credenciales.vue';
import { avisar, confirmar } from '#/composables/useAvisos';
import { useCrud } from '#/composables/useCrud';
import { useTablaLocal } from '#/composables/useTablaLocal';
import { inicialesDeNombre } from '#/utils/formato';
import { infoRol, rolDeCuenta } from '#/utils/roles';

import UsuarioFormModal from './form-modal.vue';

defineOptions({ name: 'SemfaUsuario' });

const userStore = useUserStore();

/** Cuenta con sesión: se marca «Tú» y no se puede bloquear. */
const idUsuarioActual = computed(() => {
  const id = Number(userStore.userInfo?.userId);
  return Number.isFinite(id) && id > 0 ? id : null;
});

const modalAbierto = ref(false);
const modalRef = ref<InstanceType<typeof UsuarioFormModal>>();
const usuarioSeleccionado = ref<null | Usuario>(null);

/** Acceso recién creado o contraseña nueva, para entregarlo. */
const credenciales = ref<Credenciales | null>(null);
const credencialesAbiertas = ref(false);

const crud = useCrud<Usuario, UsuarioForm>({
  etiqueta: (p) => p.usuario,
  guardar: async (payload) => {
    const guardado =
      usuarioSeleccionado.value === null
        ? await crearUsuario(payload)
        : await actualizarUsuario(usuarioSeleccionado.value.idUsuario, payload);
    credenciales.value = payload.contrasena
      ? {
          contrasena: payload.contrasena,
          nombre: guardado.nombreCompleto ?? payload.usuario,
          usuario: guardado.usuario,
        }
      : null;
    return guardado;
  },
  idKey: 'idUsuario',
  listar: listarUsuarios,
  nombre: 'Usuario',
});

// ---------------------------------------------------------------- filas y filtros

/**
 * A diferencia del resto de módulos, aquí se listan también las cuentas
 * bloqueadas (el backend devuelve todas) para poder desbloquearlas.
 */
const filas = computed(() =>
  crud.items.value.map((u) => ({ ...u, ...rolDeCuenta(u), rolEfectivo: rolDeCuenta(u).rol })),
);

type Fila = (typeof filas.value)[number];

const filtroRol = ref<string>();
const filtroEstado = ref<'activas' | 'bloqueadas'>();

const opcionesRol = computed(() => {
  const conteo = new Map<string, number>();
  for (const f of filas.value) {
    const clave = f.rolEfectivo ?? 'SIN_ROL';
    conteo.set(clave, (conteo.get(clave) ?? 0) + 1);
  }
  return [...conteo.entries()].map(([value, total]) => ({
    label: `${value === 'SIN_ROL' ? 'Sin rol' : infoRol(value).etiqueta} (${total})`,
    value,
  }));
});

const filasFiltradas = computed(() =>
  filas.value.filter(
    (f) =>
      (filtroRol.value === undefined || (f.rolEfectivo ?? 'SIN_ROL') === filtroRol.value) &&
      (filtroEstado.value === undefined ||
        f.bloqueada === (filtroEstado.value === 'bloqueadas')),
  ),
);

const { alCambiarTabla, busqueda, filtrados, numeroFila, paginacion } =
  useTablaLocal(filasFiltradas, {
    camposBusqueda: ['usuario', 'nombreCompleto', 'ci', 'email'],
  });

function comparar(a: null | string, b: null | string) {
  return (a ?? '').localeCompare(b ?? '', 'es', { numeric: true });
}

const columnas: ColumnsType<Fila> = [
  { align: 'center', key: '#', title: '#', width: 64 },
  {
    dataIndex: 'usuario',
    key: 'usuario',
    sorter: (a, b) => comparar(a.usuario, b.usuario),
    title: 'Usuario',
    width: 190,
  },
  {
    dataIndex: 'nombreCompleto',
    key: 'nombreCompleto',
    sorter: (a, b) => comparar(a.nombreCompleto, b.nombreCompleto),
    title: 'Persona',
  },
  {
    key: 'rol',
    sorter: (a, b) => comparar(a.rolEfectivo, b.rolEfectivo),
    title: 'Rol',
    width: 170,
  },
  {
    key: 'estado',
    sorter: (a, b) => Number(a.bloqueada) - Number(b.bloqueada),
    title: 'Estado',
    width: 130,
  },
  { align: 'center', key: 'opciones', title: 'Opciones', width: 250 },
];

// ---------------------------------------------------------------- acciones

function abrirRegistro() {
  usuarioSeleccionado.value = null;
  modalAbierto.value = true;
}

function abrirEdicion(usuario: Usuario) {
  usuarioSeleccionado.value = usuario;
  modalAbierto.value = true;
}

/**
 * Solo actúa si el backend confirmó el guardado. Si se definió una contraseña,
 * se muestra para entregarla (dentro del formulario con «Guardar y nuevo»).
 */
async function alGuardar(payload: UsuarioForm, continuar: boolean) {
  credenciales.value = null;
  const ok = await crud.guardar(payload, {
    esEdicion: usuarioSeleccionado.value !== null,
  });
  if (!ok) {
    return;
  }
  if (continuar) {
    modalRef.value?.reiniciar();
    return;
  }
  modalAbierto.value = false;
  if (credenciales.value) {
    credencialesAbiertas.value = true;
  }
}

/** Bloquear es un borrado lógico: `_estado = 'X'`, la cuenta no puede entrar. */
async function bloquear(fila: Fila) {
  const aceptado = await confirmar({
    mensaje: `«${fila.usuario}» no podrá iniciar sesión hasta que se desbloquee. Sus datos y su rol se conservan.`,
    peligro: true,
    textoAceptar: 'Bloquear',
    titulo: '¿Bloquear la cuenta?',
  });
  if (!aceptado) {
    return;
  }
  crud.guardando.value = true;
  try {
    await eliminarUsuario(fila.idUsuario);
    avisar({
      mensaje: `«${fila.usuario}» ya no puede iniciar sesión.`,
      tipo: 'exito',
      titulo: 'Cuenta bloqueada',
    });
    await crud.recargar();
  } catch {
    // El interceptor de errores ya avisó.
  } finally {
    crud.guardando.value = false;
  }
}

/**
 * Reactiva la cuenta con su mismo rol. Una cuenta antigua bloqueada perdió el
 * rol (vivía en el `estado`): entonces se abre el formulario para elegirlo.
 */
async function desbloquear(fila: Fila) {
  if (!fila.rolEfectivo) {
    avisar({
      mensaje: 'Esta cuenta no tiene un rol registrado: elíjalo y márquela como activa.',
      tipo: 'info',
      titulo: 'Falta el rol',
    });
    abrirEdicion(fila);
    return;
  }
  crud.guardando.value = true;
  try {
    await actualizarUsuario(fila.idUsuario, {
      bloqueado: false,
      contrasena: '',
      idPersona: fila.idPersona ?? undefined,
      rol: fila.rolEfectivo,
      usuario: fila.usuario,
    });
    avisar({
      mensaje: `«${fila.usuario}» puede volver a iniciar sesión como ${infoRol(fila.rolEfectivo).etiqueta.toLowerCase()}.`,
      tipo: 'exito',
      titulo: 'Cuenta desbloqueada',
    });
    await crud.recargar();
  } catch {
    // El interceptor de errores ya avisó.
  } finally {
    crud.guardando.value = false;
  }
}

onMounted(crud.recargar);
</script>

<template>
  <Page description="Menú / Usuario" title="Usuarios">
    <Card :body-style="{ padding: 0 }" class="overflow-hidden rounded-xl">
      <template #title>
        <div class="flex items-center gap-2">
          <IconifyIcon class="size-5 text-primary" icon="lucide:key-round" />
          Cuentas de usuario
        </div>
      </template>

      <template #extra>
        <SemfaBarraCrud
          v-model:busqueda="busqueda"
          :cargando="crud.cargando.value"
          icono-agregar="lucide:user-plus"
          placeholder="Buscar usuario, nombre o CI…"
          texto-agregar="Agregar cuenta"
          @agregar="abrirRegistro"
          @recargar="crud.recargar"
        >
          <template #filtros>
            <Select
              v-model:value="filtroRol"
              :options="opcionesRol"
              allow-clear
              class="hidden w-44 xl:block"
              placeholder="Todos los roles"
            />
            <Select
              v-model:value="filtroEstado"
              :options="[
                { label: 'Activas', value: 'activas' },
                { label: 'Bloqueadas', value: 'bloqueadas' },
              ]"
              allow-clear
              class="hidden w-36 lg:block"
              placeholder="Todas"
            />
          </template>
        </SemfaBarraCrud>
      </template>

      <Table
        :columns="columnas"
        :data-source="filtrados"
        :loading="crud.cargando.value"
        :pagination="paginacion"
        :scroll="{ x: 960 }"
        class="semfa-tabla"
        row-key="idUsuario"
        size="middle"
        @change="alCambiarTabla"
      >
        <template #bodyCell="{ column, record, index }">
          <template v-if="column.key === '#'">
            <span class="tabular-nums text-muted-foreground">
              {{ numeroFila(index) }}
            </span>
          </template>

          <template v-else-if="column.key === 'usuario'">
            <span class="font-mono text-sm font-medium">{{ record.usuario }}</span>
            <span
              v-if="record.idUsuario === idUsuarioActual"
              class="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary"
            >
              Tú
            </span>
          </template>

          <template v-else-if="column.key === 'nombreCompleto'">
            <div v-if="record.nombreCompleto" class="flex items-center gap-2">
              <SemfaAvatar :texto="inicialesDeNombre(record.nombreCompleto)" />
              <span class="truncate">{{ record.nombreCompleto }}</span>
              <span v-if="record.ci" class="shrink-0 text-xs text-muted-foreground">
                CI {{ record.ci }}
              </span>
            </div>
            <span v-else class="text-muted-foreground">Sin persona vinculada</span>
          </template>

          <template v-else-if="column.key === 'rol'">
            <Tooltip
              :title="
                record.heredado && record.rolEfectivo
                  ? 'Rol guardado a la antigua (estado de la cuenta). Al editarla queda en la tabla de roles.'
                  : ''
              "
            >
              <span
                v-if="record.rolEfectivo"
                class="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary"
              >
                <IconifyIcon :icon="infoRol(record.rolEfectivo).icono" class="size-3.5" />
                {{ infoRol(record.rolEfectivo).etiqueta }}
                <span v-if="record.heredado" class="opacity-60">*</span>
              </span>
              <span v-else class="text-muted-foreground">Sin rol</span>
            </Tooltip>
          </template>

          <template v-else-if="column.key === 'estado'">
            <span
              :class="record.bloqueada ? 'text-red-600' : 'text-green-600'"
              class="inline-flex items-center gap-1.5 text-sm"
            >
              <span
                :class="record.bloqueada ? 'bg-red-500' : 'bg-green-500'"
                class="size-2 rounded-full"
              ></span>
              {{ record.bloqueada ? 'Bloqueada' : 'Activa' }}
            </span>
          </template>

          <template v-else-if="column.key === 'opciones'">
            <div class="flex justify-center gap-2">
              <Button
                class="semfa-btn semfa-btn--suave-primario"
                size="small"
                @click="abrirEdicion(record as Usuario)"
              >
                <IconifyIcon class="size-3.5" icon="lucide:pencil" />
                Editar
              </Button>
              <Button
                v-if="record.bloqueada"
                :disabled="crud.guardando.value"
                class="semfa-btn semfa-btn--suave-primario"
                size="small"
                @click="desbloquear(record as Fila)"
              >
                <IconifyIcon class="size-3.5" icon="lucide:lock-open" />
                Desbloquear
              </Button>
              <Tooltip
                v-else
                :title="
                  record.idUsuario === idUsuarioActual
                    ? 'No puede bloquear su propia cuenta'
                    : ''
                "
              >
                <Button
                  :disabled="crud.guardando.value || record.idUsuario === idUsuarioActual"
                  class="semfa-btn semfa-btn--suave-peligro"
                  size="small"
                  @click="bloquear(record as Fila)"
                >
                  <IconifyIcon class="size-3.5" icon="lucide:lock" />
                  Bloquear
                </Button>
              </Tooltip>
            </div>
          </template>
        </template>

        <template #emptyText>
          <div class="flex flex-col items-center gap-2 py-8 text-muted-foreground">
            <IconifyIcon class="size-10 opacity-60" icon="lucide:search-x" />
            <span
              v-if="busqueda.trim() || filtroRol !== undefined || filtroEstado !== undefined"
            >
              No hay cuentas con ese filtro
            </span>
            <span v-else>Aún no hay cuentas registradas</span>
          </div>
        </template>
      </Table>
    </Card>

    <UsuarioFormModal
      ref="modalRef"
      v-model:open="modalAbierto"
      :guardando="crud.guardando.value"
      :id-usuario-actual="idUsuarioActual"
      :usuario="usuarioSeleccionado"
      :usuarios="crud.items.value"
      @guardar="alGuardar"
    >
      <template v-if="credenciales" #credenciales>
        <SemfaCredenciales :credenciales="credenciales" class="mb-4" />
      </template>
    </UsuarioFormModal>

    <!-- Tras crear una cuenta o cambiar su contraseña: el acceso para entregar -->
    <Modal
      v-model:open="credencialesAbiertas"
      :closable="false"
      :mask-closable="false"
      :width="560"
      centered
      title="Acceso guardado"
    >
      <SemfaCredenciales v-if="credenciales" :credenciales="credenciales" />
      <template #footer>
        <Button
          class="semfa-btn semfa-btn--primario"
          size="large"
          @click="credencialesAbiertas = false"
        >
          Listo
        </Button>
      </template>
    </Modal>
  </Page>
</template>
