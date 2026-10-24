# SMR Hub — Auditoría correctiva y estabilización (16-10-2026)

Documento de resultados de la auditoría pedida: verificación de los hallazgos de la
auditoría anterior sobre el estado ACTUAL, correcciones demostrables, pruebas nuevas y
todo lo que queda pendiente. Complementa a `SMR_HUB_CONTEXT.md` y `SMR_HUB_ROADMAP.md`;
no los sustituye ni reabre fases aceptadas.

## A. Procedencia

- Copia con `.git`: sí. Rama `main`, HEAD `e19d503` (`docs: update SMR Hub context and roadmap`),
  remoto `origin → https://github.com/NormalGuy749/SMR_Hub.git`.
- **No se comprobó el commit remoto**: no se hizo `fetch`/`pull` ni ninguna operación de red
  sobre el repositorio. Los hallazgos describen **esta copia**, no «la última versión de GitHub».
- Trabajo previo preservado: 13 archivos modificados y 17 sin seguimiento (fases 7-8.8) intactos.
  Nada se borró, se revirtió ni se limpió (`git reset`/`clean`/`checkout` no se ejecutaron).
- Sin commit, sin push, sin deploy y sin tocar el proyecto Supabase remoto.

## B. Hallazgos: verificación de la auditoría anterior

Métricas **recalculadas sobre los archivos actuales** (no heredadas del informe anterior).

| # | Hallazgo previo | Estado real hoy | Clasificación |
|---|---|---|---|
| 1 | Config de Supabase apuntando a `127.0.0.1:54321` | El archivo sigue teniendo los valores del stack local, pero están **detrás de una guarda de loopback** (fase 8.7, cambio previo sin commit): fuera de `localhost`/`127.0.0.1`/`[::1]`/`file://` no fija nada y la app queda local-first | **Obsoleto como defecto**; queda un pendiente real: la **inyección pública en el despliegue** (ver §E) |
| 2 | 7 referencias a recursos inexistentes en rutas | **Confirmado exactamente 7**, con la misma lista: `r-red-ipv4`, `r-red-subnetting`, `r-red-arp-dhcp`, `r-so-particiones`, `r-seg-contrasenas`, `r-seg-malware`, `r-seg-backup` | **Defecto confirmado** (no es un error de identificador: el recurso nunca existió) |
| 3 | 71 referencias `relatedResource` que no resuelven | **Confirmado 71 instancias / 19 identificadores distintos**. El merge las anula a `null` en carga (fix previo) y conserva el literal original. 83 de 154 preguntas mantienen recomendación válida | **Defecto confirmado**, con matiz: la referencia no llega al usuario; lo que faltaba era el **registro** y el aviso de que el contenido está sin publicar |
| 4 | 19 fichas curriculares con estados de verificación incompletos | **Impreciso.** Las 19 fichas tienen `status`, `verifiedAt` y evidencia: 3 `VERIFIED`, 12 `PARTIALLY_VERIFIED`, 4 `NOT_VERIFIED`, con 1-7 fuentes citadas cada una (35 en total). Las 4 no verificadas documentan el motivo (currículo LOE anterior vigente, sin adaptación al RD 659/2023) | **No es «incompleto»**: es un estado honesto y trazable. Lo que faltaba era la **matriz por territorio** (§D5) |
| 5 | 10 suites JS pasando y ausencia de `package.json` | **Obsoleto en la parte de suites**: hoy hay **20 suites Node** (213 aserciones) y **4 harnesses** con PostgreSQL/PostgREST reales (246 comprobaciones). `package.json` sigue sin existir | **Confirmado** (sin `package.json`), **no es un defecto** por sí mismo; se añade runner sin dependencias (§C) |

Hallazgos **nuevos** de esta auditoría (no estaban en el informe previo):

- **N1 (corregido)**: `renderMapa` descartaba en silencio los pasos sin recurso (`filter(Boolean)`),
  así que «Del IP al routing» se mostraba como una ruta de 3 pasos con `0/3 completados` cuando
  su tabla declara 5. Relación falsa hacia el usuario → corregido (§C).
- **N2 (corregido)**: no existía ningún registro consultable de las referencias no resolubles
  (solo un `console.warn` que se pierde al recargar) ni prueba que las vigilara.
