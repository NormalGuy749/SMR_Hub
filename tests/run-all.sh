#!/usr/bin/env bash
# =====================================================================
# SMR Hub — runner de regresión (auditoría de estabilización).
#
# QUÉ ES: el mecanismo mínimo para ejecutar TODO lo que el repositorio ya
# tenía, sin dependencias nuevas ni cambio de flujo de publicación:
#   1) node --check de js/*.js
#   2) todas las suites Node de tests/*.test.js
#   3) los harnesses de tests/*.sh contra el stack local, si está en marcha
#
# NO es un CI: no instala nada, no despliega y no levanta el stack. Los
# harnesses de PostgreSQL declaran su precondición con exit 2 (contenedor o
# API local no disponible); aquí eso se informa como OMITIDO, nunca como
# aprobado. Cualquier otro fallo cuenta como FALLO y el runner sale con 1.
#
# Uso:   bash tests/run-all.sh            (desde la raíz del repositorio)
# =====================================================================
set -u
cd "$(dirname "$0")/.." || exit 2

OK=0; FAILED=0; SKIP=0
printf '== node --check ==\n'
for f in js/*.js; do
  if node --check "$f" 2>/dev/null; then OK=$((OK + 1)); else FAILED=$((FAILED + 1)); echo "  ✗ sintaxis: $f"; fi
done
echo "  ($OK archivos sin error de sintaxis)"

printf '\n== suites Node ==\n'
for f in tests/*.test.js; do
  out=$(node "$f" 2>&1); code=$?
  resumen=$(echo "$out" | grep -E '^(OK:|[0-9]+ ok,)' | tail -1)
  if [[ $code -eq 0 ]]; then
    OK=$((OK + 1)); printf '  ✓ %-34s %s\n' "$(basename "$f")" "${resumen:-exit 0}"
  else
    FAILED=$((FAILED + 1)); printf '  ✗ %-34s exit %s %s\n' "$(basename "$f")" "$code" "${resumen:-}"
    echo "$out" | grep -E '✗|Error|error' | head -5 | sed 's/^/      /'
  fi
done

printf '\n== harnesses contra el stack local ==\n'
for f in tests/*.sh; do
  [[ "$(basename "$f")" == "run-all.sh" ]] && continue
  out=$(bash "$f" 2>&1); code=$?
  resumen=$(echo "$out" | grep -c '✓')
  caso=0; [[ $code -eq 2 ]] && caso=1
  if [[ $code -eq 0 ]]; then
    OK=$((OK + 1)); printf '  ✓ %-34s %s comprobaciones\n' "$(basename "$f")" "$resumen"
  elif [[ $caso -eq 1 ]]; then
    SKIP=$((SKIP + 1)); printf '  · %-34s OMITIDO (stack local no disponible)\n' "$(basename "$f")"
  else
    FAILED=$((FAILED + 1)); printf '  ✗ %-34s exit %s\n' "$(basename "$f")" "$code"
    echo "$out" | grep -E '✗|FALLO' | head -5 | sed 's/^/      /'
  fi
done

echo
echo "── resumen ──"
echo "OK: $OK  FALLO: $FAILED  OMITIDO: $SKIP"
[[ $FAILED -eq 0 ]] || exit 1
exit 0
