# Plan de implementación de la nube privada

## Objetivo y decisiones vigentes

Construir una nube personal multiusuario con Java/Spring Boot, PostgreSQL y almacenamiento en una carpeta de la portátil. Un único proyecto Flutter entregará clientes en este orden: **Android → Windows → Linux → web**.

Este documento sustituye al plan anterior. Las respuestas originales se conservan en [RESPUESTAS_ALCANCE_ORIGINALES.md](docs/decisiones/RESPUESTAS_ALCANCE_ORIGINALES.md) como referencia histórica. Este plan incorpora también la aclaración posterior: **tres sesiones por usuario**, enlace público entendido como **plataforma web con login** y únicamente **auditoría de entidades como SATH**.

El plan describe trabajo futuro para OpenCode; no afirma que estas funcionalidades ya existan.

## 1. Alcance confirmado

| Área | Decisión |
| --- | --- |
| Cuentas | Registro abierto por nombre de usuario y contraseña. Espacio privado por cuenta. Sin administrador ni recuperación por correo. |
| Sesiones | Máximo tres sesiones simultáneas por usuario. Cambiar contraseña revoca todas las sesiones de esa cuenta. |
| Biometría | Opcional exclusivamente en el APK Android compatible. Windows, Linux y web usan usuario y contraseña. |
| Cuota | **1.000.000.000 bytes por usuario**: archivos activos, papelera, copias y temporales dentro de esa cuota. |
| Servidor | Portátil encendida continuamente, aproximadamente 500 GB para servidor y PostgreSQL. Se esperan hasta tres usuarios concurrentes; esta previsión no es un límite global de sesiones. |
| Operaciones | Subir, descargar, listar, renombrar, mover, copiar, eliminar y restaurar; carpetas y subcarpetas. |
| Carpetas | Copiar/eliminar/restaurar incluye descendientes. Ante nombres repetidos se añade un prefijo. |
| Papelera | Retención de 30 días, con vaciado anticipado. Si el padre original desapareció, no restaurar en otro destino automáticamente. |
| Búsqueda | Solo por nombre. Sin contenido ni OCR. |
| Vista previa | Solo JPEG y PNG. PDF y demás formatos se descargan o abren externamente. |
| Transferencias | Selección manual, identificador único, reanudación y continuación en segundo plano en Android. Copias grandes con progreso. |
| Persistencia | PostgreSQL con JPA. Directorio de archivos configurable desde propiedades y fuera del repositorio. |
| Auditoría | Campos heredados de creación/modificación, actor y estado, siguiendo SATH. |
| API y arquitectura | Prefijo `/api`; monolito modular organizado con DDD. |
| Plataformas | APK primero, después Windows, Linux y web. |
| Respaldos | PostgreSQL semanalmente, en el mismo servidor. No respaldar archivos subidos. |
| Publicación | Usar herramientas open source para exponer el servidor mediante HTTPS; elegir solución según la red disponible. |

### Fuera de alcance

- Antivirus, escaneo y cuarentena.
- Administrador, moderación de registros, verificación y recuperación por correo.
- Compartir archivos entre cuentas o enlaces anónimos de descarga. La URL pública será la de acceso a la plataforma.
- Versionado del contenido, edición colaborativa y subida automática de modificaciones realizadas en aplicaciones externas.
- Bitácora de eventos, pantalla de historial y auditoría de consultas/descargas/intentos fallidos.
- Cifrado de archivos en disco y respaldos de archivos subidos.
- iOS, búsqueda por contenido, previsualización PDF.

## 2. Estructura DDD y responsabilidades

```text
ClienteServidor/
├── AGENTS.md
├── PLAN_ESTRUCTURA_Y_ALCANCE.md
├── docs/
│   ├── decisiones/RESPUESTAS_ALCANCE_ORIGINALES.md
│   ├── api/openapi.yaml
│   └── operacion.md
├── backend/src/main/
│   ├── java/org/servidor/personal/clienteservidor/
│   │   ├── compartido/auditoria/
│   │   ├── compartido/errores/
│   │   ├── identidad/
│   │   ├── archivos/
│   │   └── transferencias/
│   └── resources/
│       ├── application.properties
│       └── db/migration/
└── app_movil/
    ├── lib/
    │   ├── app/                 # navegación, tema y composición
    │   ├── core/                # HTTP y adaptadores de plataforma
    │   └── features/
    │       ├── identidad/
    │       ├── archivos/
    │       ├── transferencias/
    │       └── papelera/
    ├── test/
    ├── android/
    ├── windows/
    ├── linux/
    └── web/
```

