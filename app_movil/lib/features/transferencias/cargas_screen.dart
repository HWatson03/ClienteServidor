import 'dart:io';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:admin/core/api_client.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:file_picker/file_picker.dart';
import 'package:http/http.dart' as http;

class CargasScreen extends StatefulWidget {
  const CargasScreen({super.key});

  @override
  State<CargasScreen> createState() => _CargasScreenState();
}

class _CargasScreenState extends State<CargasScreen> {
  final _apiClient = ApiClient();
  bool _subiendo = false;
  String _estado = '';
  int _fragmentoActual = 0;
  int _totalFragmentos = 0;
  static const int _tamanoFragmento = 512 * 1024; // 512KB
  int _carpetaDestinoId = 1;
  String? _nombreCarpetaDestino;
  String? _cargaIdPendiente;

  @override
  void initState() {
    super.initState();
    _recuperarPendiente();
  }

  Future<void> _recuperarPendiente() async {
    final prefs = await SharedPreferences.getInstance();
    final cargaId = prefs.getString('carga_pendiente_id');
    final offset = prefs.getInt('carga_pendiente_offset') ?? 0;
    final carpeta = prefs.getInt('carga_pendiente_carpeta') ?? 1;
    if (cargaId != null) {
      setState(() {
        _cargaIdPendiente = cargaId;
        _carpetaDestinoId = carpeta;
        _estado = 'Carga pendiente: $cargaId (offset $offset)';
      });
    }
  }

