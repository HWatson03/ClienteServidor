import 'dart:convert';
import 'dart:io';

import 'package:admin/core/api_client.dart';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:path_provider/path_provider.dart';

class CargasScreen extends StatefulWidget {
  const CargasScreen(
      {super.key, this.carpetaDestinoId, this.nombreCarpetaDestino});

  final int? carpetaDestinoId;
  final String? nombreCarpetaDestino;

  @override
  State<CargasScreen> createState() => _CargasScreenState();
}

class _CargasScreenState extends State<CargasScreen> {
  final _api = ApiClient();
  static const _tamanoFragmento = 512 * 1024;

  File? _archivoLocal;
  bool _archivoTemporalGenerado = false;
  String? _nombreArchivo;
  String? _error;
  String _estado = '';
  int? _carpetaId;
  String _nombreCarpeta = 'Mis archivos';
  int? _bytesAndroid;
  int? _bytesLeidos;
  int? _bytesEsperadosBackend;
  int _bytesConfirmados = 0;
  int? _cargaId;
  bool _preparando = false;
  bool _subiendo = false;
  bool _completado = false;

  bool get _bytesCoinciden =>
      _bytesLeidos != null &&
      _bytesEsperadosBackend != null &&
      _bytesLeidos == _bytesEsperadosBackend;

  @override
  void initState() {
    super.initState();
    _carpetaId = widget.carpetaDestinoId;
    _nombreCarpeta = widget.nombreCarpetaDestino ?? _nombreCarpeta;
    if (_carpetaId == null) _cargarCarpetaRaiz();
  }

  Future<void> _cargarCarpetaRaiz() async {
    try {
      final response = await _api.get('/api/carpetas/raiz');
      if (response.statusCode != 200) return;
      final data = jsonDecode(response.body) as Map<String, dynamic>;
      if (!mounted) return;
      setState(() {
        _carpetaId = data['idCarpeta'] as int;
        _nombreCarpeta = data['nombre'] as String? ?? 'Mis archivos';
      });
    } catch (_) {
      if (mounted)
        setState(() => _error = 'No se pudo consultar la carpeta de destino.');
    }
  }

  Future<void> _seleccionarCarpeta() async {
    try {
      final response = await _api.get('/api/carpetas');
      if (response.statusCode != 200) {
        _mostrarError('No se pudieron cargar las carpetas.');
        return;
      }
      final carpetas = jsonDecode(response.body) as List<dynamic>;
      if (!mounted) return;
      final seleccion = await showDialog<Map<String, dynamic>>(
        context: context,
        builder: (context) => SimpleDialog(
          title: const Text('Guardar en'),
          children: carpetas
              .map((item) => Map<String, dynamic>.from(item as Map))
              .map((carpeta) => SimpleDialogOption(
                    onPressed: () => Navigator.pop(context, carpeta),
                    child: Text(carpeta['nombre'] as String? ?? 'Carpeta'),
                  ))
              .toList(),
        ),
      );
      if (seleccion == null) return;
      setState(() {
        _carpetaId = seleccion['idCarpeta'] as int;
        _nombreCarpeta = seleccion['nombre'] as String? ?? 'Carpeta';
        _bytesEsperadosBackend = null;
        _error = null;
      });
      if (_archivoLocal != null) await _prevalidar(_bytesLeidos!);
    } catch (_) {
      _mostrarError('No se pudo consultar la lista de carpetas.');
    }
  }

  Future<void> _seleccionarArchivo() async {
    if (_subiendo || _preparando) return;
    if (_archivoLocal != null) await _cancelarSeleccion();
    setState(() {
      _preparando = true;
      _error = null;
      _estado = 'Abriendo archivos del teléfono…';
      _bytesEsperadosBackend = null;
      _completado = false;
    });
    try {
      final result = await FilePicker.platform.pickFiles(
        withReadStream: true,
        withData: false,
      );
      if (result == null) {
        if (mounted) setState(() => _estado = '');
        return;
      }
      final seleccionado = result.files.single;
      final preparado = await _materializar(seleccionado);
      if (!mounted) return;
      setState(() {
        _archivoLocal = preparado.file;
        _archivoTemporalGenerado = preparado.temporal;
        _nombreArchivo = seleccionado.name;
        _bytesAndroid = seleccionado.size;
        _bytesLeidos = preparado.bytes;
        _bytesConfirmados = 0;
        _estado = 'Consultando el tamaño que acepta el servidor…';
      });
      await _prevalidar(preparado.bytes);
    } catch (e) {
      _mostrarError('No se pudo preparar el archivo: $e');
    } finally {
      if (mounted) setState(() => _preparando = false);
    }
  }

