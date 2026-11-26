<script setup lang="ts">
/** Marca de la feria: escudo UAP + «FEXC💡IN» (la O es un foco) + pastilla roja con el resto del nombre. */
import { computed } from 'vue';

import { ESCUDO, partesLogo } from '../publico-comun';

const props = defineProps<{ nombre?: null | string }>();
const logo = computed(() => partesLogo(props.nombre));
</script>

<template>
  <span class="mf" :aria-label="logo.nombre" role="img">
    <img :src="ESCUDO" alt="" class="mf__escudo" width="96" height="96" />
    <span class="mf__palabra" aria-hidden="true">{{ logo.antes }}<svg v-if="logo.foco" class="mf__foco" viewBox="0 0 24 34">
      <circle cx="12" cy="12" r="11" class="mf__luz" />
      <path d="M8.5 14l1.8 2.4L12 11.5l1.7 4.9 1.8-2.4" class="mf__filamento" />
      <path d="M8 22.5h8v2.2H8zM8.6 25.6h6.8v2H8.6zM9.6 28.5h4.8L13 31h-2z" class="mf__rosca" />
    </svg>{{ logo.despues }}</span>
    <span v-if="logo.resto" class="mf__resto" aria-hidden="true">{{ logo.resto }}</span>
  </span>
</template>

<style scoped>
.mf { display: inline-flex; align-items: center; gap: .32em; font-size: 30px; line-height: 1; }
.mf__escudo { width: 1.5em; height: 1.5em; flex: none; margin-right: .12em; border-radius: 50%; }
.mf__palabra { display: inline-flex; align-items: flex-end; color: #fff; font-family: 'Roboto Condensed', 'Arial Narrow', sans-serif-condensed, system-ui, sans-serif; font-weight: 900; font-stretch: condensed; letter-spacing: .01em; }
.mf__foco { width: .7em; height: 1em; margin: 0 .03em -.05em; overflow: visible; }
.mf__luz { fill: #f5c518; }
.mf__filamento { fill: none; stroke: #9a5b07; stroke-width: 1.4; stroke-linecap: round; stroke-linejoin: round; }
.mf__rosca { fill: #c8d0dc; }
.mf__resto { align-self: center; border-radius: 6px; background: #c8102e; padding: .2em .45em; color: #fff; font-size: .5em; font-weight: 800; letter-spacing: .04em; white-space: nowrap; }
</style>
