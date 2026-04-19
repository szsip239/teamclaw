#!/bin/bash
# check-env.sh — Detect Python/uv environment and install uv if missing
# Usage: bash check-env.sh [--install]
# Returns JSON-like summary for agent consumption

set -euo pipefail

INSTALL="${1:-}"

echo "=== Environment Check ==="

# OS
echo "OS: $(uname -s) $(uname -m)"

# Python
if command -v python3 &>/dev/null; then
  echo "Python3: $(python3 --version 2>&1) at $(which python3)"
else
  echo "Python3: NOT FOUND"
fi

# pip3
if command -v pip3 &>/dev/null; then
  echo "pip3: $(pip3 --version 2>&1 | head -1)"
else
  echo "pip3: NOT FOUND"
fi

# venv module
if python3 -m venv --help &>/dev/null 2>&1; then
  echo "venv: available (python3 -m venv)"
else
  echo "venv: NOT AVAILABLE"
fi

# uv
if command -v uv &>/dev/null; then
  echo "uv: $(uv --version 2>&1) at $(which uv)"
  echo "uv: OK"
else
  echo "uv: NOT FOUND"
  if [ "$INSTALL" = "--install" ]; then
    echo ""
    echo "Installing uv..."
    curl -LsSf https://astral.sh/uv/install.sh | sh
    echo ""
    # Source the env to pick up uv
    export PATH="$HOME/.local/bin:$PATH"
    if command -v uv &>/dev/null; then
      echo "uv: installed successfully — $(uv --version 2>&1)"
    else
      echo "uv: installation failed — check PATH"
      exit 1
    fi
  else
    echo "Run with --install to auto-install uv"
  fi
fi

# brew (macOS)
if [ "$(uname -s)" = "Darwin" ]; then
  if command -v brew &>/dev/null; then
    echo "brew: $(brew --version 2>&1 | head -1)"
  else
    echo "brew: NOT FOUND"
  fi
fi

# Docker (for container instances)
if command -v docker &>/dev/null; then
  echo "docker: $(docker --version 2>&1 | head -1)"
else
  echo "docker: NOT FOUND"
fi

echo ""
echo "=== Recommendation ==="
if command -v uv &>/dev/null; then
  echo "✅ uv is available. Use 'uv venv' and 'uv pip install' for Python."
else
  echo "⚠️  uv is missing. Run: curl -LsSf https://astral.sh/uv/install.sh | sh"
fi
