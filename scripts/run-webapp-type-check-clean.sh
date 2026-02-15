#!/usr/bin/env bash
set -euo pipefail
unset npm_config_http_proxy
unset npm_config_https_proxy
npm run type-check --prefix webapp