- **N3 (corregido)**: `js/supabase.js` aceptaba cualquier URL/clave siempre que existieran;
  una inyección de despliegue con los valores del stack local habría enviado a cada visitante a
  su propio `127.0.0.1` y una configuración a medias se declaraba conectada.
- **N4 (documentado)**: el proyecto de módulos (`1713`/`1713707`) está registrado **a la vez**
  dentro de `modules2` y en `project` en 12 currículos, y en Asturias 3 veces
  (`modules1` + `modules2` + `project`). Es una doble contabilización conocida y deliberada
  (`curriculum.js` la reporta como warning). **No se corrige**: cambiar la estructura alteraría
  los `moduleId` derivados y es una decisión de datos, no un defecto demostrable.
- **N5 (documentado)**: `galicia` es `PARTIALLY_VERIFIED` con 0 módulos cargados; su propia nota
  explica que la norma general localizada no contiene tabla de distribución de módulos. El estado
  es defendible pero el significado de «parcial» no está definido en el modelo → incidencia (§E).
- **N6**: `auditor.js` (raíz) está roto: apunta a `SMRÇ/js/data.js`, una ruta que no existe
  (mojibake de `SMR/js/`). No se carga en la aplicación y no se ha usado: no se toca.

## C. Cambios realizados

| Archivo | Cambio | Motivo |
|---|---|---|
| `js/content.js` | Registra en `SMR_DATA.contentGaps` cada referencia de ruta sin recurso y cada **lección huérfana** (`LESSON_UPGRADES` cuyo recurso no existe: 25). Los avisos de consola siguen igual (7) | Hacer resoluble después la incidencia; el aviso de consola no sobrevive a la recarga |
| `js/questions.js` | Registra en `contentGaps` cada `relatedResource` anulado con **cuántas preguntas** la usaban (19 refs / 71 instancias) | Igual; permite saber el impacto de publicar un recurso |
| `js/app.js` | `renderMapa` cuenta los pasos sin recurso y los declara («N paso(s) de esta ruta están a la espera de que se publique su recurso») en vez de filtrarlos | No mostrar una ruta más corta de lo que es (N1) |
| `js/supabase.js` | Guarda 1 endurecida (URL con esquema http/https y clave no vacía; «sin configuración» calla, «configuración a medias» avisa) y **Guarda 2**: en un origen público no se inicializa contra un endpoint loopback | N3: la app pública nunca apunta al `localhost` del visitante |
| `js/cloud-config.js` | Cabecera con el **contrato de configuración** (4 escenarios) y el estado real del despliegue. Sin cambios de comportamiento | Dejar escrito qué falta y por qué funciona en una SPA estática |
| `tests/content-integrity.test.js` | **Nuevo.** 13 comprobaciones: recursos duplicados/inválidos, pasos de ruta, `relatedResource`, huérfanos de las capas, avisos de carga, línea base, identidad estable (con mutación real) y validadores derivados + navegación/repaso | §C del encargo (validación automática) |
| `tests/cloud-config.test.js` | **Nuevo.** 10 comprobaciones del contrato de configuración y del orden de carga de `index.html` | §5 del encargo |
| `tests/fixtures/content-baseline.json` | **Nuevo.** Línea base revisada: 51 incidencias y 154 identificadores estables | Que las incidencias no puedan desaparecer en silencio |
| `tests/run-all.sh` | **Nuevo.** Runner sin dependencias: `node --check`, 20 suites Node y 4 harnesses; exit 2 del harness = OMITIDO, nunca aprobado | §7 del encargo |

**Relaciones corregidas: ninguna.** No se ha reasignado ni inventado ningún
`relatedResource` ni ningún paso de ruta. Justificación por evidencia:

- Las 19 referencias de preguntas y los 7 pasos de ruta apuntan a identificadores que **nunca
  existieron**, no a errores tipográficos ni a recursos renombrados: `git log -S` sobre todo el
  historial muestra que `js/content.js`, `js/data.js` y `js/questions.js` solo cambiaron en el
  commit inicial (`64a268d`) y ni un solo recurso con esos ids estuvo registrado jamás.
- No hay equivalencia demostrable con los 19 recursos existentes (los pendientes son de
  Virtualización/Mantenimiento/Ofimática y de temas sin recurso propio: `r-hw-ram`, `r-so-windows`…),
  así que sustituir sería presentar una relación falsa. Se conserva el id original y se registra.
