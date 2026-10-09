# Riftbound Collection Hub — BLUEPRINT v3.2

Repositorio previsto: `riftbound-collection-hub` (privado). Ubicación: raíz del repositorio.
Fecha de preparación: 2026-10-08. Idioma de especificación: español. Idioma del producto: English.

## 0. Procedencia y alcance de esta versión

Esta es una reconstrucción operativa v3.0 basada en los requisitos explícitos del usuario y en las partes legibles de la conversación «Crear aplicación Riftbound». La lectura del historial devolvió referencias internas en las respuestas del asistente, no su contenido. Por tanto, **no es una transcripción íntegra ni una recuperación verificable del blueprint original**. No se atribuyen al historial decisiones que no pudieron leerse.

Requisitos confirmados: colección de ediciones elegibles según rareza y producto (Common/Uncommon base no foil; Rare/Epic foil estándar; Proving Grounds completo según Riot); masterset de 3 copias normales y 1 Legend/Battlefield; colección y wishlist ordenadas por set y CARD # con orden configurable; deckbuilding theorycraft/physical con asignaciones físicas; dashboard; Rules Assistant con fuentes oficiales, FAQ y erratas versionadas y RAG; diseño híbrido dark en inglés; Next.js, Supabase y Vercel.

Los detalles de arquitectura, tablas, UX, fases y pruebas de este documento son propuestas concretas para implementar esos requisitos. Constituyen la base de trabajo salvo una instrucción posterior del usuario. Las decisiones pendientes de la sección 13 no deben resolverse inventando datos del juego. La revisión v3.1 incorpora las modificaciones explícitas posteriores del usuario; las versiones de este documento identifican la especificación del producto, no las reglas de Riftbound.

## 1. Objetivo y límites

Crear una aplicación web para consultar el catálogo, registrar cartas propias, completar un masterset funcional, planificar adquisiciones, construir mazos y reservar copias físicas sin duplicarlas entre mazos. Ayudar a resolver dudas de juego con evidencia oficial trazable y vigente según la última sincronización correcta.

El sistema debe persistir datos reales, funcionar en móvil y escritorio y aislar la información de cada usuario. No basta una interfaz con datos simulados. Los datos de demostración deben identificarse expresamente.

Fuera del alcance inicial: marketplace, pagos, comercio entre usuarios, precios automáticos, tasación, escáner OCR, aplicación nativa, partidas simuladas, recomendaciones competitivas automáticas, red social y tracking de todas las variantes coleccionables. No añadir estas funciones sin una petición explícita.

## 2. Invariantes del dominio

### 2.1 Identidad y catálogo base

- Separar la identidad jugable canónica de una carta, su edición por set y sus impresiones/variantes visuales. Usar identificadores estables, nunca el nombre como clave única.
- La colección usa una edición estándar elegible por carta/set según esta política confirmada por el usuario:
  - **Common y Uncommon:** sólo versión base no foil. Su versión foil queda excluida de colección, masterset y wishlist.
  - **Rare y Epic:** versión foil estándar, que el usuario identifica como su única presentación habitual. Este foil es la edición elegible, no una variante adicional ni un objetivo separado.
  - **Proving Grounds:** incluir **todas las cartas que trae el producto**, en la versión/tratamiento descrito oficialmente por Riot. Esta regla de producto tiene precedencia sobre el filtro general por rareza; no excluir una carta del producto por aplicar automáticamente dicho filtro.
