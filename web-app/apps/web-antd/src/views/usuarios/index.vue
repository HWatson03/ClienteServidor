<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';

import { Page } from '@vben/common-ui';
import { Button, Card, Form, FormItem, Input, Modal, Table, Tag, message, Progress, Drawer, Empty, Spin, Alert } from 'ant-design-vue';

import { actualizarCliente, administrarCliente, crearUsuario, descargarArchivoCliente, explorarCliente, listarActividadAdmin, listarHistorialAlmacenamiento, listarPapeleraCliente, listarSesionesAdmin, listarSesionesCliente, listarUsuarios, obtenerEspacioServidor, obtenerResumenAlmacenamiento, listarSolicitudes, aprobarSolicitud, rechazarSolicitud, type ActividadAdmin, type ArchivoCliente, type ContenidoCliente, type EspacioServidor, type ItemPapelera, type ResumenAlmacenamiento, type SesionAdmin, type SnapshotAlmacenamiento, type Usuario, type SolicitudUsuario } from '#/api/usuarios';

const usuarios = ref<Usuario[]>([]);
const cargando = ref(false);
const abierto = ref(false);
const guardando = ref(false);
const nombreUsuario = ref('');
const contrasena = ref('');
const nombres = ref('');
const apellidoPaterno = ref('');
const apellidoMaterno = ref('');
const ci = ref('');
const correo = ref('');
const telefono = ref('');
const solicitudes = ref<SolicitudUsuario[]>([]);
let temporizadorSolicitudes: ReturnType<typeof setInterval> | undefined;
const enlaceRegistroPublico = computed(() => `${window.location.origin}/auth/solicitar-acceso`);
const editarAbierto = ref(false);
const clienteEditando = ref<ResumenAlmacenamiento | null>(null);
const nuevoNombre = ref('');
const nuevaContrasena = ref('');
const resumen = ref<ResumenAlmacenamiento[]>([]);
const espacioServidor = ref<EspacioServidor>({ total: 0, disponible: 0, usado: 0 });
const archivos = ref<ArchivoCliente[]>([]);
const clienteSeleccionado = ref<ResumenAlmacenamiento | null>(null);
const archivosAbiertos = ref(false);
const cargandoArchivos = ref(false);
const actividad = ref<ActividadAdmin[]>([]);
const sesiones = ref<{ idSesion: number; nombreUsuario?: string; creadaEn?: string; expiraEn: string }[]>([]);
const sesionesGlobales = ref<SesionAdmin[]>([]);
const historial = ref<SnapshotAlmacenamiento[]>([]);
const detalleAbierto = ref(false);
const papelera = ref<ItemPapelera[]>([]);
const contenido = ref<ContenidoCliente>({ carpetas: [], archivos: [] });
const carpetaActual = ref<number | undefined>();
const verPapelera = ref(false);
const cuotaNueva = ref<number | undefined>();
const guardandoCuota = ref(false);
const cuotasDisponibles = [0.5, 1, 2, 5, 10, 20, 50];
const adminSeleccionado = ref<ResumenAlmacenamiento | null>(null);
const clientesActivos = computed(() => resumen.value.filter((u) => u.estado === 'ACTIVO').length);
const espacioUsado = computed(() => resumen.value.reduce((suma, u) => suma + u.ocupados, 0));
const cuotaTotal = computed(() => resumen.value.reduce((suma, u) => suma + u.limite, 0));
const porcentajeGlobal = computed(() => cuotaTotal.value ? Math.min(100, (espacioUsado.value / cuotaTotal.value) * 100) : 0);
const columnas = [
  { title: 'Persona', key: 'persona' },
  { title: 'Usuario', dataIndex: 'nombreUsuario', key: 'nombreUsuario' },
  { title: 'Estado', dataIndex: 'estado', key: 'estado' },
  { title: 'Cuota', dataIndex: 'limite', key: 'limite' },
  { title: 'Ocupado', dataIndex: 'ocupados', key: 'ocupados' },
  { title: 'Uso', dataIndex: 'uso', key: 'uso' },
  { title: 'Archivos', dataIndex: 'cantidadArchivos', key: 'cantidadArchivos' },
  { title: 'Acciones', key: 'acciones' },
];

