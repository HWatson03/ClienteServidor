# Plan de estructura y alcance del sistema

## Objetivo

Construir una nube privada multiusuario con un backend Java/Spring Boot que gestione archivos guardados en una carpeta del equipo servidor y clientes Flutter para Android, Windows y web. El backend guardará metadatos en una base de datos y el contenido de los archivos en el disco.

## Estructura propuesta

```text
ClienteServidor/
├── AGENTS.md
├── PLAN_ESTRUCTURA_Y_ALCANCE.md
├── backend/
│   ├── pom.xml
│   └── src/
│       ├── main/java/org/servidor/personal/clienteservidor/
│       │   ├── config/
│       │   ├── auth/
│       │   ├── archivo/
│       │   └── common/
│       ├── main/resources/
│       └── test/
└── app_movil/
    ├── pubspec.yaml
    ├── lib/
    │   ├── app/
    │   ├── core/
    │   └── features/
    │       ├── archivos/
    │       ├── auth/
    │       └── dashboard/
    ├── assets/
    └── test/
```

El backend se organizará por funcionalidades y responsabilidades: autenticación, archivos, configuración y componentes compartidos. Flutter separará interfaz, estado y acceso a datos; la plantilla de dashboard servirá como punto de partida visual, reemplazando los datos de demostración por datos de la API.

## Alcance confirmado

- Múltiples usuarios con registro y espacio privado para cada cuenta.
- Cuota de 1 GiB por usuario, compartida entre sus archivos activos y elementos en papelera hasta que se borren definitivamente.
- Clientes Android, Windows de escritorio y web; todos gestionarán los archivos de la cuenta autenticada.
- Acceso desde Internet mediante una portátil personal. La publicación segura y disponibilidad de la portátil aún deben definirse.
- Subir, listar, descargar, renombrar, mover, copiar, eliminar y restaurar; además de crear carpetas y subcarpetas.
- Papelera con retención de 30 días, seguida de eliminación permanente.
- Búsqueda por nombre, tipo, fecha y tamaño.
- Vista previa para imágenes y PDF. Otros formatos se abrirán con aplicaciones predeterminadas cuando la plataforma lo permita.
- Selección manual de archivos en el teléfono; sin carga automática de cámara.
- Ruta de almacenamiento configurable; PostgreSQL inicial y JPA.
- Inicio de sesión con contraseña y opción biométrica local para desbloquear la sesión en el dispositivo.
- Auditoría de acciones del sistema. Escaneo antimalware si la prueba técnica confirma que puede operarse.
- No se planean copias de seguridad ni cifrado de archivos en disco. La pérdida o avería de la portátil podría causar pérdida permanente de archivos y metadatos.

## Plan de implementación por entregas

OpenCode debe trabajar una entrega a la vez, leer `AGENTS.md`, limitar sus cambios al alcance indicado, ejecutar las comprobaciones pertinentes y resumir el resultado. Los mensajes de commit deben estar en español.

### Entrega 0 — Decisiones de producto y despliegue

1. Definir registro: campos, verificación de correo, recuperación de contraseña y quién puede aprobar o desactivar cuentas.
2. Elegir cómo publicar la portátil en Internet (por ejemplo, VPN privada o proxy/túnel), dominio/DNS y TLS. No exponer el puerto del backend directamente sin controles de red y HTTPS.
3. Definir máximo por archivo, tipos/extensiones permitidos, semántica de 1 GiB, orden de entrega de Android/Windows/web y retención de auditoría.
4. Registrar el estado actual de compilación de backend y Flutter antes de reorganizar la plantilla.

**Criterio de salida:** decisiones de despliegue documentadas; problemas preexistentes registrados.

### Entrega 1 — Configuración, PostgreSQL y esquema

1. Configurar perfiles `local` y `produccion`; secretos solo por variables de entorno, no en Git.
2. Configurar PostgreSQL y JPA; añadir migraciones versionadas (Flyway recomendado) y evitar `ddl-auto=update` en producción.
3. Leer una propiedad como `storage.root`, comprobar al inicio que el directorio sea válido y escribible, y mantenerlo fuera del repositorio.
4. Crear el esquema inicial para usuarios, carpetas, archivos y eventos de auditoría. Definir índices para propietario, carpeta, nombre, tipo, fechas y estado.

