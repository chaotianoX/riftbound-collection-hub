# Riftbound Collection Hub

Next.js / TypeScript / Supabase, interfaz English/dark. Entrega local de Collection, Masterset, Wishlist, Dashboard y Decks theorycraft/physical. La legalidad oficial permanece **Unverified** hasta contar con formato y perfiles oficiales verificables; Rules Assistant/ingesta son P4.

`BLUEPRINT.md` v3.1 y `AGENTS.md` se conservan íntegros. La especificación declara reconstrucción operativa v3.0: no se atribuyen decisiones a historial recuperado ni se inventan reglas Riot. Esta rama contiene la versión original autenticada con Supabase; la demo sin cuenta no forma parte de esta entrega. Publicar el código no configura ni despliega los servicios externos.

## Instalación local

Requisitos: Node >=22 (verificado con 24.19), npm y Docker local iniciado. El CLI necesita espacio para descargar sus imágenes. La aplicación y el CLI pueden usarse con Docker Desktop; scripts Bash de BD/tipos requieren Linux/macOS/WSL, y el harness avanzado usa el socket Docker local de Linux/WSL.

Clonar el repositorio y abrir una terminal en la carpeta `riftbound-collection-hub` (o extraer el ZIP de la versión original):

```sh
npm ci
npx --no-install supabase start
npx --no-install supabase migration up --local
cp .env.example .env.local
```

Completar `.env.local` con URL local y clave **pública** publishable/anon del Supabase local. No copiar service-role, JWT secrets ni contraseñas a variables públicas, commits o mensajes. `supabase status` puede mostrar claves privilegiadas: no publicar su salida completa.

```sh
# Opcional, únicamente para una prueba sin dataset autorizado:
npm run fixtures:local -- --test-only
npm run dev
```

Abrir `http://localhost:3000/settings`, crear cuenta/iniciar sesión y completar confirmación de correo si tu configuración la exige. El servidor de correo local del CLI permite consultar mensajes de prueba; no se configura SMTP de producción aquí. Después visitar Collection, Masterset, Wishlist, Dashboard y Decks.

Las cantidades se guardan realmente en tu BD local por usuario; los mocks no habilitan botones de inventario. Si no cargas catálogo, verás estados vacíos. Si cargas fixtures, verás el banner **TEST ONLY DATA**. Los fixtures no crean usuarios, propiedad, mazos ni reservas automáticamente.

| Variable | Uso |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | API de tu Supabase local o proyecto de prueba separado |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Clave pública publishable/anon, restringida por RLS |

No se requiere una clave privilegiada para usar la web. No conectar esta prueba a producción. Para revisar un proyecto Supabase propio sólo necesito su URL de prueba, clave pública configurada en `.env.local`/secretos del entorno y configuración Auth/redirecciones sin secretos. No enviar contraseñas ni service-role por chat.

## Recorrido sugerido

1. Collection: guardar 2 copias de una carta normal de prueba; recargar y comprobar owned=2 / target=3 / missing=1. Comparar grid/list, filtros y orden; reset vuelve a set/CARD # antes de paginar.
2. Masterset: seleccionar set, revisar faltantes/excesos y tipos con objetivo pendiente. Las reservas no reducen el progreso.
3. Wishlist: añadir faltante explícitamente; editar manual total/priority/note. Adquirir copias en Collection y comprobar que baja Remaining, sin perder la intención manual.
4. Decks: crear theorycraft con inventario cero; elegir impresión exacta, editar líneas y pasar a physical. Con owned=3, reservar 2 en A deja 1 disponible; intentar reservar 2 en B falla. Cambiar A a theorycraft o eliminarlo libera reservas; duplicar genera theorycraft sin reservas.
5. Dashboard: comparar métricas con las pantallas detalladas. Legality sigue Unverified; inventory Allocated no significa legalidad ni Ready.
6. Decks import/export: exportar una lista TSV, revisar preview y crear una nueva copia theorycraft sin modificar la colección.

**El catálogo de prueba no es Riot.** Sólo ejercita OGN antes de SFD, rareza/tratamientos y un producto sintético `TEST ONLY simulated Proving Grounds`. No acredita el checklist oficial completo ni trae imágenes/reglas oficiales. El propietario seleccionó un mirror comunitario para la ingesta real; la autorización de imágenes y el checklist oficial completo se revisan por separado. Consulta [ingesta de catálogo](docs/CATALOG-INGESTION.md). Los tipos no confirmados conservan objetivo NULL, no se excluyen del checklist por falta de objetivo.

