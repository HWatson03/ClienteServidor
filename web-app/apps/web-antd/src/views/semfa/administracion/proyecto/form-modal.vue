<script lang="ts" setup>
import type { FormInstance, Rule } from 'ant-design-vue/es/form';

import type { Docente } from '#/api/docentes';
import type { Estudiante } from '#/api/estudiantes';
import type { Jurado } from '#/api/jurados';
import type {
  CategoriaProyecto,
  Programa,
  Proyecto,
  ProyectoForm,
  TipoProyectoGestion,
} from '#/api/proyectos';

import { computed, ref, watch } from 'vue';

import { IconifyIcon } from '@vben/icons';

import { Form, FormItem, Input, Modal, Select, Tag, Upload } from 'ant-design-vue';

import { listarDocentes } from '#/api/docentes';
import { listarEstudiantes } from '#/api/estudiantes';
import { listarJurados } from '#/api/jurados';
import { listarCategoriasPorTipo, listarProgramas, listarTiposProyectoGestion } from '#/api/proyectos';

defineOptions({ name: 'ProyectoFormModal' });

const props = defineProps<{
  guardando: boolean;
  proyecto: null | Proyecto;
}>();

const emit = defineEmits<{
  guardar: [payload: { archivo: File | null; datos: ProyectoForm }];
}>();

interface VarianteTipo {
  titulo: string;
  nombreLabel: string;
  mostrarNroStand: boolean;
  nroStandLabel: string;
  mostrarCategoriaTexto: boolean;
  categoriaTextoLabel: string;
  mostrarPrograma: boolean;
  mostrarDocente: boolean;
  mostrarEstudiantes: boolean;
  mostrarArchivo: boolean;
}

function varianteCompleta(): VarianteTipo {
  return {
    titulo: 'Registro de proyecto',
    nombreLabel: 'Título del proyecto',
    mostrarNroStand: true,
    nroStandLabel: 'Asignatura (s)',
    mostrarCategoriaTexto: true,
    categoriaTextoLabel: 'Semestre',
    mostrarPrograma: true,
    mostrarDocente: true,
    mostrarEstudiantes: true,
    mostrarArchivo: true,
  };
}

function varianteCorta(): VarianteTipo {
  return {
    titulo: 'Registro de proyecto',
    nombreLabel: 'Título del proyecto',
    mostrarNroStand: false,
    nroStandLabel: 'Curso',
    mostrarCategoriaTexto: false,
    categoriaTextoLabel: 'Semestre',
    mostrarPrograma: true,
    mostrarDocente: true,
    mostrarEstudiantes: true,
    mostrarArchivo: false,
  };
}

/**
 * El legacy tenía un fragmento de formulario por tipo de proyecto
 * (`card_body2..card_body11`), cada uno con su propio rótulo y subconjunto de
 * campos. Todos ligaban el mismo pool de campos de la entidad, así que aquí
 * hay un solo formulario con la variante que corresponde al tipo elegido.
 */
const VARIANTES: Record<number, VarianteTipo> = {
  2: {
    titulo: 'Registro de danza',
    nombreLabel: 'Nombre de la danza',
    mostrarNroStand: false,
    nroStandLabel: 'Curso',
    mostrarCategoriaTexto: false,
    categoriaTextoLabel: 'Semestre',
    mostrarPrograma: false,
    mostrarDocente: false,
    mostrarEstudiantes: false,
    mostrarArchivo: false,
  },
  3: {
    titulo: 'Registro de tema de exposición',
    nombreLabel: 'Nombre del tema de exposición',
    mostrarNroStand: true,
    nroStandLabel: 'Curso',
    mostrarCategoriaTexto: false,
    categoriaTextoLabel: 'Semestre',
    mostrarPrograma: false,
    mostrarDocente: true,
    mostrarEstudiantes: false,
    mostrarArchivo: true,
  },
  4: varianteCompleta(),
  5: varianteCompleta(),
  6: { ...varianteCompleta(), nombreLabel: 'Unidad educativa' },
  7: {
    titulo: 'Registro de proyecto',
    nombreLabel: 'Título del proyecto',
    mostrarNroStand: false,
    nroStandLabel: 'Curso',
    mostrarCategoriaTexto: false,
    categoriaTextoLabel: 'Semestre',
    mostrarPrograma: true,
    mostrarDocente: false,
    mostrarEstudiantes: false,
    mostrarArchivo: false,
  },
  8: varianteCorta(),
  9: varianteCorta(),
  10: varianteCorta(),
  11: varianteCorta(),
};

