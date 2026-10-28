import 'dart:io';
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

  Future<void> _seleccionarYSubir() async {
    final result = await FilePicker.platform.pickFiles(withReadStream: true);
    if (result == null) return;
    final file = result.files.single;
    
    setState(() { _subiendo = true; _estado = 'Iniciando...'; });
    
    try {
      final prefs = await SharedPreferences.getInstance();
      final token = await _apiClient.getToken();
      
      // Iniciar carga
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
      
      final fileSize = file.size;
      _totalFragmentos = (fileSize / _tamanoFragmento).ceil();
      if (_totalFragmentos == 0) _totalFragmentos = 1;
      
      // Subir por fragmentos según disponibilidad
      if (file.path != null) {
        // Usar RandomAccessFile para no cargar todo en memoria
        final raf = await File(file.path!).open();
        try {
          int offset = 0;
          while (offset < fileSize) {
            final fin = (offset + _tamanoFragmento).clamp(0, fileSize);
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
              setState(() { _estado = 'Error en fragmento: ${streamed.statusCode}'; _subiendo = false; });
              return;
            }
            
            offset = fin;
          }
        } finally {
          await raf.close();
        }
      } else if (file.readStream != null) {
        // Usar stream directamente sin acumular
        int offset = 0;
        final buffer = <int>[];
        await for (final chunk in file.readStream!) {
          buffer.addAll(chunk);
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
              setState(() { _estado = 'Error en fragmento: ${streamed.statusCode}'; _subiendo = false; });
              return;
            }
            
            offset += fragmento.length;
          }
        }
        // Enviar resto
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
            setState(() { _estado = 'Error en fragmento: ${streamed.statusCode}'; _subiendo = false; });
            return;
          }
        }
      } else if (file.bytes != null) {
        // Bytes ya en memoria - usar directamente
        final bytes = file.bytes!;
        int offset = 0;
        while (offset < bytes.length) {
          final fin = (offset + _tamanoFragmento).clamp(0, bytes.length);
          final fragmento = bytes.sublist(offset, fin);
          
          _fragmentoActual++;
          setState(() { _estado = 'Fragmento $_fragmentoActual/$_totalFragmentos'; });
          
          final uri = Uri.parse('${ApiClient.baseUrl}/api/cargas/$cargaId/fragmento?offset=$offset');
          final request = http.MultipartRequest('PUT', uri);
          if (token != null) request.headers['Authorization'] = 'Bearer $token';
          request.files.add(http.MultipartFile.fromBytes('file', fragmento, filename: file.name));
          final streamed = await request.send();
          await streamed.stream.bytesToString();
          
          if (streamed.statusCode != 200) {
            setState(() { _estado = 'Error en fragmento: ${streamed.statusCode}'; _subiendo = false; });
            return;
          }
          
          offset = fin;
        }
      } else {
        setState(() { _estado = 'No se pudo leer archivo'; _subiendo = false; });
        return;
      }
      
      setState(() { _estado = 'Finalizando...'; });
      final fin = await http.post(
        Uri.parse('${ApiClient.baseUrl}/api/cargas/$cargaId/finalizar'),
        headers: {
          if (token != null) 'Authorization': 'Bearer $token',
        },
      );
      
      if (fin.statusCode == 200) {
        setState(() { _estado = 'Completado'; });
      } else {
        setState(() { _estado = 'Error al finalizar: ${fin.statusCode}'; });
      }
    } catch (e) {
      setState(() { _estado = 'Error: $e'; });
    } finally {
      setState(() { _subiendo = false; });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text('Transferencias')),
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            ElevatedButton(
              onPressed: _subiendo ? null : _seleccionarYSubir,
              child: Text(_subiendo ? 'Subiendo...' : 'Seleccionar archivo para subir'),
            ),
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