Cada módulo Java contiene `dominio`, `aplicacion`, `infraestructura` y `presentacion`. Controladores reciben DTO y llaman casos de uso. Las reglas y permisos se aplican en servicios de aplicación/dominio; JPA y disco pertenecen a infraestructura. Un controlador no utiliza directamente repositorios de otro módulo.

- **Identidad:** usuarios, contraseñas, sesiones, revocación y contexto autenticado.
- **Archivos:** árbol de carpetas, nombres, metadatos, cuota, papelera y búsqueda.
- **Transferencias:** cargas reanudables, finalización y copias con progreso; consume casos de uso de archivos para permisos, reserva de cuota y publicación del resultado.
- **Compartido:** auditoría y errores comunes. No concentrar aquí la lógica de todos los módulos.
- **Flutter:** funcionalidades con `data`, `domain` y `presentation`; adaptadores para credenciales, archivos y ejecución en segundo plano. Reutilizar componentes visuales de la plantilla reemplazando datos ficticios.

### Auditoría de SATH, sin historial adicional

Crear `Auditoria`, `AuditoriaConfig` y `AuditorAwareImpl` con `@MappedSuperclass`, `AuditingEntityListener`, `@CreatedDate`, `@CreatedBy`, `@LastModifiedDate` y `@LastModifiedBy`. Las entidades persistentes heredan fecha/actor de creación, fecha/actor de última modificación y estado.

El actor sale del contexto autenticado. Documentar actor técnico para altas públicas y trabajos del sistema. No copiar la dependencia de SATH de leer el JWT desde `credentials` si el nuevo principal funciona de otra forma.

**Estos campos conservan creación y última modificación, no todos los cambios anteriores.** Es el comportamiento solicitado. No agregar tabla de eventos, historial de versiones ni endpoints de auditoría. Al borrar definitivamente una fila desaparecen también sus campos auditados.

## 3. Modelo y reglas de consistencia

| Entidad propuesta | Responsabilidad |
| --- | --- |
| Usuario | Nombre único normalizado, hash de contraseña y cuota máxima. |
| Sesion | Usuario, credencial de renovación hasheada, vencimiento y revocación. |
| Carpeta | Propietario, padre, nombre y grupo/fecha de eliminación; raíz permanente. |
| Archivo | Propietario, carpeta, nombre visible, clave de disco, tamaño, tipo y papelera. |
| CuotaUsuario | Bytes ocupados y reservados, con control de concurrencia. |
| Carga | ID único, usuario, destino, tamaño esperado, offset confirmado, estado y vencimiento. |
| TareaCopia | Dueño, origen/destino, progreso, estado y error. |

Todas heredan auditoría. Usar migraciones versionadas; Flyway es la propuesta técnica para PostgreSQL. Evitar cambios automáticos de esquema en producción.

### Cuota y disco

- Invariante: `ocupados + reservados <= 1.000.000.000`, con enteros de 64 bits y actualización transaccional por usuario.
- Reservar el tamaño completo antes de cargar/copiar. Los temporales están incluidos en la reserva y no se contabilizan dos veces.
- Finalización convierte reserva en ocupación una sola vez. Cancelación/expiración libera reserva después de limpiar el temporal.
- Copiar crea contenido independiente y consume cuota; mover/renombrar no duplica bytes. Papelera solo libera cuota tras eliminación física.
- Propuesta: un archivo puede ocupar toda la cuota disponible; no imponer un límite menor adicional sin necesidad del transporte.
- Verificar también espacio físico libre. Rechazar nuevas reservas si falta disco aunque al usuario le quede cuota.
- Guardar mediante claves internas; el nombre visible no forma rutas físicas. Validar rutas, permisos, tamaño y límites sin escanear antivirus.
- Disco y PostgreSQL no comparten una transacción atómica. Persistir fases de finalización/purga y conciliar tras reinicios: nunca publicar contenido incompleto ni liberar cuota antes de borrarlo.

