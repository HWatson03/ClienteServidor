import 'dart:convert';

import 'package:admin/core/api_client.dart';
import 'package:flutter/material.dart';

class PapeleraScreen extends StatefulWidget {
  const PapeleraScreen({super.key});

  @override
  State<PapeleraScreen> createState() => _PapeleraScreenState();
}

class _PapeleraScreenState extends State<PapeleraScreen> {
  final _apiClient = ApiClient();
  List<dynamic> _elementos = [];
  bool _cargando = true;
  String? _error;
  int? _restaurandoId;

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
      final response = await _apiClient.get('/api/papelera');
      if (response.statusCode != 200)
        throw Exception('HTTP ${response.statusCode}');
      final data = jsonDecode(response.body);
      if (mounted) setState(() => _elementos = data is List ? data : []);
    } catch (_) {
      if (mounted)
        setState(() => _error =
            'No pudimos abrir la papelera. Comprueba la conexión e inténtalo otra vez.');
    } finally {
      if (mounted) setState(() => _cargando = false);
    }
  }

  Future<void> _restaurar(Map<String, dynamic> item) async {
    final carpeta = item['tipo'] == 'CARPETA';
    final id = carpeta
        ? (item['idCarpeta'] ?? item['id'])
        : (item['idArchivo'] ?? item['id']);
    if (id == null) return;
    setState(() => _restaurandoId = id as int);
    try {
      final tipo = carpeta ? 'carpeta' : 'archivo';
      final response =
          await _apiClient.post('/api/papelera/$tipo/$id/restaurar', {});
      if (response.statusCode != 200 && response.statusCode != 204) {
        final detalle = _detalleError(response.body);
        if (detalle.toLowerCase().contains('carpeta') &&
            detalle.toLowerCase().contains('restaura')) {
          throw Exception(carpeta
              ? 'Primero restaura la carpeta superior y luego vuelve a intentarlo.'
              : 'Primero restaura la carpeta que contiene este archivo y luego vuelve a intentarlo.');
        }
        throw Exception(detalle);
      }
      final datosRestaurados = response.body.isEmpty
          ? <String, dynamic>{}
          : jsonDecode(response.body) as Map<String, dynamic>;
      final nombreOriginal =
          (item['nombreVisible'] ?? item['nombre'] ?? '').toString();
      final nombreRestaurado = (datosRestaurados['nombre'] ?? nombreOriginal)
          .toString();
      final mensaje = nombreRestaurado.isNotEmpty &&
              nombreRestaurado != nombreOriginal
          ? 'Restaurado como "$nombreRestaurado" porque ya existía un elemento con ese nombre.'
          : 'Elemento restaurado.';
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(mensaje)));
      }
      await _cargar();
    } catch (error) {
      if (mounted)
        ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text(error.toString().replaceFirst('Exception: ', ''))));
    } finally {
      if (mounted) setState(() => _restaurandoId = null);
    }
  }

  String _detalleError(String body) {
    if (body.isEmpty) return 'No se pudo restaurar el elemento.';
    try {
      final data = jsonDecode(body);
      if (data is Map<String, dynamic>) {
        return (data['detail'] ?? data['mensaje'] ?? data['message'] ??
                data['title'] ?? 'No se pudo restaurar el elemento.')
            .toString();
      }
    } catch (_) {}
    return 'No se pudo restaurar el elemento.';
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Papelera')),
        body: _cargando
            ? const Center(child: CircularProgressIndicator())
            : _error != null
                ? Center(
                    child: Padding(
                        padding: const EdgeInsets.all(28),
                        child:
                            Column(mainAxisSize: MainAxisSize.min, children: [
                          const Icon(Icons.cloud_off_rounded, size: 44),
                          const SizedBox(height: 12),
                          Text(_error!, textAlign: TextAlign.center),
                          TextButton(
                              onPressed: _cargar,
                              child: const Text('Reintentar'))
                        ])))
                : _elementos.isEmpty
                    ? Center(
                        child: Padding(
                          padding: const EdgeInsets.all(32),
                          child:
                              Column(mainAxisSize: MainAxisSize.min, children: [
                            Container(
                                width: 76,
                                height: 76,
                                decoration: const BoxDecoration(
                                    color: Color(0xFFEDEEFF),
                                    shape: BoxShape.circle),
                                child: const Icon(Icons.delete_outline_rounded,
                                    color: Color(0xFF5B5CE2), size: 38)),
                            const SizedBox(height: 18),
                            Text('La papelera está vacía',
                                style: Theme.of(context)
                                    .textTheme
                                    .titleMedium
                                    ?.copyWith(fontWeight: FontWeight.w600)),
                            const SizedBox(height: 8),
                            Text(
                                'Los archivos que elimines aparecerán aquí y podrás restaurarlos.',
                                textAlign: TextAlign.center,
                                style: TextStyle(
                                    color: Colors.blueGrey.shade500,
                                    height: 1.45)),
                          ]),
                        ),
                      )
                    : RefreshIndicator(
                        onRefresh: _cargar,
                        child: ListView.builder(
                          padding: const EdgeInsets.all(16),
                          itemCount: _elementos.length,
                          itemBuilder: (context, index) {
                            final item = Map<String, dynamic>.from(
                                _elementos[index] as Map);
                            final carpeta = item['tipo'] == 'CARPETA';
                            final id = carpeta
                                ? (item['idCarpeta'] ?? item['id'])
                                : (item['idArchivo'] ?? item['id']);
                            final restaurando =
                                id is int && id == _restaurandoId;
                            return Card(
                              elevation: 0,
                              margin: const EdgeInsets.only(bottom: 9),
                              child: ListTile(
                                leading: Container(
                                    width: 44,
                                    height: 44,
                                    decoration: BoxDecoration(
                                        color: const Color(0xFFFFEEEE),
                                        borderRadius:
                                            BorderRadius.circular(14)),
                                    child: Icon(
                                        carpeta
                                            ? Icons.folder_rounded
                                            : Icons.insert_drive_file_rounded,
                                        color: const Color(0xFFD45B65))),
                                title: Text(
                                    item['nombreVisible'] ??
                                        item['nombre'] ??
                                        'Elemento',
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    style: const TextStyle(
                                        fontWeight: FontWeight.w500)),
                                subtitle: Text(carpeta
                                    ? 'Carpeta eliminada'
                                    : 'Archivo eliminado'),
                                trailing: IconButton(
                                  tooltip: 'Restaurar',
                                  onPressed: restaurando
                                      ? null
                                      : () => _restaurar(item),
                                  icon: restaurando
                                      ? const SizedBox(
                                          width: 20,
                                          height: 20,
                                          child: CircularProgressIndicator(
                                              strokeWidth: 2))
                                      : const Icon(Icons.restore_rounded,
                                          color: Color(0xFF5B5CE2)),
                                ),
                              ),
                            );
                          },
                        ),
                      ),
      );
}
