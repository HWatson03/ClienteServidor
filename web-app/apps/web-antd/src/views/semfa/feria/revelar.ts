import type { Directive } from 'vue';

import './revelar.css';

/**
 * `v-revelar`: el elemento aparece (sube y se desvanece) la primera vez que entra en pantalla al
 * hacer scroll. `v-revelar.grupo` lo hace con sus hijos directos, uno tras otro (escalonado).
 *
 * Pensado para celulares modestos y red lenta:
 * - Un solo `IntersectionObserver` para toda la página (nada de escuchar el scroll).
 * - Solo `opacity` y `transform` (los anima la GPU, sin recalcular el diseño).
 * - Se observa una vez y se suelta: lo ya visto no vuelve a animarse.
 * - Sin animación (contenido visible de entrada) si el visitante pidió «reducir movimiento», si el
 *   navegador es antiguo o si el equipo es muy limitado. Si el JS no corre, nada queda oculto: la
 *   clase que esconde la pone esta directiva.
 */
let observador: IntersectionObserver | undefined;

function sinAnimacion(): boolean {
  if (typeof window === 'undefined' || !('IntersectionObserver' in window)) return true;
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return true;
  const memoria = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  return memoria !== undefined && memoria <= 1;
}

function mostrar(el: Element) {
  el.classList.add('rv--visto');
  observador?.unobserve(el);
}

function obtenerObservador() {
  observador ??= new IntersectionObserver((entradas) => {
    for (const e of entradas) if (e.isIntersecting) mostrar(e.target);
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
  return observador;
}

export const vRevelar: Directive<HTMLElement, number | undefined> = {
  mounted(el, { modifiers, value }) {
    if (sinAnimacion()) return;
    if (modifiers.grupo) {
      el.classList.add('rv-grupo');
      Array.from(el.children).forEach((hijo, i) => (hijo as HTMLElement).style.setProperty('--rv-i', String(Math.min(i, 8))));
    } else {
      el.classList.add('rv');
      if (value) el.style.setProperty('--rv-retraso', `${value}ms`);
    }
    obtenerObservador().observe(el);
  },
  beforeUnmount(el) {
    observador?.unobserve(el);
  },
};
