<script setup lang="ts">
/** Agenda de los días de la feria (hoy resaltado) y la sección propia de cada día destacado («Día de los barrios»). */
import type { DiaCompleto, PortadaCompleta } from '../portada';

import { computed } from 'vue';

import { diaSemana, nombreMes, t } from '../i18n';
import { diaLocal, mismoDia } from '../portada';
import { vRevelar } from '../revelar';

const props = defineProps<{ ahora: number; portada: PortadaCompleta }>();

const dias = computed(() => props.portada.dias.map((d) => {
  const f = diaLocal(d.fecha);
  return { ...d, hoy: mismoDia(d.fecha, props.ahora), mes: nombreMes(f), numero: f.getDate(), semana: diaSemana(f) };
}));
const destacados = computed(() => dias.value.filter((d) => d.destacado));
const corto = (d: DiaCompleto & { numero: number; semana: string }) => `${d.semana.charAt(0).toUpperCase()}${d.semana.slice(1)} ${d.numero}`;
</script>

<template>
  <div class="ag">
    <ol v-revelar.grupo class="ag__dias">
      <li v-for="d in dias" :key="d.fecha" class="ag__dia" :class="{ 'is-hoy': d.hoy, 'is-destacado': d.destacado }">
        <span class="ag__fecha"><small>{{ d.semana }}</small><b>{{ d.numero }}</b><small>{{ t('de {mes}', { mes: d.mes }) }}</small></span>
        <span class="ag__texto">
          <span v-if="d.hoy" class="ag__hoy">● {{ t('HOY') }}</span>
          <strong>{{ d.titulo }}</strong>
          <span v-if="d.descripcion">{{ d.descripcion }}</span>
        </span>
      </li>
      <li class="ag__dia ag__horario">
        <span class="ag__reloj" aria-hidden="true">
          <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
        </span>
        <span class="ag__texto"><small>{{ t('HORARIO') }}</small><strong>{{ portada.horario }}</strong><span>{{ portada.lugar }}</span></span>
      </li>
    </ol>

    <section v-for="d in destacados" :key="`b${d.fecha}`" v-revelar class="ag__barrios" :class="{ 'is-hoy': d.hoy }" :aria-label="`${corto(d)} · ${d.titulo}`">
      <div class="ag__barrios-cab">
        <span class="ag__comunidad" aria-hidden="true">
          <svg viewBox="0 0 32 24"><circle cx="16" cy="7" r="4" /><circle cx="6.5" cy="9" r="3" /><circle cx="25.5" cy="9" r="3" /><path d="M8 22c0-5 3.6-8 8-8s8 3 8 8M0 21c0-3.6 2.6-6 6.3-6 1.3 0 2.4.3 3.3.8M32 21c0-3.6-2.6-6-6.3-6-1.3 0-2.4.3-3.3.8" /></svg>
        </span>
        <div>
          <small>{{ corto(d) }} · {{ portada.horario.split('·')[0] }}<template v-if="d.hoy"> · {{ t('¡ES HOY!') }}</template></small>
          <h3>{{ d.titulo }}</h3>
        </div>
      </div>
      <p v-if="d.descripcion" class="ag__invita">{{ d.descripcion }}</p>
      <ul v-if="d.items.length" class="ag__items">
        <li v-for="(it, i) in d.items" :key="i">{{ it }}</li>
      </ul>
      <p v-if="d.nota" class="ag__nota">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 19v-1a5 5 0 0 1 5-5h2a5 5 0 0 1 5 5v1M9 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM17 11a2.5 2.5 0 1 0 0-5M21 19v-1a4 4 0 0 0-3-3.9" /></svg>
        {{ d.nota }}
      </p>
      <p class="ag__organiza">{{ portada.organiza }}</p>
    </section>
  </div>
</template>

