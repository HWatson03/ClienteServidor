import { requestClient } from '#/api/request';

export interface LogsSistema {
  archivo: string;
  disponible: boolean;
  bytes: number;
  modificadoEn: string | null;
  lineas: string[];
}

export async function obtenerLogsSistema(limite = 300) {
  return requestClient.get<LogsSistema>('/auth/admin/logs', { params: { limite } });
}

export async function obtenerTicketLogsWebSocket() {
  return requestClient.post<{ ticket: string }>('/auth/admin/logs/ws-ticket');
}