- «Base» en el resto de este documento significa **edición estándar elegible**, que puede ser no foil o foil según la política anterior. No equivale a «siempre no foil».
- Alternate art, tratamientos especiales y promos externos a la composición oficial de Proving Grounds no crean objetivos adicionales ni inflan cantidades. Las variantes excluidas pueden conservarse como metadatos de referencia, sin incorporarse al inventario elegible.
- Para Proving Grounds, importar una lista completa y trazable a Riot con identidad, número, tipo, rareza, tratamiento y cantidad incluida cuando estén publicados. Mantener la pertenencia al producto separada del set impreso: una carta presente en varios productos no duplica por sí sola el inventario ni el objetivo de masterset. La cantidad incluida en el producto no reemplaza el objetivo de 3/1 del masterset.
- Una errata actualiza el texto efectivo/versionado de la carta; no crea una carta nueva ni pierde el texto impreso original.
- Al importar, identificar sets, números de colección, tipo, dominios, rareza, costes, estadísticas, texto e imagen cuando existan en la fuente. Los campos desconocidos quedan ausentes y visibles como tales; no inventarlos.
- Si Proving Grounds incluye runes, tokens u otras categorías, incluirlas en su checklist oficial, sin omitirlas por su tipo. Para otras colecciones/productos, y para objetivos masterset de categorías que no encajan en «normal/Legend/Battlefield», aplicar las decisiones pendientes de la sección 13. La inclusión completa de Proving Grounds ya está confirmada; no volver a dejarla pendiente.

### 2.2 Masterset funcional

Para un set seleccionado, el objetivo por cada entrada base elegible es:

```text
target(card) = 1 si el tipo es Legend o Battlefield
target(card) = 3 para las demás cartas normales elegibles
owned(card) = cantidad registrada de la impresión base de ese set
covered(card) = min(owned(card), target(card))
missing(card) = max(target(card) - owned(card), 0)
excess(card) = max(owned(card) - target(card), 0)
completion = sum(covered) / sum(target) * 100
```

- El progreso se calcula por copias objetivo, no sólo por cartas distintas. Puede mostrarse una segunda métrica de cartas distintas claramente rotulada.
- Más copias que el objetivo no elevan el progreso por encima del 100%.
- Las copias reservadas en mazos siguen siendo propias y cuentan para el masterset.
- Un set sin entradas elegibles muestra `No cards available` y progreso indefinido, sin dividir por cero ni afirmar que está completo.
- El masterset es un objetivo de colección; **no define los límites legales de los mazos**.
- Propuesta para reimpresiones: progreso por set/edición base, sin transferir automáticamente copias entre sets. La equivalencia jugable para mazos se trata por separado.

### 2.3 Inventario físico y disponibilidad

Para cada usuario y entrada de inventario:

```text
owned >= 0 (entero)
reserved = suma de asignaciones a mazos físicos activos
available = owned - reserved
0 <= reserved <= owned
```

- Registrar cantidades físicas y asignaciones por lote/entrada base. Una asignación tiene cantidad entera positiva. No se exige un identificador por ejemplar individual en el MVP.
- Una copia reservada no se vuelve a ofrecer como disponible para otro mazo físico.
- Reservar, liberar, reemplazar y cambiar cantidades deben ser operaciones transaccionales en la base de datos, con comprobaciones y control de concurrencia. Una comprobación sólo en el cliente es insuficiente.
- Reducir inventario por debajo de lo reservado falla con una explicación de los mazos afectados. No liberar ni reasignar copias sin decisión del usuario.
- Al eliminar un mazo físico, liberar sus asignaciones dentro de la misma transacción.
- Separar cantidad requerida, cantidad asignada y déficit. Un mazo físico puede guardarse incompleto, pero nunca mostrar `Ready` si tiene déficit, asignaciones inválidas o legalidad sin verificar.

### 2.4 Orden de colección y wishlist

