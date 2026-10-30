import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:admin/core/api_client.dart';
import 'package:admin/features/transferencias/cargas_screen.dart';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:open_filex/open_filex.dart';
import 'package:path_provider/path_provider.dart';

class ExploradorScreen extends StatefulWidget {
  const ExploradorScreen({super.key});

  @override
  State<ExploradorScreen> createState() => _ExploradorScreenState();
}

class _ExploradorScreenState extends State<ExploradorScreen> {
  final _apiClient = ApiClient();
  final _busquedaController = TextEditingController();
  final List<_CarpetaRuta> _ruta = [];
  List<dynamic> _carpetas = [];
  List<dynamic> _archivos = [];
  bool _cargando = true;
  String? _error;
  int? _descargandoId;
  int? _eliminandoId;
  int? _renombrandoId;
  int? _previsualizandoId;
  int? _raizId;
  bool _vistaGrilla = true;
  String _busqueda = '';
  Timer? _temporizadorBusqueda;
  int _solicitudActual = 0;
  final Map<int, Future<Uint8List?>> _miniaturas = {};

  int? get _carpetaActualId => _ruta.isEmpty ? _raizId : _ruta.last.id;
  String get _nombreCarpetaActual =>
      _ruta.isEmpty ? 'Mis archivos' : _ruta.last.nombre;

  @override
  void initState() {
    super.initState();
    _cargar();
  }

  @override
  void dispose() {
    _temporizadorBusqueda?.cancel();
    _busquedaController.dispose();
    super.dispose();
  }

  void _cambioBusqueda(String valor) {
    setState(() => _busqueda = valor);
    _temporizadorBusqueda?.cancel();
    _temporizadorBusqueda = Timer(
      const Duration(milliseconds: 350),
      _cargar,
    );
  }

  Future<void> _cargar() async {
    final solicitud = ++_solicitudActual;
    setState(() {
      _cargando = true;
      _error = null;
    });
    try {
      final carpetaId = _carpetaActualId;
      if (carpetaId == null) {
        final rootResponse = await _apiClient.get('/api/carpetas/raiz');
        if (rootResponse.statusCode != 200)
          throw Exception('No se encontró la carpeta raíz');
        _raizId = (jsonDecode(rootResponse.body)
            as Map<String, dynamic>)['idCarpeta'] as int;
      }
      final busqueda = _busqueda.trim();
      List<dynamic> carpetas = [];
      dynamic archivosData;
      if (busqueda.isNotEmpty) {
        final respuesta = await _apiClient.get(
            '/api/archivos?nombre=${Uri.encodeQueryComponent(busqueda)}');
        if (respuesta.statusCode != 200) {
          throw Exception('El servidor respondió ${respuesta.statusCode}');
        }
        archivosData = jsonDecode(respuesta.body);
      } else {
        final id = _carpetaActualId!;
        final responses = await Future.wait([
          _apiClient.get('/api/carpetas?padreId=$id'),
          _apiClient.get('/api/archivos?carpetaId=$id'),
        ]);
        if (responses[0].statusCode != 200 ||
            responses[1].statusCode != 200) {
          throw Exception(
              'El servidor respondió ${responses[0].statusCode}/${responses[1].statusCode}');
        }
        carpetas = jsonDecode(responses[0].body) as List<dynamic>;
        archivosData = jsonDecode(responses[1].body);
      }
      if (!mounted || solicitud != _solicitudActual) return;
      setState(() {
        _carpetas = carpetas;
        _archivos = archivosData is Map
            ? (archivosData['content'] as List<dynamic>? ?? [])
            : (archivosData as List<dynamic>);
      });
    } catch (_) {
      if (mounted && solicitud == _solicitudActual)
        setState(() => _error =
            'No pudimos cargar tus archivos. Revisa la conexión con el servidor e inténtalo otra vez.');
    } finally {
      if (mounted && solicitud == _solicitudActual) {
        setState(() => _cargando = false);
      }
    }
  }

  void _abrirCarpeta(Map<String, dynamic> carpeta) {
    setState(() => _ruta.add(_CarpetaRuta(carpeta['idCarpeta'] as int,
        carpeta['nombre'] as String? ?? 'Carpeta')));
    _cargar();
  }

