import { requestClient } from '#/api/request';

export const ROLES = { ADMIN: 'ADMIN', CLIENTE: 'CLIENTE' } as const;
export type Rol = (typeof ROLES)[keyof typeof ROLES];

export interface UsuarioActual {
  idUsuario: number;
  nombreUsuario: string;
  rol: Rol;
  nombres: string | null;
  apellidoPaterno: string | null;
  apellidoMaterno: string | null;
  ci: string | null;
  correo: string | null;
  telefono: string | null;
}

interface LoginResponse { token: string }
interface LoginRequest { nombreUsuario: string; contrasena: string }

export async function loginApi(data: LoginRequest) {
  const respuesta = await requestClient.post<LoginResponse>('/auth/login', data, {
    responseReturn: 'body',
  });
  return { accessToken: respuesta.token, refreshToken: null };
}

export async function getUserInfoApi() {
  const actual = await requestClient.get<UsuarioActual>('/auth/me');
  let avatar = '';
  try {
    const blob = await obtenerFotoPerfilApi();
    if (blob instanceof Blob && blob.size > 0) avatar = await blobComoDataUrl(blob);
  } catch { /* Una cuenta nueva todavía puede no tener foto. */ }
  return {
    avatar, desc: '', homePath: actual.rol === ROLES.ADMIN ? '/usuarios' : '/cliente',
    realName: actual.nombreUsuario, roles: [actual.rol], token: '',
    userId: String(actual.idUsuario), username: actual.nombreUsuario,
  };
}

function blobComoDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export function cambiarContrasenaApi(data: { nombreUsuario: string; contrasenaActual: string; contrasenaNueva: string }) {
  return requestClient.request<void>('/auth/contrasena', { method: 'PATCH', data });
}

export function obtenerPerfilApi() {
  return requestClient.get<UsuarioActual>('/auth/me');
}

export function subirFotoPerfilApi(file: File) {
  const data = new FormData();
  data.append('file', file);
  return requestClient.request<{ fotoPerfil: string }>('/auth/me/foto', {
    method: 'PUT', data,
    headers: { 'Content-Type': 'multipart/form-data' },
  });
}

export function obtenerFotoPerfilApi() {
  return requestClient.get<Blob>('/auth/me/foto', { responseType: 'blob', responseReturn: 'body' });
}

export async function logoutApi() {
  return requestClient.post('/auth/logout');
}

export function homePathPorRol(rol: string | undefined) {
  return rol === ROLES.ADMIN ? '/usuarios' : '/cliente';
}
