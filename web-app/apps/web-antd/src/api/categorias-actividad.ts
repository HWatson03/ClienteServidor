import { requestClient } from '#/api/request';

/**
 * `CategoriaActividadResponse` de `com.example.proyecto.api.dto`.
 *
 * La relación `LAZY` con `Actividad` llega aplanada (`idActividad` +
 * `nombreActividad`), igual que hace `EstudianteResponse` con `persona`, y lo
 * mismo la carrera y el nivel de las categorías de carrera.
 *
 * Con inscripciones o jurados asignados, el backend no deja eliminarla ni
 * cambiarla de actividad (409); una de carrera nunca cambia de actividad.
 */
export interface CategoriaActividad {
  descripcion: null | string;
  idActividad: null | number;
  /** Carrera si la creó «Asignar jurados por carrera»; `null` en las demás. */
  idCarrera: null | number;
  idCategoriaActividad: number;
  /** `BASICO` / `AVANZADO` en las categorías de carrera. */
  nivel: null | string;
  nombre: null | string;
  nombreActividad: null | string;
  nombreCarrera: null | string;
}

/**
 * Campos que edita el formulario.
 *
 * Deliberadamente no incluye `fase`, `grupoDanza`, `nivel` ni `carrera`: el
 * legacy tampoco los editaba y son los que usa la feria EXPOINNOVA.
 */
export interface CategoriaActividadForm {
  descripcion: string;
  idActividad?: number;
  idCategoriaActividad?: number;
  nombre: string;
}

/** `GET /api/categorias-actividad` — lista las categorías activas con su actividad. */
export async function listarCategoriasActividad() {
  return requestClient.get<CategoriaActividad[]>('/categorias-actividad');
}

/** `GET /api/categorias-actividad/{id}` */
export async function obtenerCategoriaActividad(id: number) {
  return requestClient.get<CategoriaActividad>(`/categorias-actividad/${id}`);
}

/**
 * `POST /api/categorias-actividad` — el backend responde 400 si falta el nombre o
 * la actividad, y 409 si ya existe una categoría activa con ese nombre.
 */
export async function crearCategoriaActividad(data: CategoriaActividadForm) {
  return requestClient.post<CategoriaActividad>('/categorias-actividad', data);
}

/** `PUT /api/categorias-actividad/{id}` */
export async function actualizarCategoriaActividad(
  id: number,
  data: CategoriaActividadForm,
) {
  return requestClient.put<CategoriaActividad>(
    `/categorias-actividad/${id}`,
    data,
  );
}

/** `DELETE /api/categorias-actividad/{id}` — borrado lógico: `estado = 'X'`. */
export async function eliminarCategoriaActividad(id: number) {
  return requestClient.delete<void>(`/categorias-actividad/${id}`);
}
