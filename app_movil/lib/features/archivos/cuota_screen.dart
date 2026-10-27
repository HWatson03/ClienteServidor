import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:admin/core/api_client.dart';
import 'package:shared_preferences/shared_preferences.dart';

class CuotaScreen extends StatefulWidget {
  const CuotaScreen({super.key});

  @override
  State<CuotaScreen> createState() => _CuotaScreenState();
}

class _CuotaScreenState extends State<CuotaScreen> {
  final _apiClient = ApiClient();
  Map<String, dynamic> resumen = {};

  @override
  void initState() {
    super.initState();
    _cargar();
  }

  Future<void> _cargar() async {
    final prefs = await SharedPreferences.getInstance();
    final usuario = prefs.getString('nombreUsuario') ?? '';
    final resp = await _apiClient.get('/api/almacenamiento/resumen?nombreUsuario=$usuario');
    if (resp.statusCode == 200) {
      setState(() {
        resumen = jsonDecode(resp.body);
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final limite = resumen['limite'] ?? 1000000000;
    final ocupados = resumen['ocupados'] ?? 0;
    final reservados = resumen['reservados'] ?? 0;
    final disponibles = resumen['disponibles'] ?? limite;
    
    return Scaffold(
      appBar: AppBar(title: Text('Espacio')),
      body: Padding(
        padding: EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Límite: $limite bytes'),
            Text('Ocupados: $ocupados bytes'),
            Text('Reservados: $reservados bytes'),
            Text('Disponibles: $disponibles bytes'),
            SizedBox(height: 16),
            LinearProgressIndicator(value: limite > 0 ? (ocupados + reservados) / limite : 0),
          ],
        ),
      ),
    );
  }
}
