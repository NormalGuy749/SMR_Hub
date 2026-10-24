# SMR_Hub — selectores ausentes del HTML estático

23 de octubre de 2026. 159 selectores literales distintos revisados: 20 encuentran algún elemento en index.html y los 139 siguientes no. El archivo de verificación de Google no aporta elementos DOM de la aplicación.

Todos los selectores de esta tabla tienen productores en JavaScript. La tabla demuestra su origen; la disponibilidad por estado y ámbito se explica en SMR_HUB_AUDITORIA_GRAFO.md. Los enlaces apuntan a la copia local analizada, incluidas sus modificaciones sin commit. La primera evidencia de construcción puede ser una de varias plantillas que generan el mismo selector. Las clases condicionales y el estado :checked se completan en ejecución.

Las tres consultas con interpolación y el helper $ se documentan por separado en el informe principal.

| Selector ausente del HTML estático | Consultas en JS | Construcción en JS (primera evidencia) |
|---|---|---|
| `[data-fav]` | [js/app.js:241](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/app.js:241) | [js/app.js:1262](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/app.js:1262) |
| `.modal-title` | [js/app.js:837](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/app.js:837) | [js/app.js:1333](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/app.js:1333) |
| `.modal-close` | [js/app.js:852](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/app.js:852), [js/app.js:1341](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/app.js:1341), [js/app.js:1441](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/app.js:1441), [js/app.js:1613](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/app.js:1613), [js/app.js:2261](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/app.js:2261), [js/app.js:2939](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/app.js:2939), [js/auth.js:295](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/auth.js:295), [js/tests.js:1075](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/tests.js:1075) | [js/app.js:1334](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/app.js:1334) |
| `[data-open-res]` | [js/app.js:1228](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/app.js:1228), [js/app.js:1445](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/app.js:1445), [js/app.js:1623](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/app.js:1623), [js/app.js:3064](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/app.js:3064), [js/tests.js:957](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/tests.js:957) | [js/app.js:1064](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/app.js:1064) |
| `[data-palette]` | [js/app.js:1231](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/app.js:1231) | [js/app.js:1049](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/app.js:1049) |
| `[data-edit-profile]` | [js/app.js:1234](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/app.js:1234), [js/app.js:2287](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/app.js:2287), [js/app.js:2350](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/app.js:2350) | [js/app.js:1141](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/app.js:1141) |
| `[data-term]` | [js/app.js:1452](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/app.js:1452), [js/app.js:1616](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/app.js:1616), [js/app.js:1712](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/app.js:1712) | [js/app.js:1416](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/app.js:1416) |
| `[data-sa]` | [js/app.js:1459](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/app.js:1459), [js/app.js:1463](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/app.js:1463) | [js/app.js:1371](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/app.js:1371) |
| `[data-complete]` | [js/app.js:1471](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/app.js:1471) | [js/app.js:1428](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/app.js:1428) |
| `#res-search` | [js/app.js:1505](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/app.js:1505) | [js/app.js:1490](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/app.js:1490) |
| `#res-level` | [js/app.js:1506](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/app.js:1506) | [js/app.js:1492](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/app.js:1492) |
| `.chip-bar` | [js/app.js:1507](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/app.js:1507), [js/app.js:1663](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/app.js:1663), [js/tools.js:695](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/tools.js:695) | [js/app.js:1497](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/app.js:1497) |
| `#res-list` | [js/app.js:1508](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/app.js:1508) | [js/app.js:1503](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/app.js:1503) |
| `#res-count` | [js/app.js:1509](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/app.js:1509) | [js/app.js:1502](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/app.js:1502) |
| `#res-clear` | [js/app.js:1530](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/app.js:1530) | [js/app.js:1528](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/app.js:1528) |
| `[data-open]` | [js/app.js:1539](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/app.js:1539), [js/app.js:2541](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/app.js:2541) | [js/app.js:1265](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/app.js:1265) |
| `.chip` | [js/app.js:1555](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/app.js:1555), [js/app.js:1562](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/app.js:1562), [js/app.js:1728](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/app.js:1728), [js/app.js:1735](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/app.js:1735), [js/tools.js:719](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/tools.js:719), [js/tools.js:722](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/tools.js:722) | [js/app.js:1244](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/app.js:1244) |
| `#glo-search` | [js/app.js:1661](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/app.js:1661) | [js/app.js:1646](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/app.js:1646) |
| `#glo-cat` | [js/app.js:1662](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/app.js:1662) | [js/app.js:1648](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/app.js:1648) |
| `#glo-list` | [js/app.js:1664](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/app.js:1664) | [js/app.js:1659](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/app.js:1659) |
| `#glo-count` | [js/app.js:1665](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/app.js:1665) | [js/app.js:1658](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/app.js:1658) |
| `#glo-clear` | [js/app.js:1686](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/app.js:1686) | [js/app.js:1684](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/app.js:1684) |
| `#curr-community` | [js/app.js:2102](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/app.js:2102) | [js/app.js:2086](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/app.js:2086) |
| `#curr-year` | [js/app.js:2103](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/app.js:2103) | [js/app.js:2093](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/app.js:2093) |
| `#curr-result` | [js/app.js:2104](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/app.js:2104) | [js/app.js:2100](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/app.js:2100) |
| `#pf-community` | [js/app.js:2216](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/app.js:2216) | [js/app.js:2191](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/app.js:2191) |
| `#pf-course` | [js/app.js:2217](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/app.js:2217) | [js/app.js:2198](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/app.js:2198) |
| `#pf-year` | [js/app.js:2218](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/app.js:2218) | [js/app.js:2206](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/app.js:2206) |
| `#pf-summary` | [js/app.js:2219](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/app.js:2219) | [js/app.js:2211](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/app.js:2211) |
| `#pf-save` | [js/app.js:2220](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/app.js:2220) | [js/app.js:2213](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/app.js:2213) |
| `#setting-text-size` | [js/app.js:2431](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/app.js:2431) | [js/app.js:2377](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/app.js:2377) |
| `#setting-animations` | [js/app.js:2432](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/app.js:2432) | [js/app.js:2389](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/app.js:2389) |
| `[data-theme-opt]` | [js/app.js:2436](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/app.js:2436) | [js/app.js:2368](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/app.js:2368) |
| `#setting-reset` | [js/app.js:2452](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/app.js:2452) | [js/app.js:2420](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/app.js:2420) |
| `#setting-clear-progress` | [js/app.js:2460](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/app.js:2460) | [js/app.js:2427](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/app.js:2427) |
| `#feedback-send` | [js/app.js:2487](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/app.js:2487) | [js/app.js:2407](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/app.js:2407) |
| `#feedback-category` | [js/app.js:2488](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/app.js:2488) | [js/app.js:2397](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/app.js:2397) |
| `#feedback-message` | [js/app.js:2489](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/app.js:2489) | [js/app.js:2403](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/app.js:2403) |
| `#feedback-status` | [js/app.js:2490](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/app.js:2490) | [js/app.js:2410](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/app.js:2410) |
| `#feedback-hint` | [js/app.js:2491](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/app.js:2491), [js/app.js:3805](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/app.js:3805) | [js/app.js:2408](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/app.js:2408) |
| `.row-list` | [js/app.js:2539](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/app.js:2539) | [js/app.js:1503](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/app.js:1503) |
| `[data-minutes]` | [js/app.js:2707](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/app.js:2707) | [js/app.js:2680](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/app.js:2680) |
| `#study-clock` | [js/app.js:2732](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/app.js:2732) | [js/app.js:2814](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/app.js:2814) |
| `#study-exit` | [js/app.js:2828](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/app.js:2828) | [js/app.js:2812](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/app.js:2812) |
| `#study-continue` | [js/app.js:2835](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/app.js:2835), [js/app.js:2874](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/app.js:2874) | [js/app.js:2778](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/app.js:2778) |
| `#study-finish` | [js/app.js:2843](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/app.js:2843) | [js/app.js:2805](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/app.js:2805) |
| `[data-study-open-res]` | [js/app.js:2848](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/app.js:2848) | [js/app.js:2777](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/app.js:2777) |
| `.quiz-option` | [js/app.js:2854](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/app.js:2854), [js/tests.js:694](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/tests.js:694) | [js/app.js:2641](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/app.js:2641) |
| `[data-explain]` | [js/app.js:2868](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/app.js:2868) | [js/app.js:2648](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/app.js:2648) |
| `[data-case-opt]` | [js/app.js:2941](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/app.js:2941) | [js/app.js:2927](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/app.js:2927) |
| `.case-option` | [js/app.js:2948](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/app.js:2948) | [js/app.js:2926](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/app.js:2926) |
| `[data-case-feedback]` | [js/app.js:2954](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/app.js:2954) | [js/app.js:2932](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/app.js:2932) |
| `[data-open-case]` | [js/app.js:3001](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/app.js:3001) | [js/app.js:2996](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/app.js:2996) |
| `.nav-link` | [js/app.js:3370](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/app.js:3370) | [js/app.js:3350](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/app.js:3350) |
| `.mobile-nav-more` | [js/app.js:3400](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/app.js:3400) | [js/app.js:3397](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/app.js:3397) |
| `.mobile-nav-link` | [js/app.js:3405](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/app.js:3405) | [js/app.js:3391](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/app.js:3391) |
| `.search-item` | [js/app.js:3540](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/app.js:3540) | [js/app.js:3528](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/app.js:3528) |
| `.palette-item` | [js/app.js:3594](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/app.js:3594), [js/app.js:3634](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/app.js:3634) | [js/app.js:3627](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/app.js:3627) |
| `.palette-item.active` | [js/app.js:3597](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/app.js:3597) | [js/app.js:3627](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/app.js:3627) |
| `.palette-input` | [js/app.js:3604](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/app.js:3604), [js/app.js:3686](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/app.js:3686) | [js/app.js:3668](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/app.js:3668) |
| `.palette-list` | [js/app.js:3605](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/app.js:3605) | [js/app.js:3674](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/app.js:3674) |
| `.palette-close` | [js/app.js:3688](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/app.js:3688) | [js/app.js:3672](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/app.js:3672) |
| `[data-auth-logout]` | [js/auth.js:104](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/auth.js:104) | [js/auth.js:101](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/auth.js:101) |
| `[data-auth-open]` | [js/auth.js:119](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/auth.js:119) | [js/auth.js:115](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/auth.js:115) |
| `button[type="submit"]` | [js/auth.js:149](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/auth.js:149) | [js/app.js:1049](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/app.js:1049) |
| `[data-auth-msg]` | [js/auth.js:158](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/auth.js:158) | [js/auth.js:270](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/auth.js:270) |
| `[data-auth-body]` | [js/auth.js:271](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/auth.js:271) | [js/auth.js:269](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/auth.js:269) |
| `[data-view]` | [js/auth.js:276](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/auth.js:276) | [js/auth.js:177](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/auth.js:177) |
| `form` | [js/auth.js:280](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/auth.js:280) | [js/auth.js:170](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/auth.js:170) |
| `[data-auth-form="update-password"]` | [js/auth.js:318](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/auth.js:318), [js/auth.js:340](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/auth.js:340) | [js/auth.js:170](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/auth.js:170) |
| `.auth-nav-item` | [js/auth.js:365](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/auth.js:365) | [js/auth.js:89](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/auth.js:89) |
| `#quiz-timer` | [js/tests.js:91](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/tests.js:91) | [js/tests.js:663](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/tests.js:663) |
| `#exam-start` | [js/tests.js:507](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/tests.js:507) | [js/tests.js:434](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/tests.js:434) |
| `#exam-count` | [js/tests.js:508](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/tests.js:508) | [js/tests.js:401](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/tests.js:401) |
| `#exam-category` | [js/tests.js:510](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/tests.js:510) | [js/tests.js:407](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/tests.js:407) |
| `#exam-diff` | [js/tests.js:511](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/tests.js:511) | [js/tests.js:414](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/tests.js:414) |
| `#exam-timer` | [js/tests.js:512](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/tests.js:512) | [js/tests.js:421](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/tests.js:421) |
| `#exam-strict` | [js/tests.js:513](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/tests.js:513) | [js/tests.js:430](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/tests.js:430) |
| `#adaptive-start` | [js/tests.js:531](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/tests.js:531) | [js/tests.js:442](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/tests.js:442) |
| `[data-test-card]` | [js/tests.js:534](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/tests.js:534) | [js/tests.js:453](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/tests.js:453) |
| `[data-count]` | [js/tests.js:536](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/tests.js:536) | [js/tests.js:468](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/tests.js:468) |
| `[data-diff]` | [js/tests.js:537](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/tests.js:537) | [js/tests.js:474](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/tests.js:474) |
| `[data-note]` | [js/tests.js:538](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/tests.js:538) | [js/tests.js:486](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/tests.js:486) |
| `[data-mode]` | [js/tests.js:539](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/tests.js:539) | [js/tests.js:482](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/tests.js:482) |
| `[data-report-test]` | [js/tests.js:593](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/tests.js:593) | [js/tests.js:568](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/tests.js:568) |
| `[data-report-open]` | [js/tests.js:594](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/tests.js:594) | [js/tests.js:569](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/tests.js:569) |
| `[data-report-form]` | [js/tests.js:595](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/tests.js:595) | [js/tests.js:570](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/tests.js:570) |
| `[data-report-reason]` | [js/tests.js:596](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/tests.js:596) | [js/tests.js:572](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/tests.js:572) |
| `[data-report-details]` | [js/tests.js:597](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/tests.js:597) | [js/tests.js:579](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/tests.js:579) |
| `[data-report-status]` | [js/tests.js:598](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/tests.js:598) | [js/tests.js:584](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/tests.js:584) |
| `[data-report-send]` | [js/tests.js:599](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/tests.js:599) | [js/tests.js:582](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/tests.js:582) |
| `[data-report-cancel]` | [js/tests.js:600](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/tests.js:600) | [js/tests.js:583](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/tests.js:583) |
| `#quiz-exit` | [js/tests.js:688](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/tests.js:688) | [js/tests.js:661](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/tests.js:661) |
| `#quiz-explain` | [js/tests.js:695](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/tests.js:695) | [js/tests.js:678](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/tests.js:678) |
| `#quiz-next` | [js/tests.js:696](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/tests.js:696) | [js/tests.js:680](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/tests.js:680) |
| `.quiz-score` | [js/tests.js:731](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/tests.js:731) | [js/app.js:2815](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/app.js:2815) |
| `[data-review-res]` | [js/tests.js:737](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/tests.js:737), [js/tests.js:960](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/tests.js:960) | [js/tests.js:722](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/tests.js:722) |
| `#quiz-retry` | [js/tests.js:966](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/tests.js:966) | [js/tests.js:949](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/tests.js:949) |
| `#quiz-errors` | [js/tests.js:987](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/tests.js:987) | [js/tests.js:950](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/tests.js:950) |
| `#quiz-back` | [js/tests.js:993](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/tests.js:993) | [js/tests.js:951](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/tests.js:951) |
| `[data-srs-cancel]` | [js/tests.js:1076](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/tests.js:1076) | [js/tests.js:1065](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/tests.js:1065) |
| `[data-srs-confirm]` | [js/tests.js:1077](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/tests.js:1077) | [js/tests.js:1066](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/tests.js:1066) |
| `[data-srs-drop]` | [js/tests.js:1125](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/tests.js:1125), [js/tests.js:1144](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/tests.js:1144) | [js/tests.js:1039](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/tests.js:1039) |
| `.srs-drop-status` | [js/tests.js:1126](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/tests.js:1126), [js/tests.js:1136](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/tests.js:1136) | [js/tests.js:1041](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/tests.js:1041) |
| `[data-srs-test]` | [js/tests.js:1146](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/tests.js:1146), [js/tests.js:1183](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/tests.js:1183) | [js/tests.js:682](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/tests.js:682) |
| `[data-srs-rate]` | [js/tests.js:1157](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/tests.js:1157), [js/tests.js:1181](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/tests.js:1181), [js/tests.js:1188](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/tests.js:1188) | [js/tests.js:1024](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/tests.js:1024) |
| `#sub-ip` | [js/tools.js:85](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/tools.js:85) | [js/tools.js:68](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/tools.js:68) |
| `#sub-prefix` | [js/tools.js:86](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/tools.js:86) | [js/tools.js:73](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/tools.js:73) |
| `#sub-results` | [js/tools.js:87](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/tools.js:87) | [js/tools.js:78](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/tools.js:78) |
| `#sub-error` | [js/tools.js:88](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/tools.js:88) | [js/tools.js:77](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/tools.js:77) |
| `#sub-steps` | [js/tools.js:89](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/tools.js:89) | [js/tools.js:82](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/tools.js:82) |
| `#sub-steps-btn` | [js/tools.js:90](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/tools.js:90) | [js/tools.js:80](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/tools.js:80) |
| `#st-net` | [js/tools.js:209](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/tools.js:209) | [js/tools.js:188](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/tools.js:188) |
| `#st-prefix` | [js/tools.js:210](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/tools.js:210) | [js/tools.js:191](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/tools.js:191) |
| `#st-newprefix` | [js/tools.js:211](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/tools.js:211) | [js/tools.js:194](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/tools.js:194) |
| `#st-error` | [js/tools.js:212](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/tools.js:212) | [js/tools.js:197](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/tools.js:197) |
| `#st-count` | [js/tools.js:213](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/tools.js:213) | [js/tools.js:198](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/tools.js:198) |
| `#st-body` | [js/tools.js:214](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/tools.js:214) | [js/tools.js:205](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/tools.js:205) |
| `#vlsm-net` | [js/tools.js:306](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/tools.js:306) | [js/tools.js:282](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/tools.js:282) |
| `#vlsm-needs` | [js/tools.js:307](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/tools.js:307) | [js/tools.js:285](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/tools.js:285) |
| `#vlsm-error` | [js/tools.js:308](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/tools.js:308) | [js/tools.js:291](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/tools.js:291) |
| `#vlsm-count` | [js/tools.js:309](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/tools.js:309) | [js/tools.js:292](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/tools.js:292) |
| `#vlsm-body` | [js/tools.js:310](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/tools.js:310) | [js/tools.js:301](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/tools.js:301) |
| `#pass-out` | [js/tools.js:555](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/tools.js:555) | [js/tools.js:535](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/tools.js:535) |
| `#pass-length` | [js/tools.js:556](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/tools.js:556) | [js/tools.js:541](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/tools.js:541) |
| `#pass-length-label` | [js/tools.js:557](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/tools.js:557) | [js/tools.js:542](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/tools.js:542) |
| `#pass-strength` | [js/tools.js:558](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/tools.js:558) | [js/tools.js:538](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/tools.js:538) |
| `#pass-gen` | [js/tools.js:559](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/tools.js:559) | [js/tools.js:552](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/tools.js:552) |
| `#pass-copy` | [js/tools.js:560](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/tools.js:560) | [js/tools.js:536](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/tools.js:536) |
| `#pass-noamb` | [js/tools.js:562](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/tools.js:562) | [js/tools.js:549](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/tools.js:549) |
| `[data-set]:checked` | [js/tools.js:565](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/tools.js:565) | [js/tools.js:545](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/tools.js:545) |
| `[data-set]` | [js/tools.js:588](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/tools.js:588) | [js/tools.js:545](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/tools.js:545) |
| `#un-value` | [js/tools.js:628](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/tools.js:628) | [js/tools.js:618](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/tools.js:618) |
| `#un-unit` | [js/tools.js:629](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/tools.js:629) | [js/tools.js:621](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/tools.js:621) |
| `#un-results` | [js/tools.js:630](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/tools.js:630) | [js/tools.js:626](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/tools.js:626) |
| `#un-error` | [js/tools.js:631](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/tools.js:631) | [js/tools.js:625](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/tools.js:625) |
| `#ports-search` | [js/tools.js:694](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/tools.js:694) | [js/tools.js:676](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/tools.js:676) |
| `#ports-body` | [js/tools.js:696](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/tools.js:696) | [js/tools.js:690](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/tools.js:690) |
| `#ports-count` | [js/tools.js:697](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/tools.js:697) | [js/tools.js:684](C:/Users/angel/OneDrive/Escritorio/SMR/SMR/js/tools.js:684) |