  void _volverCarpeta() {
    if (_ruta.isEmpty) return;
    setState(() => _ruta.removeLast());
    _cargar();
  }

  Future<void> _crearCarpeta() async {
    final controller = TextEditingController();
    final nombre = await showDialog<String>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Nueva carpeta'),
        content: TextField(
          controller: controller,
          autofocus: true,
          textCapitalization: TextCapitalization.sentences,
          decoration: const InputDecoration(labelText: 'Nombre de la carpeta'),
          onSubmitted: (value) => Navigator.pop(context, value.trim()),
        ),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Cancelar')),
          FilledButton(
              onPressed: () => Navigator.pop(context, controller.text.trim()),
              child: const Text('Crear')),
        ],
      ),
    );
    controller.dispose();
    if (nombre == null || nombre.isEmpty) return;
    final response = await _apiClient.post('/api/carpetas', {
      'carpetaPadreId': _carpetaActualId,
      'nombre': nombre,
    });
    if (!mounted) return;
    if (response.statusCode == 201 || response.statusCode == 200) {
      final carpeta = jsonDecode(response.body) as Map<String, dynamic>;
      setState(() {
        _ruta.add(_CarpetaRuta(
          (carpeta['idCarpeta'] as num).toInt(),
          carpeta['nombre'] as String? ?? nombre,
        ));
      });
      await _cargar();
    } else {
      _mensaje('No se pudo crear la carpeta.');
    }
  }

  Future<void> _enviarAPapelera(Map<String, dynamic> archivo) async {
    final id = archivo['idArchivo'] as int?;
    final nombre = archivo['nombreVisible'] as String? ?? 'este archivo';
    if (id == null) return;
    final confirmar = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        icon: const Icon(Icons.delete_outline_rounded,
            color: Color(0xFFD45B65), size: 30),
        title: const Text('¿Estás seguro de eliminar este archivo?'),
        content: Text(
            '“$nombre” se moverá a la papelera. Podrás restaurarlo después.'),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('Cancelar')),
          FilledButton.icon(
              onPressed: () => Navigator.pop(context, true),
              icon: const Icon(Icons.delete_outline_rounded),
              label: const Text('Sí, eliminar')),
        ],
      ),
    );
    if (confirmar != true) return;
    setState(() => _eliminandoId = id);
    try {
      final response = await http.delete(
        Uri.parse('${ApiClient.baseUrl}/api/papelera/archivos/$id'),
        headers: await _apiClient.headers(),
      );
      if (response.statusCode != 200 && response.statusCode != 204) {
        throw Exception('HTTP ${response.statusCode}');
      }
      if (!mounted) return;
      _mensaje('Archivo movido a la papelera.');
      await _cargar();
    } catch (_) {
      if (mounted) _mensaje('No se pudo mover el archivo a la papelera. Inténtalo de nuevo.');
    } finally {
      if (mounted) setState(() => _eliminandoId = null);
    }
  }

  Future<void> _renombrarArchivo(Map<String, dynamic> archivo) async {
    final id = archivo['idArchivo'] as int?;
    final nombreActual = archivo['nombreVisible'] as String? ?? '';
    if (id == null) return;

    final controller = TextEditingController(text: nombreActual);
    final formKey = GlobalKey<FormState>();
    final nuevoNombre = await showDialog<String>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Renombrar archivo'),
        content: Form(
          key: formKey,
          child: TextFormField(
            controller: controller,
            autofocus: true,
            textCapitalization: TextCapitalization.sentences,
            decoration: const InputDecoration(labelText: 'Nombre del archivo'),
            validator: (value) => value == null || value.trim().isEmpty
                ? 'Escribe un nombre para el archivo.'
                : null,
            onFieldSubmitted: (_) {
              if (formKey.currentState!.validate()) {
                Navigator.pop(context, controller.text.trim());
              }
            },
          ),
        ),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Cancelar')),
          FilledButton.icon(
            onPressed: () {
              if (formKey.currentState!.validate()) {
                Navigator.pop(context, controller.text.trim());
              }
            },
            icon: const Icon(Icons.check_rounded),
            label: const Text('Guardar'),
          ),
        ],
      ),
    );
    controller.dispose();
    if (nuevoNombre == null || nuevoNombre.trim().isEmpty) return;
    if (nuevoNombre.trim().toLowerCase() == nombreActual.toLowerCase()) return;

    setState(() => _renombrandoId = id);
    try {
      final response = await http.patch(
        Uri.parse('${ApiClient.baseUrl}/api/archivos/$id'),
        headers: await _apiClient.headers(),
        body: jsonEncode({'nombre': nuevoNombre.trim()}),
      );
      if (response.statusCode != 200 && response.statusCode != 204) {
        String detalle = 'No se pudo renombrar el archivo.';
        try {
          final body = jsonDecode(response.body);
          if (body is Map<String, dynamic>) {
            detalle = (body['detail'] ?? body['mensaje'] ?? body['message'] ?? detalle)
                .toString();
          }
        } catch (_) {}
        throw Exception(detalle);
      }
      final datos = response.body.isEmpty
          ? <String, dynamic>{}
          : jsonDecode(response.body) as Map<String, dynamic>;
      final nombreFinal = (datos['nombre'] ?? nuevoNombre.trim()).toString();
      await _cargar();
      if (mounted) {
        _mensaje(nombreFinal == nuevoNombre.trim()
            ? 'Archivo renombrado.'
            : 'Archivo renombrado como "$nombreFinal" porque ese nombre ya existía.');
      }
    } catch (error) {
      if (mounted) {
        _mensaje(error.toString().replaceFirst('Exception: ', ''));
      }
    } finally {
      if (mounted) setState(() => _renombrandoId = null);
    }
  }

  Future<void> _subirArchivo() async {
    await Navigator.push<bool>(
      context,
      MaterialPageRoute<bool>(
        builder: (_) => CargasScreen(
          carpetaDestinoId: _carpetaActualId,
          nombreCarpetaDestino: _nombreCarpetaActual,
        ),
      ),
    );
    if (mounted) await _cargar();
  }

  Future<void> _descargarArchivo(Map<String, dynamic> archivo) async {
    final id = archivo['idArchivo'] as int?;
    final nombre = archivo['nombreVisible'] as String? ?? 'archivo';
    if (id == null) return;
    setState(() => _descargandoId = id);
    try {
      final token = await _apiClient.getToken();
      final response = await http.get(
        Uri.parse('${ApiClient.baseUrl}/api/archivos/$id/descargar'),
        headers: {if (token != null) 'Authorization': 'Bearer $token'},
      );
      if (response.statusCode != 200)
        throw Exception('HTTP ${response.statusCode}');
      final guardado = await FilePicker.platform.saveFile(
        dialogTitle: 'Guardar archivo en el teléfono',
        fileName: nombre,
        bytes: response.bodyBytes,
      );
      if (!mounted) return;
      _mensaje(guardado == null
          ? 'Descarga cancelada.'
          : 'Archivo guardado en el teléfono.');
    } catch (_) {
      if (mounted)
        _mensaje(
            'No se pudo descargar el archivo. Comprueba la conexión e inténtalo otra vez.');
    } finally {
      if (mounted) setState(() => _descargandoId = null);
    }
  }

  Future<void> _previsualizarImagen(Map<String, dynamic> archivo) async {
    final id = archivo['idArchivo'] as int?;
    final nombre = archivo['nombreVisible'] as String? ?? 'Imagen';
    if (id == null) return;
    setState(() => _previsualizandoId = id);
    try {
      final token = await _apiClient.getToken();
      final response = await http.get(
        Uri.parse('${ApiClient.baseUrl}/api/archivos/$id/descargar'),
        headers: {if (token != null) 'Authorization': 'Bearer $token'},
      );
      if (response.statusCode != 200) {
        throw Exception('HTTP ${response.statusCode}');
      }
      if (!mounted) return;
      await Navigator.push<void>(
        context,
        MaterialPageRoute<void>(
          builder: (_) =>
              _VistaImagen(nombre: nombre, bytes: response.bodyBytes),
        ),
      );
    } catch (_) {
      if (mounted) _mensaje('No se pudo abrir la vista previa de esta imagen.');
    } finally {
      if (mounted) setState(() => _previsualizandoId = null);
    }
  }

  Future<Uint8List?> _cargarMiniatura(int id) {
    return _miniaturas.putIfAbsent(id, () async {
      try {
        final token = await _apiClient.getToken();
        final response = await http.get(
          Uri.parse('${ApiClient.baseUrl}/api/archivos/$id/descargar'),
          headers: {if (token != null) 'Authorization': 'Bearer $token'},
        );
        if (response.statusCode != 200) return null;
        return response.bodyBytes;
      } catch (_) {
        return null;
      }
    });
  }

  Future<void> _abrirVideo(Map<String, dynamic> archivo) async {
    if (kIsWeb) {
      await _descargarArchivo(archivo);
      return;
    }
    final id = archivo['idArchivo'] as int?;
    final nombre = archivo['nombreVisible'] as String? ?? 'video';
    if (id == null) return;
    setState(() => _descargandoId = id);
    try {
      final token = await _apiClient.getToken();
      final response = await http.get(
        Uri.parse('${ApiClient.baseUrl}/api/archivos/$id/descargar'),
        headers: {if (token != null) 'Authorization': 'Bearer $token'},
      );
      if (response.statusCode != 200) throw Exception('HTTP ${response.statusCode}');
      final directory = await getTemporaryDirectory();
      final extension = nombre.contains('.') ? nombre.split('.').last : 'mp4';
      final safeName = nombre.replaceAll(RegExp(r'[^a-zA-Z0-9._-]'), '_');
      final file = File('${directory.path}/video_${id}_$safeName');
      await file.writeAsBytes(response.bodyBytes, flush: true);
      final result = await OpenFilex.open(file.path, type: 'video/$extension');
      if (result.type != ResultType.done && mounted) {
        _mensaje('No se pudo abrir el video con el reproductor del teléfono.');
      }
    } catch (_) {
      if (mounted) _mensaje('No se pudo abrir el video. Comprueba la conexión e inténtalo otra vez.');
    } finally {
      if (mounted) setState(() => _descargandoId = null);
    }
  }

  bool _esVideo(String nombre, String? mime) {
    if (mime?.startsWith('video/') == true) return true;
    return const {'mp4', 'mov', 'm4v', 'webm', 'mkv', 'avi', '3gp'}
        .contains(nombre.split('.').last.toLowerCase());
  }

  Widget _miniatura(Map<String, dynamic> archivo, {bool grande = false}) {
    final id = archivo['idArchivo'] as int?;
    if (id == null) return const Icon(Icons.image_rounded);
    return FutureBuilder<Uint8List?>(
      future: _cargarMiniatura(id),
      builder: (context, snapshot) {
        final bytes = snapshot.data;
        if (bytes == null) {
          return Container(
            color: const Color(0xFFEDEEFF),
            alignment: Alignment.center,
            child: Icon(Icons.image_rounded,
                size: grande ? 42 : 24, color: const Color(0xFF5B5CE2)),
          );
        }
        return Image.memory(bytes, fit: BoxFit.cover,
            errorBuilder: (_, __, ___) => const Icon(Icons.broken_image_rounded));
      },
    );
  }

  void _mensaje(String texto) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(texto)));
  }

  String _formatearTamano(dynamic valor) {
    final bytes = (valor as num?)?.toDouble() ?? 0;
    if (bytes < 1024) return '${bytes.toInt()} B';
    if (bytes < 1024 * 1024) return '${(bytes / 1024).toStringAsFixed(1)} KB';
    if (bytes < 1024 * 1024 * 1024)
      return '${(bytes / (1024 * 1024)).toStringAsFixed(1)} MB';
    return '${(bytes / (1024 * 1024 * 1024)).toStringAsFixed(2)} GB';
  }

  @override
  Widget build(BuildContext context) {
    final itemsCount = _carpetas.length + _archivos.length;
    final buscando = _busqueda.trim().isNotEmpty;
    return Scaffold(
      appBar: AppBar(
        leading: _ruta.isEmpty
            ? null
            : IconButton(
                onPressed: _volverCarpeta,
                icon: const Icon(Icons.arrow_back_rounded)),
        title: Text(_nombreCarpetaActual,
            style: const TextStyle(fontWeight: FontWeight.w600)),
        actions: [
          IconButton(
              tooltip: _vistaGrilla ? 'Vista de lista' : 'Vista de grilla',
              onPressed: () => setState(() => _vistaGrilla = !_vistaGrilla),
              icon: Icon(_vistaGrilla
                  ? Icons.view_list_rounded
                  : Icons.grid_view_rounded)),
          IconButton(
              tooltip: 'Actualizar',
              onPressed: _cargar,
              icon: const Icon(Icons.refresh_rounded)),
          IconButton(
              tooltip: 'Crear carpeta',
              onPressed: _crearCarpeta,
              icon: const Icon(Icons.create_new_folder_outlined)),
          const SizedBox(width: 4),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _subirArchivo,
        icon: const Icon(Icons.upload_rounded),
        label: const Text('Subir archivo'),
      ),
      body: RefreshIndicator(
        onRefresh: _cargar,
        child: _cargando
            ? const Center(child: CircularProgressIndicator())
            : _error != null
                ? ListView(children: [
                    const SizedBox(height: 120),
                    Icon(Icons.cloud_off_rounded,
                        size: 48, color: Colors.blueGrey.shade300),
                    const SizedBox(height: 16),
                    Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 32),
                        child: Text(_error!, textAlign: TextAlign.center)),
                    Center(
                        child: TextButton.icon(
                            onPressed: _cargar,
                            icon: const Icon(Icons.refresh),
                            label: const Text('Reintentar')))
                  ])
                : ListView(
                    padding: const EdgeInsets.fromLTRB(18, 8, 18, 100),
                    children: [
                      TextField(
                        controller: _busquedaController,
                        onChanged: _cambioBusqueda,
                        textInputAction: TextInputAction.search,
                        decoration: InputDecoration(
                          hintText: 'Buscar archivos por nombre',
                          prefixIcon: const Icon(Icons.search_rounded),
                          suffixIcon: _busqueda.isEmpty
                              ? null
                              : IconButton(
                                  tooltip: 'Limpiar búsqueda',
                                  onPressed: () {
                                    _busquedaController.clear();
                                    _cambioBusqueda('');
                                  },
                                  icon: const Icon(Icons.close_rounded),
                                ),
                          filled: true,
                          fillColor: Colors.white,
                          border: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(16),
                            borderSide: BorderSide.none,
                          ),
                        ),
                      ),
                      const SizedBox(height: 16),
                      _ResumenArchivos(
                          cantidad: itemsCount,
                          carpeta: buscando
                              ? 'Resultados en todos tus archivos'
                              : _nombreCarpetaActual),
                      const SizedBox(height: 20),
                      if (itemsCount == 0)
                        buscando
                            ? Padding(
                                padding: const EdgeInsets.symmetric(
                                    vertical: 48, horizontal: 20),
                                child: Column(children: [
                                  Icon(Icons.search_off_rounded,
                                      size: 46,
                                      color: Colors.blueGrey.shade300),
                                  const SizedBox(height: 12),
                                  Text(
                                      'No encontramos archivos con “${_busqueda.trim()}”.',
                                      textAlign: TextAlign.center,
                                      style: TextStyle(
                                          color: Colors.blueGrey.shade600)),
                                ]),
                              )
                            : _Vacio(
                                onUpload: _subirArchivo,
                                onCreateFolder: _crearCarpeta)
                      else ...[
                        if (_carpetas.isNotEmpty) ...[
                          const _SectionTitle(title: 'Carpetas'),
                          const SizedBox(height: 8),
                          ..._carpetas.map((raw) {
                            final carpeta =
                                Map<String, dynamic>.from(raw as Map);
                            return Card(
                              elevation: 0,
                              margin: const EdgeInsets.only(bottom: 8),
                              child: ListTile(
                                onTap: () => _abrirCarpeta(carpeta),
                                leading: _IconoArchivo(
                                    icon: Icons.folder_rounded,
                                    color: const Color(0xFFF1A840),
                                    fondo: const Color(0xFFFFF4DF)),
                                title: Text(carpeta['nombre'] ?? 'Carpeta',
                                    style: const TextStyle(
                                        fontWeight: FontWeight.w500)),
                                subtitle: const Text('Abrir carpeta'),
                                trailing:
                                    const Icon(Icons.chevron_right_rounded),
                              ),
                            );
                          }),
                        ],
                        if (_archivos.isNotEmpty) ...[
                          const SizedBox(height: 10),
                          Row(children: [
                            Expanded(
                                child: _SectionTitle(
                                    title: buscando ? 'Resultados' : 'Archivos')),
                            Text(_vistaGrilla ? 'Grilla' : 'Lista',
                                style: TextStyle(color: Colors.blueGrey.shade600)),
                          ]),
                          const SizedBox(height: 8),
                          if (_vistaGrilla)
                            LayoutBuilder(builder: (context, constraints) {
                              final columnas = constraints.maxWidth >= 700
                                  ? 4
                                  : constraints.maxWidth >= 460
                                      ? 3
                                      : 2;
                              return GridView.builder(
                                shrinkWrap: true,
                                physics: const NeverScrollableScrollPhysics(),
                                itemCount: _archivos.length,
                                gridDelegate:
                                    SliverGridDelegateWithFixedCrossAxisCount(
                                  crossAxisCount: columnas,
                                  crossAxisSpacing: 10,
                                  mainAxisSpacing: 10,
                                  childAspectRatio: 0.88,
                                ),
                                itemBuilder: (context, index) {
                                  final archivo = Map<String, dynamic>.from(
                                      _archivos[index] as Map);
                                  return _tarjetaArchivo(archivo, grilla: true);
                                },
                              );
                            })
                          else
                            ..._archivos.map((raw) => _tarjetaArchivo(
                                Map<String, dynamic>.from(raw as Map),
                                grilla: false)),
                        ],
                      ],
                    ],
                  ),
      ),
    );
  }

  Widget _tarjetaArchivo(Map<String, dynamic> archivo,
      {required bool grilla}) {
    final id = archivo['idArchivo'] as int?;
    final nombre = archivo['nombreVisible'] as String? ?? 'Archivo';
    final mime = archivo['tipoMime'] as String?;
    final imagen = _esImagen(nombre, mime);
    final video = _esVideo(nombre, mime);
    final cargando = id != null &&
        (_descargandoId == id ||
            _eliminandoId == id ||
            _renombrandoId == id);
    final previsualizando = id != null && _previsualizandoId == id;
    final Future<void> Function()? abrir = imagen
        ? () => _previsualizarImagen(archivo)
        : video
            ? () => _abrirVideo(archivo)
            : null;
    if (!grilla) {
      return Card(
        elevation: 0,
        margin: const EdgeInsets.only(bottom: 8),
        child: ListTile(
          onTap: abrir,
          leading: SizedBox(
            width: 48,
            height: 48,
            child: ClipRRect(
              borderRadius: BorderRadius.circular(12),
              child: imagen
                  ? _miniatura(archivo)
                  : _IconoArchivo(
                      icon: _iconoMime(mime, nombre),
                      color: video ? const Color(0xFFB04CA5) : const Color(0xFF5B5CE2),
                      fondo: const Color(0xFFEDEEFF)),
            ),
          ),
          title: Text(nombre, maxLines: 1, overflow: TextOverflow.ellipsis,
              style: const TextStyle(fontWeight: FontWeight.w500)),
          subtitle: Text('${_formatearTamano(archivo['tamano'])}${imagen ? ' · Toca para previsualizar' : video ? ' · Toca para reproducir' : ''}'),
          trailing: Row(mainAxisSize: MainAxisSize.min, children: [
            IconButton(
              tooltip: video ? 'Abrir video' : 'Descargar al teléfono',
              onPressed: cargando
                  ? null
                  : video
                      ? abrir
                      : () => _descargarArchivo(archivo),
              icon: cargando || previsualizando
                  ? const SizedBox(width: 20, height: 20,
                      child: CircularProgressIndicator(strokeWidth: 2))
                  : Icon(video ? Icons.play_arrow_rounded : Icons.download_rounded,
                      color: const Color(0xFF5B5CE2)),
            ),
            IconButton(
              tooltip: 'Renombrar archivo',
              onPressed: cargando ? null : () => _renombrarArchivo(archivo),
              icon: const Icon(Icons.edit_outlined,
                  color: Color(0xFF5B5CE2)),
            ),
            IconButton(
              tooltip: 'Mover a la papelera',
              onPressed: cargando ? null : () => _enviarAPapelera(archivo),
              icon: const Icon(Icons.delete_outline_rounded,
                  color: Color(0xFFD45B65)),
            ),
          ]),
        ),
      );
    }
    return Card(
      elevation: 0,
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: abrir,
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Expanded(
            child: Stack(fit: StackFit.expand, children: [
              if (imagen)
                _miniatura(archivo, grande: true)
              else
                Container(
                  color: const Color(0xFFEDEEFF),
                  child: Icon(_iconoMime(mime, nombre), size: 46,
                      color: video ? const Color(0xFFB04CA5) : const Color(0xFF5B5CE2)),
                ),
              if (video)
                const Center(
                  child: CircleAvatar(
                    backgroundColor: Color(0xAA20212A),
                    child: Icon(Icons.play_arrow_rounded, color: Colors.white, size: 30),
                  ),
                ),
              Positioned(
                right: 4,
                top: 4,
                child: PopupMenuButton<String>(
                  tooltip: 'Acciones del archivo',
                  onSelected: (accion) {
                    if (accion == 'renombrar') {
                      _renombrarArchivo(archivo);
                    } else if (accion == 'papelera') {
                      _enviarAPapelera(archivo);
                    } else if (accion == 'abrir') {
                      if (abrir != null) abrir();
                      else _descargarArchivo(archivo);
                    } else {
                      _descargarArchivo(archivo);
                    }
                  },
                  itemBuilder: (context) => [
                    if (imagen || video)
                      PopupMenuItem(
                          value: 'abrir',
                          child: Text(imagen ? 'Previsualizar' : 'Reproducir')),
                    const PopupMenuItem(
                        value: 'renombrar', child: Text('Renombrar')),
                    if (!video)
                      const PopupMenuItem(
                          value: 'descargar', child: Text('Descargar')),
                    const PopupMenuItem(
                        value: 'papelera', child: Text('Mover a la papelera')),
                  ],
                  child: CircleAvatar(
                    radius: 19,
                    backgroundColor: Colors.white.withValues(alpha: .92),
                    child: cargando
                        ? const SizedBox(width: 18, height: 18,
                            child: CircularProgressIndicator(strokeWidth: 2))
                        : const Icon(Icons.more_vert_rounded,
                            color: Color(0xFF303044)),
                  ),
                ),
              ),
            ]),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(10, 8, 10, 10),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(nombre, maxLines: 2, overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
              const SizedBox(height: 3),
              Text(_formatearTamano(archivo['tamano']),
                  style: TextStyle(fontSize: 11, color: Colors.blueGrey.shade600)),
            ]),
          ),
        ]),
      ),
    );
  }

  bool _esImagen(String nombre, String? mime) {
    if (mime?.startsWith('image/') == true) return true;
    final extension = nombre.split('.').last.toLowerCase();
    return const {'jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'heic', 'heif'}
        .contains(extension);
  }

  IconData _iconoMime(String? mime, String? nombre) {
    if (_esImagen(nombre ?? '', mime)) return Icons.image_rounded;
    if (mime?.startsWith('video/') == true) return Icons.movie_rounded;
    if (mime?.startsWith('audio/') == true) return Icons.music_note_rounded;
    if (mime?.contains('pdf') == true) return Icons.picture_as_pdf_rounded;
    return Icons.insert_drive_file_rounded;
  }
}