**Criterio de salida:** backend arranca contra PostgreSQL configurado y utiliza almacenamiento externo configurable.

### Entrega 2 — Registro, autenticación y aislamiento

1. Implementar registro, login, renovación y revocación de sesión; añadir verificación/recuperación conforme a las decisiones de la entrega 0.
2. Hashear contraseñas con algoritmo fuerte. Nunca guardar ni registrar contraseñas o tokens.
3. Aplicar autorización por propietario en cada consulta y operación: el servidor obtiene el usuario desde la sesión autenticada, nunca de un `usuarioId` confiado al cliente.
4. Definir tokens seguros para Android/Windows y una estrategia web que proteja credenciales frente a XSS/CSRF.
5. Permitir que la biometría desbloquee localmente una credencial/token guardado en almacenamiento seguro; la autenticación del servidor sigue siendo contraseña/token.
6. Añadir límites de frecuencia y detección de intentos automatizados sin bloqueo permanente accidental de cuenta.

**Criterio de salida:** pruebas con dos cuentas confirman que ninguna puede acceder a los datos de la otra.

### Entrega 3 — Servicio de archivos, carpetas y cuota

1. Crear almacenamiento por identificador generado por el servidor; conservar nombre original como metadato, no como ruta física.
2. Validar ruta, nombre, extensión, tamaño y tipo de contenido; impedir traversal y escritura fuera de `storage.root`.
3. Escribir primero en temporal, validar y luego mover atómicamente al destino. Limpiar temporales y archivos huérfanos ante errores.
4. Controlar cuota de forma transaccional/concurrente para que cargas simultáneas no excedan 1 GiB. Aclarar si se usa 1 GiB binario (1,073,741,824 bytes).
5. Implementar operaciones de carpeta y relaciones entre carpetas/archivos; validar ciclos al mover carpetas.
6. Definir estados para activo, papelera, en análisis y bloqueado. Los archivos en papelera continúan contando para la cuota hasta la purga definitiva.

**Criterio de salida:** carga, movimiento y copia preservan integridad; la cuota no se excede ni con solicitudes simultáneas.

### Entrega 4 — API REST

Usar un contrato versionado bajo `/api/v1`:

```text
POST   /api/v1/auth/registro
POST   /api/v1/auth/login
POST   /api/v1/auth/refresh
POST   /api/v1/auth/logout
GET    /api/v1/archivos
POST   /api/v1/archivos
GET    /api/v1/archivos/{id}/contenido
PATCH  /api/v1/archivos/{id}
POST   /api/v1/archivos/{id}/copias
GET    /api/v1/carpetas
POST   /api/v1/carpetas
PATCH  /api/v1/carpetas/{id}
DELETE /api/v1/carpetas/{id}
DELETE /api/v1/archivos/{id}              # enviar a papelera
GET    /api/v1/papelera
POST   /api/v1/papelera/{id}/restaurar
DELETE /api/v1/papelera/{id}              # eliminación permanente
GET    /api/v1/almacenamiento/resumen
GET    /api/v1/auditoria
```

Los listados deben paginarse y filtrar por nombre, tipo, rango de fechas y tamaño. Restringir los campos de ordenamiento permitidos. Documentar con OpenAPI y usar respuestas de error consistentes para validación, cuota excedida, falta de permisos y recurso inexistente.

**Criterio de salida:** todas las operaciones acordadas se pueden recorrer y comprobar usando la API, antes de conectarlas al cliente.

### Entrega 5 — Auditoría, papelera y purga

1. Usar campos comunes de fecha/actor de creación y modificación, inspirados en `Auditoria`/`AuditorAware` del proyecto `sistema-hardware`.
2. Crear además una bitácora de eventos de negocio, porque los logs técnicos no bastan: registrar actor, acción, fecha, recurso, resultado y metadatos mínimos.
3. Auditar registro, accesos, subida, descarga, cambios de nombre, movimientos, copias, papelera, restauración y borrado definitivo; no registrar secretos ni contenido de archivos.
4. Implementar purga idempotente de elementos con más de 30 días, incluyendo contenido físico, metadatos y actualización de cuota.
5. Definir la retención de la bitácora y permisos para que cada usuario consulte solo su historial.

