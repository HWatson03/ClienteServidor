<script lang="ts" setup>
/**
 * Carga rápida de carreras pegando filas desde Excel: «Facultad · Sigla ·
 * Carrera» (separadas por tabulador o «;»), o solo «Facultad · Carrera», o solo
 * «Carrera». Muestra qué se creará y llama a `POST /estructura/carreras/importar`,
 * que omite lo que ya existe (se puede repetir sin duplicar).
 */
import type { Carrera, Facultad, FilaImportacion } from '#/api/estructura';

import { computed, ref, watch } from 'vue';

import { IconifyIcon } from '@vben/icons';

import { Input, Tooltip } from 'ant-design-vue';

import { importarCarreras } from '#/api/estructura';
import SemfaModalForm from '#/components/semfa/semfa-modal-form.vue';
import { avisar } from '#/composables/useAvisos';
import { limpiarEspacios, nombrePropio, normalizarTexto } from '#/utils/formato';

defineOptions({ name: 'CarreraImportarModal' });

const props = defineProps<{
  /** Carreras ya registradas en la actividad. */
  carreras: Carrera[];
  facultades: Facultad[];
  idActividad?: number;
  nombreActividad: string;
}>();

const emit = defineEmits<{ importado: [] }>();

const visible = defineModel<boolean>('open', { required: true });

const texto = ref('');
const importando = ref(false);

watch(visible, (abierto) => {
  if (abierto) texto.value = '';
});

const clave = (t: string) => normalizarTexto(limpiarEspacios(t));

interface FilaVista extends FilaImportacion {
  /** Ya registrada en la actividad, o repetida más arriba en lo pegado. */
  carreraExiste: boolean;
  facultadNueva: boolean;
  /** Lo que se mostrará: la facultad ya registrada si coincide (también por sigla). */
  facultadVista: string;
  repetida: boolean;
  siglaVista: string;
}

/** Filas pegadas, sin encabezado ni líneas vacías. */
const filas = computed<FilaVista[]>(() => {
  const vistas = new Set<string>();
  const facultadesNuevas = new Set<string>();
  const salida: FilaVista[] = [];
  for (const linea of texto.value.split(/\r?\n/)) {
    const celdas = linea.split(/\t|;/).map((c) => limpiarEspacios(c));
    while (celdas.length > 0 && !celdas.at(-1)) celdas.pop();
    if (celdas.length === 0) continue;
    // 3+ columnas: facultad, sigla, carrera; 2: facultad, carrera; 1: carrera.
    const facultad = celdas.length >= 2 ? celdas[0]! : '';
    const sigla = celdas.length >= 3 ? celdas[1]! : '';
    const carrera = celdas.length >= 3 ? celdas[2]! : celdas.at(-1)!;
    // Encabezado copiado junto con los datos.
    if (clave(carrera) === 'carrera' || clave(facultad) === 'facultad') continue;
    if (!carrera) continue;
    const c = clave(carrera);
    const f = clave(facultad);
    // El backend la reconoce por nombre o por sigla.
    const existente = f
      ? props.facultades.find((x) => clave(x.nombre) === f || (!!x.sigla && clave(x.sigla) === f))
      : undefined;
    const existeF = !f || !!existente;
    salida.push({
      facultadVista: existente ? existente.nombre : facultad.toUpperCase(),
      siglaVista: existente ? (existente.sigla ?? '') : sigla.toUpperCase(),
      carrera: carrera.toUpperCase(),
      carreraExiste: props.carreras.some((x) => clave(x.nombre) === c),
      facultad: facultad.toUpperCase(),
      facultadNueva: !existeF && !facultadesNuevas.has(f),
      repetida: vistas.has(c),
      sigla: sigla.toUpperCase(),
    });
    vistas.add(c);
    if (!existeF) facultadesNuevas.add(f);
  }
  return salida;
});

const resumen = computed(() => ({
  carrerasNuevas: filas.value.filter((f) => !f.carreraExiste && !f.repetida).length,
  existentes: filas.value.filter((f) => f.carreraExiste || f.repetida).length,
  facultadesNuevas: filas.value.filter((f) => f.facultadNueva).length,
}));

const EJEMPLO = 'FACULTAD DE CIENCIAS Y TECNOLOGÍA\tFCyT\tINGENIERÍA DE SISTEMAS';

