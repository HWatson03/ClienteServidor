import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:admin/core/api_client.dart';
import 'package:shared_preferences/shared_preferences.dart';

class ExploradorScreen extends StatefulWidget {
  const ExploradorScreen({super.key});

  @override
  State<ExploradorScreen> createState() => _ExploradorScreenState();
}

class _ExploradorScreenState extends State<ExploradorScreen> {
  final _apiClient = ApiClient();
  List<dynamic> carpetas = [];
  List<dynamic> archivos = [];
  bool _cargando = false;

  @override
  void initState() {
    super.initState();
    _cargar();
  }

  Future<void> _cargar({String? nombre}) async {
    setState(() => _cargando = true);
    try {
      final prefs = await SharedPreferences.getInstance();
      final usuario = prefs.getString('nombreUsuario') ?? '';
      final url = nombre != null && nombre.isNotEmpty
          ? '/api/archivos?nombreUsuario=$usuario&nombre=$nombre'
          : '/api/archivos?nombreUsuario=$usuario';
      final respCarpetas = await _apiClient.get('/api/carpetas?nombreUsuario=$usuario');
      final respArchivos = await _apiClient.get(url);
      if (respCarpetas.statusCode == 200) {
        carpetas = jsonDecode(respCarpetas.body);
      }
      if (respArchivos.statusCode == 200) {
        final data = jsonDecode(respArchivos.body);
        archivos = data['content'] ?? data;
      }
    } finally {
      setState(() => _cargando = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text('Explorador')),
      body: _cargando
          ? Center(child: CircularProgressIndicator())
          : ListView(
              children: [
                ...carpetas.map((c) => ListTile(
                      leading: Icon(Icons.folder),
                      title: Text(c['nombre'] ?? ''),
                    )),
                ...archivos.map((a) => ListTile(
                      leading: Icon(Icons.insert_drive_file),
                      title: Text(a['nombreVisible'] ?? ''),
                      subtitle: Text('${a['tamano'] ?? 0} bytes'),
                    )),
              ],
            ),
    );
  }
}