**Criterio de salida:** las acciones se atribuyen a la cuenta correcta y la purga puede repetirse sin borrar datos ajenos ni duplicar efectos.

### Entrega 6 — Cliente Flutter

1. Conservar de la plantilla lo útil visualmente y reemplazar datos ficticios por datos del backend.
2. Organizar `lib/` por `features` y separar `data`, `presentation`, estado/view models, `core/network`, `core/auth` y navegación.
3. Implementar registro/login; explorador de carpetas; carga manual con progreso y reintento; descarga, vista previa, renombrar, mover, copiar, papelera/restaurar y cuota.
4. Implementar búsqueda, filtros, paginación y estados vacíos/cargando/error. Mostrar: “Se perdió la conexión. Vuelve a intentar más tarde o revisa tu conexión a Internet.”
5. Previsualizar imagen/PDF; abrir otros formatos mediante la aplicación predeterminada si el entorno lo permite.
6. Adaptar la interfaz para Android y Windows; validar el target web para la administración desde navegador y definir almacenamiento seguro de sesión web.

**Criterio de salida:** el mismo usuario administra su espacio desde las plataformas elegidas con datos reales y errores comprensibles.

### Entrega 7 — Antimalware y publicación

1. Hacer prueba técnica de un escáner como ClamAV en la portátil y evaluar instalación, actualización de firmas, memoria y rendimiento.
2. Integrar mediante una interfaz intercambiable. Si hay escáner, mantener el archivo en cuarentena hasta resultado limpio; decidir el comportamiento si el escáner no responde.
3. Configurar TLS, método de acceso remoto, firewall, CORS, límites de proxy y secretos de producción.
4. Preparar el backend como servicio con arranque controlado, logs rotados y procedimiento de actualización.
5. Generar APK Android, paquete Windows y publicación web según los targets aprobados.
6. Documentar instalación, mantenimiento y recuperación. Reconfirmar explícitamente la decisión de no tener copias de seguridad antes de producción.

**Criterio de salida:** un usuario puede acceder desde fuera de casa por HTTPS y operar las versiones de cliente comprometidas.

## Criterios de aceptación del MVP

- Registro/login y aislamiento privado por usuario.
- CRUD de archivos y carpetas, incluyendo copia, movimiento, papelera, restauración y purga a los 30 días.
- Cuota de 1 GiB aplicada también ante operaciones concurrentes.
- Búsqueda por nombre, tipo, fecha y tamaño con resultados paginados.
- Vista previa de imagen y PDF, y apertura externa para otros formatos compatibles.
- Auditoría de acciones sin filtrar secretos.
- Mensaje de desconexión y opción de reintento.
- Conexión por HTTPS desde las plataformas incluidas en la primera publicación.

## Referencia de auditoría existente

En `/home/usic03/IdeaProjects/sistema-hardware`, `Config/Auditoria/Auditoria.java`, `AuditoriaConfig` y `AuditorAwareImpl` registran actor y fechas en entidades. `Config/LogSistema` y MDC manejan logs técnicos. La documentación está en `Docs/auditoria.md` y `Docs/architecture.md` de ese proyecto. Para esta nube conviene adaptar la auditoría de entidades y agregar una tabla de eventos de negocio para operaciones de archivos; no usar el log técnico como única bitácora.

## Decisiones pendientes

- Método de publicación remota, dominio/DNS y terminación de HTTPS.
- Verificación de correo, recuperación de contraseña y moderación de registros.
- Orden de salida de Android, Windows y web.
- Máximo por archivo y lista de extensiones/tipos permitidos.
- Retención de la bitácora de auditoría.
- Resultado de la prueba antimalware y conducta ante indisponibilidad del escáner.
- Confirmación de operar sin respaldos: avería, robo o pérdida de la portátil implicaría pérdida potencial de todos los datos.

## Preguntas para definir el sistema

Completa las respuestas; se pueden dejar como “por decidir”.