  Future<({File file, int bytes, bool temporal})> _materializar(
      PlatformFile seleccionado) async {
    final path = seleccionado.path;
    if (path != null) {
      final file = File(path);
      if (await file.exists()) {
        return (file: file, bytes: await file.length(), temporal: false);
      }
    }

    final directorio = await getTemporaryDirectory();
    final temporal = File(
        '${directorio.path}/cs_${DateTime.now().microsecondsSinceEpoch}.upload');
    final stream = seleccionado.readStream;
    if (stream != null) {
      final sink = temporal.openWrite();
      var bytes = 0;
      try {
        await for (final fragmento in stream) {
          sink.add(fragmento);
          bytes += fragmento.length;
        }
        await sink.flush();
      } finally {
        await sink.close();
      }
      return (file: temporal, bytes: bytes, temporal: true);
    }

    final data = seleccionado.bytes;
    if (data != null) {
      await temporal.writeAsBytes(data, flush: true);
      return (file: temporal, bytes: data.length, temporal: true);
    }
    throw const FileSystemException(
        'Android no entregó una ruta ni contenido legible para el archivo.');
  }

  Future<void> _prevalidar(int bytes) async {
    final carpetaId = _carpetaId;
    if (carpetaId == null) {
      _mostrarError(
          'No se encontró la carpeta de destino. Vuelve a abrir esta pantalla.');
      return;
    }
    final response = await _api.post('/api/cargas/prevalidar', {
      'carpetaDestinoId': carpetaId,
      'nombreArchivo': _nombreArchivo,
      'tamanoEsperado': bytes,
    });
    if (response.statusCode != 200) {
      _mostrarError(
          'El servidor rechazó la preparación (${response.statusCode}): ${_detalle(response.body)}');
      return;
    }
    final data = jsonDecode(response.body) as Map<String, dynamic>;
    final esperado = (data['tamanoEsperado'] as num).toInt();
    if (!mounted) return;
    setState(() {
      _bytesEsperadosBackend = esperado;
      _estado = esperado == bytes
          ? 'Tamaño verificado. Puedes subir el archivo.'
          : 'El tamaño local y el del servidor no coinciden.';
    });
  }