### Cargas reanudables

- Mantener el ID de operación en el cliente. Repetir inicio/finalización con la misma clave devuelve el mismo resultado, sin duplicar archivo ni cuota.
- Subir fragmentos secuenciales con offset. Confirmar en el servidor el offset persistido; el cliente lo consulta al reconectar.
- Rechazar huecos y offsets incompatibles con el offset esperado. Un fragmento repetido no se cuenta dos veces.
- Propuesta configurable: fragmentos de 4 MiB, una escritura simultánea por carga y expiración tras siete días sin actividad.
- Android conserva cola, ID, fuente local y destino. Continuar las subidas seleccionadas al salir de la aplicación o cambiar a otra. No vigilar carpetas ni subir automáticamente archivos nuevos. Verificar acceso duradero a la fuente y funcionamiento en segundo plano en un dispositivo real.
- Cambiar contraseña invalida la sesión antigua; después de autenticarse, el dueño puede retomar su carga vigente.
- La detención forzada de Android puede detener el trabajo. Al reabrir, recuperar la cola y continuar si el archivo local sigue accesible. No prometer funcionamiento con la app forzosamente detenida.

### Carpetas y papelera

- Validar propietario de origen/destino, impedir ciclos y proteger la raíz.
- Propuesta de prefijo: `(1) nombre.ext`, `(2) nombre.ext`. Aplicarlo en creación, copia y restauración, con resolución de conflictos concurrentes en DB.
- Copiar un árbol reserva la cuota total y muestra progreso; resultados parciales no se presentan como terminados.
- Eliminar un árbol asigna un grupo a los elementos activos afectados. Restaurarlo no revive archivos eliminados antes de forma independiente.
- Si el padre está en papelera, restaurarlo primero; si fue eliminado permanentemente, rechazar la restauración del hijo. En restauración de árbol, procesar padres antes que descendientes.
- Propuesta operativa: purga al iniciar y cada hora de elementos vencidos a los 30 días, calculados en UTC. Repetirla tras una caída debe ser seguro.

## 4. Contratos REST

Antes de conectar cada funcionalidad Flutter, completar sus DTO y errores en `docs/api/openapi.yaml`. El propietario siempre se obtiene de la autenticación.

| Función | Rutas propuestas |
| --- | --- |
| Registro/login | `POST /api/auth/registro`, `POST /api/auth/login`. |
| Sesión | `POST /api/auth/refresh`, `POST /api/auth/logout`, `GET /api/auth/sesiones`, `DELETE /api/auth/sesiones/{id}`. |
| Contraseña | `PATCH /api/auth/contrasena`. |
| Exploración | `GET /api/archivos?carpetaId=&nombre=&pagina=&tamano=`; `GET /api/archivos/{id}/contenido`; `PATCH /api/archivos/{id}`. |
| Carpetas | `GET/POST /api/carpetas`; `PATCH/DELETE /api/carpetas/{id}`. |
| Cargas | `POST /api/cargas`; `GET /api/cargas/{id}`; `PATCH /api/cargas/{id}/contenido`; `POST /api/cargas/{id}/finalizar`; `DELETE /api/cargas/{id}` cancela. |
| Copias | `POST /api/copias` con tipo/origen/destino; `GET /api/copias/{id}` consulta progreso. |
| Papelera | `DELETE /api/archivos/{id}` envía a papelera; `GET /api/papelera`; `POST /api/papelera/{tipo}/{id}/restaurar`; `DELETE /api/papelera/{tipo}/{id}` borra definitivamente; `DELETE /api/papelera` vacía. |
| Espacio | `GET /api/almacenamiento/resumen`: límite, ocupados, reservados, disponibles. |

Propuestas comunes: primera página 0, tamaño 50 y máximo 200; búsqueda por nombre sin distinguir mayúsculas; orden estable por nombre e ID. Listados normales excluyen papelera y cargas incompletas.