### Usuarios y permisos

- ¿El sistema será solo para ti o tendrá cuentas para varias personas?

R: Sera para varias personas

- Si hay varias cuentas, ¿cada usuario tendrá espacio privado o habrá carpetas compartidas?

R: Cada usuario tendrá espacio privado

- ¿Se requiere registro de usuarios o las cuentas las crea únicamente el administrador?

R: Se requiere registro de usuario

- ¿Qué operaciones podrá hacer cada tipo de usuario?

R: Podra administrar sus archivos


### Acceso y dispositivos

- ¿La primera versión funcionará solo en la red Wi-Fi local o también desde Internet?

R: Desde internet

- Si habrá acceso remoto, ¿qué equipo o servicio alojará el backend y cómo se publicará con HTTPS?

R: Lo alojara mi portatil que funcionara como un servidor remoto, aun no se como se dara salida a internet

- ¿El cliente inicial será únicamente Android (APK) o también se contemplan iOS, web o escritorio?

R: Si sera tambien para windows usado en un escritorio

- ¿Se desea una interfaz web para administrar los archivos desde una computadora?

R: Si sera igual para cada usuario la administracion de sus propios archivos


### Archivos y organización

- ¿Qué operaciones son obligatorias para la primera versión: subir, listar, descargar, renombrar, mover, copiar, eliminar, restaurar?

R: Si todas las operaciones que mencionas

- ¿Se necesitan carpetas creadas por el usuario y subcarpetas?

R: Si se necesitara sub carpetas creadas por el usuario 

- ¿Qué formatos deben previsualizarse dentro de la app (imágenes, PDF, audio, video)?

R: imagen y PDF, se llamara a aplicaciones como word, el reproductor de audio y video que tenga preterminado el telefono 
- ¿Se requiere búsqueda por nombre, tipo, fecha, tamaño o contenido?

R: Todos lo que mencionas

- ¿Cuál será el tamaño máximo por archivo y se permitirán cargas grandes o reanudables?

R: Cada usuario tendra un espacio de 1G no se puede superar ese tamaño

- ¿Se necesita carga automática de fotos/videos del teléfono o solo selección manual?

R: Solo seleccion manual


### Almacenamiento y conservación

- ¿En qué ruta del equipo se guardarán los archivos? Debe ser configurable y estar fuera del repositorio.

R: Si se debera configurar por el properties del proyecto la ruta de la subida de archivos 

- ¿La base de datos elegida será PostgreSQL, como aparece actualmente en Maven, u otra?

R: Si sera postgres usaremos JPA asi que no hay problema si mas adelante cambiamos de gestor solo actualizamos el driver

- ¿Cuál es la capacidad disponible y habrá cuota por usuario o límite total?

R: Si cada usuario tendra a disposicion 1G de espacio de almacenamiento

- ¿Qué debe ocurrir al borrar un archivo: eliminación inmediata o papelera con periodo de recuperación?

R: Eliminado de papelera con periodo de recuperación de 30 dias

- ¿Con qué frecuencia se harán copias de seguridad y dónde se guardarán?

R: No tendra copias de seguridad

- ¿Se requiere cifrado de archivos en disco o cifrado del lado del cliente?

R: No se requiere cifrado de archivos en disco

### Seguridad y operación

- ¿Cómo se iniciará sesión: usuario/contraseña, PIN, biometría del dispositivo u otro método?

R: un login para usuarios y contraseñas, al mismo tiempo que se pueda inicar por biometrico

- ¿Cuántos intentos de acceso y sesiones simultáneas se permitirán?

R: No se indicó un máximo. Definir límites de frecuencia para proteger el login contra intentos automatizados y decidir si se permitirán sesiones concurrentes sin límite.

- ¿Se necesita historial de actividad (subidas, descargas, cambios y eliminaciones)?

R: Si, abra una cosa de auditoria en todo el sistema revisa el proyecto "usic03@usic03-System:~/IdeaProjects/sistema-hardware$ pwd
/home/usic03/IdeaProjects/sistema-hardware
usic03@usic03-System:~/IdeaProjects/sistema-hardware$ " Para ver como esta eso de la audotoria