  Future<void> _subirArchivo() async {
    final archivo = _archivoLocal;
    final nombre = _nombreArchivo;
    final carpetaId = _carpetaId;
    final bytes = _bytesLeidos;
    if (archivo == null ||
        nombre == null ||
        carpetaId == null ||
        bytes == null ||
        !_bytesCoinciden) return;

    setState(() {
      _subiendo = true;
      _error = null;
      _bytesConfirmados = 0;
      _estado = 'Creando la carga…';
    });
    try {
      late final int cargaId;
      late final int tamanoBackend;
      late int offset;
      if (_cargaId == null) {
        final inicio = await _api.post('/api/cargas', {
          'carpetaDestinoId': carpetaId,
          'nombreArchivo': nombre,
          'tamanoEsperado': bytes,
        });
        if (inicio.statusCode != 201 && inicio.statusCode != 200) {
          throw Exception(
              'El servidor rechazó la carga (${inicio.statusCode}): ${_detalle(inicio.body)}');
        }
        final carga = jsonDecode(inicio.body) as Map<String, dynamic>;
        cargaId = (carga['idCarga'] as num).toInt();
        tamanoBackend = (carga['tamanoEsperado'] as num).toInt();
        offset = (carga['offsetConfirmado'] as num).toInt();
        _cargaId = cargaId;
      } else {
        cargaId = _cargaId!;
        final estado = await http.get(
          Uri.parse('${ApiClient.baseUrl}/api/cargas/$cargaId'),
          headers: await _headers(),
        );
        if (estado.statusCode != 200) {
          throw Exception(
              'No se pudo reanudar la carga (${estado.statusCode}): ${_detalle(estado.body)}');
        }
        final carga = jsonDecode(estado.body) as Map<String, dynamic>;
        tamanoBackend = (carga['tamanoEsperado'] as num).toInt();
        offset = (carga['offsetConfirmado'] as num).toInt();
      }
      if (tamanoBackend != bytes) {
        await _api.delete('/api/cargas/$cargaId');
        _cargaId = null;
        throw Exception(
            'El servidor espera $tamanoBackend bytes y el archivo tiene $bytes bytes.');
      }
      if (offset > bytes) {
        throw Exception(
            'El servidor ya tiene $offset bytes, más que el archivo seleccionado ($bytes).');
      }

      final raf = await archivo.open();
      try {
        await raf.setPosition(offset);
        while (offset < bytes) {
          final limite = (offset + _tamanoFragmento).clamp(0, bytes).toInt();
          final fragmento = await raf.read(limite - offset);
          if (fragmento.isEmpty) {
            throw Exception(
                'El archivo local terminó en $offset de $bytes bytes.');
          }
          final nuevoOffset =
              await _enviarFragmento(cargaId, nombre, offset, fragmento);
          final esperadoOffset = offset + fragmento.length;
          if (nuevoOffset != esperadoOffset) {
            throw Exception(
                'El servidor confirmó $nuevoOffset bytes; se enviaron $esperadoOffset.');
          }
          offset = nuevoOffset;
          if (mounted) {
            setState(() {
              _bytesConfirmados = offset;
              _estado = 'Subiendo ${_porcentaje(offset, bytes)}%';
            });
          }
        }
      } finally {
        await raf.close();
      }

      if (offset != tamanoBackend) {
        throw Exception(
            'El servidor confirmó $offset de $tamanoBackend bytes.');
      }
      if (mounted) setState(() => _estado = 'Confirmando archivo…');
      final finalizacion = await http.post(
        Uri.parse('${ApiClient.baseUrl}/api/cargas/$cargaId/finalizar'),
        headers: await _headers(),
      );
      if (finalizacion.statusCode != 200) {
        throw Exception(
            'No se pudo registrar el archivo (${finalizacion.statusCode}): ${_detalle(finalizacion.body)}');
      }
      final resultado = jsonDecode(finalizacion.body) as Map<String, dynamic>;
      final esDuplicado = resultado['duplicado'] == true;
      final archivo = resultado['archivo'] as Map<String, dynamic>?;
      final nombreFinal = archivo?['nombreVisible'] as String? ?? nombre;
      _cargaId = null;
      if (mounted) {
        setState(() {
          _completado = true;
          _bytesConfirmados = bytes;
          _estado = esDuplicado
              ? 'Este archivo ya existía y es idéntico. Se conserva una sola copia.'
              : nombreFinal == nombre
                  ? '¡Archivo subido y disponible en la app!'
                  : 'Subido como "$nombreFinal" porque ya existía otro archivo con ese nombre.';
        });
      }
    } catch (e) {
      _mostrarError(e.toString().replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) setState(() => _subiendo = false);
    }
  }

  Future<int> _enviarFragmento(
      int cargaId, String nombre, int offset, List<int> bytes) async {
    final request = http.MultipartRequest(
      'PUT',
      Uri.parse(
          '${ApiClient.baseUrl}/api/cargas/$cargaId/fragmento?offset=$offset'),
    );
    request.headers.addAll(await _headers());
    request.files
        .add(http.MultipartFile.fromBytes('file', bytes, filename: nombre));
    final streamed = await request.send();
    final body = await streamed.stream.bytesToString();
    if (streamed.statusCode != 200) {
      throw Exception(
          'Error al enviar desde el byte $offset (${streamed.statusCode}): ${_detalle(body)}');
    }
    final data = jsonDecode(body) as Map<String, dynamic>;
    return (data['offsetConfirmado'] as num).toInt();
  }

