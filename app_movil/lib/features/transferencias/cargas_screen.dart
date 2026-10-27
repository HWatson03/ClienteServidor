import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:admin/core/api_client.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:file_picker/file_picker.dart';

class CargasScreen extends StatefulWidget {
  const CargasScreen({super.key});

  @override
  State<CargasScreen> createState() => _CargasScreenState();
}

class _CargasScreenState extends State<CargasScreen> {
  final _apiClient = ApiClient();

  Future<void> _seleccionarYSubir() async {
    final result = await FilePicker.platform.pickFiles(withReadStream: true);
    if (result == null) return;
    final file = result.files.single;
    final prefs = await SharedPreferences.getInstance();
    final usuario = prefs.getString('nombreUsuario') ?? '';
    
    final resp = await _apiClient.post('/api/cargas?nombreUsuario=$usuario', {
      'carpetaDestinoId': 1,
      'nombreArchivo': file.name,
      'tamanoEsperado': file.size,
    });
    
    if (resp.statusCode == 200) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Carga iniciada: ${file.name}')),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text('Transferencias')),
      body: Center(
        child: ElevatedButton(
          onPressed: _seleccionarYSubir,
          child: Text('Seleccionar archivo para subir'),
        ),
      ),
    );
  }
}