- ¿Se analizarán archivos en busca de malware antes de permitir su descarga?

R: Si, si se puede

- ¿Qué debe ocurrir si se pierde la conexión o se interrumpe una subida?

R: Si se interrumpe o se pierde la coneccion con el servidor que aparezca el mensaje de "Se perdio la coneccion" vuelve a intentar mas tarde o revisa tu cneccion a internet

- ¿Quién instalará y actualizará el servidor y el APK?

R: Yo merito

## Trabajo con OpenCode

Entregar a OpenCode una entrega pequeña cada vez. Pedirle que lea `AGENTS.md` y el código relacionado, enumere los archivos que planea modificar, implemente solo el alcance solicitado, ejecute las comprobaciones pertinentes y reporte resultados. No cambiar decisiones de alcance sin actualizar este documento. Los mensajes de commit deben estar en español.

## Revisión del plan: hallazgos y preguntas de aclaración

Esta revisión contrasta el plan con las respuestas originales y señala decisiones que OpenCode no debe asumir. Las propuestas siguientes no cambian el alcance hasta que se respondan. Prioridad alta: resolver antes de implementar el módulo afectado. Prioridad media: resolver antes de cerrar su entrega.

### H01 — Alta: se omitió la búsqueda por contenido

**Hallazgo:** la pregunta incluía buscar por contenido y la respuesta fue “Todos lo que mencionas”. Sin embargo, el alcance, la API y los criterios de aceptación solo incluyen nombre, tipo, fecha y tamaño. Faltan extracción de texto, indexación, permisos del índice y su eliminación al enviar archivos a papelera.

**Pregunta:** ¿la primera versión debe buscar dentro de TXT, PDF y documentos de Word? ¿También dentro de imágenes o PDF escaneados mediante OCR, o eso quedará para después?

**Respuesta:** Solo se buscara por el nombre del archivo, no su contenido

### H02 — Alta: cuota y papelera presentadas como confirmadas sin haberlo acordado

**Hallazgo:** respondiste “1G”; el plan lo convirtió en 1 GiB y decidió que la papelera consume la misma cuota. Son decisiones propuestas. Tampoco define si temporales, archivos en análisis y copias cuentan, ni distingue cuota total de tamaño máximo por archivo.

**Preguntas:** ¿1 GB será 1.000.000.000 bytes o 1 GiB será 1.073.741.824 bytes? ¿La papelera cuenta dentro del espacio del usuario? ¿Un solo archivo puede ocupar toda la cuota disponible? ¿Cada copia consume espacio adicional?

**Respuesta:** 1G me doy a enter como 1.000.000.000 bytes Y la paelera, las copias y demas estaran dentro del espacio del usuario

### H03 — Alta: la respuesta sobre intentos y sesiones fue reemplazada

**Hallazgo:** tu respuesta original fue “indefinidamente”. Durante la elaboración se sustituyó por una interpretación que aparece como si fuera tu respuesta. Además, el plan prescribe límites de frecuencia sin distinguirlos del número total de intentos o sesiones. Debe conservarse la respuesta original y registrar cualquier propuesta por separado.

**Preguntas:** ¿quieres sesiones simultáneas sin límite? ¿Aceptas una espera temporal entre intentos fallidos de login, manteniendo la posibilidad de volver a intentarlo y sin bloqueo permanente?

**Respuesta:** El proyecto sera personal, requiero 3 sesiones como maximo simultaneamente

### H04 — Alta: plataformas confirmadas pero aceptación condicional

**Hallazgo:** Android, Windows y web aparecen en el alcance confirmado, pero otras secciones hablan de plataformas “elegidas” o “aprobadas”. Esto permite cerrar el MVP sin entregar alguna de las solicitadas.

**Pregunta:** ¿la primera versión se considera terminada únicamente cuando funcionan APK Android, aplicación instalable Windows y web, o autorizas entregarlas en etapas? Si son etapas, ¿en qué orden?

**Respuesta:** En etapas, primero APK, despues windows luego linux y despues web

### H05 — Alta: acceso por Internet sin definir público destinatario ni disponibilidad
 