async function recargar() {
  cargando.value = true;
  try {
    const resultados = await Promise.allSettled([
      listarUsuarios(), obtenerResumenAlmacenamiento(), obtenerEspacioServidor(),
      listarActividadAdmin(), listarSesionesAdmin(),
      listarHistorialAlmacenamiento(), listarSolicitudes(),
    ]);
    if (resultados[0].status === 'fulfilled') usuarios.value = resultados[0].value;
    if (resultados[1].status === 'fulfilled') resumen.value = resultados[1].value;
    if (resultados[2].status === 'fulfilled') espacioServidor.value = resultados[2].value;
    if (resultados[3].status === 'fulfilled') actividad.value = resultados[3].value;
    if (resultados[4].status === 'fulfilled') sesiones.value = resultados[4].value;
    if (resultados[4].status === 'fulfilled') sesionesGlobales.value = resultados[4].value;
    if (resultados[5].status === 'fulfilled') historial.value = resultados[5].value;
    if (resultados[6].status === 'fulfilled') solicitudes.value = resultados[6].value;
  }
  catch { /* interceptor HTTP muestra el error */ }
  finally { cargando.value = false; }
}

function formatoBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  const unidades = ['KB', 'MB', 'GB', 'TB'];
  let valor = bytes / 1024;
  let unidad = 0;
  while (valor >= 1024 && unidad < unidades.length - 1) { valor /= 1024; unidad += 1; }
  return `${valor.toFixed(1)} ${unidades[unidad]}`;
}

async function abrirArchivos(cliente: any) {
  clienteSeleccionado.value = cliente;
  archivosAbiertos.value = true;
  cargandoArchivos.value = true;
  carpetaActual.value = undefined;
  verPapelera.value = false;
  try {
    contenido.value = await explorarCliente(cliente.idUsuario);
    archivos.value = contenido.value.archivos;
  }
  catch { archivos.value = []; }
  finally { cargandoArchivos.value = false; }
}

async function navegarCarpeta(carpetaId?: number) {
  if (!clienteSeleccionado.value) return;
  carpetaActual.value = carpetaId;
  cargandoArchivos.value = true;
  verPapelera.value = false;
  try {
    contenido.value = await explorarCliente(clienteSeleccionado.value.idUsuario, carpetaId);
    archivos.value = contenido.value.archivos;
  } finally { cargandoArchivos.value = false; }
}

async function abrirAdministracion(cliente: any) {
  adminSeleccionado.value = cliente;
  cuotaNueva.value = cliente.limite / 1_000_000_000;
  detalleAbierto.value = true;
  try { sesiones.value = await listarSesionesCliente(cliente.idUsuario); }
  catch { sesiones.value = []; }
}

async function guardarCuota() {
  if (!adminSeleccionado.value || cuotaNueva.value === undefined) return;
  const cliente = adminSeleccionado.value;
  const cuotaBytes = Math.round(cuotaNueva.value * 1_000_000_000);
  Modal.confirm({ title: 'Confirmar cambio de cuota', content: `La cuenta ${cliente.nombreUsuario} tendrá un límite de ${cuotaNueva.value} GB.`, okText: 'Guardar cuota', cancelText: 'Revisar', onOk: async () => aplicarCuota(cliente, cuotaBytes) });
}

async function aplicarCuota(cliente: ResumenAlmacenamiento, cuotaBytes: number) {
  guardandoCuota.value = true;
  try {
    await administrarCliente(cliente.idUsuario, { cuotaMaxBytes: cuotaBytes });
    message.success('Cuota actualizada.');
    await recargar();
  } catch (error: any) {
    message.error(error?.mensaje ?? error?.message ?? 'No se pudo guardar la cuota. Comprueba que el backend esté actualizado.');
  } finally {
    guardandoCuota.value = false;
  }
}

