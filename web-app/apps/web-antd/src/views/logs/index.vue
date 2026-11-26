<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';

import { Page } from '@vben/common-ui';
import { Alert, Button, Card, Empty, Input, Select, Spin, Tag, message } from 'ant-design-vue';

import { obtenerLogsSistema, obtenerTicketLogsWebSocket, type LogsSistema } from '#/api/logs-sistema';

const datos = ref<LogsSistema>({ archivo: 'lestrade.log', disponible: false, bytes: 0, modificadoEn: null, lineas: [] });
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

const lineasFiltradas = computed(() => datos.value.lineas
  .filter((linea) => !busqueda.value || linea.toLowerCase().includes(busqueda.value.toLowerCase()))
  .filter((linea) => nivel.value === 'TODOS' || linea.includes(`[${nivel.value}`))
  .slice()
  .reverse());

function nivelLinea(linea: string) {
  const coincidencia = linea.match(/\[(TRACE|DEBUG|INFO|WARN|ERROR)\s*\]/)?.[1] ?? 'DETALLE';
  return coincidencia;
}

function colorNivel(linea: string) {
  const tipo = nivelLinea(linea);
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
        :description="`Archivo activo: ${datos.archivo}. Se muestran como máximo 300 líneas recientes; los archivos rotados se conservan en el servidor.`"
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
          <span class="self-center text-sm text-gray-500">{{ lineasFiltradas.length }} líneas</span>
        </div>

        <Spin :spinning="cargando">
          <div v-if="!datos.disponible" class="py-10">
            <Empty description="Todavía no hay un archivo de log. Se creará cuando el sistema escriba el primer evento." />
          </div>
          <div v-else-if="lineasFiltradas.length" class="max-h-[65vh] overflow-auto rounded-lg bg-slate-950 p-3 text-slate-100">
            <div
              v-for="(linea, indice) in lineasFiltradas"
              :key="`${indice}-${linea}`"
              class="flex gap-3 border-b border-white/5 py-1.5 font-mono text-xs leading-5"
            >
              <Tag class="m-0 h-fit min-w-16 text-center" :color="colorNivel(linea)">{{ nivelLinea(linea) }}</Tag>
              <pre class="m-0 whitespace-pre-wrap break-all">{{ linea }}</pre>
            </div>
          </div>
          <Empty v-else description="No hay líneas que coincidan con los filtros." />
        </Spin>
      </Card>
    </div>
  </Page>
</template>
