<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';

import { Page } from '@vben/common-ui';
import { Alert, Button, Card, Empty, Input, Select, Spin, Tag, message } from 'ant-design-vue';

import { obtenerLogsSistema, obtenerTicketLogsWebSocket, type LogEntrada, type LogsSistema } from '#/api/logs-sistema';

const datos = ref<LogsSistema>({ archivo: 'lestrade.log', disponible: false, bytes: 0, modificadoEn: null, entradas: [] });
const cargando = ref(true);
const busqueda = ref('');
const nivel = ref('TODOS');
const conexion = ref<'conectando' | 'en-vivo' | 'reintentando'>('conectando');
const actualizado = ref<Date | null>(null);
let socket: WebSocket | undefined;
let reintento: ReturnType<typeof setTimeout> | undefined;
let desmontado = false;

const niveles = [
  { label: 'Todos los niveles', value: 'TODOS' },
  { label: 'Error', value: 'ERROR' },
  { label: 'Advertencia', value: 'WARN' },
  { label: 'Información', value: 'INFO' },
  { label: 'Depuración', value: 'DEBUG' },
];

const lineasFiltradas = computed(() => datos.value.entradas
  .filter((entrada) => !busqueda.value || `${entrada.fecha} ${entrada.origen} ${entrada.usuario} ${entrada.mensaje} ${entrada.detalle}`.toLowerCase().includes(busqueda.value.toLowerCase()))
  .filter((entrada) => nivel.value === 'TODOS' || entrada.nivel === nivel.value)
  .slice()
  .reverse());

function colorNivel(entrada: LogEntrada) {
  const tipo = entrada.nivel;
  if (tipo === 'ERROR') return 'red';
  if (tipo === 'WARN') return 'orange';
  if (tipo === 'INFO') return 'blue';
  return 'default';
}

function recibir(respuesta: LogsSistema) {
  datos.value = respuesta;
  actualizado.value = new Date();
  cargando.value = false;
}

async function cargar() {
  cargando.value = true;
  try {
    recibir(await obtenerLogsSistema());
  } catch {
    message.error('No se pudieron cargar los logs del sistema.');
  } finally {
    cargando.value = false;
  }
}

async function conectar() {
  if (desmontado) return;
  conexion.value = 'conectando';
  try {
    const { ticket } = await obtenerTicketLogsWebSocket();
    if (desmontado) return;
    const url = new URL('/ws/admin/logs', window.location.href);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    url.searchParams.set('ticket', ticket);
    socket = new WebSocket(url);
    socket.onopen = () => { conexion.value = 'en-vivo'; };
    socket.onmessage = (evento) => {
      try { recibir(JSON.parse(evento.data) as LogsSistema); }
      catch { /* Ignora mensajes incompletos y conserva el último contenido válido. */ }
    };
    socket.onerror = () => socket?.close();
    socket.onclose = () => {
      if (desmontado) return;
      conexion.value = 'reintentando';
      reintento = setTimeout(() => void conectar(), 4000);
    };
  } catch {
    if (desmontado) return;
    conexion.value = 'reintentando';
    reintento = setTimeout(() => void conectar(), 4000);
  }
}

onMounted(() => {
  void cargar();
  void conectar();
});

onUnmounted(() => {
  desmontado = true;
  if (reintento) clearTimeout(reintento);
  socket?.close();
});
</script>

<template>
  <Page title="Logs del sistema">
    <div class="flex flex-col gap-4 p-4">
      <Alert
        message="Registro en vivo"
        :description="`Archivo activo: ${datos.archivo}. Se muestran como máximo 300 eventos recientes; los archivos rotados se conservan en el servidor.`"
        type="info"
        show-icon
      />
      <Card>
        <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div class="flex items-center gap-2">
            <Tag :color="conexion === 'en-vivo' ? 'green' : 'orange'">
              {{ conexion === 'en-vivo' ? 'EN VIVO' : conexion === 'conectando' ? 'CONECTANDO' : 'RECONECTANDO' }}
            </Tag>
            <span class="text-sm text-gray-500">
              {{ actualizado ? `Actualizado ${actualizado.toLocaleTimeString()}` : 'Esperando datos' }}
            </span>
          </div>
          <Button :loading="cargando" @click="cargar">Actualizar ahora</Button>
        </div>

        <div class="mb-4 flex flex-wrap gap-3">
          <Input v-model:value="busqueda" allow-clear placeholder="Buscar en los logs" class="max-w-md" />
          <Select v-model:value="nivel" :options="niveles" class="w-48" />
          <span class="self-center text-sm text-gray-500">{{ lineasFiltradas.length }} eventos</span>
        </div>

        <Spin :spinning="cargando">
          <div v-if="!datos.disponible" class="py-10">
            <Empty description="Todavía no hay un archivo de log. Se creará cuando el sistema escriba el primer evento." />
          </div>
          <div v-else-if="lineasFiltradas.length" class="max-h-[70vh] space-y-3 overflow-auto pr-1">
            <Card v-for="(entrada, indice) in lineasFiltradas" :key="`${entrada.fecha}-${indice}`" size="small">
              <div class="flex flex-wrap items-center gap-2">
                <Tag class="m-0 min-w-16 text-center" :color="colorNivel(entrada)">{{ entrada.nivel }}</Tag>
                <span class="font-mono text-xs text-gray-500">{{ entrada.fecha || 'Hora no disponible' }}</span>
                <span v-if="entrada.origen" class="rounded bg-gray-100 px-2 py-0.5 font-mono text-xs text-gray-600">{{ entrada.origen }}</span>
                <Tag v-if="entrada.usuario" class="m-0" color="purple">{{ entrada.usuario }}</Tag>
              </div>
              <p class="mb-0 mt-2 whitespace-pre-wrap break-words font-medium">{{ entrada.mensaje }}</p>
              <details v-if="entrada.detalle" class="mt-3">
                <summary class="cursor-pointer select-none text-sm text-blue-600">
                  Ver detalle técnico ({{ entrada.detalle.split('\n').length }} líneas)
                </summary>
                <pre class="mt-2 max-h-80 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-slate-950 p-3 text-xs leading-5 text-slate-100">{{ entrada.detalle }}</pre>
              </details>
            </Card>
          </div>
          <Empty v-else description="No hay líneas que coincidan con los filtros." />
        </Spin>
      </Card>
    </div>
  </Page>
</template>
