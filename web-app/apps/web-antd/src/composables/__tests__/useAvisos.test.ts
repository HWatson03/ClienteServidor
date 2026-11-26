import { beforeEach, describe, expect, it } from 'vitest';

import {
  avisar,
  avisosDeErrorSilenciados,
  cerrarAviso,
  describirError,
  sinAvisosDeError,
  useAvisos,
} from '#/composables/useAvisos';

const { avisos } = useAvisos();

describe('useAvisos', () => {
  beforeEach(() => {
    for (const a of [...avisos.value]) {
      cerrarAviso(a.id);
    }
  });

  it('apila el más reciente arriba y conserva como mucho 4', () => {
    for (let i = 1; i <= 5; i++) {
      avisar({ tipo: 'info', titulo: `Aviso ${i}` });
    }
    expect(avisos.value.map((a) => a.titulo)).toEqual([
      'Aviso 5',
      'Aviso 4',
      'Aviso 3',
      'Aviso 2',
    ]);
  });

  it('da más tiempo a errores que a éxitos y respeta una duración explícita', () => {
    avisar({ tipo: 'exito', titulo: 'ok' });
    avisar({ tipo: 'error', titulo: 'mal' });
    avisar({ duracion: 0, tipo: 'info', titulo: 'fijo' });
    const [fijo, error, exito] = avisos.value;
    expect(error!.duracion).toBeGreaterThan(exito!.duracion);
    expect(fijo!.duracion).toBe(0);
  });

  it('cierra un aviso por id', () => {
    const id = avisar({ tipo: 'info', titulo: 'x' });
    cerrarAviso(id);
    expect(avisos.value).toHaveLength(0);
  });

  it('silencia los avisos de error solo mientras dura el lote', async () => {
    expect(avisosDeErrorSilenciados()).toBe(false);
    await sinAvisosDeError(async () => {
      expect(avisosDeErrorSilenciados()).toBe(true);
    });
    expect(avisosDeErrorSilenciados()).toBe(false);
  });
});

describe('describirError', () => {
  it('usa el mensaje de negocio de ApiResponse y un título por código HTTP', () => {
    const error = {
      response: { data: { mensaje: 'Ese jurado ya tiene una asignación.' }, status: 409 },
    };
    expect(describirError(error)).toEqual({
      mensaje: 'Ese jurado ya tiene una asignación.',
      titulo: 'Registro duplicado',
    });
  });

  it('distingue errores del servidor y falta de conexión', () => {
    expect(describirError({ response: { data: {}, status: 503 } }).titulo).toBe(
      'Error del servidor',
    );
    expect(describirError(new Error('Network Error'), 'Error de red').titulo).toBe(
      'Sin conexión con el servidor',
    );
  });
});
