import { requestClient } from '#/api/request';

/**
 * `api/dto/ProyectoResponse.java`.
 *
 * Aplana las relaciones del proyecto (docente, estudiantes y jurados son
 * `LAZY`/`ManyToMany` en la entidad) y expone los ids que el formulario de
 * edición necesita para preseleccionar los multi-select.
 */
export interface Proyecto {
  categoria: null | string;
  categoriaProyecto: null | string;
  docente: null | string;
  estado: string;
  estudiantes: NombreId[];
  idCategoriaProyecto: null | number;
  idDocente: null | number;
  idPrograma: null | number;
  idProyecto: number;
  idTipoProyecto: number;
  jurados: NombreId[];
  nombreArchivo: null | string;
  nombreProyecto: string;
  nroStand: null | string;
  promedioFinal: number;
  programa: null | string;
  tipoProyecto: string;
}

/** Par id/nombre para los multi-select del formulario. */
export interface NombreId {
  id: number;
  nombre: null | string;
}

/**
 * Cuerpo de alta/edición del módulo de proyectos.
 *
 * Un solo formulario cubre las tres variantes del legacy (`ProyectoF`,
 * `danza-entrada` y `ProyectoFBanda`), que solo diferenciaban en si el archivo
 * era obligatorio: aquí el archivo viaja aparte, como parte opcional del
 * multipart, y el backend lo guarda si llega.
 */
export interface ProyectoForm {
  categoriaProyecto?: string;
  idCategoriaProyecto?: number;
  idDocente?: number;
  idPrograma?: number;
  idTipoProyecto?: number;
  idsEstudiantes?: number[];
  idsJurados?: number[];
  nombreProyecto?: string;
  nroStand?: string;
}

/** `api/dto/TipoProyectoResponse.java`. */
export interface TipoProyectoGestion {
  idTipoProyecto: number;
  nombre: string;
}

/** `api/dto/CategoriaProyectoResponse.java`. */
export interface CategoriaProyecto {
  idCategoriaProyecto: number;
  nombre: string;
}

/** `api/dto/ProgramaResponse.java`. */
export interface Programa {
  idPrograma: number;
  nombre: string;
}

/** `GET /api/proyectos/tipos` — tipos de proyecto activos. */
export async function listarTiposProyectoGestion() {
  return requestClient.get<TipoProyectoGestion[]>('/proyectos/tipos');
}

/** `GET /api/proyectos/categorias/{idTipo}` — categorías activas de ese tipo. */
export async function listarCategoriasPorTipo(idTipo: number) {
  return requestClient.get<CategoriaProyecto[]>(`/proyectos/categorias/${idTipo}`);
}

/** `GET /api/proyectos/programas` — programas (carreras) activos. */
export async function listarProgramas() {
  return requestClient.get<Programa[]>('/proyectos/programas');
}

/** `GET /api/proyectos/por-tipo/{idTipo}` — proyectos vivos, ordenados por categoría. */
export async function listarProyectosPorTipo(idTipo: number) {
  return requestClient.get<Proyecto[]>(`/proyectos/por-tipo/${idTipo}`);
}

/** `GET /api/proyectos/{id}` — 404 si no existe o está borrado. */
export async function obtenerProyecto(id: number) {
  return requestClient.get<Proyecto>(`/proyectos/${id}`);
}

/** `POST /api/proyectos` — alta. El respaldo PDF es opcional. */
export async function crearProyecto(datos: ProyectoForm, archivo: File | null) {
  return requestClient.post<Proyecto>('/proyectos', construirMultipart(datos, archivo));
}

/** `PUT /api/proyectos/{id}` — edición. 404 si el proyecto está dado de baja. */
export async function actualizarProyecto(
  id: number,
  datos: ProyectoForm,
  archivo: File | null,
) {
  return requestClient.put<Proyecto>(
    `/proyectos/${id}`,
    construirMultipart(datos, archivo),
  );
}

/** `DELETE /api/proyectos/{id}` — borrado lógico (`estado = 'X'`). */
export async function eliminarProyecto(id: number) {
  return requestClient.delete<void>(`/proyectos/${id}`);
}

/** `GET /api/proyectos/evaluados` — proyectos con `estado = 'E'`. */
export async function listarProyectosEvaluados() {
  return requestClient.get<Proyecto[]>('/proyectos/evaluados');
}

/**
 * `GET /api/proyectos/{id}/archivo` — respaldo PDF en una pestaña nueva.
 *
 * El interceptor de `@vben/request` desenvuelve `ApiResponse` y ante un blob
 * fallaría, así que la petición se hace con `responseReturn: 'body'` para
 * recibir el `Blob` directamente. El token JWT viaja en la cabecera, como en
 * el resto de llamadas: no se debilita la seguridad con una URL pública.
 */
export async function abrirArchivoProyecto(id: number) {
  const blob = await requestClient.get<Blob>(`/proyectos/${id}/archivo`, {
    responseReturn: 'body',
    responseType: 'blob',
  });
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank');
  // Se revoca al cabo de un rato: la pestaña ya cargó el PDF.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/**
 * Multipart con una parte JSON (`datos`) y una parte opcional (`archivo`).
 * Spring enlaza la parte JSON con `@RequestPart("datos") ProyectoRequest`.
 */
function construirMultipart(datos: ProyectoForm, archivo: File | null) {
  const formData = new FormData();
  formData.append(
    'datos',
    new Blob([JSON.stringify(datos)], { type: 'application/json' }),
  );
  if (archivo) {
    formData.append('archivo', archivo);
  }
  return formData;
}
