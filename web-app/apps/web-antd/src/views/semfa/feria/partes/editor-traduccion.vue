<script setup lang="ts">
/**
 * Textos de una sección de la portada para traducir (inglés o portugués), dentro del editor. Cada
 * campo muestra el español como referencia y avisa qué verá el visitante si queda vacío: la
 * traducción sugerida (si el español es el texto por defecto) o el español tal cual.
 * Interruptores, fotos, videos y fechas no van aquí: se configuran en Español.
 */
import type { TextosPortada } from '#/api/feria-publico';
import type { CampoTexto } from '../portada';

import { Input, Textarea } from 'ant-design-vue';

import { fraseTraducida } from '../i18n';
import { leerRuta } from '../portada';

const props = defineProps<{
  campos: CampoTexto[];
  idioma: 'en' | 'pt';
  /** Sube cuando llegan los diccionarios (para que las sugerencias aparezcan). */
  listo: boolean;
  traducciones: TextosPortada | undefined;
}>();
const emit = defineEmits<{ fijar: [campo: CampoTexto, valor: string] }>();

/** Nombre de cada campo en el editor, a partir de su ruta. */
const NOMBRES: Record<string, string> = {
  'hero.descripcion': 'Descripción', 'hero.frase': 'Frase', 'hero.lema': 'Lema', 'hero.titulo': 'Título · línea blanca', 'hero.tituloRojo': 'Título · línea roja',
  'horario': 'Horario', 'mapa.texto': 'Texto del aviso del mapa bloqueado', 'mapa.titulo': 'Título del aviso del mapa bloqueado', 'organiza': 'Organiza',
  'pie.descripcion': 'Mensaje', 'proyectos.destacadosTitulo': 'Título de destacados', 'proyectos.preparandoTexto': 'Texto del aviso «se están preparando»',
  'proyectos.preparandoTitulo': 'Título del aviso «se están preparando»', 'proyectos.todosTitulo': 'Título de la lista',
};
const PARTE_DIA: Record<string, string> = { descripcion: 'descripción', nota: 'nota', titulo: 'título' };
function etiqueta(c: CampoTexto): string {
  const [raiz, clave = '', parte = '', n = ''] = c.ruta;
  if (raiz === 'medios') return `Pie de la foto o video ${props.campos.filter((x) => x.ruta[0] === 'medios').indexOf(c) + 1}`;
  if (raiz === 'dias') {
    const dia = [...new Set(props.campos.filter((x) => x.ruta[0] === 'dias').map((x) => x.ruta[1]))].indexOf(clave) + 1;
    return `Día ${dia} · ${parte === 'items' ? `actividad ${Number(n) + 1}` : PARTE_DIA[parte] ?? parte}`;
  }
  return NOMBRES[c.ruta.join('.')] ?? (clave === 'titulo' ? 'Título' : 'Descripción');
}
const EN_ESPANOL = { en: 'inglés', pt: 'portugués' } as const;
const valor = (c: CampoTexto) => leerRuta(props.traducciones, c.ruta) ?? '';
const sugerida = (c: CampoTexto) => (props.listo ? fraseTraducida(c.es, props.idioma) : undefined);
</script>

<template>
  <div class="et" :lang="idioma">
    <p class="et__nota">
      Traducción al <b>{{ EN_ESPANOL[idioma] }}</b>. Vacío = se ve la traducción sugerida (si el español es el por defecto) o el español. Interruptores, fotos, videos y fechas se configuran en <b>Español</b>.
    </p>
    <p v-if="!campos.length" class="et__vacio">Esta sección no tiene textos para traducir (los campos vacíos en español no se muestran).</p>
    <div v-for="c in campos" :key="c.ruta.join('/')" class="et__campo">
      <div class="et__cab">
        <span>{{ etiqueta(c) }}</span>
        <small v-if="valor(c).trim()" class="et__marca et__marca--ok">traducido</small>
        <small v-else-if="sugerida(c)" class="et__marca et__marca--auto" title="Se muestra la traducción sugerida porque el texto en español es el por defecto">sugerida (automática)</small>
        <small v-else class="et__marca et__marca--falta" title="El visitante verá el texto en español">sin traducir</small>
      </div>
      <small class="et__es" lang="es"><b>ES</b> {{ c.es }}</small>
      <Textarea v-if="c.largo" :value="valor(c)" :placeholder="sugerida(c) || c.es" :auto-size="{ minRows: 2, maxRows: 5 }" :maxlength="400"
        @update:value="(v) => emit('fijar', c, String(v ?? ''))" />
      <Input v-else :value="valor(c)" :placeholder="sugerida(c) || c.es" :maxlength="200" @update:value="(v) => emit('fijar', c, String(v ?? ''))" />
      <button v-if="sugerida(c) && valor(c) !== sugerida(c)" type="button" class="et__usar" @click="emit('fijar', c, sugerida(c)!)">
        Usar traducción sugerida
      </button>
    </div>
  </div>
</template>

<style scoped>
.et { display: flex; flex-direction: column; gap: 12px; }
.et__nota, .et__vacio { margin: 0; border-radius: 8px; background: hsl(var(--muted)); padding: 8px 10px; color: hsl(var(--muted-foreground)); font-size: 12.5px; line-height: 1.45; }
.et__nota b { color: hsl(var(--foreground)); }
.et__campo { display: flex; flex-direction: column; gap: 4px; }
.et__cab { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.et__cab > span { font-size: 12.5px; font-weight: 700; }
.et__marca { border-radius: 999px; padding: 0 8px; font-size: 11px; font-weight: 700; }
.et__marca--ok { background: rgb(22 163 74 / 12%); color: #15803d; }
.et__marca--auto { background: rgb(37 99 235 / 12%); color: #1d4ed8; }
.et__marca--falta { background: rgb(250 204 21 / 22%); color: #a16207; }
.et__es { color: hsl(var(--muted-foreground)); font-size: 12px; line-height: 1.4; }
.et__es b { margin-right: 4px; border-radius: 4px; background: hsl(var(--muted)); padding: 0 4px; font-size: 10.5px; }
.et__usar { align-self: flex-start; border: 0; background: none; padding: 0; color: hsl(var(--primary)); font-size: 12px; font-weight: 700; text-decoration: underline; cursor: pointer; }
</style>
