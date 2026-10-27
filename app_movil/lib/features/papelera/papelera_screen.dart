import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:admin/core/api_client.dart';
import 'package:shared_preferences/shared_preferences.dart';

class PapeleraScreen extends StatefulWidget {
  const PapeleraScreen({super.key});

  @override
  State<PapeleraScreen> createState() => _PapeleraScreenState();
}

class _PapeleraScreenState extends State<PapeleraScreen> {
  final _apiClient = ApiClient();
  List<dynamic> elementos = [];

  @override
  void initState() {
    super.initState();
    _cargar();
  }

  Future<void> _cargar() async {
    final prefs = await SharedPreferences.getInstance();
    final usuario = prefs.getString('nombreUsuario') ?? '';
    final resp = await _apiClient.get('/api/papelera?nombreUsuario=$usuario');
    if (resp.statusCode == 200) {
      setState(() {
        final data = jsonDecode(resp.body);
        elementos = data is List ? data : [];
      });
    }
  }

  Future<void> _restaurar(int id) async {
    final prefs = await SharedPreferences.getInstance();
    final usuario = prefs.getString('nombreUsuario') ?? '';
    await _apiClient.post('/api/papelera/archivo/$id/restaurar?nombreUsuario=$usuario', {});
    _cargar();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text('Papelera')),
      body: ListView.builder(
        itemCount: elementos.length,
        itemBuilder: (context, index) {
          final item = elementos[index];
          return ListTile(
            leading: Icon(Icons.delete),
            title: Text(item['nombreVisible'] ?? item['nombre'] ?? ''),
            trailing: IconButton(
              icon: Icon(Icons.restore),
              onPressed: () => _restaurar(item['idArchivo'] ?? item['id'] ?? 0),
            ),
          );
        },
      ),
    );
  }
}
