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

  Future<void> _seleccionarYSubir() async {
    final result = await FilePicker.platform.pickFiles(withReadStream: true);
    if (result == null) return;
    final file = result.files.single;
    setState(() { _subiendo = true; _estado = 'Iniciando...'; });
    
    try {
      final resp = await _apiClient.post('/api/cargas', {
        'carpetaDestinoId': 1,
        'nombreArchivo': file.name,
        'tamanoEsperado': file.size,
      });
      
      if (resp.statusCode != 201 && resp.statusCode != 200) {
        setState(() { _estado = 'Error al iniciar'; _subiendo = false; });
        return;
      }
      
      final data = _apiClient.getToken().then((t) => null);
      // Parse cargaId
      final json = resp.body;
      final match = RegExp(r'"idCarga":(\d+)').firstMatch(json);
      if (match == null) {
        setState(() { _estado = 'Error al obtener carga'; _subiendo = false; });
        return;
      }
      final cargaId = match.group(1);
      final token = await _apiClient.getToken();
      
      setState(() { _estado = 'Subiendo fragmentos...'; });
      
      // Leer archivo completo
      List<int> bytes;
      if (file.bytes != null) {
        bytes = file.bytes!;
      } else if (file.path != null) {
        bytes = await File(file.path!).readAsBytes();
      } else {
        setState(() { _estado = 'No se pudo leer archivo'; _subiendo = false; });
        return;
      }
      
      final uri = Uri.parse('${ApiClient.baseUrl}/api/cargas/$cargaId/fragmento?offset=0');
      final request = http.MultipartRequest('PUT', uri);
      if (token != null) request.headers['Authorization'] = 'Bearer $token';
      request.files.add(http.MultipartFile.fromBytes('file', bytes, filename: file.name));
      final streamed = await request.send();
      await streamed.stream.bytesToString();
      
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
            Text(_estado),
          ],
        ),
      ),
    );
  }
}
