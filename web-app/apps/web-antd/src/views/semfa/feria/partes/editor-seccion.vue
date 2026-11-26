<script setup lang="ts">
/**
 * Sección plegable del editor de la portada: cabecera con número, título, resumen y el interruptor
 * «Mostrar» (si la sección se puede ocultar); dentro, sus campos y «Restablecer esta sección».
 */
import { Switch } from 'ant-design-vue';

defineProps<{
  abierta: boolean;
  ayuda: string;
  /** La sección no se puede ocultar (sin interruptor «Mostrar»). */
  fija?: boolean;
  mostrar?: boolean;
  numero?: number;
  /** Editando una traducción: «Mostrar» se ve pero se cambia en Español; «Restablecer» borra las traducciones de la sección. */
  soloTexto?: boolean;
  titulo: string;
}>();
const emit = defineEmits<{ alternar: []; restablecer: []; 'update:mostrar': [valor: boolean] }>();
</script>

<template>
  <section class="es" :class="{ 'is-abierta': abierta, 'is-oculta': !fija && !mostrar }">
    <header class="es__cab">
      <button type="button" class="es__boton" :aria-expanded="abierta" @click="emit('alternar')">
        <span class="es__flecha" aria-hidden="true">▸</span>
        <span v-if="numero" class="es__num">{{ numero }}</span>
        <span class="es__textos">
          <strong>{{ titulo }}</strong>
          <small>{{ ayuda }}</small>
        </span>
      </button>
      <label v-if="!fija" class="es__mostrar" :title="soloTexto ? 'Se configura en Español' : (mostrar ? 'Se ve en la página' : 'Oculta en la página')">
        <Switch :checked="mostrar" size="small" :disabled="soloTexto" @change="(v) => emit('update:mostrar', Boolean(v))" />
        <span>{{ mostrar ? 'Mostrar' : 'Oculta' }}</span>
      </label>
    </header>
    <div v-if="abierta" class="es__cuerpo">
      <p v-if="!fija && !mostrar" class="es__aviso">Esta sección está oculta: no aparece en la página pública (sus textos se guardan igual).</p>
      <slot></slot>
      <div class="es__pie">
        <button type="button" class="es__restablecer" @click="emit('restablecer')">↺ {{ soloTexto ? 'Volver a las traducciones sugeridas' : 'Restablecer esta sección' }}</button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.es { border: 1px solid hsl(var(--border)); border-radius: 12px; background: hsl(var(--card)); }
.es.is-abierta { border-color: hsl(var(--primary) / 45%); box-shadow: 0 2px 10px hsl(var(--primary) / 8%); }
.es__cab { display: flex; align-items: center; gap: 8px; padding: 4px 12px 4px 4px; }
.es__boton { display: flex; flex: 1; align-items: center; gap: 10px; min-width: 0; border: 0; border-radius: 10px; background: none; padding: 8px; color: inherit; text-align: left; cursor: pointer; }
.es__boton:hover { background: hsl(var(--accent)); }
.es__flecha { flex: none; color: hsl(var(--muted-foreground)); font-size: 12px; transition: transform .2s; }
.is-abierta .es__flecha { transform: rotate(90deg); }
.es__num { display: grid; width: 24px; height: 24px; flex: none; place-items: center; border-radius: 50%; background: hsl(var(--primary) / 12%); color: hsl(var(--primary)); font-size: 12px; font-weight: 800; }
.es__textos { display: flex; flex-direction: column; min-width: 0; }
.es__textos strong { font-size: 14px; }
.es__textos small { overflow: hidden; color: hsl(var(--muted-foreground)); font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
.is-oculta .es__textos strong { color: hsl(var(--muted-foreground)); text-decoration: line-through; }
.es__mostrar { display: inline-flex; flex: none; align-items: center; gap: 6px; font-size: 12px; font-weight: 700; cursor: pointer; }
.es__cuerpo { display: flex; flex-direction: column; gap: 12px; border-top: 1px solid hsl(var(--border)); padding: 14px; }
.es__aviso { margin: 0; border-radius: 8px; background: hsl(var(--muted)); padding: 7px 10px; color: hsl(var(--muted-foreground)); font-size: 12.5px; }
.es__pie { display: flex; justify-content: flex-end; }
.es__restablecer { border: 0; background: none; padding: 2px 4px; color: hsl(var(--muted-foreground)); font-size: 12.5px; font-weight: 600; cursor: pointer; }
.es__restablecer:hover { color: hsl(var(--primary)); text-decoration: underline; }
</style>
