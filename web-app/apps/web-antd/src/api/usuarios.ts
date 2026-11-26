import { requestClient } from '#/api/request';

export interface Usuario {
  idUsuario: number;
  nombreUsuario: string;
  rol: 'ADMIN' | 'CLIENTE';
  estado: string;
  cuotaMaxBytes: number;
  nombres: string | null;
  apellidoPaterno: string | null;
  apellidoMaterno: string | null;
  ci: string | null;
  correo: string | null;
  telefono: string | null;
}

export interface ResumenAlmacenamiento {
  idUsuario: number;
  nombreUsuario: string;
  estado: string;
  limite: number;
  ocupados: number;
  reservados: number;
  disponibles: number;
  cantidadArchivos: number;
  nombres: string | null;
  apellidoPaterno: string | null;
  apellidoMaterno: string | null;
  ci: string | null;
}

export interface DatosAlta {
  nombres: string; apellidoPaterno: string; apellidoMaterno: string;
  ci: string; correo: string; telefono: string; nombreUsuario: string; contrasena: string;
}
export interface SolicitudUsuario {
  idSolicitud: number; nombres: string; apellidoPaterno: string; apellidoMaterno: string;
  ci: string; correo: string; telefono: string; nombreUsuario: string; fechaSolicitud: string;
}

export interface ArchivoCliente {
  idArchivo: number;
  nombreVisible: string;
  tamano: number;
  tipoMime: string | null;
}

export interface Pagina<T> {
  content: T[];
  number: number;
  size: number;
  totalElements: number;
  totalPages: number;
}

export interface EspacioServidor {
  total: number;
  disponible: number;
  usado: number;
}

export interface SesionAdmin { idSesion: number; nombreUsuario: string; creadaEn: string; expiraEn: string }
export interface ActividadAdmin { nombreUsuario: string; recurso: string; bytes: number; ocurridaEn: string; accion: string }
export interface CarpetaAdmin { idCarpeta: number; nombre: string }
export interface ContenidoCliente { carpetas: CarpetaAdmin[]; archivos: ArchivoCliente[] }
export interface ItemPapelera { tipo: 'ARCHIVO' | 'CARPETA'; id: number; nombre: string; tamano: number }
export interface SnapshotAlmacenamiento { capturadoEn: string; bytesTotalServidor: number; bytesDisponiblesServidor: number; bytesOcupadosClientes: number; cantidadClientes: number }

export function listarUsuarios() {
  return requestClient.get<Usuario[]>('/auth/admin/usuarios');
}

export function crearUsuario(data: DatosAlta) {
  return requestClient.post<Usuario>('/auth/admin/usuarios', data);
}

export function solicitarAcceso(data: DatosAlta) {
  return requestClient.post<{ mensaje: string }>('/auth/solicitudes', data);
}
export function listarSolicitudes() { return requestClient.get<SolicitudUsuario[]>('/auth/admin/solicitudes'); }
export function aprobarSolicitud(id: number) { return requestClient.post<Usuario>(`/auth/admin/solicitudes/${id}/aprobar`); }
export function rechazarSolicitud(id: number) { return requestClient.post<void>(`/auth/admin/solicitudes/${id}/rechazar`); }

export function actualizarCliente(id: number, data: { nombreUsuario?: string; contrasena?: string }) {
  return requestClient.request<Usuario>(`/auth/admin/usuarios/${id}`, { method: 'PATCH', data });
}

export function administrarCliente(id: number, data: { bloqueado?: boolean; cuotaMaxBytes?: number }) {
  return requestClient.request<Usuario>(`/auth/admin/usuarios/${id}/administracion`, { method: 'PATCH', data });
}

export function listarSesionesCliente(id: number) {
  return requestClient.get<{ idSesion: number; expiraEn: string }[]>(`/auth/admin/usuarios/${id}/sesiones`);
}

export function listarSesionesAdmin() {
  return requestClient.get<SesionAdmin[]>('/auth/admin/sesiones');
}

export function listarActividadAdmin() {
  return requestClient.get<ActividadAdmin[]>('/auth/admin/actividad');
}

export function listarHistorialAlmacenamiento() {
  return requestClient.get<SnapshotAlmacenamiento[]>('/auth/admin/almacenamiento/historial');
}

export function explorarCliente(id: number, carpetaId?: number) {
  return requestClient.get<ContenidoCliente>(`/auth/admin/usuarios/${id}/carpetas`, { params: { carpetaId } });
}

export function listarPapeleraCliente(id: number) {
  return requestClient.get<ItemPapelera[]>(`/auth/admin/usuarios/${id}/papelera`);
}

export function obtenerResumenAlmacenamiento() {
  return requestClient.get<ResumenAlmacenamiento[]>('/auth/admin/almacenamiento');
}

export function obtenerEspacioServidor() {
  return requestClient.get<EspacioServidor>('/auth/admin/almacenamiento/servidor');
}

export function listarArchivosCliente(idUsuario: number, pagina = 0) {
  return requestClient.get<Pagina<ArchivoCliente>>(
    `/auth/admin/usuarios/${idUsuario}/archivos`,
    { params: { pagina, tamano: 50 } },
  );
}

export function descargarArchivoCliente(idUsuario: number, archivoId: number) {
  return requestClient.get<Blob>(
    `/auth/admin/usuarios/${idUsuario}/archivos/${archivoId}/descargar`,
    { responseType: 'blob', responseReturn: 'body' },
  );
}
