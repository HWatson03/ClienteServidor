# Diseño: refactor del backend Java

## Objetivo

Homogeneizar el backend para que use Lombok en entidades y servicios, identifique las entidades con claves numéricas `Long`, mantenga cada DTO/record en su propio archivo y nombre las APIs con el sufijo `Api`. Las reglas de negocio y rutas HTTP existentes se conservarán salvo los cambios de tipo necesarios para IDs.

## Persistencia e identificadores

Las entidades `Usuario`, `Sesion`, `Archivo`, `Carpeta`, `CuotaUsuario`, `Carga` y `TareaCopia` tendrán claves `Long` generadas por PostgreSQL con `GenerationType.IDENTITY`. Cada campo Java tendrá el nombre `id` seguido del nombre de la entidad en UpperCamelCase (por ejemplo, `idCarpeta`); cada columna PK usará `id_` más el nombre de la entidad en minúsculas (por ejemplo, `id_carpeta`).

Cada FK se mapeará a la PK de la entidad destino y usará exactamente el nombre de esa PK. Por ejemplo, `archivos.id_carpeta` referencia `carpetas.id_carpeta`; las relaciones a usuario referencian `usuarios.id_usuario`. Los nombres se aplicarán consistentemente en anotaciones JPA, índices, constraints y migraciones.

Se reescribirán las migraciones Flyway existentes para el esquema vacío confirmado por el usuario. Las tablas, restricciones, índices, valores iniciales y columnas de auditoría requeridas por las entidades se definirán coherentemente desde V1. UUID se conservará únicamente para valores aleatorios no identificadores (por ejemplo, claves internas de almacenamiento o grupos de eliminación), si el código aún los necesita.

## Capas Java y Lombok

Las entidades usarán Lombok para getters/setters y constructor requerido por JPA, sin `@Data` para evitar `equals`, `hashCode` y `toString` sobre relaciones lazy. Los servicios usarán `@RequiredArgsConstructor` con dependencias `final`; se eliminarán sus constructores manuales. Los repositorios seguirán como interfaces Spring Data y cambiarán sus parámetros genéricos y métodos derivados a `Long`.

Los records y DTOs actualmente anidados se moverán a archivos públicos independientes en paquetes `dto` dentro de su módulo/capa de presentación o aplicación según su uso. Los controladores se renombrarán a clases y archivos `*Api` (por ejemplo, `ArchivoApi`), conservando rutas y comportamiento HTTP.

## Compatibilidad y alcance

Se actualizarán todas las firmas, parámetros de rutas, consultas de repositorio, relaciones y pruebas que dependan de UUID como ID. No se eliminarán reglas de negocio; “código legacy” aquí significa boilerplate reemplazado, DTOs anidados y tipos/nombres anteriores que queden obsoletos. Se preservarán los cambios locales previos no relacionados.

## Verificación

Se compilará y ejecutará la suite existente del backend. Se revisará que no queden UUID como tipo de ID de entidad o repositorio, que cada relación use la columna FK acordada y que Flyway cree el esquema desde cero antes de que Hibernate valide las entidades.