## Verificaciones

```sh
npm run typecheck
npm run lint
npm test
npm run test:db
npm run build
npm run test:ui
npm run test:local
```

- `typecheck`: genera tipos de rutas Next y comprueba TypeScript; `lint`: ESLint.
- `test`: lógica de objetivos, reservas, orden/filters/paging, wishlist/demanda, métricas, imágenes y listas de mazo.
- `test:db`: su propio PostgreSQL 17 desechable, sin URL remota; migraciones, RLS de dos usuarios, ownership, enteros, transacciones y concurrencia real. Usa Auth stub controlado para esta prueba SQL.
- `test:ui`: pruebas de estado sin configuración en desktop/móvil, con aplicación compilada **sin variables Supabase**. Los tests de servicios reales se ejecutan exclusivamente mediante el siguiente harness; no contra una cuenta de producción.
- `test:local`: inicia PostgreSQL, GoTrue y PostgREST reales en contenedores desechables y un gateway de prueba sólo loopback; compila con claves locales efímeras y ejecuta el recorrido autenticado desktop/móvil con fixtures TEST ONLY; limpia contenedores/red al terminar. No valida Storage, SMTP, realtime, CLI completo ni servicios alojados. Puede tardar más en la primera descarga de imágenes. Chromium en `/usr/bin/chromium` por defecto; usar `P0_CHROMIUM_PATH` para tu ejecutable. Después de este harness, ejecutar `npm run build` con tu configuración si vas a usar `npm start`, pues el build del harness apunta a su API efímera.

```sh
# Opcional, con Supabase local iniciado:
npm run db:types
```

Genera tipos del esquema local sólo si el CLI termina correctamente. El contrato del snapshot/RPC usado en los módulos está tipado en el código; no se entrega un archivo falsamente presentado como generado.

## Migraciones y recuperación

- `202610080001_foundation.sql`: P0 original, sin modificar.
- `202610080002_workspace.sql`: evolución aditiva para P1/P2/P3, wishlist, preferencias, impresión elegida, RPC y snapshot.
- `202610080003_deck_builder_layout.sql`: orden y movimiento de líneas de mazo.
- `202610080004_catalog_ingestion.sql`: claves de importación administrativas, estados de sincronización y previews; no altera inventarios.

Para datos P0 locales existentes usar `migration up --local`; **no** `db reset`. `db reset --local` sólo sirve para recrear una BD local descartable, destruye sus datos y reaplica todas las migraciones. No ejecutar migraciones o fixtures en producción desde estas instrucciones. Una migración aplicada se evoluciona mediante otra migración; no se edita ni borra. Backup/restore de producción siguen pendientes antes de lanzamiento y requieren un plan aprobado.

Detalles de semántica, criterios, decisiones y verificaciones: [docs/P1-P3.md](docs/P1-P3.md). Diagnóstico histórico de fundamentos: [docs/P0.md](docs/P0.md). Esta entrega no declara terminado el producto: quedan dataset/checklist oficial, perfiles legales, ingesta de imágenes/Storage, erratas/reglas/RAG y preparación de lanzamiento.

## Catálogo comunitario y Radiance

`npm run catalog:import -- --report /tmp/catalog-review.json` previsualiza la release de LouisCourrian/riftbound-cards, incluye todos los sets conocidos y aplica los filtros de ediciones base. No publica por defecto. La publicación administrativa, sus requisitos, los permisos de imágenes y la excepción completa de Proving Grounds se documentan en [docs/CATALOG-INGESTION.md](docs/CATALOG-INGESTION.md).

La app todavía no está registrada con Riot: está preparado el [borrador para solicitar registro y acceso autorizado](docs/RIOT-REGISTRATION.md), sin enviar la solicitud ni habilitar imágenes. La [revisión de Proving Grounds](docs/PROVING-GROUNDS-REVIEW.md) documenta el tratamiento original no foil de OGS y los 24 registros pendientes; no declara completa la composición de la caja. El dataset propuesto de Hugging Face es un espejo comunitario, no una autorización específica de la app. Esta rama se publica para revisión con esos pendientes explícitos; no configura producción.