Errores con `codigo`, `mensaje` y validaciones: sesión inválida, recurso no accesible, cuota insuficiente, disco insuficiente, padre eliminado, offset incompatible. El cliente diferencia estos errores de una pérdida de conexión. No crear rutas de administrador, antivirus, eventos, versiones o descarga pública.

## 5. Entregas para OpenCode

Las rutas Java siguientes son relativas a `backend/src/main/java/org/servidor/personal/clienteservidor/`. Las pruebas replican paquetes en `backend/src/test/java/`. Cada casilla debe producir un cambio revisable, con evidencia y commits en español.

### E01 — Base DDD, configuración y auditoría

**Archivos:** `backend/pom.xml`, `application.properties`, `db/migration/`, `compartido/auditoria/{Auditoria,AuditoriaConfig,AuditorAwareImpl}.java`, `docs/api/openapi.yaml`.

- [ ] Registrar estado inicial de compilación y versiones antes de actualizar dependencias.
- [ ] Configurar PostgreSQL, migraciones, secretos por entorno y raíz de almacenamiento.
- [ ] Implementar auditoría heredada y validación de directorio escribible.
- [ ] Establecer errores comunes y contrato de identidad.

**Aceptación:** iniciar con PostgreSQL, aplicar migraciones y comprobar actor/fechas de creación y última modificación. Usar directorios de prueba, nunca el contenido personal real.

### E02 — Registro y tres sesiones por usuario

**Depende de:** E01. **Archivos:** `identidad/`; pruebas `RegistroTest`, `SesionesTest`, `CambioContrasenaTest`.

- [ ] Implementar registro por nombre único y contraseña hasheada, sin correo ni administrador.
- [ ] Persistir sesiones, renovación y revocación; serializar login por usuario para no exceder tres con solicitudes concurrentes.
- [ ] Propuesta: rechazar cuarto login con mensaje claro. Logout y expiración liberan plazas; no expulsar silenciosamente otro dispositivo.
- [ ] Cambiar contraseña exige la actual y revoca todas las sesiones, incluida la del solicitante.
- [ ] Definir credenciales nativas y futura sesión web con protección apropiada para el navegador.

**Aceptación:** A puede tener tres sesiones y B otras tres; cuarta sesión de A rechazada; ninguna credencial revocada permite acceso ni renovación.

### E03 — Explorador privado y cuota

**Depende de:** E02. **Archivos:** `archivos/`, migraciones; pruebas `PropiedadArchivosTest`, `CarpetasTest`, `CuotaTest`.

- [ ] Crear raíz, árbol y metadatos auditados por usuario.
- [ ] Listar/buscar por nombre, renombrar y mover.
- [ ] Implementar reserva/liberación de cuota y conflictos de nombres con prefijo.
- [ ] Cerrar DTO de cargas, copias y papelera en OpenAPI.

**Aceptación:** rechazar origen/destino ajenos, ciclos y cuota excedida; conflictos concurrentes no rompen el árbol.

### E04 — Cargas reanudables y descarga

**Depende de:** E03. **Archivos:** `transferencias/`, adaptador de disco en `archivos/`; pruebas `CargaReanudableTest`, `CuotaConcurrenteTest`, `RecuperacionCargaTest`.

- [ ] Iniciar carga idempotente con reserva, offset y expiración.
- [ ] Implementar fragmentos, consulta, cancelación y finalización recuperable.
- [ ] Descargar por streaming y previsualizar solo JPEG/PNG; otros formatos como descarga.
- [ ] Recuperar operaciones incompletas y liberar temporales expirados.

**Aceptación:** interrumpir red, reiniciar servidor, retomar offset y finalizar; repetir finalización produce un archivo. No cargar contenido completo en memoria.

### E05 — Copias con progreso y papelera

**Depende de:** E04. **Archivos:** casos de uso en `archivos/`, tareas en `transferencias/`; pruebas `CopiaArbolTest`, `RestauracionTest`, `PurgaTest`.

