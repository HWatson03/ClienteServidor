import { requestClient } from '#/api/request';

export interface CarpetaCliente { idCarpeta: number; nombre: string; idCarpetaPadre: number | null }
export interface ArchivoClienteWeb { idArchivo: number; nombreVisible: string; tamano: number; tipoMime: string | null }
export interface PaginaArchivos { content: ArchivoClienteWeb[]; totalElements: number; totalPages: number; number: number }
export interface CuotaCliente { limite: number; ocupados: number; reservados: number; disponibles: number }
interface CargaCliente { idCarga: number; offsetConfirmado: number; tamanoEsperado: number }

export const obtenerRaizCliente = () => requestClient.get<CarpetaCliente>('/carpetas/raiz');
export const listarCarpetasCliente = (padreId: number) =>
  requestClient.get<CarpetaCliente[]>('/carpetas', { params: { padreId } });
export const crearCarpetaCliente = (carpetaPadreId: number, nombre: string) =>
  requestClient.post<CarpetaCliente>('/carpetas', { carpetaPadreId, nombre });
export const listarArchivosClienteWeb = (carpetaId: number, pagina = 0) =>
  requestClient.get<PaginaArchivos>('/archivos', { params: { carpetaId, pagina, tamano: 100 } });
export const obtenerCuotaCliente = () => requestClient.get<CuotaCliente>('/almacenamiento/resumen');
export const descargarArchivoClienteWeb = (id: number) =>
  requestClient.get<Blob>(`/archivos/${id}/descargar`, { responseType: 'blob', responseReturn: 'body' });

export async function subirArchivoCliente(carpetaId: number, file: File, onProgress: (bytes: number) => void) {
  const info = { carpetaDestinoId: carpetaId, nombreArchivo: file.name, tamanoEsperado: file.size };
  const prevalidacion = await requestClient.post<{ tamanoEsperado: number }>('/cargas/prevalidar', info);
  if (prevalidacion.tamanoEsperado !== file.size) throw new Error('El servidor no aceptó el tamaño del archivo.');

  const carga = await requestClient.post<CargaCliente>('/cargas', info);
  try {
    let offset = carga.offsetConfirmado;
    const tamanoFragmento = 512 * 1024;
    while (offset < file.size) {
      const fragmento = file.slice(offset, Math.min(offset + tamanoFragmento, file.size));
      const datos = new FormData();
      datos.append('file', fragmento, file.name);
      const actualizada = await requestClient.put<CargaCliente>(`/cargas/${carga.idCarga}/fragmento`, datos, {
        params: { offset },
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      if (actualizada.offsetConfirmado !== offset + fragmento.size) {
        throw new Error('El servidor confirmó un fragmento incompleto.');
      }
      offset = actualizada.offsetConfirmado;
      onProgress(offset);
    }
    await requestClient.post(`/cargas/${carga.idCarga}/finalizar`);
  } catch (error) {
    try { await requestClient.delete(`/cargas/${carga.idCarga}`); } catch { /* se limpiará por expiración */ }
    throw error;
  }
}