**Hallazgo:** VPN privada y web accesible públicamente implican experiencias distintas. No está definido si cada usuario aceptará instalar una VPN. Tampoco se especifican disponibilidad de la portátil, conexión, capacidad ni condiciones para alojar PostgreSQL.

**Preguntas:** ¿los usuarios deben entrar solo con una URL y sus credenciales, sin instalar VPN? ¿Cuántos usuarios y conexiones simultáneas esperas? ¿La portátil estará encendida permanentemente? ¿Tienes dominio y presupuesto para publicación? ¿PostgreSQL estará en esa misma portátil?

**Respuesta:** Los usuarios entraran por la APK, por windows, linux y la plataforme web, no tengo dominio, postgres y el servidor contaran con un espacio de 500gb 1/2 tera se esperan 3 usaurios como maxi ceonectados simultaneamente y si estara prendida indefinidamente

### H06 — Alta: registro y administración de cuentas incompletos

**Hallazgo:** se pidió registro, pero se añadieron verificación, recuperación y moderación sin decidir su alcance. No existe un rol administrador definido. Una cuota individual no limita el consumo total si pueden registrarse cuentas indefinidamente.

**Preguntas:** ¿cualquiera podrá registrarse o habrá invitación/aprobación? ¿Login por nombre de usuario o correo? ¿Habrá recuperación de contraseña por correo? ¿Qué podrá hacer el administrador: suspender cuentas, consultar auditoría global o acceder a archivos? ¿Habrá máximo de cuentas o cierre de registros cuando falte espacio?

**Respuesta:** Si cualquiera podra registrarse, la recuperacion por correo no esta en los alcances, login por nombre de usuario sin administrador

### H07 — Alta: biometría y ciclo de sesión sin contrato

**Hallazgo:** el desbloqueo local es una propuesta técnica, pero no se estableció dónde debe funcionar, cuándo pedir contraseña nuevamente ni qué ocurre con dispositivos sin biometría. La sesión web también queda sin resolver.

**Preguntas:** ¿la biometría será obligatoria en Android únicamente o también en Windows y navegador? ¿Aceptas primer acceso con contraseña y desbloqueos posteriores con biometría? ¿Debe haber cierre de todas las sesiones y revocación al cambiar contraseña?

**Respuesta:** la habilitacion biometrica solo sera en dispositivos que eucntan con lector niometrico y sera preguntado al momento de inicar sesion, si se debe de cerrar la sesion al cambiar la contraseña

### H08 — Alta: cargas interrumpidas y duplicadas

**Hallazgo:** mostrar un mensaje no define qué sucede con los bytes ya recibidos. El plan promete reintento, pero no determina si reinicia o reanuda. Si el servidor termina una subida y se pierde la respuesta, reintentar puede duplicarla y consumir cuota dos veces.

**Preguntas:** ¿al interrumpirse una carga se reinicia desde cero o debe continuar desde donde quedó? ¿Debe continuar con la aplicación en segundo plano? ¿Aceptas que un reintento de la misma operación conserve un identificador para evitar duplicados?

**Respuesta:** Si lo acepto, deberia de tener el un identificador unico, deberia de continuar desde donde se quedo, Si debe de continuar en 2do plano

### H09 — Alta: operaciones de carpetas, nombres y restauración ambiguas

**Hallazgo:** no se define si copiar/eliminar una carpeta incluye todo su contenido, si se permiten nombres repetidos ni qué ocurre al restaurar cuando el padre ya no existe. La API de copia solo contempla archivos; la aceptación exige también operaciones sobre carpetas.

**Preguntas:** ¿copiar, eliminar y restaurar carpetas debe incluir sus subcarpetas y archivos? Ante nombres repetidos, ¿rechazar, reemplazar o agregar un sufijo? Si la carpeta original desapareció, ¿restaurar en la raíz o pedir destino? ¿Se podrá vaciar la papelera o borrar definitivamente antes de 30 días?

**Respuesta:** Si debe de incluir sus carpetas y archivos, ante nombres repetidos se debe de añadir un prefijo antes del nombre original asi se distinguen, si la carpeta original desaparecio no se podra restaurar, si se podra vaciar la papelera antes de los 30 dias

