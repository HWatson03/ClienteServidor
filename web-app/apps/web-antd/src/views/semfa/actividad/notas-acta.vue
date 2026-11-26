<script lang="ts" setup>
import type { ColumnsType } from 'ant-design-vue/es/table';

import type { PasoActividad } from '#/api/actividades';
import type { ResultadosProyecto } from '#/api/resultados';

import { computed, nextTick, ref, shallowRef, watch } from 'vue';

import { IconifyIcon } from '@vben/icons';

import { Button, Card, Input, InputNumber, Table, Tooltip } from 'ant-design-vue';

import { guardarNotaDirecta, quitarNotaDirecta } from '#/api/inscripciones';
import { obtenerResultados } from '#/api/resultados';
import SemfaBarraCrud from '#/components/semfa/semfa-barra-crud.vue';
import SemfaModalForm from '#/components/semfa/semfa-modal-form.vue';
import SemfaPagina from '#/components/semfa/semfa-pagina.vue';
import { useActividadTrabajo } from '#/composables/useActividadTrabajo';
import { avisar, confirmar } from '#/composables/useAvisos';
import { useTablaLocal } from '#/composables/useTablaLocal';
import { limpiarEspacios, nombrePropio } from '#/utils/formato';
import { leerNota, posicionEstimada, puntajeEnCategoria } from '#/utils/nota-acta';

defineOptions({ name: 'SemfaActividadNotasActa' });

/**
 * Paso «Notas de acta» del centro de la actividad: los proyectos cuya nota llegó
 * escrita (8.5 sobre 10, 95/100…) se buscan aquí y se les pone esa nota. El
 * sistema la lleva al puntaje máximo de su categoría, el proyecto queda evaluado
 * y entra al ranking de su carrera; ningún jurado lo ve. Lo que no está
 * registrado se registra en «Participantes».
 */
const emit = defineEmits<{ cambiado: []; ir: [paso: PasoActividad] }>();

const { idActividad, nombreActividad } = useActividadTrabajo();

// ---------------------------------------------------------------- datos

const proyectos = shallowRef<
  (ResultadosProyecto & { categoria: string; idCategoria: number; maximo: number })[]
>([]);
const cargando = ref(false);
/** Solo cuenta la última carga: una respuesta vieja no pisa a la nueva. */
let ultimaCarga = 0;

async function cargar() {
  const id = idActividad.value;
  const esta = ++ultimaCarga;
  if (!id) {
    proyectos.value = [];
    return;
  }
  cargando.value = true;
  try {
    const r = await obtenerResultados(id);
    if (esta !== ultimaCarga) return;
    proyectos.value = (r?.categorias ?? []).flatMap((c) =>
      c.proyectos.map((p) => ({ ...p, categoria: c.nombre, idCategoria: c.idCategoria, maximo: c.puntajeMaximo })),
    );
  } finally {
    cargando.value = false;
  }
}

watch(idActividad, cargar, { immediate: true });

const filas = computed(() =>
  proyectos.value
    .map((p) => ({
      ...p,
      carreraBonita: nombrePropio(p.carrera ?? p.institucion),
      categoriaBonita: nombrePropio(p.categoria),
      conNota: !!p.notaDirecta,
      proyecto: limpiarEspacios(p.nombre),
      textoNota: p.notaDirecta?.texto ?? '',
    }))
    .sort(
      (a, b) =>
        a.carreraBonita.localeCompare(b.carreraBonita, 'es') ||
        a.categoriaBonita.localeCompare(b.categoriaBonita, 'es') ||
        (a.puesto || Number.MAX_SAFE_INTEGER) - (b.puesto || Number.MAX_SAFE_INTEGER) ||
        (b.puntaje ?? -1) - (a.puntaje ?? -1) ||
        a.proyecto.localeCompare(b.proyecto, 'es'),
    ),
);

type Fila = (typeof filas.value)[number];