  Future<Map<String, String>> _headers() async {
    final token = await _api.getToken();
    return {if (token != null) 'Authorization': 'Bearer $token'};
  }

  Future<void> _cancelarSeleccion() async {
    final archivo = _archivoLocal;
    final temporal = _archivoTemporalGenerado;
    final cargaId = _cargaId;
    if (cargaId != null && !_completado) {
      try {
        await _api.delete('/api/cargas/$cargaId');
      } catch (_) {}
    }
    setState(() {
      _archivoLocal = null;
      _archivoTemporalGenerado = false;
      _cargaId = null;
      _nombreArchivo = null;
      _bytesAndroid = null;
      _bytesLeidos = null;
      _bytesEsperadosBackend = null;
      _bytesConfirmados = 0;
      _error = null;
      _estado = '';
      _completado = false;
    });
    if (archivo != null && temporal) {
      try {
        await archivo.delete();
      } catch (_) {}
    }
  }

  String _detalle(String body) {
    if (body.isEmpty) return 'respuesta vacía';
    try {
      final data = jsonDecode(body);
      if (data is Map<String, dynamic>)
        return (data['mensaje'] ?? data['message'] ?? data['codigo'] ?? body)
            .toString();
    } catch (_) {}
    return body.length > 180 ? '${body.substring(0, 180)}…' : body;
  }

  int _porcentaje(int actual, int total) =>
      total == 0 ? 100 : ((actual / total) * 100).round();

  String _bytes(int valor) =>
      '$valor bytes (${(valor / (1024 * 1024)).toStringAsFixed(2)} MB)';

  void _mostrarError(String texto) {
    if (mounted)
      setState(() {
        _error = texto;
        _estado = '';
      });
  }