### H10 — Alta: seguridad antimalware y estados llegan demasiado tarde

**Hallazgo:** el escaneo se evalúa en la entrega 7, después de implementar almacenamiento y clientes. Su resultado condiciona descarga, vista previa, búsqueda por contenido y cuota desde el principio. “Activo/papelera” y “en análisis/bloqueado” representan aspectos distintos: un archivo en papelera puede seguir teniendo resultado de análisis.

**Preguntas:** ¿el antivirus es obligatorio para publicar o una mejora opcional? Si falla el escáner, ¿mantener en cuarentena, rechazar la carga o permitir uso sin análisis? ¿Los archivos detectados se eliminan automáticamente o se conservan bloqueados?

**Ajuste técnico propuesto:** evaluar viabilidad antes de cerrar el almacenamiento y modelar por separado estado de conservación y estado de análisis.

**Respuesta:** Quietemos esta implementacion, sera un proyecto personal que no se escanee nada en busca de virus

### H11 — Alta: auditoría implementada después de las operaciones que debe registrar

**Hallazgo:** la entrega 2 crea autenticación y la 4 operaciones completas, pero la bitácora llega en la 5. Se necesita un mecanismo transversal desde las primeras operaciones. No se define quién consulta eventos globales, su conservación ni si una descarga registra inicio o transferencia terminada.

**Preguntas:** ¿cada usuario verá su actividad y tú verás la de todos? ¿Cuánto tiempo se conserva? ¿Registrar también consultas, vistas previas, intentos fallidos y acciones automáticas? ¿Para descargas basta registrar solicitud autorizada o necesitas confirmar transferencia completada?

**Ajuste técnico propuesto:** crear la infraestructura de auditoría antes de autenticación y archivos, y añadir eventos junto con cada funcionalidad.

**Respuesta:** Como en el sistema SATH cada entidad debera de herdar la seccion de auditoria por lo tanto cada operacion quedara registrada, no necesitamos registrar consultas, vistas previas, intentos fallidos y acciones automáticas, ya que estas son acciones que no afectan al sistema y no son necesarias para el funcionamiento del mismo.

### H12 — Media: vista previa, apertura externa y edición

**Hallazgo:** abrir un archivo externamente no especifica si queda descargado en el dispositivo ni si los cambios hechos en Word se suben de vuelta. La web puede descargar o abrir formatos compatibles en el navegador, pero no garantizar la apertura de cualquier aplicación local.

**Preguntas:** ¿solo necesitas abrir/descargar o también devolver cambios al servidor? ¿Qué formatos de imagen deben previsualizarse? ¿Aceptas que en web los formatos no compatibles se descarguen? ¿Las copias temporales locales deben eliminarse al cerrar sesión?

**Respuesta:**  solo es necesario descargar y cargar el archivo sin ediciones, La previsualizacion sera para las fotos JPEG y PNG nada mas

### H13 — Media: inconsistencias entre disco, base de datos y purga

**Hallazgo:** “mover atómicamente” el archivo no hace atómica la operación conjunta con PostgreSQL. Faltan estados recuperables y conciliación tras reinicios. Tampoco se define la eliminación de contenido mientras alguien lo descarga, la purga al volver a encender la portátil o qué pasa si el disco se llena antes de agotar las cuotas.

**Preguntas:** ¿aceptas que la purga se ejecute periódicamente y al reiniciar, retirando elementos vencidos mientras el equipo estuvo apagado? ¿Se deben rechazar nuevas cargas cuando se alcance una reserva mínima de disco, aunque el usuario tenga cuota?

**Ajuste técnico propuesto:** documentar reserva/finalización/liberación de cuota, recuperación de operaciones pendientes y limpieza idempotente. Mantener identidad mínima en auditoría aunque se borre el recurso.

**Respuesta:** Si se deben de rechazar archivos mas grandes que el espacio dentro de la cuota

### H14 — Media: contrato REST y estructura insuficientes para repartir implementación

**Hallazgo:** faltan DTO, paginación, filtros, formato de error, respuestas de tareas de copia/escaneo y distinción archivo/carpeta en papelera. El árbol no sitúa carpetas, cuota, búsqueda, auditoría y tareas programadas. También el plan inicial pasó a `/api/v1`, mientras el cuestionario editado había usado `/api`.

