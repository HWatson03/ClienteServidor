import { requestClient } from '#/api/request';

export interface LogsSistema {
  archivo: string;
  disponible: boolean;
  bytes: number;
  modificadoEn: string | null;
  entradas: LogEntrada[];
}

export interface LogEntrada {
  fecha: string;
  nivel: string;
  origen: string;
  usuario: string;
  mensaje: string;
  detalle: string;
}

export async function obtenerLogsSistema(limite = 300) {
  return requestClient.get<LogsSistema>('/auth/admin/logs', { params: { limite } });
}

export async function obtenerTicketLogsWebSocket() {
  return requestClient.post<{ ticket: string }>('/auth/admin/logs/ws-ticket');
}