<style scoped>
.ag { display: grid; gap: 14px; }
@media (min-width: 900px) { .ag:has(.ag__barrios) { grid-template-columns: minmax(0, 5fr) minmax(0, 7fr); align-items: start; } }
.ag__dias { display: flex; flex-direction: column; gap: 10px; margin: 0; padding: 0; list-style: none; }
.ag__dia { display: flex; gap: 14px; border: 1px solid rgb(255 255 255 / 10%); border-radius: 14px; background: #0f1f45; padding: 12px; }
.ag__dia.is-hoy { border-color: rgb(245 197 24 / 70%); }
.ag__fecha { display: flex; flex: none; flex-direction: column; align-items: center; justify-content: center; min-width: 64px; border-radius: 10px; background: #0b1736; padding: 6px 4px; line-height: 1.1; }
.ag__fecha b { color: #fff; font-size: 28px; font-weight: 800; }
.ag__fecha small { color: #8fa3cf; font-size: 10.5px; font-weight: 700; text-transform: uppercase; }
.ag__dia.is-destacado .ag__fecha { box-shadow: inset 0 -3px 0 #c8102e; }
.ag__texto { display: flex; flex-direction: column; justify-content: center; gap: 3px; min-width: 0; color: #b9c6e4; font-size: 14px; line-height: 1.4; }
.ag__texto strong { color: #fff; font-size: 16px; }
.ag__texto small { color: #8fa3cf; font-size: 10.5px; font-weight: 800; letter-spacing: .12em; }
.ag__hoy { align-self: flex-start; border-radius: 6px; background: #f5c518; padding: 1px 7px; color: #241a00; font-size: 11px; font-weight: 800; }
.ag__horario { background: #13244f; }
.ag__reloj { display: grid; flex: none; width: 64px; place-items: center; }
.ag__reloj svg { width: 30px; height: 30px; fill: none; stroke: #8fa3cf; stroke-width: 1.8; stroke-linecap: round; }

.ag__barrios { position: relative; overflow: hidden; border: 1px solid rgb(255 255 255 / 14%); border-radius: 18px; background: linear-gradient(150deg, #8a1426 0%, #5e1328 55%, #3b1530 100%); padding: 20px; box-shadow: 0 14px 30px rgb(0 0 0 / 30%); }
.ag__barrios::after { position: absolute; top: -60px; right: -60px; width: 180px; height: 180px; border-radius: 50%; background: rgb(245 197 24 / 10%); content: ''; pointer-events: none; }
.ag__barrios.is-hoy { border-color: rgb(245 197 24 / 70%); }
.ag__barrios-cab { display: flex; align-items: center; gap: 14px; }
.ag__barrios-cab small { color: #ffd9de; font-size: 11.5px; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; }
.ag__barrios-cab h3 { margin: 2px 0 0; color: #fff; font-size: clamp(22px, 2.6vw, 30px); font-weight: 900; line-height: 1.1; }
.ag__comunidad { display: grid; flex: none; width: 54px; height: 54px; place-items: center; border-radius: 50%; background: rgb(255 255 255 / 10%); box-shadow: inset 0 0 0 1px rgb(255 255 255 / 25%); }
.ag__comunidad svg { width: 34px; height: 26px; fill: none; stroke: #fff; stroke-width: 1.8; stroke-linecap: round; }
.ag__invita { margin: 14px 0 0; color: #fff; font-size: 16px; font-weight: 700; }
.ag__items { display: grid; gap: 8px; margin: 12px 0 0; padding: 0; list-style: none; }
.ag__items li { position: relative; padding-left: 30px; color: #fff; font-size: 15px; font-weight: 600; line-height: 1.35; }
.ag__items li::before { position: absolute; top: 0; left: 0; display: grid; width: 20px; height: 20px; place-items: center; border-radius: 50%; background: #fff; color: #8a1426; font-size: 12px; font-weight: 900; content: '✓'; }
.ag__nota { display: flex; align-items: center; gap: 10px; margin: 16px 0 0; border: 1px solid rgb(255 255 255 / 18%); border-radius: 12px; background: rgb(11 23 54 / 40%); padding: 10px 12px; color: #fff; font-size: 14px; line-height: 1.4; }
.ag__nota svg { width: 26px; height: 26px; flex: none; fill: none; stroke: #f5c518; stroke-width: 1.8; stroke-linecap: round; }
.ag__organiza { margin: 12px 0 0; color: #ffd9de; font-size: 12.5px; }
</style>