function ajustarCuota(direccion: -1 | 1) {
  const actual = cuotaNueva.value ?? 1;
  const indice = cuotasDisponibles.findIndex((cuota) => cuota >= actual);
  const base = indice < 0 ? cuotasDisponibles.length - 1 : indice;
  const siguiente = Math.max(0, Math.min(cuotasDisponibles.length - 1, base + direccion));
  cuotaNueva.value = cuotasDisponibles[siguiente];
}

async function cambiarBloqueo(cliente: any, bloqueado: boolean) {
  Modal.confirm({ title: bloqueado ? 'Bloquear cliente' : 'Reactivar cliente', content: bloqueado ? `Se cerrarán las sesiones activas de ${cliente.nombreUsuario}.` : `La cuenta ${cliente.nombreUsuario} podrá volver a iniciar sesión.`, okText: bloqueado ? 'Bloquear' : 'Reactivar', cancelText: 'Cancelar', okButtonProps: bloqueado ? { danger: true } : {}, onOk: async () => {
    await administrarCliente(cliente.idUsuario, { bloqueado });
    message.success(bloqueado ? 'Cuenta bloqueada y sesiones revocadas.' : 'Cuenta reactivada.');
    await recargar();
  } });
}

async function revisarSolicitud(s: any, aprobar: boolean) {
  Modal.confirm({ title: aprobar ? 'Aprobar solicitud de acceso' : 'Rechazar solicitud de acceso', content: `${s.nombres} ${s.apellidoPaterno} ${s.apellidoMaterno} · CI ${s.ci} · usuario ${s.nombreUsuario}. ${aprobar ? 'Se creará una cuenta cliente activa.' : 'La solicitud quedará rechazada.'}`, okText: aprobar ? 'Aprobar y crear cuenta' : 'Rechazar', cancelText: 'Cancelar', okButtonProps: aprobar ? {} : { danger: true }, onOk: async () => { if (aprobar) await aprobarSolicitud(s.idSolicitud); else await rechazarSolicitud(s.idSolicitud); message.success(aprobar ? 'Cuenta cliente aprobada.' : 'Solicitud rechazada.'); await recargar(); } });
}

async function copiarEnlaceRegistro() {
  const enlace = enlaceRegistroPublico.value;
  try {
    if (window.isSecureContext && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(enlace);
    } else if (!copiarTextoAlternativo(enlace)) {
      throw new Error('El navegador no permitió copiar el enlace.');
    }
    message.success('Enlace copiado. Ya puedes pegarlo donde quieras.');
  } catch {
    if (copiarTextoAlternativo(enlace)) {
      message.success('Enlace copiado. Ya puedes pegarlo donde quieras.');
    } else {
      Modal.info({ title: 'No se pudo copiar automáticamente', content: `Selecciona y copia este enlace: ${enlace}` });
    }
  }
}

function copiarTextoAlternativo(texto: string) {
  const campo = document.createElement('textarea');
  campo.value = texto;
  campo.setAttribute('readonly', '');
  campo.style.position = 'fixed';
  campo.style.opacity = '0';
  document.body.append(campo);
  campo.select();
  campo.setSelectionRange(0, campo.value.length);
  const copiado = document.execCommand('copy');
  campo.remove();
  return copiado;
}

async function comprobarSolicitudesNuevas() {
  if (document.visibilityState !== 'visible') return;
  try {
    const nuevas = await listarSolicitudes();
    const idsPrevios = new Set(solicitudes.value.map((solicitud) => solicitud.idSolicitud));
    const cantidadNuevas = nuevas.filter((solicitud) => !idsPrevios.has(solicitud.idSolicitud)).length;
    solicitudes.value = nuevas;
    if (cantidadNuevas > 0) message.info(`Hay ${cantidadNuevas} nueva${cantidadNuevas === 1 ? '' : 's'} solicitud${cantidadNuevas === 1 ? '' : 'es'} de acceso.`);
  } catch { /* se volverá a consultar en el siguiente ciclo */ }
}

