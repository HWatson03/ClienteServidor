<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';

import { Page } from '@vben/common-ui';
import { Alert, Button, Card, Empty, Input, Modal, Progress, Spin, Table, Tag, message } from 'ant-design-vue';
import LestradeIcon from '#/components/lestrade-icon.vue';

import {
  crearCarpetaCliente,
  descargarArchivoClienteWeb,
  listarArchivosClienteWeb,
  listarCarpetasCliente,
  obtenerCuotaCliente,
  obtenerRaizCliente,
  subirArchivoCliente,
  type ArchivoClienteWeb,
  type CarpetaCliente,
  type CuotaCliente,
} from '#/api/archivos-cliente';

const carpetas = ref<CarpetaCliente[]>([]);
const archivos = ref<ArchivoClienteWeb[]>([]);
const ruta = ref<CarpetaCliente[]>([]);
const cuota = ref<CuotaCliente>({ limite: 0, ocupados: 0, reservados: 0, disponibles: 0 });
const cargando = ref(true);
const subiendo = ref(false);
const progreso = ref(0);
const tamanoSubiendo = ref(0);
const abrirNuevaCarpeta = ref(false);
const nombreNuevaCarpeta = ref('');
const guardandoCarpeta = ref(false);
const inputArchivo = ref<HTMLInputElement | null>(null);
const archivosPendientes = ref<File[]>([]);
const confirmarSubidaAbierta = ref(false);
const tamanoPendiente = computed(() => archivosPendientes.value.reduce((total, archivo) => total + archivo.size, 0));
const elementos = computed(() => [
  ...carpetas.value.map((carpeta) => ({ ...carpeta, id: carpeta.idCarpeta, tipoElemento: 'CARPETA' as const })),
  ...archivos.value.map((archivo) => ({ ...archivo, id: archivo.idArchivo, tipoElemento: 'ARCHIVO' as const })),
]);

const carpetaActual = computed(() => ruta.value.at(-1));
const porcentajeCuota = computed(() => cuota.value.limite
  ? Math.min(100, ((cuota.value.ocupados + cuota.value.reservados) / cuota.value.limite) * 100)
  : 0);

function formatoBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  const unidades = ['KB', 'MB', 'GB', 'TB'];
  let valor = bytes / 1024;
  let indice = 0;
  while (valor >= 1024 && indice < unidades.length - 1) { valor /= 1024; indice += 1; }
  return `${valor.toFixed(1)} ${unidades[indice]}`;
}

async function cargarContenido() {
  if (!carpetaActual.value) return;
  cargando.value = true;
  try {
    const [subcarpetas, pagina, resumen] = await Promise.all([
      listarCarpetasCliente(carpetaActual.value.idCarpeta),
      listarArchivosClienteWeb(carpetaActual.value.idCarpeta),
      obtenerCuotaCliente(),
    ]);
    carpetas.value = subcarpetas;
    archivos.value = pagina.content;
    cuota.value = resumen;
  } catch {
    message.error('No se pudo cargar el contenido de esta carpeta.');
  } finally { cargando.value = false; }
}

async function iniciar() {
  cargando.value = true;
  try {
    const raiz = await obtenerRaizCliente();
    ruta.value = [raiz];
    await cargarContenido();
  } catch {
    message.error('No se pudo abrir tu espacio de almacenamiento.');
    cargando.value = false;
  }
}

async function abrirCarpeta(carpeta: any) {
  ruta.value = [...ruta.value, carpeta];
  await cargarContenido();
}

async function abrirElemento(elemento: any) {
  if (elemento.tipoElemento === 'CARPETA') await abrirCarpeta(elemento);
  else await descargar(elemento);
}

async function volverA(indice: number) {
  ruta.value = ruta.value.slice(0, indice + 1);
  await cargarContenido();
}

async function guardarCarpeta() {
  const nombre = nombreNuevaCarpeta.value.trim();
  if (!nombre || !carpetaActual.value) {
    message.warning('Escribe un nombre para la carpeta.');
    return;
  }
  guardandoCarpeta.value = true;
  try {
    await crearCarpetaCliente(carpetaActual.value.idCarpeta, nombre);
    message.success('Carpeta creada.');
    nombreNuevaCarpeta.value = '';
    abrirNuevaCarpeta.value = false;
    await cargarContenido();
  } catch (error: any) {
    message.error(error?.mensaje ?? error?.message ?? 'No se pudo crear la carpeta.');
  } finally { guardandoCarpeta.value = false; }
}

async function seleccionarArchivos(event: Event) {
  const selector = event.target as HTMLInputElement;
  const seleccionados = Array.from(selector.files ?? []);
  selector.value = '';
  if (!seleccionados.length || !carpetaActual.value) return;
  archivosPendientes.value = seleccionados;
  confirmarSubidaAbierta.value = true;
}

