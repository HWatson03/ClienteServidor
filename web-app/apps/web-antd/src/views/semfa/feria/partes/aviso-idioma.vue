<script setup lang="ts">
/**
 * Sugerencia del idioma del navegador, una sola vez y en ese idioma («Ver em português?» /
 * «View in English?»): botón para cambiar y ✕ (se recuerda que se cerró). La carga `selector-idioma`
 * solo cuando hay algo que sugerir, así el visitante en español no la descarga.
 */
import { cerrarSugerencia, sugerencia, TEXTO_SUGERENCIA } from '../i18n';

const emit = defineEmits<{ elegir: [idioma: 'en' | 'pt'] }>();
</script>

<template>
  <div v-if="sugerencia" class="ai" role="status" :lang="sugerencia">
    <span>{{ TEXTO_SUGERENCIA[sugerencia].pregunta }}</span>
    <button type="button" class="ai__si" @click="emit('elegir', sugerencia)">{{ TEXTO_SUGERENCIA[sugerencia].cambiar }}</button>
    <button type="button" class="ai__x" :aria-label="TEXTO_SUGERENCIA[sugerencia].cerrar" @click="cerrarSugerencia">✕</button>
  </div>
</template>

<style scoped>
.ai { position: fixed; z-index: 90; top: 64px; left: 50%; display: flex; align-items: center; gap: 10px; width: max-content; max-width: calc(100vw - 24px); border: 1px solid rgb(255 255 255 / 16%); border-radius: 12px; background: #13244f; padding: 8px 8px 8px 14px; color: #e8edf8; font-size: 14px; font-weight: 700; box-shadow: 0 12px 30px rgb(0 0 0 / 45%); transform: translateX(-50%); }
.ai button { font-family: inherit; cursor: pointer; }
.ai button:focus-visible { outline: 3px solid #f5c518; outline-offset: 2px; }
.ai__si { flex: none; min-height: 34px; border: 0; border-radius: 8px; background: #c8102e; padding: 0 12px; color: #fff; font-size: 13px; font-weight: 800; }
.ai__x { flex: none; min-width: 32px; min-height: 32px; border: 0; background: none; color: #c9d3ea; }
@media (max-width: 700px) { .ai { top: 58px; } }
</style>
