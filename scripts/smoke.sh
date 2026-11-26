#!/bin/sh
set -eu
web="http://$(docker compose port web 3000)"
api="http://$(docker compose port api 8080)"
ai="http://$(docker compose port ai 8000)"
body=$(mktemp)
cleanup() {
  if [ "${restore:-0}" = 1 ]; then docker compose start ai; fi
  unlink "$body"
}
trap cleanup EXIT
trap 'exit 1' HUP INT TERM

check() {
  actual=$(curl -sS --max-time 5 -o "$body" -w '%{http_code}' "$1") || return 1
  [ "$actual" = "$2" ] && jq -e "$3" "$body" >/dev/null || return 1
  printf '%s → %s ' "$1" "$actual"
  jq -c . "$body"
}

ready='.status == "ok" and .checks.db == "ok" and .checks.ai == "ok"'
unready='.status == "unavailable" and .checks.db == "ok" and .checks.ai == "unavailable"'
live='.status == "ok"'
wait_ready() {
  deadline=$(($(date +%s) + 60))
  until check "$api/readyz" 200 "$ready" && check "$web/api/health" 200 "$ready"; do
    if [ "$(date +%s)" -ge "$deadline" ]; then
      echo "Timed out waiting for API and Web readiness" >&2
      return 1
    fi
    sleep 2
  done
}

wait_ready
[ "$(curl -sS --max-time 5 -o "$body" -w '%{http_code}' "$web/")" = 200 ]
grep -q 'KU Spot' "$body"
printf '%s/ → 200 KU Spot\n' "$web"
check "$ai/healthz" 200 "$live"
check "$api/healthz" 200 "$live"

case "${1:-}" in
  --ai-outage)
    restore=1
    docker compose stop ai
    check "$api/healthz" 200 "$live"
    check "$api/readyz" 503 "$unready"
    check "$web/api/health" 503 "$unready"
    docker compose start ai
    restore=0
    wait_ready
    ;;
  "") ;;
  *) echo "Usage: $0 [--ai-outage]" >&2; exit 2 ;;
esac