async function confirmarSubida() {
  if (!carpetaActual.value || !archivosPendientes.value.length) return;
  if (tamanoPendiente.value > cuota.value.disponibles) {
    message.warning(`Los archivos seleccionados ocupan ${formatoBytes(tamanoPendiente.value)} y solo tienes ${formatoBytes(cuota.value.disponibles)} disponibles.`);
    return;
  }
  const pendientes = [...archivosPendientes.value];
  confirmarSubidaAbierta.value = false;
  subiendo.value = true;
  try {
    for (const file of pendientes) {
      tamanoSubiendo.value = file.size;
      progreso.value = 0;
      await subirArchivoCliente(carpetaActual.value.idCarpeta, file, (bytes) => { progreso.value = bytes; });
      message.success(`«${file.name}» se subió correctamente.`);
    }
    await cargarContenido();
  } catch (error: any) {
    message.error(error?.mensaje ?? error?.message ?? 'No se pudo completar la subida.');
  } finally { subiendo.value = false; archivosPendientes.value = []; }
}

async function descargar(archivo: any) {
  try {
    const blob = await descargarArchivoClienteWeb(archivo.idArchivo);
    const url = URL.createObjectURL(blob);
    const enlace = document.createElement('a');
    enlace.href = url;
    enlace.download = archivo.nombreVisible;
    enlace.click();
    URL.revokeObjectURL(url);
  } catch (error: any) {
    message.error(error?.mensaje ?? error?.message ?? 'No se pudo descargar el archivo.');
  }
}

onMounted(iniciar);
</script>