- El contenido **sí existe** para 25 de esos ids: `LESSON_UPGRADES` de `js/content.js` trae
  `keyPoints`, `example`, `commonErrors` y `summary` de cada uno. Publicar esos recursos es la vía
  natural de cierre, y ya no requiere arqueología.

## D. Resultados

### D1. Comandos y suites (todos exit 0 salvo donde se indica)

```bash
bash tests/run-all.sh                    # OK: 43  FALLO: 0  OMITIDO: 0
```
- `node --check js/*.js` → 19 archivos sin error.
- **20 suites Node → 223 aserciones, 0 fallos.** Incluye las 2 nuevas (13 + 10) y las 18 previas (200 aserciones).
- **4 harnesses con stack local real** (Docker + PostgreSQL + PostgREST + GoTrue):
  `pg-local-concurrency.sh` 13, `pg-privileges-lockdown.sh` 55, `pg-srs-delete.sh` 18,
  `rest-rls-isolation.sh` 160 comprobaciones.
- Auto-verificaciones de runner: `CONTENT_SELFTEST=1` → exit 1; `CLOUD_CONFIG_SELFTEST=1` → exit 1
  (las suites detectan fallos, no son vacuas).

### D2. Detección demostrada de las pruebas nuevas (mutaciones reales, revertidas después)

| Mutación aplicada | Resultado |
|---|---|
| Añadir `r-red-inventado` a un paso de ruta | `✗ F1` nombra la incidencia nueva y `✗ E1` (el aviso de consola pasa a 8) → exit 1 |
| Cambiar el texto de una pregunta (`hosts útiles ofrece` → `da`) | `✗ G1` con identidad nueva y perdida exactas → exit 1 |
| Hashes `md5` de `js/content.js` y `js/questions.js` tras revertir | idénticos a los de partida |

### D3. Validadores del catálogo (recalculados)

- `curriculumIndex`: 227 instancias de módulo, `duplicates: []`, `ok: true`, 35 warnings
  (12 electivas sin código, 11 colisiones desambiguadas, 11 duplicados estructurales
  `modules2`+`project`, 1 duplicado entre cursos — Asturias).
- `moduleTopics`: 227 módulos, 905 enlaces, 139 módulos enlazados, 88 sin topic,
  7 topics sin módulo (`t-contenedores`, `t-diagnostico`, `t-discos-virtuales`,
  `t-maquinas-virtuales`, `t-recursos-virtualizacion`, `t-redes-virtuales`, `t-snapshots`).
- `moduleEquivalences`: 20 grupos, 203 miembros, 1182 pares fuertes, 328 parciales,
  1 warning (`aragon:c1:A997` / `aragon:c2:A996` fuera de grupos: documentar).
- `contentTopics`: 19 recursos y 6 casos mapeados, sin errores.
- Catálogo: 7 tests, 154 preguntas, 19 recursos, 51 términos de glosario, 6 casos, 4 rutas,
  19 currículos, 227 módulos indexados.

### D4. Configuración cloud: contrato y pruebas

Escenarios verificados (mocks de SDK y de `location`, **sin claves reales**):

1. local (`localhost`, `127.0.0.1`, `[::1]`, `file://`) → valores del stack local y cliente inicializado;
2. origen público con inyección previa → manda lo inyectado; la clave del stack local no viaja;
3. origen público sin configuración → no fija nada, `cloudAvailable = false`, cero llamadas;
4. configuración incompleta/vacía o URL sin esquema → no se inicializa, aviso en consola;
5. origen público con los valores **locales** inyectados por error → no se inicializa (Guarda 2);
6. CDN del SDK caída → local-first, sin excepciones;
7. orden de carga real en `index.html`: CDN → `cloud-config.js` → `supabase.js` → `auth.js`.

**Comprobación en navegador real del escenario público** (origen no loopback,
`http://127-0-0-1.nip.io:8096`, que resuelve a 127.0.0.1): `SMR.cloudAvailable = false`,
`SMR_SUPABASE_URL` sin definir, la app renderiza completa y **0 peticiones** al stack local
(las dos únicas peticiones `supabase` son el SDK de CDN y el propio `js/supabase.js`).

Limitación: **no se ha desplegado nada ni se ha verificado Cloudflare Pages**. Sin inyección
pública, producción queda local-first (nube desactivada, nunca medio conectada).