async function mostrarPapelera() {
  if (!clienteSeleccionado.value) return;
  verPapelera.value = true;
  try { papelera.value = await listarPapeleraCliente(clienteSeleccionado.value.idUsuario); }
  catch { papelera.value = []; }
}

async function descargar(cliente: any, archivo: any) {
  try {
    const blob = await descargarArchivoCliente(cliente.idUsuario, archivo.idArchivo);
    const url = URL.createObjectURL(blob);
    const enlace = document.createElement('a');
    enlace.href = url;
    enlace.download = archivo.nombreVisible;
    enlace.click();
    URL.revokeObjectURL(url);
  } catch { message.error('No se pudo descargar el archivo.'); }
}

async function guardar() {
  if ([nombres.value, apellidoPaterno.value, apellidoMaterno.value, ci.value, correo.value, telefono.value, nombreUsuario.value].some((v) => !v.trim()) || !correo.value.includes('@') || contrasena.value.length < 8) {
    message.warning('Completa los datos de la persona y del acceso. La contraseña requiere al menos 8 caracteres.');
    return;
  }
  guardando.value = true;
  try {
    await crearUsuario({ nombres: nombres.value.trim(), apellidoPaterno: apellidoPaterno.value.trim(), apellidoMaterno: apellidoMaterno.value.trim(), ci: ci.value.trim(), correo: correo.value.trim(), telefono: telefono.value.trim(), nombreUsuario: nombreUsuario.value.trim(), contrasena: contrasena.value });
    message.success('Persona y cuenta cliente creadas.');
    abierto.value = false;
    nombreUsuario.value = '';
    contrasena.value = '';
    nombres.value = ''; apellidoPaterno.value = ''; apellidoMaterno.value = ''; ci.value = ''; correo.value = ''; telefono.value = '';
    await recargar();
  } catch { /* interceptor HTTP muestra el error */ }
  finally { guardando.value = false; }
}

function editarAcceso(cliente: any) {
  clienteEditando.value = cliente;
  nuevoNombre.value = cliente.nombreUsuario;
  nuevaContrasena.value = '';
  editarAbierto.value = true;
}

async function guardarEdicion() {
  if (!clienteEditando.value) return;
  if (!nuevoNombre.value.trim()) {
    message.warning('El nombre de usuario es obligatorio.');
    return;
  }
  if (nuevaContrasena.value && nuevaContrasena.value.length < 8) {
    message.warning('La nueva contraseña debe tener al menos 8 caracteres.');
    return;
  }
  const nombreCambio = nuevoNombre.value.trim() !== clienteEditando.value.nombreUsuario;
  if (!nombreCambio && !nuevaContrasena.value) {
    message.info('No hay cambios para guardar.');
    return;
  }
  const clienteId = clienteEditando.value.idUsuario;
  const cambios = {
      ...(nombreCambio ? { nombreUsuario: nuevoNombre.value.trim() } : {}),
      ...(nuevaContrasena.value ? { contrasena: nuevaContrasena.value } : {}),
  };
  Modal.confirm({ title: 'Confirmar actualización de acceso', content: `Se actualizarán las credenciales de ${clienteEditando.value.nombreUsuario} y se cerrarán sus sesiones activas.`, okText: 'Guardar cambios', cancelText: 'Revisar', onOk: async () => guardarCambioAcceso(clienteId, cambios) });
}

async function guardarCambioAcceso(clienteId: number, cambios: { nombreUsuario?: string; contrasena?: string }) {
  guardando.value = true;
  try {
    await actualizarCliente(clienteId, cambios);
    message.success('Acceso actualizado. El cliente deberá iniciar sesión nuevamente.');
    editarAbierto.value = false;
    await recargar();
  } catch { /* interceptor HTTP muestra el error */ }
  finally { guardando.value = false; }
}