const VARIANTE_POR_DEFECTO: VarianteTipo = varianteCompleta();

const visible = defineModel<boolean>('open', { required: true });

const esEdicion = computed(() => props.proyecto !== null);

const formRef = ref<FormInstance>();
const cargandoOpciones = ref(false);
const tipos = ref<TipoProyectoGestion[]>([]);
const categorias = ref<CategoriaProyecto[]>([]);
const programas = ref<Programa[]>([]);
const docentes = ref<Docente[]>([]);
const estudiantes = ref<Estudiante[]>([]);
const jurados = ref<Jurado[]>([]);
const archivo = ref<File | null>(null);

const form = ref<ProyectoForm>({});

const variante = computed(() => {
  const idTipo = form.value.idTipoProyecto;
  return idTipo === undefined
    ? VARIANTE_POR_DEFECTO
    : (VARIANTES[idTipo] ?? VARIANTE_POR_DEFECTO);
});

const rules = computed<Record<string, Rule[]>>(() => ({
  idCategoriaProyecto: [
    { message: 'Debe seleccionar una categoría.', required: true, trigger: 'change' },
  ],
  idTipoProyecto: [
    { message: 'Debe seleccionar un tipo de proyecto.', required: true, trigger: 'change' },
  ],
  nombreProyecto: [
    { message: 'Debe indicar el nombre del proyecto.', required: true, trigger: 'change' },
  ],
}));

const opcionesTipo = computed(() =>
  tipos.value.map((tipo) => ({ label: tipo.nombre, value: tipo.idTipoProyecto })),
);
const opcionesCategoria = computed(() =>
  categorias.value.map((categoria) => ({
    label: categoria.nombre,
    value: categoria.idCategoriaProyecto,
  })),
);
const opcionesPrograma = computed(() =>
  programas.value.map((programa) => ({ label: programa.nombre, value: programa.idPrograma })),
);
const opcionesDocente = computed(() =>
  docentes.value.map((docente) => ({
    label: docente.nombreCompleto ?? '',
    value: docente.idDocente,
  })),
);
const opcionesEstudiante = computed(() =>
  estudiantes.value.map((estudiante) => ({
    label: estudiante.nombrePersona ?? '',
    value: estudiante.idEstudiante,
  })),
);
const opcionesJurado = computed(() =>
  jurados.value.map((jurado) => ({ label: jurado.nombreCompleto ?? '', value: jurado.idJurado })),
);

async function cargarOpciones() {
  cargandoOpciones.value = true;
  try {
    [tipos.value, programas.value, docentes.value, estudiantes.value, jurados.value] =
      await Promise.all([
        listarTiposProyectoGestion(),
        listarProgramas(),
        listarDocentes(),
        listarEstudiantes(),
        listarJurados(),
      ]);
  } finally {
    cargandoOpciones.value = false;
  }
}

async function cargarCategorias(idTipo: number) {
  categorias.value = await listarCategoriasPorTipo(idTipo);
}

function cambiarTipo(idTipo: number) {
  form.value.idCategoriaProyecto = undefined;
  if (idTipo) {
    cargarCategorias(idTipo);
  } else {
    categorias.value = [];
  }
}

/** Captura el respaldo sin subirlo: el archivo viaja en el multipart final. */
function capturarArchivo(file: File) {
  archivo.value = file;
  return false;
}

watch(visible, async (abierto) => {
  if (!abierto) {
    return;
  }
  const p = props.proyecto;
  form.value = {
    categoriaProyecto: p?.categoriaProyecto ?? undefined,
    idCategoriaProyecto: p?.idCategoriaProyecto ?? undefined,
    idDocente: p?.idDocente ?? undefined,
    idPrograma: p?.idPrograma ?? undefined,
    idTipoProyecto: p?.idTipoProyecto,
    idsEstudiantes: p?.estudiantes.map((e) => e.id),
    idsJurados: p?.jurados.map((j) => j.id),
    nombreProyecto: p?.nombreProyecto,
    nroStand: p?.nroStand ?? undefined,
  };
  archivo.value = null;
  formRef.value?.clearValidate();
  if (tipos.value.length === 0) {
    await cargarOpciones();
  }
  if (form.value.idTipoProyecto) {
    await cargarCategorias(form.value.idTipoProyecto);
  }
});