- [ ] Copiar archivos/árboles con progreso persistido, reserva y limpieza ante fallo.
- [ ] Implementar grupos de eliminación, restauración y vaciado anticipado.
- [ ] Ejecutar purga periódica/al arranque y reconciliar disco/DB después de interrupciones.

**Aceptación:** copia consume cuota adicional; papelera no libera espacio; purga sí. Padre eliminado impide restauración y la restauración de árbol respeta eliminaciones previas.

### E06 — APK: interfaz y segundo plano

**Depende de:** E02–E05. **Archivos:** `app_movil/lib/app/`, `core/`, `features/`, `pubspec.yaml`, configuración Android y pruebas Flutter.

- [ ] Adaptar plantilla a las funcionalidades, reemplazando datos ficticios.
- [ ] Implementar registro/login, explorador, búsqueda, cuota y operaciones de archivos/papelera.
- [ ] Selección manual, cola persistente, progreso y reanudación de transferencias.
- [ ] Probar segundo plano, pantalla apagada, desconexión y reapertura en Android real.
- [ ] Ofrecer biometría tras login si hay soporte. Sin lector/cancelación, usar contraseña; no guardar la contraseña del usuario.
- [ ] JPEG/PNG en pantalla; otros archivos mediante descarga/apertura externa sin edición.

**Aceptación:** cuentas aisladas, carga recuperable sin duplicaciones y sesión antigua invalidada también al intentar desbloquearla por biometría tras cambiar contraseña.

### E07 — Publicación y entrega Android

**Depende de:** E06 y evaluación técnica del acceso externo con herramientas open source. **Archivos:** `docs/operacion.md`, configuración de producción y scripts de servicio/respaldo PostgreSQL.

- [ ] Elegir herramientas open source para publicación HTTPS según red y ausencia de dominio. Comprobar IP pública/CGNAT, acceso al router, necesidad de intermediario y límites de transferencia. Documentar requisitos y posibles costos antes de contratar infraestructura.
- [ ] Configurar servicio, arranque, secretos, almacenamiento externo y rotación de logs técnicos.
- [ ] Programar respaldo semanal de PostgreSQL en un directorio del mismo servidor separado del almacenamiento de archivos. Definir horario y retención configurables, permisos restrictivos y comprobar restauración en una base aislada.
- [ ] Documentar que restaurar PostgreSQL no recupera archivos físicos perdidos; conciliar metadatos sin borrar contenido silenciosamente.
- [ ] Generar APK e instrucciones de instalación/conexión.

**Aceptación:** login, subida reanudable y descarga desde red externa. Esta es la primera versión entregable.

### E08 — Windows

**Depende de:** E07. **Archivos:** `app_movil/windows/`, adaptadores y diseño de escritorio.

- [ ] Adaptar selección, descargas, almacenamiento de sesión y progreso.
- [ ] Implementar acceso por usuario y contraseña; no añadir biometría en Windows.
- [ ] Compilar y probar en Windows y documentar instalación.

**Aceptación:** mismo espacio y operaciones del APK en un equipo Windows; no declarar validación del target solo desde Linux.

### E09 — Linux

**Depende de:** E08. **Archivos:** `app_movil/linux/`, adaptadores y guía de instalación.

- [ ] Adaptar credenciales, selección/apertura y empaquetado.
- [ ] Implementar acceso por usuario y contraseña; no añadir biometría en Linux.
- [ ] Verificar explorador, transferencias, copias y papelera.

**Aceptación:** cliente funcional en la distribución elegida, con acceso por usuario y contraseña.

### E10 — Web

**Depende de:** E09. **Archivos:** `app_movil/web/`, adaptadores web y configuración de sesión/orígenes.

- [ ] Publicar URL de acceso; archivos y operaciones requieren login.
- [ ] Proteger sesión web y solicitudes contra CSRF cuando se usen cookies; preferir mismo origen cuando sea posible.
- [ ] Adaptar selección, progreso, vistas previas y descarga. Tras recarga, pedir nuevamente el archivo cuando el navegador no conserve acceso local.
- [ ] Usar usuario y contraseña sin biometría web. No trasladar la promesa de segundo plano Android a una pestaña cerrada.