<template>
  <Page title="Mis archivos" description="Tu espacio personal en la nube.">
    <div class="client-files min-w-0">
    <div class="mb-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
      <Card class="client-toolbar rounded-2xl">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div class="mb-2 inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700"><LestradeIcon name="folder-open" size="14" /> ESPACIO PERSONAL</div>
            <div class="text-xl font-semibold tracking-tight">{{ ruta.length <= 1 ? 'Mi espacio' : carpetaActual?.nombre }}</div>
            <div class="mt-1 text-sm text-muted-foreground">Tus archivos, organizados y disponibles desde cualquier dispositivo.</div>
          </div>
          <div class="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap">
            <Button class="min-h-11" :disabled="subiendo" @click="abrirNuevaCarpeta = true"><LestradeIcon name="folder-plus" size="16" /> Nueva carpeta</Button>
            <Button class="min-h-11" type="primary" :loading="subiendo" :disabled="subiendo || cuota.disponibles <= 0" @click="inputArchivo?.click()"><LestradeIcon name="upload" size="16" /> {{ subiendo ? 'Subiendo…' : 'Subir archivos' }}</Button>
            <input ref="inputArchivo" class="hidden" type="file" multiple @change="seleccionarArchivos" />
          </div>
        </div>
        <div v-if="subiendo" class="mt-4 rounded-xl bg-blue-50 p-3">
          <div class="mb-1 flex justify-between text-sm"><span>Subiendo archivo…</span><span>{{ formatoBytes(progreso) }} / {{ formatoBytes(tamanoSubiendo) }}</span></div>
          <Progress :percent="tamanoSubiendo ? Math.round((progreso / tamanoSubiendo) * 100) : 0" />
        </div>
        <div class="mt-4 flex flex-wrap items-center gap-2 text-sm">
          <template v-for="(carpeta, indice) in ruta" :key="carpeta.idCarpeta">
            <button class="text-primary hover:underline" @click="volverA(indice)">{{ indice === 0 ? 'Mi espacio' : carpeta.nombre }}</button>
            <span v-if="indice < ruta.length - 1" class="text-muted-foreground">/</span>
          </template>
        </div>
      </Card>
      <Card class="quota-card rounded-2xl">
        <div class="flex items-center justify-between text-sm"><span class="font-semibold">Almacenamiento</span><span class="rounded-full bg-white/15 px-2.5 py-1 font-semibold">{{ porcentajeCuota.toFixed(0) }}%</span></div>
        <Progress class="mt-2" :percent="porcentajeCuota" :status="porcentajeCuota >= 90 ? 'exception' : 'normal'" />
        <div class="mt-3 text-2xl font-bold tracking-tight">{{ formatoBytes(cuota.ocupados + cuota.reservados) }}</div>
        <div class="mt-1 text-sm text-muted-foreground">utilizados de {{ formatoBytes(cuota.limite) }}</div>
        <div class="mt-3 flex items-center justify-between border-t border-white/20 pt-3 text-xs"><span>Disponible</span><strong>{{ formatoBytes(cuota.disponibles) }}</strong></div>
        <Tag v-if="cuota.disponibles <= 0" class="mt-2" color="red">Cuota completa</Tag>
      </Card>
    </div>

    <Card :body-style="{ padding: 0 }" class="overflow-hidden rounded-xl">
      <Spin :spinning="cargando">
        <Table
          class="hidden lg:block"
          v-if="carpetas.length || archivos.length"
          :columns="[
            { title: 'Nombre', key: 'nombre' },
            { title: 'Tamaño', key: 'tamano', width: 150 },
            { title: 'Tipo', key: 'tipo', width: 160 },
            { title: 'Acción', key: 'accion', width: 150 },
          ]"
          :data-source="elementos"
          :pagination="{ pageSize: 20 }"
          :scroll="{ x: 680 }"
          row-key="id"
          size="middle"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'nombre'">
              <button v-if="record.tipoElemento === 'CARPETA'" class="inline-flex items-center gap-2 font-medium text-primary hover:underline" @click="abrirCarpeta(record)"><span class="file-icon folder-icon"><LestradeIcon name="folder" /></span>{{ record.nombre }}</button>
              <span v-else class="inline-flex items-center gap-2 font-medium"><span class="file-icon"><LestradeIcon name="file" /></span>{{ record.nombreVisible }}</span>
            </template>
            <span v-else-if="column.key === 'tamano'">{{ record.tipoElemento === 'ARCHIVO' ? formatoBytes(record.tamano) : '—' }}</span>
            <span v-else-if="column.key === 'tipo'">{{ record.tipoElemento === 'CARPETA' ? 'Carpeta' : (record.tipoMime || 'Archivo') }}</span>
            <Button v-else-if="column.key === 'accion' && record.tipoElemento === 'ARCHIVO'" size="small" @click="descargar(record)"><LestradeIcon name="download" size="15" /> Descargar</Button>
          </template>
        </Table>
        <div v-if="elementos.length" class="space-y-2 p-3 lg:hidden">
          <div v-for="elemento in elementos" :key="elemento.id" class="mobile-file">
            <span class="file-icon" :class="elemento.tipoElemento === 'CARPETA' ? 'folder-icon' : ''">
              <LestradeIcon v-if="elemento.tipoElemento === 'CARPETA'" name="folder" />
              <LestradeIcon v-else name="file" />
            </span>
            <button class="min-w-0 flex-1 text-left" @click="abrirElemento(elemento)">
              <span class="block truncate text-sm font-semibold">{{ elemento.tipoElemento === 'CARPETA' ? elemento.nombre : elemento.nombreVisible }}</span>
              <span class="mt-1 block truncate text-xs text-muted-foreground">{{ elemento.tipoElemento === 'CARPETA' ? 'Carpeta · Abrir' : `${elemento.tipoMime || 'Archivo'} · ${formatoBytes(elemento.tamano)}` }}</span>
            </button>
            <Button v-if="elemento.tipoElemento === 'ARCHIVO'" class="shrink-0" shape="circle" aria-label="Descargar archivo" @click="descargar(elemento)"><LestradeIcon name="download" size="16" /></Button>
          </div>
        </div>
        <Empty v-else-if="!cargando" description="Esta carpeta está vacía. Sube un archivo o crea una carpeta para empezar." class="py-12" />
      </Spin>
    </Card>

    <Modal v-model:open="abrirNuevaCarpeta" title="Crear carpeta" :confirm-loading="guardandoCarpeta" ok-text="Crear" cancel-text="Cancelar" @ok="guardarCarpeta">
      <Input v-model:value="nombreNuevaCarpeta" class="mt-3" :maxlength="255" placeholder="Nombre de la carpeta" @press-enter="guardarCarpeta" />
    </Modal>
    <Modal v-model:open="confirmarSubidaAbierta" title="Confirmar subida de archivos" ok-text="Subir archivos" cancel-text="Cancelar" @ok="confirmarSubida" @cancel="archivosPendientes = []">
      <p>Se subirán {{ archivosPendientes.length }} archivo(s) a «{{ carpetaActual?.nombre }}».</p>
      <p class="mb-3">Tamaño total: <strong>{{ formatoBytes(tamanoPendiente) }}</strong> · Disponible: {{ formatoBytes(cuota.disponibles) }}</p>
      <Alert v-if="tamanoPendiente > cuota.disponibles" type="warning" show-icon message="La selección supera el espacio disponible." />
      <ul class="mt-3 max-h-40 overflow-auto text-sm"><li v-for="archivo in archivosPendientes" :key="`${archivo.name}-${archivo.lastModified}`">{{ archivo.name }} · {{ formatoBytes(archivo.size) }}</li></ul>
    </Modal>
    </div>
  </Page>
</template>