async function onOk() {
  try {
    await formRef.value?.validate();
  } catch {
    return;
  }
  emit('guardar', {
    archivo: variante.value.mostrarArchivo ? archivo.value : null,
    datos: {
      categoriaProyecto: variante.value.mostrarCategoriaTexto
        ? form.value.categoriaProyecto
        : undefined,
      idCategoriaProyecto: form.value.idCategoriaProyecto,
      idDocente: variante.value.mostrarDocente ? form.value.idDocente : undefined,
      idPrograma: variante.value.mostrarPrograma ? form.value.idPrograma : undefined,
      idTipoProyecto: form.value.idTipoProyecto,
      idsEstudiantes: variante.value.mostrarEstudiantes
        ? form.value.idsEstudiantes
        : undefined,
      idsJurados: form.value.idsJurados,
      nombreProyecto: form.value.nombreProyecto,
      nroStand: variante.value.mostrarNroStand ? form.value.nroStand : undefined,
    },
  });
}
</script>

<template>
  <Modal
    v-model:open="visible"
    :confirm-loading="guardando"
    :title="esEdicion ? 'Modificar proyecto' : variante.titulo"
    :width="720"
    @cancel="visible = false"
    @ok="onOk"
  >
    <Form ref="formRef" :model="form" :rules="rules" layout="vertical">
      <div class="grid grid-cols-1 gap-x-4 md:grid-cols-2">
        <FormItem label="Tipo de proyecto" name="idTipoProyecto" required>
          <Select
            v-model:value="form.idTipoProyecto"
            :loading="cargandoOpciones"
            :options="opcionesTipo"
            placeholder="Seleccione un tipo…"
            show-search
            @change="(valor: unknown) => cambiarTipo(Number(valor))"
          />
        </FormItem>

        <FormItem label="Categoría" name="idCategoriaProyecto" required>
          <Select
            v-model:value="form.idCategoriaProyecto"
            :loading="cargandoOpciones"
            :options="opcionesCategoria"
            placeholder="Seleccione una categoría…"
            show-search
          />
        </FormItem>

        <FormItem
          class="md:col-span-2"
          :label="variante.nombreLabel"
          name="nombreProyecto"
          required
        >
          <Input v-model:value="form.nombreProyecto" placeholder="Nombre del proyecto" />
        </FormItem>

        <FormItem v-if="variante.mostrarNroStand" :label="variante.nroStandLabel">
          <Input v-model:value="form.nroStand" />
        </FormItem>

        <FormItem
          v-if="variante.mostrarCategoriaTexto"
          :label="variante.categoriaTextoLabel"
        >
          <Input v-model:value="form.categoriaProyecto" />
        </FormItem>

        <FormItem v-if="variante.mostrarPrograma" label="Carrera o programa">
          <Select
            v-model:value="form.idPrograma"
            :loading="cargandoOpciones"
            :options="opcionesPrograma"
            allow-clear
            placeholder="Seleccione un programa…"
            show-search
          />
        </FormItem>

        <FormItem v-if="variante.mostrarDocente" label="Capacitador">
          <Select
            v-model:value="form.idDocente"
            :loading="cargandoOpciones"
            :options="opcionesDocente"
            allow-clear
            placeholder="Seleccione un docente…"
            show-search
          />
        </FormItem>

        <FormItem v-if="variante.mostrarEstudiantes" class="md:col-span-2" label="Estudiantes">
          <Select
            v-model:value="form.idsEstudiantes"
            :loading="cargandoOpciones"
            :options="opcionesEstudiante"
            mode="multiple"
            placeholder="Seleccione los estudiantes…"
            show-search
          />
        </FormItem>

        <FormItem class="md:col-span-2" label="Jurados" name="idsJurados">
          <Select
            v-model:value="form.idsJurados"
            :loading="cargandoOpciones"
            :options="opcionesJurado"
            mode="multiple"
            placeholder="Seleccione los jurados…"
            show-search
          />
        </FormItem>

        <FormItem v-if="variante.mostrarArchivo" class="md:col-span-2" label="Respaldo (PDF)">
          <Upload
            :before-upload="capturarArchivo"
            :max-count="1"
            accept="application/pdf"
            class="w-full"
          >
            <Button>
              <IconifyIcon icon="lucide:upload" />
              Adjuntar respaldo (opcional)
            </Button>
          </Upload>
          <div class="mt-2 flex flex-wrap gap-2">
            <Tag v-if="archivo" color="blue">{{ archivo.name }}</Tag>
            <Tag v-else-if="esEdicion && proyecto?.nombreArchivo" color="green">
              Respaldo actual: {{ proyecto.nombreArchivo }}
            </Tag>
          </div>
        </FormItem>
      </div>
    </Form>
  </Modal>
</template>