  Future<void> _guardarPendiente(String cargaId, int offset, int carpeta) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('carga_pendiente_id', cargaId);
    await prefs.setInt('carga_pendiente_offset', offset);
    await prefs.setInt('carga_pendiente_carpeta', carpeta);
  }

  Future<void> _limpiarPendiente() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove('carga_pendiente_id');
    await prefs.remove('carga_pendiente_offset');
    await prefs.remove('carga_pendiente_carpeta');
  }

  Future<int> _consultarOffsetServidor(String cargaId) async {
    final token = await _apiClient.getToken();
    final resp = await http.get(
      Uri.parse('${ApiClient.baseUrl}/api/cargas/$cargaId'),
      headers: {
        if (token != null) 'Authorization': 'Bearer $token',
      },
    );
    if (resp.statusCode == 200) {
      final data = jsonDecode(resp.body);
      return data['offsetConfirmado'] ?? 0;
    }
    return 0;
  }

  Future<void> _seleccionarCarpeta() async {
    final token = await _apiClient.getToken();
    final resp = await http.get(
      Uri.parse('${ApiClient.baseUrl}/api/carpetas'),
      headers: {
        if (token != null) 'Authorization': 'Bearer $token',
      },
    );
    if (resp.statusCode != 200) return;
    final List<dynamic> carpetas = jsonDecode(resp.body);
    
    if (!mounted) return;
    final seleccion = await showDialog<Map<String, dynamic>>(
      context: context,
      builder: (ctx) => SimpleDialog(
        title: Text('Seleccionar carpeta'),
        children: carpetas.map((c) => SimpleDialogOption(
          onPressed: () => Navigator.pop(ctx, c),
          child: Text(c['nombre'] ?? 'Carpeta ${c['idCarpeta']}'),
        )).toList(),
      ),
    );
    if (seleccion != null) {
      setState(() {
        _carpetaDestinoId = seleccion['idCarpeta'];
        _nombreCarpetaDestino = seleccion['nombre'];
      });
    }
  }

  Future<void> _seleccionarYSubir() async {
    final result = await FilePicker.platform.pickFiles(withReadStream: true);
    if (result == null) return;
    final file = result.files.single;
    
    setState(() { _subiendo = true; _estado = 'Iniciando...'; });
    
    try {
      final token = await _apiClient.getToken();
      
      final resp = await _apiClient.post('/api/cargas', {
        'carpetaDestinoId': _carpetaDestinoId,
        'nombreArchivo': file.name,
        'tamanoEsperado': file.size,
      });
      
      if (resp.statusCode != 201 && resp.statusCode != 200) {
        setState(() { _estado = 'Error al iniciar: ${resp.statusCode}'; _subiendo = false; });
        return;
      }
      
      final match = RegExp(r'"idCarga":(\d+)').firstMatch(resp.body);
      if (match == null) {
        setState(() { _estado = 'Error al obtener carga'; _subiendo = false; });
        return;
      }
      final cargaId = match.group(1)!;
      await _guardarPendiente(cargaId, 0, _carpetaDestinoId);
      
      await _subirArchivo(file, cargaId, token, 0);
    } catch (e) {
      setState(() { _estado = 'Error: $e'; });
    } finally {
      setState(() { _subiendo = false; });
    }
  }

  Future<void> _reanudarCarga() async {
    if (_cargaIdPendiente == null) return;
    final result = await FilePicker.platform.pickFiles(withReadStream: true);
    if (result == null) return;
    final file = result.files.single;
    
    setState(() { _subiendo = true; _estado = 'Consultando offset del servidor...'; });
    
    try {
      final token = await _apiClient.getToken();
      // Consultar offset confirmado por el servidor
      final offsetServidor = await _consultarOffsetServidor(_cargaIdPendiente!);
      setState(() { _estado = 'Reanudando desde offset $offsetServidor...'; });
      await _subirArchivo(file, _cargaIdPendiente!, token, offsetServidor);
    } catch (e) {
      setState(() { _estado = 'Error: $e'; });
    } finally {
      setState(() { _subiendo = false; });
    }
  }

  Future<void> _subirArchivo(dynamic file, String cargaId, String? token, int offsetInicial) async {
    final fileSize = file.size as int;
    if (fileSize == 0) {
      _totalFragmentos = 0;
    } else {
      _totalFragmentos = (fileSize / _tamanoFragmento).ceil();
      if (_totalFragmentos == 0) _totalFragmentos = 1;
    }
    
    int offset = offsetInicial;
    _fragmentoActual = offsetInicial > 0 ? (offsetInicial / _tamanoFragmento).ceil() : 0;
    
    if (fileSize > 0 && offset < fileSize) {
      if (file.path != null) {
        final raf = await File(file.path!).open();
        try {
          await raf.setPosition(offset);
          while (offset < fileSize) {
            final fin = (offset + _tamanoFragmento).clamp(0, fileSize) as int;
            final length = fin - offset;
            final fragmento = await raf.read(length);
            
            _fragmentoActual++;
            setState(() { _estado = 'Fragmento $_fragmentoActual/$_totalFragmentos'; });
            
            final uri = Uri.parse('${ApiClient.baseUrl}/api/cargas/$cargaId/fragmento?offset=$offset');
            final request = http.MultipartRequest('PUT', uri);
            if (token != null) request.headers['Authorization'] = 'Bearer $token';
            request.files.add(http.MultipartFile.fromBytes('file', fragmento, filename: file.name));
            final streamed = await request.send();
            await streamed.stream.bytesToString();
            
            if (streamed.statusCode != 200) {
              await _guardarPendiente(cargaId, offset, _carpetaDestinoId);
              setState(() { _estado = 'Error en fragmento: ${streamed.statusCode}'; _subiendo = false; });
              return;
            }
            
            offset = fin;
            await _guardarPendiente(cargaId, offset, _carpetaDestinoId);
          }
        } finally {
          await raf.close();
        }
      } else if (file.readStream != null) {
        int skipped = 0;
        final buffer = <int>[];
        await for (final chunk in file.readStream!) {
          if (skipped + (chunk.length as int) <= offset) {
            skipped += chunk.length as int;
            continue;
          }
          final startInChunk = (offset - skipped).clamp(0, chunk.length) as int;
          buffer.addAll(chunk.sublist(startInChunk));
          skipped += chunk.length as int;
          
          while (buffer.length >= _tamanoFragmento) {
            final fragmento = buffer.sublist(0, _tamanoFragmento);
            buffer.removeRange(0, _tamanoFragmento);
            
            _fragmentoActual++;
            setState(() { _estado = 'Fragmento $_fragmentoActual/$_totalFragmentos'; });
            
            final uri = Uri.parse('${ApiClient.baseUrl}/api/cargas/$cargaId/fragmento?offset=$offset');
            final request = http.MultipartRequest('PUT', uri);
            if (token != null) request.headers['Authorization'] = 'Bearer $token';
            request.files.add(http.MultipartFile.fromBytes('file', fragmento, filename: file.name));
            final streamed = await request.send();
            await streamed.stream.bytesToString();
            
            if (streamed.statusCode != 200) {
              await _guardarPendiente(cargaId, offset, _carpetaDestinoId);
              setState(() { _estado = 'Error en fragmento: ${streamed.statusCode}'; _subiendo = false; });
              return;
            }
            
            offset += fragmento.length;
            await _guardarPendiente(cargaId, offset, _carpetaDestinoId);
          }
        }
        if (buffer.isNotEmpty) {
          _fragmentoActual++;
          setState(() { _estado = 'Fragmento $_fragmentoActual/$_totalFragmentos'; });
          
          final uri = Uri.parse('${ApiClient.baseUrl}/api/cargas/$cargaId/fragmento?offset=$offset');
          final request = http.MultipartRequest('PUT', uri);
          if (token != null) request.headers['Authorization'] = 'Bearer $token';
          request.files.add(http.MultipartFile.fromBytes('file', buffer, filename: file.name));
          final streamed = await request.send();
          await streamed.stream.bytesToString();
          
          if (streamed.statusCode != 200) {
            await _guardarPendiente(cargaId, offset, _carpetaDestinoId);
            setState(() { _estado = 'Error en fragmento: ${streamed.statusCode}'; _subiendo = false; });
            return;
          }
          offset += buffer.length;
          await _guardarPendiente(cargaId, offset, _carpetaDestinoId);
        }
      } else if (file.bytes != null) {
        final bytes = file.bytes!;
        int i = offset;
        while (i < bytes.length) {
          final fin = (i + _tamanoFragmento).clamp(0, bytes.length) as int;
          final fragmento = bytes.sublist(i, fin);
          
          _fragmentoActual++;
          setState(() { _estado = 'Fragmento $_fragmentoActual/$_totalFragmentos'; });
          
          final uri = Uri.parse('${ApiClient.baseUrl}/api/cargas/$cargaId/fragmento?offset=$i');
          final request = http.MultipartRequest('PUT', uri);
          if (token != null) request.headers['Authorization'] = 'Bearer $token';
          request.files.add(http.MultipartFile.fromBytes('file', fragmento, filename: file.name));
          final streamed = await request.send();
          await streamed.stream.bytesToString();
          
          if (streamed.statusCode != 200) {
            await _guardarPendiente(cargaId, i, _carpetaDestinoId);
            setState(() { _estado = 'Error en fragmento: ${streamed.statusCode}'; _subiendo = false; });
            return;
          }
          
          i = fin;
          await _guardarPendiente(cargaId, i, _carpetaDestinoId);
        }
        offset = bytes.length;
      } else {
        setState(() { _estado = 'No se pudo leer archivo'; _subiendo = false; });
        return;
      }
    }
    
    setState(() { _estado = 'Finalizando...'; });
    final fin = await http.post(
      Uri.parse('${ApiClient.baseUrl}/api/cargas/$cargaId/finalizar'),
      headers: {
        if (token != null) 'Authorization': 'Bearer $token',
      },
    );
    
    if (fin.statusCode == 200) {
      await _limpiarPendiente();
      setState(() { _estado = 'Completado'; });
    } else {
      await _guardarPendiente(cargaId, offset, _carpetaDestinoId);
      setState(() { _estado = 'Error al finalizar: ${fin.statusCode}'; });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text('Transferencias')),
      body: Padding(
        padding: EdgeInsets.all(16),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(_nombreCarpetaDestino != null
                      ? 'Carpeta: $_nombreCarpetaDestino (ID: $_carpetaDestinoId)'
                      : 'Carpeta destino ID: $_carpetaDestinoId'),
                ),
                ElevatedButton(
                  onPressed: _subiendo ? null : _seleccionarCarpeta,
                  child: Text('Elegir'),
                ),
              ],
            ),
            SizedBox(height: 16),
            ElevatedButton(
              onPressed: _subiendo ? null : _seleccionarYSubir,
              child: Text(_subiendo ? 'Subiendo...' : 'Seleccionar archivo para subir'),
            ),
            if (_cargaIdPendiente != null) ...[
              SizedBox(height: 8),
              ElevatedButton(
                onPressed: _subiendo ? null : _reanudarCarga,
                child: Text('Reanudar carga pendiente'),
              ),
            ],
            SizedBox(height: 16),
            if (_subiendo && _totalFragmentos > 0)
              LinearProgressIndicator(value: _fragmentoActual / _totalFragmentos),
            SizedBox(height: 8),
            Text(_estado),
          ],
        ),
      ),
    );
  }
}