**Preguntas:** ¿prefieres mantener `/api` o usar `/api/v1`? ¿Las copias grandes pueden ejecutarse como tareas con estado/progreso? ¿Las tareas técnicas y modelos pueden definirse siguiendo el esquema por funcionalidades propuesto?

**Ajuste técnico propuesto:** cerrar contratos compartidos antes de conectar Flutter; dividir la entrega del cliente en autenticación, explorador, transferencias, papelera/búsqueda y adaptación por plataforma.

**Respuesta:** Prefiero mantener "/api" las copias grandes se ejecutaran con una barra de estado/progreso, usaremos el esquema DDD asi se sub divide por modulos y no se desorgamniza la arquitectura

### H15 — Media: portabilidad de base de datos y guía del repositorio

**Hallazgo:** JPA no garantiza cambiar de gestor solamente reemplazando el driver: también pueden cambiar dialecto, migraciones, consultas e índices. Además, `AGENTS.md` todavía menciona SQLite, mientras el plan establece PostgreSQL.

**Pregunta:** ¿el alcance exige soportar otro gestor ahora, o basta PostgreSQL y considerar un cambio futuro como una migración independiente?

**Ajuste técnico propuesto:** al consolidar decisiones, actualizar la mención de SQLite en `AGENTS.md` y documentar las dependencias específicas de PostgreSQL.

**Respuesta:** Sera considerado solo postgres en esta version a futuro podemos considerar migrar a otro gestor

### H16 — Media: decisiones ya respondidas se vuelven a pedir

**Hallazgo:** ya decidiste no incluir copias de seguridad ni cifrado de archivos en disco. El plan vuelve a exigir confirmación de respaldos como paso para producción, aunque no surgió un requisito nuevo. Asimismo, la ausencia de respaldos no impide definir recuperación de cargas incompletas o reinicios.

**Pregunta:** ¿“sin copias de seguridad” excluye tanto respaldo de archivos como respaldo de PostgreSQL, o se refiere únicamente a los archivos subidos?

**Ajuste técnico propuesto:** mantener la decisión expresada, aclarar únicamente su alcance y no convertirla en una aprobación repetida.

**Respuesta:** Solo a los archivos subidos no a postgres 

### H17 — Media: criterios de entrega incompletos

**Hallazgo:** la aceptación final omite biometría, búsqueda por contenido y decisión antimalware. “Cuota concurrente” y “aislamiento” requieren escenarios concretos; “se pueden recorrer las operaciones” no define evidencia suficiente. No están delimitados enlaces compartidos, sincronización, versionado ni edición colaborativa.

**Preguntas:** ¿confirmamos fuera de esta versión enlaces públicos/compartidos, sincronización automática, historial de versiones y edición colaborativa? ¿Aceptas comprobar cada entrega con casos de dos usuarios, límites de cuota, reconexión y restauración, además del flujo correcto?

**Ajuste técnico propuesto:** crear una matriz requisito → entrega → comprobación y registrar comandos/resultados. Incluir los casos de permisos, carreras de cuota, desconexión tras subida completada, caída durante purga y plataforma sin biometría.

**Respuesta:** Enlaces publicos si, asi pueden ingresar desde una web, Sincronizacion automatica solo con el apk en 2do plano, historial de versiones solo en el servidor, edicion colaborativa no, cada usuario podra hacer sus scosas independeientemente, sin entrar en conflicto con otro usuario

### Orden sugerido para responder

Primero H01–H10 para cerrar alcance, modelo y acceso. Después H11–H17 para concretar auditoría, operación y aceptación. Se pueden responder por identificador; las decisiones técnicas de implementación pueden delegarse a OpenCode una vez fijadas sus reglas de negocio.

## Referencias

- [Arquitectura recomendada para Flutter](https://docs.flutter.dev/app-architecture/guide)
- [Guía de Spring Boot para carga de archivos](https://spring.io/guides/gs/uploading-files/)
- [OWASP: seguridad en la carga de archivos](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html)