onMounted(() => {
  void recargar();
  temporizadorSolicitudes = setInterval(() => void comprobarSolicitudesNuevas(), 30_000);
});
onUnmounted(() => { if (temporizadorSolicitudes) clearInterval(temporizadorSolicitudes); });
</script>

<template>
  <Page title="Panel administrativo" description="Uso de almacenamiento y archivos por cliente.">
    <div class="mb-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <Card><div class="text-sm text-muted-foreground">Clientes activos</div><div class="mt-2 text-2xl font-semibold">{{ clientesActivos }}</div></Card>
      <Card><div class="text-sm text-muted-foreground">Espacio utilizado por clientes</div><div class="mt-2 text-2xl font-semibold">{{ formatoBytes(espacioUsado) }}</div></Card>
      <Card>
        <div class="flex justify-between text-sm text-muted-foreground"><span>Disco del servidor</span><span>{{ formatoBytes(espacioServidor.disponible) }} libres</span></div>
        <Progress class="mt-3" :percent="espacioServidor.total ? (espacioServidor.usado / espacioServidor.total) * 100 : 0" :show-info="false" />
        <div class="text-xs text-muted-foreground">{{ formatoBytes(espacioServidor.usado) }} de {{ formatoBytes(espacioServidor.total) }} usados en el volumen</div>
      </Card>
      <Card>
        <div class="flex justify-between text-sm text-muted-foreground"><span>Uso de cuotas asignadas</span><span>{{ porcentajeGlobal.toFixed(1) }}%</span></div>
        <Progress class="mt-3" :percent="porcentajeGlobal" :show-info="false" />
        <div class="text-xs text-muted-foreground">{{ formatoBytes(espacioUsado) }} de {{ formatoBytes(cuotaTotal) }}</div>
      </Card>
    </div>
    <Alert
      v-if="porcentajeGlobal >= 80 || (espacioServidor.total > 0 && espacioServidor.disponible / espacioServidor.total < 0.1) || resumen.some((u) => u.limite > 0 && u.ocupados / u.limite >= 0.85)"
      class="mb-4"
      type="warning"
      show-icon
      message="Hay alertas de almacenamiento"
      :description="`${resumen.filter((u) => u.limite > 0 && u.ocupados / u.limite >= 0.85).length} cliente(s) superan el 85% de su cuota. Espacio libre del servidor: ${formatoBytes(espacioServidor.disponible)}.`"
    />
    <Card>
      <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div class="text-lg font-semibold">Almacenamiento por cliente</div>
          <div class="text-sm text-muted-foreground">Consulta el espacio utilizado y los archivos de cada cuenta.</div>
        </div>
        <div class="flex flex-wrap items-center gap-2"><Button @click="copiarEnlaceRegistro">Invitar cliente</Button><Button type="primary" @click="abierto = true">Crear usuario</Button></div>
      </div>
      <Table :columns="columnas" :data-source="resumen" :loading="cargando" row-key="idUsuario">
        <template #bodyCell="{ column, record }">
          <span v-if="column.key === 'persona'">{{ [record.nombres, record.apellidoPaterno, record.apellidoMaterno].filter(Boolean).join(' ') || 'Sin persona vinculada' }}<span v-if="record.ci" class="block text-xs text-muted-foreground">CI {{ record.ci }}</span></span>
          <Tag v-if="column.key === 'estado'" :color="record.estado === 'ACTIVO' ? 'green' : 'default'">{{ record.estado }}</Tag>
          <span v-else-if="column.key === 'limite'">{{ formatoBytes(record.limite) }}</span>
          <span v-else-if="column.key === 'ocupados'">{{ formatoBytes(record.ocupados) }}</span>
          <span v-else-if="column.key === 'cantidadArchivos'">{{ record.cantidadArchivos }}</span>
          <div v-else-if="column.key === 'uso'" class="min-w-28">
            <Progress :percent="record.limite ? Math.min(100, (record.ocupados / record.limite) * 100) : 0" size="small" />
            <span class="text-xs text-muted-foreground">{{ formatoBytes(record.disponibles) }} libres</span>
          </div>
          <div v-else-if="column.key === 'acciones'" class="flex flex-wrap gap-2">
            <Button size="small" @click="abrirArchivos(record)">Archivos</Button>
            <Button size="small" @click="editarAcceso(record)">Editar acceso</Button>
            <Button size="small" @click="abrirAdministracion(record)">Administrar</Button>
            <Button v-if="record.estado === 'ACTIVO'" size="small" danger @click="cambiarBloqueo(record, true)">Bloquear</Button>
            <Button v-else size="small" type="primary" @click="cambiarBloqueo(record, false)">Reactivar</Button>
          </div>
        </template>
      </Table>
    </Card>
    <Modal v-model:open="abierto" title="Crear cliente y vincular persona" :confirm-loading="guardando" ok-text="Crear cuenta cliente" cancel-text="Cancelar" @ok="guardar">
      <Form layout="vertical" class="pt-4">
        <div class="mb-2 font-medium">Datos de la persona</div>
        <div class="grid gap-x-3 md:grid-cols-2">
          <FormItem label="Nombres"><Input v-model:value="nombres" :maxlength="100" /></FormItem>
          <FormItem label="Apellido paterno"><Input v-model:value="apellidoPaterno" :maxlength="100" /></FormItem>
          <FormItem label="Apellido materno"><Input v-model:value="apellidoMaterno" :maxlength="100" /></FormItem>
          <FormItem label="CI"><Input v-model:value="ci" :maxlength="30" /></FormItem>
          <FormItem label="Correo"><Input v-model:value="correo" type="email" :maxlength="180" /></FormItem>
          <FormItem label="Teléfono"><Input v-model:value="telefono" :maxlength="40" /></FormItem>
        </div>
        <div class="mb-2 mt-3 font-medium">Datos de usuario y contraseña</div>
        <FormItem label="Nombre de usuario"><Input v-model:value="nombreUsuario" autocomplete="off" :maxlength="50" /></FormItem>
        <FormItem label="Contraseña" help="Usa al menos 8 caracteres y comparte la clave con el cliente de forma segura."><Input.Password v-model:value="contrasena" autocomplete="new-password" /></FormItem>
      </Form>
    </Modal>
    <Card class="mt-4"><template #title>Solicitudes de acceso pendientes</template>
      <Table :columns="[{ title: 'Persona', key: 'persona' }, { title: 'CI', dataIndex: 'ci', key: 'ci' }, { title: 'Correo', dataIndex: 'correo', key: 'correo' }, { title: 'Usuario solicitado', dataIndex: 'nombreUsuario', key: 'nombreUsuario' }, { title: 'Fecha', dataIndex: 'fechaSolicitud', key: 'fechaSolicitud' }, { title: 'Revisión', key: 'revision' }]" :data-source="solicitudes" row-key="idSolicitud" :pagination="{ pageSize: 6 }">
        <template #bodyCell="{ column, record }"><span v-if="column.key === 'persona'">{{ record.nombres }} {{ record.apellidoPaterno }} {{ record.apellidoMaterno }}</span><span v-else-if="column.key === 'fechaSolicitud'">{{ new Date(record.fechaSolicitud).toLocaleString() }}</span><div v-else-if="column.key === 'revision'" class="flex gap-2"><Button size="small" type="primary" @click="revisarSolicitud(record, true)">Aprobar</Button><Button size="small" danger @click="revisarSolicitud(record, false)">Rechazar</Button></div></template>
      </Table><Empty v-if="!solicitudes.length" description="No hay solicitudes pendientes" />
    </Card>
    <Modal v-model:open="editarAbierto" :title="`Editar acceso: ${clienteEditando?.nombreUsuario ?? ''}`" :confirm-loading="guardando" ok-text="Guardar cambios" cancel-text="Cancelar" @ok="guardarEdicion">
      <Form layout="vertical" class="pt-4">
        <FormItem label="Nombre de usuario"><Input v-model:value="nuevoNombre" autocomplete="off" :maxlength="50" /></FormItem>
        <FormItem label="Nueva contraseña" help="Déjala vacía para conservar la contraseña actual. Si la cambias, el cliente cerrará sesión en todos sus dispositivos."><Input.Password v-model:value="nuevaContrasena" autocomplete="new-password" /></FormItem>
      </Form>
    </Modal>
    <Drawer v-model:open="archivosAbiertos" :title="`Archivos de ${clienteSeleccionado?.nombreUsuario ?? 'cliente'}`" width="720">
      <Spin :spinning="cargandoArchivos">
        <div class="mb-3 flex gap-2">
          <Button size="small" @click="navegarCarpeta(undefined)">Raíz</Button>
          <Button size="small" @click="mostrarPapelera">Papelera</Button>
        </div>
        <Table v-if="!verPapelera && contenido.carpetas.length" :columns="[{ title: 'Carpetas', dataIndex: 'nombre', key: 'nombre' }, { title: '', key: 'abrir' }]" :data-source="contenido.carpetas" row-key="idCarpeta" :pagination="false">
          <template #bodyCell="{ column, record }"><Button v-if="column.key === 'abrir'" size="small" @click="navegarCarpeta(record.idCarpeta)">Abrir</Button></template>
        </Table>
        <Table v-if="!verPapelera && archivos.length" :columns="[
          { title: 'Archivo', dataIndex: 'nombreVisible', key: 'nombreVisible' },
          { title: 'Tamaño', dataIndex: 'tamano', key: 'tamano', width: 120 },
          { title: '', key: 'accion', width: 120 },
        ]" :data-source="archivos" row-key="idArchivo" :pagination="false">
          <template #bodyCell="{ column, record }">
            <span v-if="column.key === 'tamano'">{{ formatoBytes(record.tamano) }}</span>
            <Button v-else-if="column.key === 'accion'" size="small" @click="clienteSeleccionado && descargar(clienteSeleccionado, record)">Descargar</Button>
          </template>
        </Table>
        <Table v-if="verPapelera && papelera.length" :columns="[{ title: 'Tipo', dataIndex: 'tipo', key: 'tipo' }, { title: 'Nombre', dataIndex: 'nombre', key: 'nombre' }, { title: 'Tamaño', dataIndex: 'tamano', key: 'tamano' }]" :data-source="papelera" row-key="id" :pagination="false" />
        <Empty v-if="!cargandoArchivos && (verPapelera ? !papelera.length : !archivos.length && !contenido.carpetas.length)" :description="verPapelera ? 'La papelera está vacía' : 'Esta carpeta está vacía'" />
      </Spin>
    </Drawer>
    <Card class="mt-4">
      <template #title>Actividad reciente de clientes</template>
      <Table :columns="[{ title: 'Cliente', dataIndex: 'nombreUsuario', key: 'nombreUsuario' }, { title: 'Recurso', dataIndex: 'recurso', key: 'recurso' }, { title: 'Acción', dataIndex: 'accion', key: 'accion' }, { title: 'Tamaño', dataIndex: 'bytes', key: 'bytes' }, { title: 'Fecha', dataIndex: 'ocurridaEn', key: 'ocurridaEn' }]" :data-source="actividad" row-key="ocurridaEn" :pagination="{ pageSize: 8 }">
        <template #bodyCell="{ column, record }">
          <Tag v-if="column.key === 'accion'" color="blue">{{ record.accion }}</Tag>
          <span v-else-if="column.key === 'bytes'">{{ formatoBytes(record.bytes) }}</span>
          <span v-else-if="column.key === 'ocurridaEn'">{{ new Date(record.ocurridaEn).toLocaleString() }}</span>
        </template>
      </Table>
    </Card>
    <div class="mt-4 grid gap-4 xl:grid-cols-2">
      <Card>
        <template #title>Sesiones de clientes activas</template>
        <Table :columns="[{ title: 'Cliente', dataIndex: 'nombreUsuario', key: 'nombreUsuario' }, { title: 'Inicio', dataIndex: 'creadaEn', key: 'creadaEn' }, { title: 'Vence', dataIndex: 'expiraEn', key: 'expiraEn' }]" :data-source="sesionesGlobales" row-key="idSesion" :pagination="{ pageSize: 6 }">
          <template #bodyCell="{ column, record }"><span v-if="column.key === 'creadaEn' || column.key === 'expiraEn'">{{ new Date(record[column.key]).toLocaleString() }}</span></template>
        </Table>
        <Empty v-if="!sesionesGlobales.length" description="No hay sesiones activas" />
      </Card>
      <Card>
        <template #title>Historial de almacenamiento</template>
        <Table :columns="[{ title: 'Fecha', dataIndex: 'capturadoEn', key: 'capturadoEn' }, { title: 'Uso clientes', dataIndex: 'bytesOcupadosClientes', key: 'bytesOcupadosClientes' }, { title: 'Disco usado', key: 'disco' }]" :data-source="historial" row-key="capturadoEn" :pagination="{ pageSize: 6 }">
          <template #bodyCell="{ column, record }">
            <span v-if="column.key === 'capturadoEn'">{{ new Date(record.capturadoEn).toLocaleDateString() }}</span>
            <span v-else-if="column.key === 'bytesOcupadosClientes'">{{ formatoBytes(record.bytesOcupadosClientes) }}</span>
            <span v-else-if="column.key === 'disco'">{{ formatoBytes(record.bytesTotalServidor - record.bytesDisponiblesServidor) }} / {{ formatoBytes(record.bytesTotalServidor) }}</span>
          </template>
        </Table>
        <Empty v-if="!historial.length" description="El historial se inicia con la primera captura diaria" />
      </Card>
    </div>
    <Modal v-model:open="detalleAbierto" :title="`Administrar ${adminSeleccionado?.nombreUsuario ?? 'cliente'}`" :footer="null">
      <Form layout="vertical">
        <FormItem label="Cuota de almacenamiento">
          <div class="rounded-xl border border-border p-4">
            <div class="flex items-center justify-between gap-3">
              <Button html-type="button" shape="circle" :disabled="cuotaNueva === cuotasDisponibles[0]" aria-label="Reducir cuota" @click="ajustarCuota(-1)">−</Button>
              <div class="text-center">
                <div class="text-3xl font-semibold">{{ cuotaNueva }} GB</div>
                <div class="text-xs text-muted-foreground">Límite para esta cuenta</div>
                <div class="mt-1 text-xs text-muted-foreground">{{ formatoBytes(Math.round((cuotaNueva ?? 0) * 1_000_000_000) ) }}</div>
              </div>
              <Button html-type="button" shape="circle" :disabled="cuotaNueva === cuotasDisponibles[cuotasDisponibles.length - 1]" aria-label="Aumentar cuota" @click="ajustarCuota(1)">+</Button>
            </div>
            <div class="mt-4 flex flex-wrap justify-center gap-2">
              <Button
                v-for="cuota in cuotasDisponibles"
                :key="cuota"
                :type="cuotaNueva === cuota ? 'primary' : 'default'"
                html-type="button"
                size="small"
                @click="cuotaNueva = cuota"
              >
                {{ cuota }} GB
              </Button>
            </div>
          </div>
          <Button html-type="button" class="mt-3 w-full" type="primary" :loading="guardandoCuota" :disabled="guardandoCuota || cuotaNueva === undefined" @click="guardarCuota">Guardar cuota</Button>
        </FormItem>
      </Form>
      <div class="mb-2 font-medium">Sesiones activas</div>
      <div v-if="sesiones.length" class="space-y-2">
        <div v-for="sesion in sesiones" :key="sesion.idSesion" class="text-sm">Sesión #{{ sesion.idSesion }} · vence {{ new Date(sesion.expiraEn).toLocaleString() }}</div>
      </div>
      <Empty v-else description="Sin sesiones activas" />
    </Modal>
  </Page>
</template>
