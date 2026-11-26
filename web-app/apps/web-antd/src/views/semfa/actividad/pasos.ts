import type { Component } from 'vue';

import type { PasoActividad } from '#/api/actividades';

import { defineAsyncComponent } from 'vue';

export type Paso = 'resumen' | 'ubicacion' | PasoActividad;

/**
 * Pasos del centro de la actividad, en el orden en que se configura una. Cada
 * uno reutiliza la pantalla del módulo (que va sin su cabecera, ver `SemfaPagina`).
 */
export const PASOS: {
  ayuda: string;
  clave: Paso;
  componente: Component;
  icono: string;
  /** Solo aparece si la actividad dura más de un día. */
  soloVariosDias?: boolean;
  titulo: string;
}[] = [
  {
    ayuda: 'Qué está listo, qué falta y abrir o cerrar la evaluación',
    clave: 'resumen',
    componente: defineAsyncComponent(() => import('./resumen.vue')),
    icono: 'lucide:layout-dashboard',
    titulo: 'Resumen',
  },
  {
    ayuda: 'Grupos en los que compiten los participantes (p. ej. Expertos y Principiantes)',
    clave: 'categorias',
    componente: defineAsyncComponent(() => import('#/views/semfa/complementos/categoria-actividad/index.vue')),
    icono: 'lucide:layers',
    titulo: 'Categorías',
  },
  {
    ayuda: 'Facultades y carreras a las que pertenece cada proyecto (rankings por facultad y carrera)',
    clave: 'carreras',
    componente: defineAsyncComponent(() => import('#/views/semfa/complementos/carrera/index.vue')),
    icono: 'lucide:graduation-cap',
    titulo: 'Carreras',
  },
  {
    ayuda: 'Quién participa y en qué categoría; registrar, inscribir y trasladar',
    clave: 'participantes',
    componente: defineAsyncComponent(() => import('#/views/semfa/complementos/inscripcion/index.vue')),
    icono: 'lucide:users',
    titulo: 'Participantes',
  },
  {
    ayuda: 'Qué día se presenta cada proyecto y qué día evalúa el jurado ahora',
    clave: 'jornadas',
    componente: defineAsyncComponent(() => import('./jornadas.vue')),
    icono: 'lucide:calendar-range',
    soloVariosDias: true,
    titulo: 'Jornadas',
  },
  {
    ayuda: 'Qué califica el jurado: cada rúbrica con sus criterios y puntos',
    clave: 'rubricas',
    componente: defineAsyncComponent(() => import('#/views/semfa/evaluacion/rubrica/index.vue')),
    icono: 'lucide:clipboard-list',
    titulo: 'Rúbricas',
  },
  {
    ayuda: 'Quién evalúa y en qué categorías (con su acceso a la app)',
    clave: 'jurados',
    componente: defineAsyncComponent(() => import('#/views/semfa/administracion/jurado/index.vue')),
    icono: 'lucide:gavel',
    titulo: 'Jurados',
  },
  {
    ayuda: 'En qué orden se presentan: así los lista la app del jurado',
    clave: 'orden',
    componente: defineAsyncComponent(() => import('./orden.vue')),
    icono: 'lucide:list-ordered',
    titulo: 'Orden',
  },
  {
    ayuda: 'Proyectos con la nota entregada por escrito (8.5, 95/100): ponerla para que entren al ranking',
    clave: 'notas',
    componente: defineAsyncComponent(() => import('./notas-acta.vue')),
    icono: 'lucide:file-pen-line',
    titulo: 'Notas de acta',
  },
  {
    ayuda: 'Asignar una cuenta a cada danza y seguir su ubicación sobre el plano UAP',
    clave: 'ubicacion',
    componente: defineAsyncComponent(() => import('#/views/semfa/seguimiento-danzas/index.vue')),
    icono: 'lucide:map-pinned',
    titulo: 'Acompañantes',
  },
];