// ---------------------------------------------------------------- filtros

const filtroNota = ref<'con' | 'sin'>();
const filtroFacultad = ref<string>();
const filtroCarrera = ref<string>();
const filtroCategoria = ref<number>();

const conNota = computed(() => filas.value.filter((f) => f.conNota).length);

function contar<K>(lista: Fila[], clave: (f: Fila) => K | null | undefined) {
  const m = new Map<K, number>();
  for (const f of lista) {
    const k = clave(f);
    if (k !== null && k !== undefined && k !== '') m.set(k, (m.get(k) ?? 0) + 1);
  }
  return m;
}

const chipsFacultad = computed(() =>
  [...contar(filas.value, (f) => f.siglaFacultad).entries()]
    .map(([sigla, total]) => ({ nombre: filas.value.find((f) => f.siglaFacultad === sigla)?.facultad ?? sigla, sigla, total }))
    .sort((a, b) => a.sigla.localeCompare(b.sigla, 'es')),
);

const chipsCarrera = computed(() =>
  [
    ...contar(
      filas.value.filter((f) => filtroFacultad.value === undefined || f.siglaFacultad === filtroFacultad.value),
      (f) => (f.carrera ? f.carreraBonita : null),
    ).entries(),
  ]
    .map(([nombre, total]) => ({ nombre, total }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
);

const chipsCategoria = computed(() =>
  [...contar(filas.value, (f) => f.idCategoria).entries()]
    .map(([id, total]) => ({ id, nombre: filas.value.find((f) => f.idCategoria === id)!.categoriaBonita, total }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
);

function alternarNota(valor: 'con' | 'sin') {
  filtroNota.value = filtroNota.value === valor ? undefined : valor;
}

function alternarFacultad(sigla: string) {
  filtroFacultad.value = filtroFacultad.value === sigla ? undefined : sigla;
  filtroCarrera.value = undefined;
}

function alternarCarrera(nombre: string) {
  filtroCarrera.value = filtroCarrera.value === nombre ? undefined : nombre;
}

function alternarCategoria(id: number) {
  filtroCategoria.value = filtroCategoria.value === id ? undefined : id;
}

const filasFiltradas = computed(() =>
  filas.value.filter(
    (f) =>
      (filtroNota.value === undefined || f.conNota === (filtroNota.value === 'con')) &&
      (filtroFacultad.value === undefined || f.siglaFacultad === filtroFacultad.value) &&
      (filtroCarrera.value === undefined || f.carreraBonita === filtroCarrera.value) &&
      (filtroCategoria.value === undefined || f.idCategoria === filtroCategoria.value),
  ),
);

const { alCambiarTabla, busqueda, filtrados, paginacion } = useTablaLocal(filasFiltradas, {
  camposBusqueda: ['proyecto', 'carreraBonita', 'categoriaBonita', 'docenteGuia', 'stand', 'textoNota'],
});

// ---------------------------------------------------------------- formulario

const abierto = ref(false);
const guardando = ref(false);
const elegido = ref<Fila | null>(null);
const nota = ref('');
const escala = ref<number | undefined>(10);
const observacion = ref('');
/** Lo cargado al abrir, para saber si hubo cambios. */
const inicial = ref('');

const ESCALAS = [10, 20, 100];
/** antd expone `focus()` en la instancia, pero sus tipos no lo declaran. */
const campoNota = ref<{ focus: () => void }>();

const lectura = computed(() => leerNota(nota.value, escala.value));
/** La nota trae su escala («95/100»): los botones de escala no aplican. */
const escalaEnTexto = computed(() => /\/|sobre|de/i.test(nota.value));

const puntajeNuevo = computed(() =>
  elegido.value && lectura.value.ok
    ? puntajeEnCategoria(lectura.value.valor, lectura.value.escala, elegido.value.maximo)
    : null,
);

/** Grupo con el que compite: misma categoría y misma carrera (como el ranking). */
const posicion = computed(() => {
  const e = elegido.value;
  if (!e || puntajeNuevo.value === null) return null;
  const grupo = proyectos.value.filter(
    (p) => p.idCategoria === e.idCategoria && (p.carrera ?? null) === (e.carrera ?? null),
  );
  return posicionEstimada(grupo, e.idInscripcion, puntajeNuevo.value);
});

const hayCambios = computed(() => `${nota.value}|${escala.value}|${observacion.value}` !== inicial.value);

function abrir(f: Fila) {
  elegido.value = f;
  const n = f.notaDirecta;
  nota.value = n ? String(n.valor) : '';
  escala.value = n ? n.escala : 10;
  observacion.value = n?.observacion ?? '';
  inicial.value = `${nota.value}|${escala.value}|${observacion.value}`;
  abierto.value = true;
  // El modal se monta al abrir: el foco va a la nota cuando ya está en pantalla.
  setTimeout(() => nextTick(() => campoNota.value?.focus()), 150);
}

// Al escribir «85» sin escala, lo más probable es que sea sobre 100.
watch(nota, (texto) => {
  if (escalaEnTexto.value) return;
  const v = Number(texto.replace(',', '.'));
  if (Number.isFinite(v) && v > 10 && (escala.value ?? 0) < v) escala.value = 100;
});

async function guardar() {
  const f = elegido.value;
  if (!f || guardando.value) return;
  if (!lectura.value.ok) {
    avisar({ mensaje: lectura.value.error, tipo: 'error', titulo: 'Revise la nota' });
    return;
  }
  guardando.value = true;
  try {
    const guardada = await guardarNotaDirecta(f.idInscripcion, {
      escala: escalaEnTexto.value ? null : (escala.value ?? null),
      nota: nota.value,
      observacion: observacion.value.trim() || null,
    });
    avisar({
      mensaje: `«${f.proyecto}»: ${guardada.texto} → ${puntajeNuevo.value} de ${f.maximo || 100} puntos.`,
      tipo: 'exito',
      titulo: 'Nota de acta registrada',
    });
    abierto.value = false;
    await cargar();
    emit('cambiado');
  } catch {
    // El interceptor ya avisó.
  } finally {
    guardando.value = false;
  }
}

async function quitar(f: Fila) {
  const ok = await confirmar({
    mensaje: `«${f.proyecto}» dejará de tener la nota ${f.notaDirecta?.texto} y volverá a los jurados asignados a su categoría (si no tiene jurados, queda sin evaluar).`,
    peligro: true,
    textoAceptar: 'Quitar nota',
    titulo: '¿Quitar la nota de acta?',
  });
  if (!ok) return;
  try {
    await quitarNotaDirecta(f.idInscripcion);
    avisar({ mensaje: `«${f.proyecto}» vuelve a calificarse con jurados.`, tipo: 'exito', titulo: 'Nota quitada' });
    abierto.value = false;
    await cargar();
    emit('cambiado');
  } catch {
    // El interceptor ya avisó.
  }
}

// ---------------------------------------------------------------- tabla

function comparar(a: null | string, b: null | string) {
  return (a ?? '').localeCompare(b ?? '', 'es', { numeric: true });
}

const ESTADO: Record<string, { clase: string; texto: string }> = {
  COMPLETO: { clase: 'bg-green-500/10 text-green-700', texto: 'Evaluado' },
  EN_PROCESO: { clase: 'bg-amber-500/10 text-amber-700', texto: 'En proceso' },
  SIN_INICIAR: { clase: 'bg-muted text-muted-foreground', texto: 'Sin iniciar' },
  SIN_JURADOS: { clase: 'bg-muted text-muted-foreground', texto: 'Sin jurados' },
};

const columnas = computed<ColumnsType<Fila>>(() => [
  {
    dataIndex: 'proyecto',
    ellipsis: true,
    key: 'proyecto',
    sorter: (a, b) => comparar(a.proyecto, b.proyecto),
    title: 'Proyecto',
    width: 280,
  },
  {
    dataIndex: 'carreraBonita',
    ellipsis: true,
    key: 'carrera',
    sorter: (a, b) => comparar(a.carreraBonita, b.carreraBonita),
    title: 'Carrera',
    width: 190,
  },
  {
    dataIndex: 'categoriaBonita',
    ellipsis: true,
    key: 'categoria',
    sorter: (a, b) => comparar(a.categoriaBonita, b.categoriaBonita),
    title: 'Categoría',
    width: 160,
  },
  { align: 'center', key: 'nota', sorter: (a, b) => comparar(a.textoNota, b.textoNota), title: 'Nota de acta', width: 120 },
  {
    align: 'center',
    key: 'puntaje',
    sorter: (a, b) => (a.puntaje ?? -1) - (b.puntaje ?? -1),
    title: 'Puntaje',
    width: 110,
  },
  { align: 'center', key: 'estado', title: 'Estado', width: 110 },
  { align: 'center', key: 'puesto', sorter: (a, b) => (a.puesto || 999) - (b.puesto || 999), title: 'Puesto', width: 80 },
  { align: 'center', key: 'acciones', title: '', width: 120 },
]);
</script>

<template>
  <SemfaPagina
    description="Proyectos con la nota entregada por escrito: se les pone esa nota y entran al ranking"
    title="Notas de acta"
  >
    <Card :body-style="{ padding: 0 }" class="overflow-hidden rounded-xl">
      <template #title>
        <div class="flex items-center gap-2">
          <IconifyIcon class="size-5 text-primary" icon="lucide:file-pen-line" />
          Notas de acta
          <span v-if="nombreActividad" class="text-sm font-normal text-muted-foreground">· {{ nombreActividad }}</span>
        </div>
      </template>
      <template #extra>
        <SemfaBarraCrud
          v-model:busqueda="busqueda"
          :cargando="cargando"
          icono-agregar="lucide:user-plus"
          placeholder="Buscar proyecto, carrera, docente o stand…"
          texto-agregar="Registrar proyecto"
          @agregar="emit('ir', 'participantes')"
          @recargar="cargar"
        />
      </template>

      <p class="m-0 flex items-start gap-1.5 border-b border-border px-4 py-2.5 text-sm text-muted-foreground">
        <IconifyIcon class="mt-0.5 size-4 shrink-0" icon="lucide:info" />
        <span>
          Escriba la nota como viene en el acta (<b>8.5</b> sobre 10, <b>95/100</b>…). Se lleva con regla de tres al
          puntaje máximo de la categoría, el proyecto queda <b>evaluado</b> y compite en el ranking de su carrera. Los
          jurados ya no lo ven. ¿No está en la lista? Use «Registrar proyecto» (Participantes) y vuelva aquí.
        </span>
      </p>

      <!-- Filtros de un clic -->
      <div class="flex max-h-44 flex-col gap-2 overflow-y-auto border-b border-border px-4 py-2">
        <div class="flex flex-wrap items-center gap-2">
          <IconifyIcon class="size-4 text-muted-foreground" icon="lucide:file-pen-line" />
          <button :class="{ 'is-activo': filtroNota === 'con' }" class="semfa-chip" type="button" @click="alternarNota('con')">
            Con nota de acta <span class="semfa-chip__total">{{ conNota }}</span>
          </button>
          <button :class="{ 'is-activo': filtroNota === 'sin' }" class="semfa-chip" type="button" @click="alternarNota('sin')">
            Sin nota de acta <span class="semfa-chip__total">{{ filas.length - conNota }}</span>
          </button>
        </div>
        <div v-if="chipsFacultad.length > 0" class="flex flex-wrap items-center gap-2">
          <Tooltip title="Facultad"><IconifyIcon class="size-4 text-muted-foreground" icon="lucide:landmark" /></Tooltip>
          <Tooltip v-for="f in chipsFacultad" :key="f.sigla" :title="f.nombre">
            <button :class="{ 'is-activo': filtroFacultad === f.sigla }" class="semfa-chip" type="button" @click="alternarFacultad(f.sigla)">
              {{ f.sigla }} <span class="semfa-chip__total">{{ f.total }}</span>
            </button>
          </Tooltip>
        </div>
        <div v-if="chipsCarrera.length > 0" class="flex flex-wrap items-center gap-2">
          <Tooltip title="Carrera"><IconifyIcon class="size-4 text-muted-foreground" icon="lucide:graduation-cap" /></Tooltip>
          <button
            v-for="c in chipsCarrera"
            :key="c.nombre"
            :class="{ 'is-activo': filtroCarrera === c.nombre }"
            class="semfa-chip"
            type="button"
            @click="alternarCarrera(c.nombre)"
          >
            {{ c.nombre }} <span class="semfa-chip__total">{{ c.total }}</span>
          </button>
        </div>
        <div v-if="chipsCategoria.length > 1" class="flex flex-wrap items-center gap-2">
          <Tooltip title="Categoría"><IconifyIcon class="size-4 text-muted-foreground" icon="lucide:layers" /></Tooltip>
          <button
            v-for="c in chipsCategoria"
            :key="c.id"
            :class="{ 'is-activo': filtroCategoria === c.id }"
            class="semfa-chip"
            type="button"
            @click="alternarCategoria(c.id)"
          >
            {{ c.nombre }} <span class="semfa-chip__total">{{ c.total }}</span>
          </button>
        </div>
      </div>

      <Table
        :columns="columnas"
        :data-source="filtrados"
        :loading="cargando"
        :pagination="paginacion"
        :scroll="{ x: 1150 }"
        class="semfa-tabla"
        row-key="idInscripcion"
        size="small"
        @change="alCambiarTabla"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'proyecto'">
            <Tooltip :title="record.proyecto">
              <span class="font-medium">{{ record.proyecto }}</span>
            </Tooltip>
          </template>
          <template v-else-if="column.key === 'nota'">
            <Tooltip
              v-if="record.notaDirecta"
              :title="`Registrada por ${record.notaDirecta.usuario ?? '—'}${record.notaDirecta.observacion ? ` · ${record.notaDirecta.observacion}` : ''}`"
            >
              <span class="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                {{ record.notaDirecta.texto }}
              </span>
            </Tooltip>
            <span v-else class="text-muted-foreground">—</span>
          </template>
          <template v-else-if="column.key === 'puntaje'">
            <span v-if="record.puntaje !== null" class="tabular-nums font-semibold">{{ record.puntaje.toFixed(2) }}</span>
            <span v-else class="text-muted-foreground">—</span>
            <span class="text-xs text-muted-foreground"> / {{ record.maximo || 100 }}</span>
          </template>
          <template v-else-if="column.key === 'estado'">
            <span :class="ESTADO[record.estado]?.clase" class="rounded-full px-2 py-0.5 text-xs font-medium">
              {{ record.conNota ? 'Acta' : ESTADO[record.estado]?.texto }}
            </span>
          </template>
          <template v-else-if="column.key === 'puesto'">
            <span v-if="record.puesto > 0" class="font-semibold">{{ record.puesto }}°</span>
            <Tooltip v-else title="El puesto sale cuando todos los proyectos de su carrera y categoría están evaluados">
              <span class="text-muted-foreground">—</span>
            </Tooltip>
          </template>
          <template v-else-if="column.key === 'acciones'">
            <Button
              :class="record.conNota ? 'semfa-btn--suave-primario' : 'semfa-btn--primario'"
              class="semfa-btn"
              size="small"
              @click="abrir(record as Fila)"
            >
              <IconifyIcon :icon="record.conNota ? 'lucide:pencil' : 'lucide:file-pen-line'" class="size-3.5" />
              {{ record.conNota ? 'Editar' : 'Poner nota' }}
            </Button>
          </template>
        </template>
      </Table>
    </Card>

    <SemfaModalForm
      v-model:open="abierto"
      :es-edicion="!!elegido?.notaDirecta"
      :guardando="guardando"
      :hay-cambios="hayCambios"
      :permitir-continuar="false"
      :subtitulo="elegido ? `${elegido.carreraBonita} · ${elegido.categoriaBonita}` : ''"
      :titulo="elegido?.proyecto ?? 'Nota de acta'"
      :width="620"
      icono="lucide:file-pen-line"
      @guardar="guardar"
    >
      <template #vista-previa>
        <div v-if="elegido" class="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
          <span>
            Puntaje en el sistema:
            <b v-if="puntajeNuevo !== null" class="text-lg text-primary">{{ puntajeNuevo.toFixed(2) }}</b>
            <b v-else class="text-muted-foreground">—</b>
            de {{ elegido.maximo || 100 }}
          </span>
          <span v-if="posicion">
            Quedaría <b>{{ posicion.puesto }}°</b> de {{ posicion.total }} en su carrera y categoría
            <span v-if="posicion.pendientes > 0" class="text-xs text-amber-600">
              (provisional: {{ posicion.pendientes }} sin evaluar)
            </span>
          </span>
        </div>
      </template>

      <div class="flex flex-col gap-4">
        <div>
          <label class="mb-1 block font-medium">Nota del acta</label>
          <Input
            ref="campoNota"
            v-model:value="nota"
            :status="nota && !lectura.ok ? 'error' : undefined"
            allow-clear
            placeholder="Ej.: 8.5   ·   95/100"
            size="large"
          >
            <template #prefix><IconifyIcon class="size-4 text-muted-foreground" icon="lucide:hash" /></template>
          </Input>
          <div class="mt-1 text-xs" :class="nota && !lectura.ok ? 'text-red-600' : 'text-muted-foreground'">
            {{ nota && !lectura.ok ? lectura.error : 'Tal como está escrita: con coma o punto, y «/100» si la trae.' }}
          </div>
        </div>

        <div v-if="!escalaEnTexto">
          <label class="mb-1 block font-medium">¿Sobre cuánto es?</label>
          <div class="flex flex-wrap items-center gap-2">
            <button
              v-for="e in ESCALAS"
              :key="e"
              :class="{ 'is-activo': escala === e }"
              class="semfa-chip"
              type="button"
              @click="escala = e"
            >
              Sobre {{ e }}
            </button>
            <InputNumber v-model:value="escala" :max="1000" :min="1" placeholder="Otra" size="small" style="width: 96px" />
          </div>
        </div>

        <div>
          <label class="mb-1 block font-medium">Observación <span class="font-normal text-muted-foreground">(opcional)</span></label>
          <Input.TextArea
            v-model:value="observacion"
            :auto-size="{ maxRows: 3, minRows: 2 }"
            :maxlength="250"
            placeholder="Ej.: Acta de la comisión de Ingeniería, 14/11"
            show-count
          />
        </div>

        <div v-if="elegido?.notaDirecta" class="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2 text-xs">
          <span class="text-muted-foreground">
            Registrada por <b>{{ elegido.notaDirecta.usuario ?? '—' }}</b>
            {{ elegido.notaDirecta.fecha ? `el ${elegido.notaDirecta.fecha.replace('T', ' ').slice(0, 16)}` : '' }}
          </span>
          <Button class="semfa-btn semfa-btn--suave-peligro" size="small" @click="quitar(elegido)">
            <IconifyIcon class="size-3.5" icon="lucide:eraser" />
            Quitar nota
          </Button>
        </div>
      </div>
    </SemfaModalForm>
  </SemfaPagina>
</template>