- Orden inicial obligatorio: **set primero, luego CARD # ascendente dentro del set**. Cada set forma un bloque completo antes de pasar al siguiente; no intercalar sets por compartir el mismo número.
- Ejemplo solicitado: `OGN 001, OGN 002, …, OGN 298`, y sólo después `SFD 001, SFD 002, …`. Es un ejemplo de secuencia, no un límite de catálogo hardcodeado ni una verificación del número total de cartas de OGN.
- Usar un orden explícito de sets (`sort_order`) que garantice OGN antes de SFD; mantener una secuencia documentada para otros sets. No ordenar los códigos alfabéticamente como sustituto de esta secuencia. Proving Grounds es además un filtro/checklist de producto; conservar el código y número oficiales de cada carta, sin inventar un set para forzar el orden.
- Comparar CARD # por su componente numérico: 2 precede a 10. Conservar ceros iniciales y sufijos oficiales para mostrar el identificador; definir comparación natural para sufijos y un desempate estable por impresión/ID. Números ausentes van al final de su set, con estado de dato incompleto visible.
- Aplicar el mismo comparador a colección y wishlist, incluyendo las sugerencias de faltantes. Ordenar el conjunto completo antes de paginar; los filtros no deben romper la secuencia de las filas restantes.
- Añadir `Sort by` y dirección `Ascending`/`Descending`, más `Reset to default`. Condiciones disponibles: `Set / CARD #`, `Name`, `Rarity`, `Card type`, `Domain`, `Owned quantity`, `Missing quantity`; wishlist añade `Priority` y `Desired quantity`. Estas condiciones son opciones de diseño concretas para el requisito de orden configurable.
- Para `Rarity`, usar Common → Uncommon → Rare → Epic, con tipos/rarezas adicionales definidos explícitamente. Para `Priority`, usar High → Medium → Low. Las demás categorías usan sus etiquetas English; desempatar todos los órdenes alternativos por el orden canónico de set/CARD # y luego ID.
- Propuesta de persistencia: guardar la preferencia por usuario y pantalla. Sin preferencia guardada, usar siempre el orden obligatorio; `Reset to default` restaura ese orden. No cambiar cantidades, reservas ni prioridades al reordenar.

## 3. Experiencia y diseño

Diseño híbrido: propuesta de una experiencia visual de cartas para explorar, combinada con tablas y paneles compactos para administrar cantidades y mazos. Tema dark por defecto, tipografía legible, acentos contenidos, imágenes protagonistas y controles de inventario claros.

- Toda la interfaz final está en inglés: navegación, botones, validaciones, errores y estados vacíos. La conversación de desarrollo puede ser en español.
- Navegación principal: `Dashboard`, `Collection`, `Masterset`, `Wishlist`, `Decks`, `Rules Assistant`, `Settings`.
- Grid/list toggle en colección; búsqueda y filtros por set, nombre, tipo, dominio, rareza y estado de propiedad. No depender sólo del color para comunicar estados.
- Colección y wishlist ofrecen los controles de orden de 2.4 en móvil y escritorio; conservar el orden elegido al alternar grid/list y distinguir ordenar de filtrar. Añadir acceso al checklist completo de Proving Grounds.
- Detalle de carta: imagen base, metadatos, texto impreso y efectivo, erratas enlazadas, owned/reserved/available, objetivo y faltantes, acciones de colección/wishlist/mazo.
- Mostrar loading, empty, error, retry y success en los flujos con persistencia. Evitar indicadores de éxito antes de confirmar la escritura.
- Mobile: controles táctiles, paneles adaptados y navegación usable sin desbordes. Desktop: navegación lateral y paneles de detalle donde aporten claridad.
- Accesibilidad: teclado, foco visible, etiquetas de formulario, textos alternativos, contraste suficiente y anuncios de errores/cambios importantes.

## 4. Funcionalidades y criterios de aceptación

### COL — Colección

Consultar catálogo, buscar/filtrar y añadir o quitar cantidades base. Mostrar owned, reserved y available. Validar entradas en servidor. Persistir por usuario y reflejar resultados tras recargar.

Aceptación COL-1: una carta pasa de 0 a 2, se recarga la página y sigue en 2. COL-2: no se aceptan cantidades negativas ni fraccionarias. COL-3: un usuario no accede a inventarios ajenos. COL-4: una variante alternativa no suma al inventario base. COL-5: se bloquea una reducción que invalida asignaciones. COL-6: Common/Uncommon sólo admiten la base no foil, y Rare/Epic admiten el foil estándar. COL-7: el checklist Proving Grounds coincide con todas las cartas y versiones descritas por Riot y aplica su excepción de producto. COL-8: por defecto se completa el bloque OGN por CARD # antes de SFD, sin intercalación entre páginas. COL-9: funcionan los órdenes alternativos y su dirección; reset restaura set/CARD #, sin alterar datos.

### MST — Masterset

Seleccionar set, ver progreso global y por tipo, faltantes y excedentes; filtrar cartas incompletas. Usar las fórmulas de 2.2 en una única implementación de dominio.

