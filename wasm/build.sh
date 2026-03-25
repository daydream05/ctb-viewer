#!/usr/bin/env bash
set -euo pipefail

source "$HOME/.cargo/env"
wasm-pack build --target web --out-dir ../web/pkg
