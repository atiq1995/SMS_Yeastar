#!/bin/bash
set -a
source /opt/toms-sms/.env
set +a
TO="${SMS_TEST_MOBILE:-0450323290}"
echo "=== B: username+number ==="
curl -sS -m 15 "http://${YEASTAR_HOST}:${YEASTAR_HTTP_PORT}/cgi/WebCGI?1500101=account&username=${YEASTAR_USERNAME}&password=${YEASTAR_PASSWORD}&port=${YEASTAR_SIM_PORT}&number=${TO}&content=test"
echo
echo "=== A: account=user+destination ==="
curl -sS -m 15 "http://${YEASTAR_HOST}:${YEASTAR_HTTP_PORT}/cgi/WebCGI?1500101=account=${YEASTAR_USERNAME}&password=${YEASTAR_PASSWORD}&port=${YEASTAR_SIM_PORT}&destination=${TO}&content=test"
echo
