#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

exec "./部署Cloudflare Pages.command"