class _VistaImagen extends StatelessWidget {
  const _VistaImagen({required this.nombre, required this.bytes});

  final String nombre;
  final Uint8List bytes;

  @override
  Widget build(BuildContext context) => Scaffold(
        backgroundColor: const Color(0xFF11121A),
        appBar: AppBar(
          backgroundColor: const Color(0xFF11121A),
          foregroundColor: Colors.white,
          title: Text(nombre, maxLines: 1, overflow: TextOverflow.ellipsis),
        ),
        body: Center(
          child: InteractiveViewer(
            minScale: 0.7,
            maxScale: 5,
            child: Image.memory(
              bytes,
              fit: BoxFit.contain,
              errorBuilder: (_, __, ___) => const Padding(
                padding: EdgeInsets.all(24),
                child: Text(
                  'No se pudo decodificar esta imagen.',
                  style: TextStyle(color: Colors.white70),
                ),
              ),
            ),
          ),
        ),
      );
}

class _CarpetaRuta {
  const _CarpetaRuta(this.id, this.nombre);
  final int id;
  final String nombre;
}

class _ResumenArchivos extends StatelessWidget {
  const _ResumenArchivos({required this.cantidad, required this.carpeta});
  final int cantidad;
  final String carpeta;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.all(20),
        decoration: BoxDecoration(
          gradient: const LinearGradient(
              colors: [Color(0xFF6667E8), Color(0xFF8889F5)],
              begin: Alignment.topLeft,
              end: Alignment.bottomRight),
          borderRadius: BorderRadius.circular(24),
        ),
        child: Row(
          children: [
            Expanded(
              child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Tu espacio personal',
                        style: TextStyle(color: Colors.white70, fontSize: 13)),
                    SizedBox(height: 8),
                    Text('Tus archivos\nen un solo lugar',
                        style: TextStyle(
                            color: Colors.white,
                            fontSize: 21,
                            fontWeight: FontWeight.w700,
                            height: 1.2)),
                    SizedBox(height: 8),
                    Text('$cantidad elementos · $carpeta',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(color: Colors.white70, fontSize: 12)),
                  ]),
            ),
            Container(
              width: 58,
              height: 58,
              decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: .18),
                  borderRadius: BorderRadius.circular(20)),
              child: const Icon(Icons.cloud_done_rounded,
                  color: Colors.white, size: 32),
            ),
          ],
        ),
      );
}