Aceptación MST-1: carta normal con owned=2 tiene target=3 y missing=1. MST-2: Legend y Battlefield con owned=1 están completos. MST-3: owned=5 de una normal aporta 3 al numerador y excess=2. MST-4: reservar cartas no baja el progreso. MST-5: ningún cálculo incluye variantes no elegibles. MST-6: el foil estándar Rare/Epic sí cuenta; el foil Common/Uncommon no cuenta salvo la excepción oficial de Proving Grounds. MST-7: pertenecer a Proving Grounds no duplica automáticamente una carta/impresión ya representada ni sustituye el objetivo masterset por la cantidad contenida en la caja.

### WSH — Wishlist

Mantener una lista manual de adquisiciones con cantidad deseada, prioridad y nota, además de sugerencias calculadas desde masterset y déficits de mazos. Propuesta de prioridades: `High`, `Medium`, `Low`.

- Distinguir el origen: `Manual`, `Masterset`, `Deck`. Las sugerencias no deben sobrescribir intenciones manuales.
- Añadir faltantes a la lista mediante una acción explícita. Permitir editar o retirar entradas.
- Aplicar la política de ediciones de 2.1 y el mismo orden canónico y configurable de 2.4. No sugerir compras de foil Common/Uncommon excluido; Rare/Epic apunta a foil estándar y Proving Grounds a su versión oficial.
- Mostrar objetivo de adquisición y déficit restante. Recalcular con cambios de inventario sin convertir automáticamente una wishlist en cartas propias.
- Deduplicar por carta/edición según la política de identidad; al combinar razones, mostrar cada razón y evitar sumas engañosas. Propuesta MVP: para colección/masterset usar el máximo de objetivos compatibles; para mazos físicos simultáneos sumar la demanda y descontar inventario sólo una vez. No mezclar una cantidad de compra pendiente con un objetivo total sin convertir su significado.