### D5. Matriz curricular por territorio (evidencia: `js/data.js` + búsqueda web de contraste)

| Territorio | Estado | Módulos (m1/m2/electivas) | Fuentes | Comprobado en esta auditoría | Fuente oficial necesaria |
|---|---|---|---|---|---|
| andalusia | NOT_VERIFIED | 0/0/0 | 2 | No existe adaptación al RD 659/2023 localizada; el BOJA mantiene vigente la Orden de 7-07-2009 (LOE) | Norma BOJA de adaptación al RD 659/2023 |
| aragon | PARTIALLY_VERIFIED | 8/8/1 | 4 | Orden ECD/842/2024 citada; marcadores 1.º/2.º del PDF no extraídos | Confirmar asignación por curso |
| asturias | VERIFIED | 9/6/1 | 4 | Decreto 103/2025 existe (BOPA 165, 27-08-2025) pero es norma **general** de FP, no específica de SMR | Confirmar que su tabla es la de SMR |
| illes-balears | NOT_VERIFIED | 0/0/0 | 1 | No se ha podido identificar ninguna norma BOIB de currículo del SMR, ni nueva ni anterior | Norma BOIB vigente del título |
| canarias | PARTIALLY_VERIFIED | 7/7/1 | 5 | Resolución 3747 (BOC 226). Nota propia: modificación de 20-12-2024 no transcrita | Transcribir la modificación |
| cantabria | VERIFIED | 7/7/1 | 4 | Orden EDU/71/2025 existe, de la familia Informática y Comunicaciones, e incluye SMR | — |
| castilla-la-mancha | PARTIALLY_VERIFIED | 8/5/1 | 3 | Decreto 79/2024 (DOCM 218) y corrección de errores revisada (no afecta a SMR) | Confirmar horas de curso |
| castilla-y-leon | PARTIALLY_VERIFIED | 6/7/2 | 4 | Resolución de 3-12-2024 (BOCYL 235) con 16 líneas de módulo | Confirmar optatividad |
| cataluna | NOT_VERIFIED | 0/0/0 | 2 | Decret 193/2013 (DOGC 6415) es el currículo LOE; XTEC lo mantiene; sin norma de adaptación | Norma DOGC de adaptación |
| comunitat-valenciana | PARTIALLY_VERIFIED | 6/8/1 | 4 | Decreto 114/2025 (DOGV 10165) localizado | Confirmar secuenciación |
| extremadura | VERIFIED | 6/8/1 | 7 | Instrucción 12/2024 con Anexo 24 de SMR confirmada; es instrucción administrativa alojada en Educarex, **sin boletín** | — (matiz: no es norma publicada) |
| galicia | PARTIALLY_VERIFIED | 0/0/0 | 2 | Decreto 20/2026 (DOG 56) es ordenación **general**; su artículo 4 remite los currículos a órdenes. La ficha ya lo declara | Orden DOG del currículo del título |
| madrid | PARTIALLY_VERIFIED | 5/9/2 | 3 | Decreto 102/2024 (BOCM 273); órdenes de optativas 2025 localizadas sin transcribir | Transcribir optativas/transversales |
| murcia | PARTIALLY_VERIFIED | 7/7/1 | 5 | Resolución de 1-10-2026 (BORM 227); nota de 3-03-2026 sin transcribir | Transcribir certificación |
| navarra | PARTIALLY_VERIFIED | 8/6/1 | 2 | Decreto Foral 109/2024 (BON 52 consolidado); versión inicial revisada | — |
| pais-vasco | NOT_VERIFIED | 0/0/0 | 2 | Decreto 67/2010 (BOPV) es el currículo LOE, aún citado en 2025; sin adaptación localizada | Norma BOPV de adaptación |
| la-rioja | PARTIALLY_VERIFIED | 7/7/1 | 6 | Resolución 26/2025 (BOR 166); optatividad y formación en empresa localizadas sin transcribir | Transcribir instrucciones |
| ceuta | PARTIALLY_VERIFIED | 7/7/1 | 2 | Orden EFD/657/2024 (BOE 158), ámbito de gestión del Ministerio | — |
| melilla | PARTIALLY_VERIFIED | 7/7/1 | 2 | Igual que Ceuta (misma norma de ámbito ministerial) | — |

