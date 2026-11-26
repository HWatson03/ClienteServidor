import type { EstadoEvaluacionActividad } from '#/api/actividades';

/**
 * Fases de la evaluación de una actividad (`Actividad.estadoEvaluacion`) con su
 * aspecto. Solo `ABIERTA` aparece en la app del jurado.
 */
export const ESTADOS_EVALUACION: Record<
  EstadoEvaluacionActividad,
  { ayuda: string; clase: string; icono: string; punto: string; texto: string }
> = {
  EN_PREPARACION: {
    ayuda: 'Se está configurando: los jurados todavía no la ven en su app.',
    clase: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
    icono: 'lucide:wrench',
    punto: 'bg-amber-500',
    texto: 'En preparación',
  },
  ABIERTA: {
    ayuda: 'Los jurados la ven en su app y pueden calificar.',
    clase: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
    icono: 'lucide:circle-play',
    punto: 'bg-emerald-500',
    texto: 'Abierta',
  },
  CERRADA: {
    ayuda: 'Terminó: desaparece de la app del jurado y no se aceptan más calificaciones.',
    clase: 'bg-slate-500/15 text-slate-600 dark:text-slate-300',
    icono: 'lucide:lock',
    punto: 'bg-slate-400',
    texto: 'Cerrada',
  },
};

export const ORDEN_ESTADOS_EVALUACION: EstadoEvaluacionActividad[] = ['EN_PREPARACION', 'ABIERTA', 'CERRADA'];