Aceptación WSH-1: una entrada manual sobrevive a un cambio de progreso. WSH-2: añadir dos veces el mismo faltante no lo duplica accidentalmente. WSH-3: al adquirir copias disminuye el déficit derivado. WSH-4: las razones quedan visibles para entender el cálculo. WSH-5: el orden inicial coincide con colección (set, luego CARD #), tanto para entradas manuales como sugeridas. WSH-6: ordenar por prioridad, cantidad deseada u otras condiciones y reset funciona sin modificar entradas. WSH-7: las ediciones sugeridas respetan rareza y la excepción Proving Grounds.

### DCK — Deckbuilding

Crear, renombrar, duplicar y eliminar mazos. Buscar cartas y editar cantidades por sección del mazo. Propuesta de secciones: main deck, rune deck, Legend, chosen champion, Battlefields y sideboard cuando el formato oficial lo permita; verificarlas contra fuentes oficiales antes de fijar tamaños o límites.

**Theorycraft:** permite cartas no poseídas, no reserva inventario y muestra faltantes hipotéticos. Guardar ideas no implica que el mazo sea legal.

**Physical:** permite asignar cantidades de entradas físicas elegibles a líneas del mazo. Mostrar disponibilidad, origen de copias, conflictos y déficit. La conversión desde theorycraft no fabrica copias ni toma reservas de otros mazos. La conversión a theorycraft libera reservas de forma transaccional.

- Duplicar un mazo debe crear una copia theorycraft sin heredar asignaciones.
- Editar un mazo físico no debe dejar reservas huérfanas: actualizar composición y asignaciones coherentemente o exigir reasignación explícita.
- Separar `Inventory status` de `Legality status`. Propuesta: inventario `Incomplete`/`Allocated`; legalidad `Valid`/`Invalid`/`Unverified`; `Ready` requiere Allocated y Valid bajo el perfil de reglas activo.
- Legalidad: perfiles versionados por formato, fecha efectiva, límites por identidad jugable, dominios, secciones y restricciones oficiales. No deducir límites desde el objetivo del masterset.
- Cuando cambian reglas/erratas, invalidar o recalcular la validación previa y mostrar su versión. Conservar el mazo aunque quede inválido.
- Propuesta: importar/exportar una lista de texto con formato documentado, previsualización de errores y resolución de nombres ambiguos. Importar no modifica la colección.

Aceptación DCK-1: theorycraft funciona con inventario cero y no reserva. DCK-2: con owned=3, reservar 2 en A deja 1 disponible; B no puede reservar 2. DCK-3: dos reservas concurrentes no exceden owned. DCK-4: eliminar/converter libera reservas. DCK-5: duplicar no duplica reservas. DCK-6: editar cantidades mantiene integridad. DCK-7: no hay validación legal positiva sin perfil oficial verificado.

### DSH — Dashboard

Mostrar total de copias base, cartas distintas, progreso del masterset por set, copias faltantes, wishlist y resumen de mazos físicos con disponibilidad/legalidad. Enlazar cada métrica a su detalle. Mostrar última sincronización del catálogo y reglas con estado de actualización.

Aceptación DSH-1: métricas coinciden con colección/masterset/mazos para el mismo usuario y ámbito. DSH-2: las reservas no cambian owned. DSH-3: métricas sin datos tienen estados vacíos comprensibles.

### RUL — Rules Assistant oficial

Buscador y asistente sobre Core Rules, Tournament Rules cuando apliquen, FAQ oficiales, clarificaciones, patch notes y erratas por carta. RAG significa recuperar fragmentos documentales antes de generar una respuesta, con citas comprobables.

**Fuentes iniciales verificadas:**

- Hub oficial: https://playriftbound.com/en-us/rules-hub/
- Publicaciones oficiales de reglas: https://playriftbound.com/en-us/news/rules-and-releases/
- Referencia histórica Core Rules: https://riftbound.leagueoflegends.com/en-us/news/rules-and-releases/gameplay-guide-core-rules/
- Erratas históricas Origins: https://riftbound.leagueoflegends.com/en-us/news/rules-and-releases/riftbound-origins-card-errata/

Usar el hub para descubrir los enlaces vigentes. No tratar el documento histórico ni su FAQ archivada como la versión actual por defecto. El dominio oficial puede enlazar PDFs en otro host: admitir únicamente recursos enlazados desde una fuente oficial validada. No asumir que existe una API de cartas o reglas accesible sin verificar su documentación y permisos.

**Ingesta y versionado:**

1. Propuesta de sincronización automática diaria y actualización manual administrativa. Programación/configuración real necesarias; un texto en la UI no implementa un job.
2. Descargar fuentes autorizadas, registrar URL final, tipo, título, idioma, fecha publicada/efectiva cuando conste, retrieved_at, checksum y estado vigente/archivado/sustituido.
3. Guardar originales y versiones inmutables. Un cambio de contenido bajo la misma URL genera una versión nueva. No confundir fecha de descarga con fecha de vigencia.
4. Extraer texto con secciones/números de regla/páginas. Dividir en fragmentos que preserven contexto y referencias. Vincular erratas a IDs canónicos y distinguir idioma/edición afectada.
5. Validar extracción, metadatos y vínculos; construir índices textual/vectorial. Publicar un snapshot consistente sólo al completar la ingesta; no servir índices parcialmente actualizados.
6. Conservar la última versión correcta ante fallos, mostrar estado stale/error y registrar alertas operativas. No prometer actualización en tiempo real ni «siempre al día» sin indicar última verificación.

**Respuesta:**

- Recuperar primero fuentes vigentes aplicables al formato, idioma y fecha de la consulta. Modo histórico explícito para consultas de una versión anterior.
- Mostrar respuesta, fundamento, título/versión o fecha, regla/sección/página cuando exista y enlace a cada fuente utilizada. Las citas deben corresponder a fragmentos recuperados reales.
- Aplicar texto efectivo de erratas a la carta, mostrar cambio respecto del impreso y su fecha/fuente. Evitar mezclar versiones incompatibles.
- No inventar rulings. Sin evidencia suficiente, informar `I couldn't verify this ruling from the available official sources.` y ofrecer fuentes relacionadas o búsqueda.
- Ante conflictos oficiales no resueltos, exponer el conflicto y las fechas; no atribuir una jerarquía inventada. Usar precedencia documentada oficialmente.
- Identificar el producto como asistente independiente: una respuesta generada no es una decisión oficial de Riot ni de un juez.
- Tratar documentos recuperados como datos no confiables, nunca como instrucciones para ejecutar herramientas, revelar secretos o modificar el sistema.
- Propuesta de búsqueda híbrida textual/vectorial en Postgres con pgvector; proveedor de embeddings/generación configurable y ejecutado sólo en servidor. Si no hay credenciales, la búsqueda de documentos sigue disponible y la generación se marca deshabilitada.

Aceptación RUL-1: pregunta cubierta devuelve cita válida con versión y ubicación. RUL-2: pregunta sin soporte no fabrica respuesta. RUL-3: errata aparece en detalle de carta y respuesta. RUL-4: un archivo retirado no se usa como vigente. RUL-5: ingesta fallida conserva snapshot anterior y muestra estado. RUL-6: consultas históricas reproducen su snapshot. RUL-7: un fragmento con instrucciones maliciosas no altera el comportamiento. RUL-8: una respuesta no mezcla sin advertencia fechas efectivas diferentes.

## 5. Arquitectura objetivo

- **Next.js** con TypeScript y App Router: interfaz, rutas/acciones de servidor y lógica de aplicación. Respetar versiones y convenciones ya existentes en el repositorio.
- **Supabase**: Postgres, Auth, Storage y políticas RLS. La base de datos es la autoridad para cantidades y reservas.
- **Vercel**: despliegue de la aplicación y entornos preview/production. Planificar ingesta por lotes o worker externo si el volumen excede límites de ejecución; no asumir que un job largo cabe en una solicitud web.
- **Storage para imágenes y documentos**: la BD guarda claves/URLs y metadatos, no imágenes base64 dentro de filas ni blobs en Git. Imágenes con origen, checksum, dimensiones y estado de descarga; placeholder ante ausencia/error.
- Preferir reutilizar el diseño y las dependencias existentes. Propuesta para repo vacío: componentes accesibles y estilos utilitarios; no imponer una librería nueva sin necesidad.
- Configurar cachés del catálogo/reglas por versión; nunca compartir respuestas privadas cacheadas entre usuarios. Invalidar vistas tras mutaciones confirmadas.

## 6. Modelo de datos propuesto

Los nombres son orientativos; adaptar a esquemas existentes sin romper los invariantes.

| Entidad | Propósito y datos mínimos |
| --- | --- |
| sets | ID estable, código, nombre, fecha de lanzamiento, sort_order explícito, fuente |
| cards | Identidad jugable, nombre, tipo, dominios y atributos canónicos |
| card_printings | Carta, set, CARD # original y componentes de orden natural, variante/base, tratamiento foil/no foil, idioma, texto impreso, imagen, elegibilidad y motivo |
| products / product_contents | Producto (incluido Proving Grounds), impresiones incluidas, cantidades publicadas, fuente oficial y versión; pertenencia distinta del set |
| card_images | Impresión, storage key/URL autorizada, fuente, checksum, estado |
| profiles | ID vinculado a Auth y preferencias, incluyendo campo/dirección de orden por pantalla |
| collection_entries | Usuario, impresión base, cantidad entera, timestamps; unicidad usuario/impresión |
| wishlist_entries | Usuario, impresión/carta resuelta, objetivo o cantidad de compra con semántica explícita, prioridad, nota |
| decks | Usuario, nombre, mode, formato, estado y referencia de validación |
| deck_cards | Mazo, carta jugable, sección, cantidad entera positiva |
| deck_allocations | Línea del mazo, entrada de colección, cantidad; mismo propietario e identidad compatible |
| rules_sources | Origen autorizado, URL y tipo de documento |
| rules_document_versions | Metadatos, checksum, original, estado y fechas de vigencia |
| rules_snapshots | Conjunto coherente de versiones publicado para consulta |
| rules_chunks | Versión, texto, sección/página y embedding/indexación |
| card_errata | Carta, versión fuente, texto anterior/efectivo, idioma y vigencia |
| legality_profiles | Formato, versión fuente y restricciones verificadas |
| sync_runs | Fuente, inicio/fin, resultado, conteos y error sin secretos |

Usar claves foráneas, índices y restricciones. Verificar propietario también en joins/asignaciones. Los cálculos derivados deben venir de una única fuente; evitar guardar contadores desincronizados. Diseñar migraciones versionadas y seed mínimo reproducible con procedencia o fixtures inequívocos.

## 7. Seguridad y gestión de servicios

- RLS en todas las tablas personales. Usuarios sólo leen y escriben sus propios registros; catálogo/reglas pueden ser legibles según política y sólo administradores/jobs autorizados los modifican.
- Funciones transaccionales validan usuario autenticado y ownership. Si se necesita SECURITY DEFINER, restringir permisos, search_path y parámetros; nunca aceptar user_id como autorización suficiente.
- Claves privilegiadas de Supabase y del proveedor IA sólo en servidor. Variables públicas únicamente para valores diseñados para ser públicos. No incluir secretos en commits, respuestas, logs ni fixtures.
- Proveer `.env.example` con nombres y valores ficticios; separar entornos local, staging/preview y producción. No conectar pruebas a datos personales de producción.
- Validar entradas, proteger endpoints administrativos/jobs y aplicar límites de uso a generación e ingesta. Descargas con allowlist, timeout, tamaño máximo y validación de redirects para evitar SSRF.
- No renderizar HTML documental sin sanitizar. No permitir que una respuesta generada ejecute acciones con permisos del usuario.
- Guardar imágenes sólo cuando su fuente y condiciones permitan el uso; documentar atribución/procedencia y usar enlaces autorizados o placeholders si no es posible alojarlas. No inventar assets oficiales.
- Documentar backups, migración y recuperación antes del lanzamiento. Operaciones destructivas en producción requieren autorización explícita y plan de recuperación.

Supabase provee BD/Auth/Storage; Vercel aloja la web. Subir estos Markdown no crea proyectos, buckets, tablas, jobs, credenciales ni accesos de Codex a esos servicios. Cada integración requiere configuración y permisos separados.

## 8. Prioridades y entregas

Orden propuesto para asegurar dependencias, sin declarar terminado un módulo incompleto:

1. **P0 — Diagnóstico y fundamentos:** inspección del repo; arquitectura existente; configuración documentada; esquema, Auth/RLS, catálogo base, identidad y pipeline de imágenes mínimo; migraciones y pruebas de aislamiento.
2. **P1 — Colección y masterset:** persistencia de cantidades, cálculos, filtros, detalle y estados de UI.
3. **P2 — Wishlist y dashboard:** sugerencias trazables, entradas manuales y métricas coherentes.
4. **P3 — Deckbuilding:** theorycraft, perfil de legalidad verificado, physical y reservas transaccionales; concurrencia y cambios de modo.
5. **P4 — Rules Assistant:** fuentes oficiales, versiones, búsqueda, erratas y RAG con citas y sincronización observable. El versionado necesario para legalidad puede adelantarse a P3.
6. **P5 — Preparación de lanzamiento:** UX responsive/accesible, verificaciones integradas, backup, configuración de Vercel/Supabase y documentación operativa.

En cada fase entregar una porción funcional, pruebas pertinentes y limitaciones verificables. No alterar prioridades ni el alcance para facilitar la implementación sin dejar una decisión documentada.

## 9. Estrategia de validación

- Unitarias de lógica: masterset, faltantes, excedentes, disponibilidad, wishlist y separación entre legalidad/objetivo de colección.
- Verificar política de rareza/tratamiento, checklist íntegro Proving Grounds contra su fuente y ausencia de doble conteo por pertenencia a producto. Verificar orden OGN antes de SFD, comparación numérica 2/10, sufijos, números ausentes, desempates estables, filtros/paginación, órdenes alternativos y reset en colección y wishlist.
- Integración con BD aislada: restricciones, RLS entre dos usuarios, transacciones, concurrencia, cambio de modo, eliminación y reducción de inventario reservado.
- E2E de rutas críticas: autenticar, modificar colección/recargar, ver masterset, wishlist, crear theorycraft, asignar physical y consultar reglas con cita.
- Rules Assistant: corpus de preguntas con referencias oficiales esperadas, erratas y casos sin respuesta; fixtures de extracción y fallo de actualización; pruebas de aislamiento de snapshots e instrucciones maliciosas.
- Calidad técnica: comprobación de tipos, lint y build según scripts reales; no inventar comandos ni reportar pruebas no ejecutadas.
- Revisión visual: móvil/escritorio, teclado, loading/empty/error y fallback de imágenes.

Ejemplo determinista de masterset: una normal y una Legend tienen target total 4. Con owned normal=2 y Legend=1, covered=3, completion=75%, missing=1. Reservar una normal mantiene 75% y cambia available normal de 2 a 1.

## 10. Definición de terminado

Una función está terminada cuando cumple sus criterios aplicables, persiste datos correctamente, respeta ownership/RLS, mantiene invariantes bajo errores y concurrencia relevantes, tiene estados de UI claros y cuenta con verificación pertinente. Documentar dependencias externas o pruebas bloqueadas; una demo no equivale a integración validada.

Para el producto completo: módulos COL/MST/WSH/DCK/DSH/RUL operativos, fuentes/versiones identificables, UI English dark responsive, despliegue configurado, guía de entorno/migraciones/ingesta y ninguna credencial publicada. Si falta una integración, informar su estado exacto en lugar de marcar el producto listo.

## 11. Gestión de cambios

- Este archivo es la especificación de producto; `AGENTS.md` indica cómo trabajar en ella. Mantener ambos en la raíz.
- Cambiar requisitos, prioridades, política de variantes o fórmulas exige una petición del usuario o una propuesta claramente presentada. No modificar criterios para hacer pasar una implementación.
- Cambios rutinarios que preservan el contrato pueden resolverse con criterio técnico. Registrar decisiones significativas, motivo, impacto, migración y pruebas en PR o documentación existente.
- Toda PR debe referir criterios relevantes (por ejemplo, MST-1 o DCK-3) y distinguir comprobaciones ejecutadas de pendientes.
- Si se obtiene el historial completo, reconciliarlo con esta reconstrucción mediante diff y conservar explícitamente las correcciones del usuario.

## 12. Registro inicial

| Fecha | Versión | Cambio |
| --- | --- | --- |
| 2026-10-08 | 3.0 reconstruida | Requisitos explícitos consolidados; detalles propuestos y limitación de procedencia declarados; fuentes oficiales iniciales verificadas. |
| 2026-10-08 | 3.1 | Ediciones por rareza; inclusión completa de Proving Grounds según Riot; orden inicial por set/CARD # y opciones de orden en colección/wishlist; modelo, criterios y verificaciones alineados. |
| 2026-10-08 | 3.2 | Fuente comunitaria y alcance de todos los sets, incluida Radiance, confirmados por el propietario; autorización de imágenes y composición oficial de Proving Grounds siguen requiriendo evidencia. |

## 13. Decisiones pendientes del propietario

Resolver cuando afecten una implementación, sin bloquear trabajo independiente:

1. Alcance confirmado por el propietario: todos los sets presentes en el catálogo hasta la fecha, incluidas las cartas reveladas de Radiance. Fuente seleccionada: https://github.com/LouisCourrian/riftbound-cards (mirror comunitario; no implica verificación oficial ni derechos sobre imágenes). Mantener revisión independiente de autorización de assets, tratamientos y lista oficial completa de Proving Grounds, sin inferir contenidos ni aplicar foil por rareza a OGS. Identificar y etiquetar cartas preview/unreleased; no asumir que Radiance está completo.
2. Qué objetivo masterset corresponde a categorías fuera de normal/Legend/Battlefield, y si se incluyen fuera de Proving Grounds. No aplicar automáticamente un objetivo de 3 a tipos no confirmados ni excluirlos del checklist completo de Proving Grounds.
3. Si reimpresiones equivalentes cuentan entre sets o mantienen objetivos separados (propuesta actual: separados para masterset).
4. Formato(s) oficial(es) a validar primero, equivalencias de impresiones e idioma permitido para asignaciones físicas.
5. Proveedor/modelo de embeddings y generación, presupuesto y configuración del job de ingesta (propuesta: diario).
6. Significado visual exacto de «híbrido» si hay un diseño de referencia del historial no recuperado.

No solicitar contraseñas ni claves en el chat para resolver estas decisiones. Usar los mecanismos de secretos del entorno.
