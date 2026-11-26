import { guardarOrdenPresentacion } from '#/api/inscripciones';
import { avisar, describirError, sinAvisosDeError } from '#/composables/useAvisos';

export interface CambioOrden {
  idCategoriaActividad: number;
  ids: number[];
  nombre: string;
}

/**
 * Guarda el orden de cada categoría cambiada (una petición por categoría) y da un
 * único aviso con el resultado. Devuelve `true` si se guardaron todas.
 */
export async function guardarOrdenes(cambios: CambioOrden[]): Promise<boolean> {
  const fallidas: string[] = [];
  await sinAvisosDeError(async () => {
    for (const c of cambios) {
      try {
        await guardarOrdenPresentacion(c.idCategoriaActividad, c.ids);
      } catch (error) {
        const { mensaje, titulo } = describirError(error);
        fallidas.push(`${c.nombre}: ${mensaje || titulo}`);
      }
    }
  });
  if (fallidas.length === 0) {
    avisar({
      mensaje: 'La app de los jurados ya los lista en este orden.',
      tipo: 'exito',
      titulo:
        cambios.length === 1 ? `Orden guardado: ${cambios[0]!.nombre}` : `Orden guardado en ${cambios.length} categorías`,
    });
    return true;
  }
  avisar({
    detalles: fallidas,
    mensaje:
      fallidas.length === cambios.length
        ? 'No se guardó el orden.'
        : `Se guardaron ${cambios.length - fallidas.length} de ${cambios.length} categorías.`,
    tipo: fallidas.length === cambios.length ? 'error' : 'advertencia',
    titulo: 'Orden de presentación',
  });
  return false;
}