Contraste con fuentes oficiales (búsqueda web en esta sesión): Illes Balears, Cataluña, País Vasco
y Andalucía **no** tienen una norma de adaptación localizada, y en los tres últimos sigue
identificada la norma LOE anterior, lo que coincide con lo que declara el catálogo. También se
confirmó que existen las normas citadas de Asturias, Cantabria, Extremadura y Galicia, con el
matiz de Asturias (norma general) y Extremadura (instrucción sin publicación en boletín).

**No se ha cambiado ningún estado, ningún módulo ni ninguna fuente.** Las decisiones académicas
son ambiguas o incompletas y no se corrigen inventando: ver incidencias (§E).

### D6. Regresión funcional tras los cambios

- Navegador real (`127.0.0.1:8096`, stack local): las 14 rutas con vista propia de la SPA renderizan (inicio, mi-smr, estudio, tests, recursos, redes, sistemas, casos, glosario, curriculo,
  herramientas, estadísticas, configuración, mapa) con **0 errores de consola** y **0 errores no capturados**; consola solo con los avisos esperados (7 de rutas, 71 de `relatedResource`).
- Flujo de test completo (3 preguntas respondidas mal → resultado): 9 botones de valoración SRS,
  3 botones de «quitar del repaso», recomendaciones `r-red-nat-routing`, `r-red-ethernet-mac`,
  `r-red-topologia` — **todas existentes**, ninguna recomendación rota.
- Rutas de aprendizaje: 4 rutas, 12 pasos publicados + 7 declarados pendientes (2+1+1+3),
  captura visual de la ruta «Del IP al routing» con el aviso nuevo.
- Suites de sincronización, SRS, auth y multi-pestaña: sin regresión (ver D1).

## E. Pendientes

1. **Inyección de la configuración pública en el despliegue** (bloquea la nube en producción).
   Falta decidir el método y ejecutarlo: un script anterior a `js/supabase.js` que defina
   `window.SMR_SUPABASE_URL` y `window.SMR_SUPABASE_ANON_KEY` (p. ej. generado en el build desde
   las variables del entorno). Sin ese paso, producción es local-first: no hay error, pero no hay
   auth ni sincronización. No se ha tocado la configuración de Cloudflare en esta fase.
2. **Publicar o descartar 25 recursos planificados.** Contenido de lección ya escrito en
   `js/content.js` (`LESSON_UPGRADES`) y 0 recursos creados; 19 de esos ids son destino de 71
   `relatedResource` y 7 son pasos de ruta. Decisión de contenido del propietario.
3. **Decisiones académicas** (no se deben resolver por inferencia):
   - Currículo de Illes Balears: no se ha podido identificar norma alguna (ni nueva ni LOE).
   - Andalucía, Cataluña y País Vasco: sin adaptación al RD 659/2023; decidir si el catálogo debe
     mostrar el plan LOE anterior con una etiqueta explícita.
   - Galicia: estado `PARTIALLY_VERIFIED` con 0 módulos.
   - Extremadura: la fuente es una instrucción administrativa, no una norma publicada.
   - Asturias: la fuente es un decreto general de FP; confirmar que su tabla es la de SMR.
   - `aragon:c1:A997` y `aragon:c2:A996` fuera de grupos de equivalencia.
4. **Duplicación estructural del proyecto intermodular** (12 currículos; Asturias 3 veces):
   decidir si se normaliza o se conserva como está (afecta a `moduleId` derivados).
5. **Sin CI**: el runner existe (`bash tests/run-all.sh`), pero ejecutarlo en cada cambio es
   manual. Integrarlo en un flujo automático es una decisión de infraestructura.
6. **No verificado**: proyecto Supabase remoto, Cloudflare Pages, rendimiento bajo carga masiva
   y ningún commit remoto (no se hizo `fetch`).

## F. Integridad

- Sin `git commit`, sin `git push`, sin deploy, sin migraciones remotas, sin cambios de producción.
- Sin `git reset`, `git clean` ni checkout destructivo; sin borrar datos, usuarios ni fixtures
  ajenos. Los harnesses crean y borran solo sus propios usuarios `*@local.test` y sus filas.
- Sin sobrescribir trabajo previo: los 13 archivos modificados y 17 sin seguimiento se conservan.
- Sin `service_role` ni secretos en el cliente; las pruebas no usan claves reales.
- Migraciones: ninguna creada ni aplicada en esta fase (la 00009 y las previas siguen igual).
