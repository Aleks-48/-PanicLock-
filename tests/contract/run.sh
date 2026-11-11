#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
mode=${1:-all}
suite=tests/contract/transfers.test.mjs
case "$mode" in all|docker|worker|live) ;; *) echo 'Use all, docker, worker or live' >&2; exit 2;; esac
tmp=$(mktemp -d)
container=""
cleanup(){
  if [[ $? -ne 0 && -n "$container" ]]; then docker logs --tail 100 "$container" >&2; fi
  if [[ -n "$container" ]]; then docker rm -f "$container" >/dev/null; fi
  rm -rf "$tmp"
}
trap cleanup EXIT
if [[ "$mode" == all || "$mode" == docker ]]; then
  docker build -q -t paniclock-contract-bank ./backend >/dev/null
  container=$(docker run -d --rm -p 127.0.0.1::8000 \
    -v "$PWD/tests/contract/docker_app.py:/app/docker_app.py:ro" \
    -e PANICLOCK_DATA=/tmp/ledger paniclock-contract-bank uvicorn docker_app:app --host 0.0.0.0 --port 8000)
  addr=$(docker port "$container" 8000/tcp)
  for i in {1..40}; do
    if curl -fsS "http://$addr/api/health" >/dev/null 2>&1; then break; fi
    sleep 0.5
  done
  token=$(docker exec "$container" cat /tmp/ledger/judge.key)
  TARGET=docker BASE="http://$addr" TEST_CONTAINER="$container" OPERATOR_KEY="$token" node --test "$suite"
fi
if [[ "$mode" == all || "$mode" == worker ]]; then
  if [[ -z "${HOSTED_DIR:-}" ]]; then
    git fetch --quiet origin refs/heads/demo/hosted
    git log -1 --format="Hosted implementation: %H" FETCH_HEAD
    git archive FETCH_HEAD cloud/worker.ts drizzle | tar -x -C "$tmp"
    HOSTED_DIR=$tmp
  fi
  TARGET=worker HOSTED_DIR="$HOSTED_DIR" node --test "$suite"
fi
if [[ "$mode" == live ]]; then
  TARGET=live BASE=https://paniclock-mobile-banking.vovnoivan.chatgpt.site node --test "$suite"
fi