  @override
  Widget build(BuildContext context) {
    final verificado = _bytesCoinciden;
    return Scaffold(
      appBar: AppBar(title: const Text('Subir archivo')),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          Container(
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              gradient: const LinearGradient(
                  colors: [Color(0xFF5B5CE2), Color(0xFF8586F1)]),
              borderRadius: BorderRadius.circular(24),
            ),
            child: const Row(children: [
              Icon(Icons.upload_file_rounded, size: 38, color: Colors.white),
              SizedBox(width: 14),
              Expanded(
                  child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                    Text('Desde tu teléfono',
                        style: TextStyle(
                            color: Colors.white,
                            fontSize: 19,
                            fontWeight: FontWeight.w700)),
                    SizedBox(height: 4),
                    Text(
                        'Primero revisamos el tamaño. Después confirmas la subida.',
                        style: TextStyle(color: Colors.white70, height: 1.35)),
                  ])),
            ]),
          ),
          const SizedBox(height: 18),
          Card(
            elevation: 0,
            child: ListTile(
              leading:
                  const Icon(Icons.folder_rounded, color: Color(0xFFE9A63A)),
              title: const Text('Se guardará en'),
              subtitle: Text(_nombreCarpeta),
              trailing: TextButton(
                  onPressed:
                      _subiendo || _preparando ? null : _seleccionarCarpeta,
                  child: const Text('Cambiar')),
            ),
          ),
          const SizedBox(height: 12),
          if (_archivoLocal == null)
            OutlinedButton.icon(
              onPressed: _preparando ? null : _seleccionarArchivo,
              icon: const Icon(Icons.attach_file_rounded),
              label: Text(_preparando
                  ? 'Preparando…'
                  : 'Elegir video, foto u otro archivo'),
              style: OutlinedButton.styleFrom(
                  minimumSize: const Size.fromHeight(56),
                  shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(16))),
            )
          else ...[
            Card(
              elevation: 0,
              child: Padding(
                padding: const EdgeInsets.all(18),
                child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(children: [
                        const Icon(Icons.insert_drive_file_rounded,
                            color: Color(0xFF5B5CE2)),
                        const SizedBox(width: 10),
                        Expanded(
                            child: Text(_nombreArchivo ?? 'Archivo',
                                maxLines: 2,
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(
                                    fontWeight: FontWeight.w600))),
                        if (!_subiendo)
                          IconButton(
                              tooltip: 'Quitar archivo',
                              onPressed: _cancelarSeleccion,
                              icon: const Icon(Icons.close_rounded)),
                      ]),
                      const Divider(height: 24),
                      _FilaBytes(
                          label: 'Medido en el teléfono',
                          valor: _bytesLeidos == null
                              ? '—'
                              : _bytes(_bytesLeidos!)),
                      if (_bytesAndroid != null &&
                          _bytesAndroid != _bytesLeidos)
                        _FilaBytes(
                            label: 'Tamaño reportado por Android',
                            valor: _bytes(_bytesAndroid!)),
                      const SizedBox(height: 8),
                      _FilaBytes(
                          label: 'El servidor espera',
                          valor: _bytesEsperadosBackend == null
                              ? 'Comprobando…'
                              : _bytes(_bytesEsperadosBackend!)),
                      const SizedBox(height: 12),
                      Container(
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: verificado
                              ? const Color(0xFFE8F7EF)
                              : const Color(0xFFF1F2F8),
                          borderRadius: BorderRadius.circular(14),
                        ),
                        child: Row(children: [
                          Icon(
                              verificado
                                  ? Icons.check_circle_rounded
                                  : Icons.pending_outlined,
                              color: verificado
                                  ? const Color(0xFF26845B)
                                  : Colors.blueGrey),
                          const SizedBox(width: 9),
                          Expanded(
                              child: Text(
                                  verificado
                                      ? 'Los tamaños coinciden. Listo para subir.'
                                      : _estado.isEmpty
                                          ? 'Esperando la verificación del servidor.'
                                          : _estado,
                                  style: TextStyle(
                                      color: verificado
                                          ? const Color(0xFF216C4D)
                                          : Colors.blueGrey.shade700))),
                        ]),
                      ),
                    ]),
              ),
            ),
            const SizedBox(height: 16),
            if (_subiendo) ...[
              LinearProgressIndicator(
                  value: _bytesLeidos == 0
                      ? null
                      : _bytesConfirmados / _bytesLeidos!),
              const SizedBox(height: 10),
              Text(
                  'Confirmados por el servidor: ${_bytes(_bytesConfirmados)} de ${_bytes(_bytesLeidos!)}',
                  textAlign: TextAlign.center),
            ],
            FilledButton.icon(
              onPressed: _subiendo || _preparando || !verificado || _completado
                  ? null
                  : _subirArchivo,
              icon: _subiendo
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(
                          strokeWidth: 2, color: Colors.white))
                  : const Icon(Icons.upload_rounded),
              label: Text(_subiendo
                  ? _estado
                  : _completado
                      ? 'Subida completada'
                      : 'Subir archivo'),
              style: FilledButton.styleFrom(
                  minimumSize: const Size.fromHeight(54),
                  shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(16))),
            ),
            if (_completado)
              TextButton(
                  onPressed: () => Navigator.pop(context, true),
                  child: const Text('Volver a mis archivos')),
          ],
          if (_error != null) ...[
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                  color: const Color(0xFFFFEEEE),
                  borderRadius: BorderRadius.circular(14)),
              child: Text(_error!,
                  style: const TextStyle(color: Color(0xFF9D3038))),
            ),
            if (_archivoLocal == null && !_preparando)
              TextButton(
                  onPressed: _seleccionarArchivo,
                  child: const Text('Intentar de nuevo')),
          ],
        ],
      ),
    );
  }
}

class _FilaBytes extends StatelessWidget {
  const _FilaBytes({required this.label, required this.valor});
  final String label;
  final String valor;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 5),
        child: Row(children: [
          Expanded(
              child: Text(label,
                  style: TextStyle(color: Colors.blueGrey.shade600))),
          const SizedBox(width: 12),
          Flexible(
              child: Text(valor,
                  textAlign: TextAlign.end,
                  style: const TextStyle(fontWeight: FontWeight.w600))),
        ]),
      );
}