class _SectionTitle extends StatelessWidget {
  const _SectionTitle({required this.title});
  final String title;
  @override
  Widget build(BuildContext context) => Text(title,
      style: Theme.of(context)
          .textTheme
          .titleMedium
          ?.copyWith(fontWeight: FontWeight.w600));
}

class _IconoArchivo extends StatelessWidget {
  const _IconoArchivo(
      {required this.icon, required this.color, required this.fondo});
  final IconData icon;
  final Color color;
  final Color fondo;
  @override
  Widget build(BuildContext context) => Container(
        width: 44,
        height: 44,
        decoration: BoxDecoration(
            color: fondo, borderRadius: BorderRadius.circular(14)),
        child: Icon(icon, color: color),
      );
}

class _Vacio extends StatelessWidget {
  const _Vacio({required this.onUpload, required this.onCreateFolder});
  final VoidCallback onUpload;
  final VoidCallback onCreateFolder;
  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.all(25),
        decoration: BoxDecoration(
            color: Colors.white, borderRadius: BorderRadius.circular(24)),
        child: Column(
          children: [
            Container(
                width: 72,
                height: 72,
                decoration: const BoxDecoration(
                    color: Color(0xFFEDEEFF), shape: BoxShape.circle),
                child: const Icon(Icons.folder_open_rounded,
                    color: Color(0xFF5B5CE2), size: 35)),
            const SizedBox(height: 16),
            Text('Aquí todavía no hay archivos',
                style: Theme.of(context)
                    .textTheme
                    .titleMedium
                    ?.copyWith(fontWeight: FontWeight.w600),
                textAlign: TextAlign.center),
            const SizedBox(height: 8),
            Text(
                'Sube algo desde tu teléfono o crea una carpeta para organizarte.',
                textAlign: TextAlign.center,
                style:
                    TextStyle(color: Colors.blueGrey.shade500, height: 1.45)),
            const SizedBox(height: 18),
            FilledButton.icon(
                onPressed: onUpload,
                icon: const Icon(Icons.upload_rounded),
                label: const Text('Elegir archivo')),
            TextButton.icon(
                onPressed: onCreateFolder,
                icon: const Icon(Icons.create_new_folder_outlined),
                label: const Text('Crear carpeta')),
          ],
        ),
      );
}