**Aceptación:** operar desde navegador sin exponer archivos anónimamente ni rutas físicas.

## 6. Matriz de verificación

| Requisito | Entregas | Escenario mínimo |
| --- | --- | --- |
| Auditoría SATH | E01–E05 | Creación/última modificación con actor; sin historial añadido. |
| Tres sesiones por cuenta | E02 | Concurrencia de login y revocación por contraseña. |
| Privacidad | E02–E10 | Rechazo de IDs ajenos en recurso, origen, destino y carga. |
| Cuota decimal | E03–E05 | Límite exacto, reservas simultáneas y limpieza tras fallo. |
| Reanudación | E04/E06 | Desconexión y pérdida de respuesta sin duplicación. |
| Papelera | E05 | Árbol anidado, padre eliminado y purga reiniciada. |
| Fondo Android | E06 | Subida continúa al cambiar de aplicación; pantalla apagada, red recuperada y reapertura. |
| Biometría | E06/E08–E10 | Opcional solo en APK; los otros clientes usan usuario y contraseña. |
| Nombre/JPEG/PNG | E06–E10 | Búsqueda sin contenido y previsualización acotada. |
| Acceso externo | E07 | Operaciones desde otra red con HTTPS. |
| Respaldo DB | E07 | Ejecución semanal local y restauración aislada; sin respaldo de contenido subido. |
| Plataformas | E08–E10 | Evidencia en Windows, Linux y navegador correspondientes. |

Durante implementación: `cd backend && ./mvnw test`; `cd app_movil && flutter analyze`; `cd app_movil && flutter test`. Construir cada target en su entorno. Registrar resultados y bloqueos reales.

## 7. Aclaraciones resueltas y detalles operativos

### P01 — Segundo plano Android: resuelto

Continuar la subida de archivos seleccionados cuando el usuario salga de la aplicación. Mantener cola persistente y reanudación. Esto no incorpora vigilancia de carpetas, carga de fotos nuevas ni sincronización de cambios externos. Sigue aplicando la recuperación al reabrir tras una detención forzada del sistema.

### P02 — Publicación: herramientas open source

La publicación se realizará con herramientas open source. La elección concreta corresponde a la evaluación técnica de E07: conectividad real de la portátil, acceso al router, CGNAT, dirección pública y HTTPS sin dominio contratado. No se ha elegido todavía un producto ni autorizado contratar infraestructura; el carácter open source del software no determina la disponibilidad o costo de un servidor intermediario.

### P03 — PostgreSQL: respaldo semanal local

Ejecutar respaldo semanal de PostgreSQL en el mismo servidor, en un directorio separado y con acceso restringido. Los archivos subidos no se respaldan. Horario y cantidad de respaldos a conservar serán parámetros operativos que se fijarán en E07; no ejecutar una política de borrado sin documentar su retención.

### P04 — Biometría: solo APK, opcional

Ofrecer biometría únicamente en el APK Android compatible y después de iniciar sesión. El usuario puede rechazarla o seguir usando contraseña. Windows, Linux y web emplean usuario y contraseña, incluso si el equipo dispone de lector.

Las decisiones de funcionalidad anteriores quedan cerradas. Solo falta concretar en E07 la herramienta de publicación y los parámetros de horario/retención de respaldos.

## 8. Reglas para OpenCode

1. Leer `AGENTS.md` y este plan. Las respuestas archivadas son referencia histórica subordinada al plan vigente.
2. Trabajar una tarea revisable por vez, identificando archivos y dependencias.
3. Mantener OpenAPI y dominio consistentes; no introducir funciones excluidas.
4. No confundir auditoría con historial/versionado ni reintroducir antivirus, administrador, correo o vista previa PDF.
5. Preservar cambios ajenos y escribir commits en español.
6. Reportar archivos, comportamiento, comprobaciones y decisiones pendientes; no marcar tareas completas sin evidencia.
7. Respetar las decisiones de la sección 7. Resolver los detalles operativos en E07 sin detener trabajo independiente.

## 6. Estado de implementación (matriz)

