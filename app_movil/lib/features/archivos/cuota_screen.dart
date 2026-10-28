import 'dart:convert';

import 'package:admin/core/api_client.dart';
import 'package:flutter/material.dart';

class CuotaScreen extends StatefulWidget {
  const CuotaScreen({super.key});

  @override
  State<CuotaScreen> createState() => _CuotaScreenState();
}

class _CuotaScreenState extends State<CuotaScreen> {
  final _apiClient = ApiClient();
  Map<String, dynamic> _resumen = {};
  bool _cargando = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _cargar();
  }

  Future<void> _cargar() async {
    setState(() {
      _cargando = true;
      _error = null;
    });
    try {
      final response = await _apiClient.get('/api/almacenamiento/resumen');
      if (response.statusCode != 200)
        throw Exception('HTTP ${response.statusCode}');
      if (mounted) setState(() => _resumen = jsonDecode(response.body));
    } catch (_) {
      if (mounted)
        setState(() => _error =
            'No pudimos consultar tu espacio. Revisa la conexión e inténtalo otra vez.');
    } finally {
      if (mounted) setState(() => _cargando = false);
    }
  }

  String _tamano(num valor) {
    const unidades = ['B', 'KB', 'MB', 'GB', 'TB'];
    var numero = valor.toDouble();
    var unidad = 0;
    while (numero >= 1024 && unidad < unidades.length - 1) {
      numero /= 1024;
      unidad++;
    }
    return '${numero.toStringAsFixed(unidad == 0 ? 0 : 1)} ${unidades[unidad]}';
  }

  @override
  Widget build(BuildContext context) {
    final limite = (_resumen['limite'] as num?)?.toDouble() ?? 0;
    final ocupados = (_resumen['ocupados'] as num?)?.toDouble() ?? 0;
    final reservados = (_resumen['reservados'] as num?)?.toDouble() ?? 0;
    final disponibles = (_resumen['disponibles'] as num?)?.toDouble() ?? 0;
    final usados = ocupados + reservados;
    final progreso =
        limite <= 0 ? 0.0 : (usados / limite).clamp(0.0, 1.0).toDouble();
    final porcentaje = (progreso * 100).round();

    return Scaffold(
      appBar: AppBar(title: const Text('Mi espacio')),
      body: _cargando
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(
                  child: Padding(
                      padding: const EdgeInsets.all(28),
                      child: Column(mainAxisSize: MainAxisSize.min, children: [
                        const Icon(Icons.cloud_off_rounded, size: 44),
                        const SizedBox(height: 12),
                        Text(_error!, textAlign: TextAlign.center),
                        TextButton(
                            onPressed: _cargar, child: const Text('Reintentar'))
                      ])))
              : RefreshIndicator(
                  onRefresh: _cargar,
                  child: ListView(
                    padding: const EdgeInsets.all(20),
                    children: [
                      Container(
                        padding: const EdgeInsets.all(24),
                        decoration: BoxDecoration(
                          gradient: const LinearGradient(
                              colors: [Color(0xFF5354D3), Color(0xFF8586F1)],
                              begin: Alignment.topLeft,
                              end: Alignment.bottomRight),
                          borderRadius: BorderRadius.circular(26),
                        ),
                        child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const Icon(Icons.cloud_done_rounded,
                                  color: Colors.white, size: 34),
                              const SizedBox(height: 20),
                              const Text('Espacio utilizado',
                                  style: TextStyle(color: Colors.white70)),
                              const SizedBox(height: 5),
                              Text('${_tamano(usados)} de ${_tamano(limite)}',
                                  style: const TextStyle(
                                      color: Colors.white,
                                      fontSize: 24,
                                      fontWeight: FontWeight.w700)),
                              const SizedBox(height: 20),
                              ClipRRect(
                                  borderRadius: BorderRadius.circular(20),
                                  child: LinearProgressIndicator(
                                      value: progreso,
                                      minHeight: 10,
                                      backgroundColor: Colors.white24,
                                      color: Colors.white)),
                              const SizedBox(height: 9),
                              Text('$porcentaje% utilizado',
                                  style: const TextStyle(
                                      color: Colors.white70, fontSize: 12)),
                            ]),
                      ),
                      const SizedBox(height: 20),
                      _DatoEspacio(
                          icon: Icons.folder_rounded,
                          color: const Color(0xFF5B5CE2),
                          label: 'Archivos guardados',
                          valor: _tamano(ocupados)),
                      const SizedBox(height: 10),
                      _DatoEspacio(
                          icon: Icons.sync_rounded,
                          color: const Color(0xFFE9A63A),
                          label: 'Cargas en curso',
                          valor: _tamano(reservados)),
                      const SizedBox(height: 10),
                      _DatoEspacio(
                          icon: Icons.check_circle_outline_rounded,
                          color: const Color(0xFF35A47A),
                          label: 'Espacio disponible',
                          valor: _tamano(disponibles)),
                      const SizedBox(height: 16),
                      Text('Desliza hacia abajo para actualizar.',
                          textAlign: TextAlign.center,
                          style: TextStyle(
                              color: Colors.blueGrey.shade400, fontSize: 12)),
                    ],
                  ),
                ),
    );
  }
}

class _DatoEspacio extends StatelessWidget {
  const _DatoEspacio(
      {required this.icon,
      required this.color,
      required this.label,
      required this.valor});
  final IconData icon;
  final Color color;
  final String label;
  final String valor;

  @override
  Widget build(BuildContext context) => Card(
        elevation: 0,
        child: ListTile(
          leading: Container(
              width: 42,
              height: 42,
              decoration: BoxDecoration(
                  color: color.withValues(alpha: .12),
                  borderRadius: BorderRadius.circular(13)),
              child: Icon(icon, color: color)),
          title: Text(label,
              style: TextStyle(color: Colors.blueGrey.shade600, fontSize: 13)),
          subtitle: Text(valor,
              style:
                  const TextStyle(fontWeight: FontWeight.w600, fontSize: 16)),
        ),
      );
}