async function importar() {
  if (props.idActividad === undefined || filas.value.length === 0) return;
  importando.value = true;
  try {
    const r = await importarCarreras(
      props.idActividad,
      filas.value.map(({ carrera, facultad, sigla }) => ({ carrera, facultad, sigla })),
    );
    avisar({
      mensaje: `${r.carrerasNuevas} carrera(s) y ${r.facultadesNuevas} facultad(es) nuevas${
        r.omitidas > 0 ? `; ${r.omitidas} fila(s) ya existían u omitidas` : ''
      }.`,
      tipo: r.carrerasNuevas + r.facultadesNuevas > 0 ? 'exito' : 'info',
      titulo: 'Importación terminada',
    });
    visible.value = false;
    emit('importado');
  } catch {
    // El interceptor ya avisó.
  } finally {
    importando.value = false;
  }
}
</script>

<template>
  <SemfaModalForm
    v-model:open="visible"
    :atajo-enter="false"
    :es-edicion="false"
    :guardando="importando"
    :hay-cambios="!!texto.trim()"
    :permitir-continuar="false"
    :subtitulo="`Pegue filas desde Excel; se crean en «${nombreActividad}» las que falten.`"
    :width="860"
    icono="lucide:file-spreadsheet"
    titulo="Importar carreras"
    @guardar="importar"
  >
    <template #vista-previa>
      <div class="flex flex-wrap items-center gap-2 text-sm">
        <span class="rounded-full bg-primary/10 px-2.5 py-0.5 font-medium text-primary">
          {{ resumen.carrerasNuevas }} carrera(s) nuevas
        </span>
        <span class="rounded-full bg-primary/10 px-2.5 py-0.5 font-medium text-primary">
          {{ resumen.facultadesNuevas }} facultad(es) nuevas
        </span>
        <span v-if="resumen.existentes > 0" class="rounded-full bg-muted px-2.5 py-0.5 text-muted-foreground">
          {{ resumen.existentes }} ya existen (se omiten)
        </span>
      </div>
    </template>

    <div class="mb-1 text-sm">Filas a importar</div>
    <Input.TextArea
      v-model:value="texto"
      :auto-size="{ minRows: 5, maxRows: 10 }"
      :disabled="importando"
      :placeholder="`${EJEMPLO}\nFCyT;INGENIERÍA CIVIL\nFACULTAD DE SALUD;ENFERMERÍA`"
      class="font-mono text-xs"
    />
    <p class="mb-3 mt-1 text-xs text-muted-foreground">
      Columnas «Facultad · Sigla · Carrera» (copiadas de Excel van separadas por tabulador) o con «;». También vale
      «Facultad;Carrera» (la facultad puede ser su sigla) o solo «Carrera». La fila de encabezados se ignora.
    </p>

    <div v-if="filas.length > 0" class="max-h-72 overflow-auto rounded-lg border border-border">
      <table class="w-full text-sm">
        <thead class="sticky top-0 bg-muted text-xs text-muted-foreground">
          <tr>
            <th class="w-10 px-2 py-1.5 text-center font-medium">#</th>
            <th class="px-2 py-1.5 text-left font-medium">Facultad</th>
            <th class="px-2 py-1.5 text-left font-medium">Carrera</th>
            <th class="w-28 px-2 py-1.5 text-center font-medium">Resultado</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(f, i) in filas" :key="i" class="border-t border-border">
            <td class="px-2 py-1 text-center tabular-nums text-muted-foreground">{{ i + 1 }}</td>
            <td class="max-w-0 px-2 py-1">
              <div class="flex items-center gap-1.5">
                <span v-if="f.siglaVista" class="shrink-0 rounded-full bg-primary/10 px-1.5 text-xs text-primary">
                  {{ f.siglaVista }}
                </span>
                <Tooltip :title="f.facultadVista">
                  <span class="truncate">{{ f.facultadVista ? nombrePropio(f.facultadVista) : '—' }}</span>
                </Tooltip>
                <span v-if="f.facultadNueva" class="shrink-0 text-xs text-primary">(nueva)</span>
              </div>
            </td>
            <td class="max-w-0 px-2 py-1">
              <Tooltip :title="f.carrera">
                <div class="truncate">{{ f.carrera }}</div>
              </Tooltip>
            </td>
            <td class="px-2 py-1 text-center">
              <span
                v-if="f.carreraExiste || f.repetida"
                class="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"
              >
                <IconifyIcon class="size-3" icon="lucide:skip-forward" />
                {{ f.repetida ? 'Repetida' : 'Ya existe' }}
              </span>
              <span
                v-else
                class="inline-flex items-center gap-1 rounded-full bg-green-600/10 px-2 py-0.5 text-xs text-green-600"
              >
                <IconifyIcon class="size-3" icon="lucide:plus" />
                Nueva
              </span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </SemfaModalForm>
</template>