### Implementado
| Función | Estado | Notas |
| --- | --- | --- |
| Registro abierto por nombre/contraseña | Implementado | Sin admin ni recuperación por correo. Requiere red confiable. |
| Login y sesiones (máx 3) | Implementado | Serialización por usuario, revocación al cambiar contraseña. |
| Token Bearer + filtro auth | Implementado | TokenService con transacción. |
| Explorador (listar/buscar por nombre) | Implementado | Paginación, búsqueda case-insensitive. |
| Renombrar archivos/carpetas | Implementado | |
| Crear carpetas | Implementado | Resolución de conflictos de nombres. |
| Cuota (ocupados/reservados) | Implementado | Concurrencia por usuario. |
| Resumen de espacio | Implementado | |
| Cargas reanudables (fragmentos) | Implementado | Offset confirmado por servidor, validación de tamaño. |
| Consulta de carga (GET) | Implementado | Cliente consulta offset del servidor al reanudar. |
| Copia de archivos con progreso | Parcial | Files.copy síncrono; progreso solo al finalizar. |
| Papelera de archivos (enviar/restaurar/borrar) | Parcial | Envío y restauración de archivos individuales desde Flutter; restaurar resuelve nombres duplicados con prefijo. El borrado definitivo existe en API, pero falta la acción en Flutter. |
| Explorador Flutter | Implementado | Vista grilla/lista, miniaturas y previsualización de imágenes; videos abren el reproductor predeterminado en móvil. |
| Despliegue Debian Web + API | Implementado | `scripts/deploy_debian.sh` compila y arranca ambos procesos; requiere configurar `.env`, PostgreSQL y HTTPS/proxy para exposición pública. |
| Purga periódica de cargas | Implementado | Cron diario. |
| Biometría (Android) | Base | local_auth configurado. |
| Publicación HTTPS | Documentado | Túneles/reverse proxy open source. |
| Respaldos PostgreSQL | Script | backup_postgres.sh, cron manual. |
| Android APK | Generado | app-debug.apk. |
| Windows/Linux/Web config | Configurado | Documentación y plataforma_config. |

### Parcial
| Función | Estado | Pendiente |
| --- | --- | --- |
| Papelera de carpetas | Parcial | El listado y restauración individual existen, pero falta enviar carpetas/árboles a la papelera y restaurar grupos de eliminación. |
| Copia de árboles | Parcial | Solo archivos individuales; falta copia recursiva de carpetas. |
| Descarga de archivos | Parcial | Falta endpoint de contenido/streaming y previsualización JPEG/PNG. |
| Movimiento de archivos/carpetas | Parcial | Falta endpoint y lógica de mover entre carpetas. |
| Vaciado de papelera | Parcial | Falta endpoint DELETE /api/papelera. |
| Segundo plano Android | Parcial | Base implementada; falta prueba en dispositivo real. |
| Reanudación tras cierre de app | Parcial | Persiste cargaId/offset; falta prueba completa. |

### Pendiente
| Función | Notas |
| --- | --- |
| Endpoint de descarga/contenido | GET /api/archivos/{id}/contenido |
| Movimiento de archivos/carpetas | PATCH con carpetaDestinoId |
| Copia recursiva de carpetas | Copiar árbol completo |
| Vaciado completo de papelera | DELETE /api/papelera |
| Envío de carpetas a papelera | Solo archivos tienen endpoint; carpetas no. |
| Espacio físico libre en disco | Verificar antes de reservar |
| Recuperación ante fallos DB/disco | Conciliación tras reinicios |
| HTTPS en producción | Configurar túnel/reverse proxy |
| Respaldos automatizados | Cron programado |
| Pruebas en dispositivo Android real | Segundo plano, biometría |

### Política de registro

El registro es **abierto** por nombre de usuario y contraseña, sin administrador ni recuperación por correo, según el plan original. Para despliegues privados, se recomienda:
- Colocar el servidor detrás de VPN o firewall
- Deshabilitar el registro público si no se necesita (variable de entorno o configuración futura)
- El bootstrap crea el primer usuario si la base está vacía, usando `BOOTSTRAP_USUARIO` y `BOOTSTRAP_CONTRASENA`

No se requiere invitación ni administrador para el MVP.
