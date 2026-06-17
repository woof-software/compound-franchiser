#!/usr/bin/env bash

set -euo pipefail

echo

if ! command -v slither > /dev/null 2>&1; then
    echo "Slither is not found."
    echo "Please, install Slither: "
    echo "\`https://github.com/crytic/slither?tab=readme-ov-file#how-to-install\`."
    echo
    exit 1
fi

if ! command -v solc-select > /dev/null 2>&1; then
    echo "solc-select is not found. Installing..."
    pip3 install solc-select
fi

SOLC_VERSION="0.8.34"

if ! solc-select versions | grep -q "^${SOLC_VERSION}$"; then
    echo "Installing solc ${SOLC_VERSION}..."
    solc-select install "${SOLC_VERSION}"
fi

solc-select use "${SOLC_VERSION}"

REPORT_DIR="./security-reports"
REPORT_PATH="$REPORT_DIR/Slither.md"
FOUNDRY_TOML="./foundry.toml"

mkdir -p "$REPORT_DIR"

# Create a minimal foundry.toml so crytic-compile can resolve imports.
# Removed after slither finishes.
cat > "$FOUNDRY_TOML" <<'EOF'
[profile.default]
src = "contracts"
out = "out"
libs = ["node_modules"]
remappings = ["@openzeppelin/contracts/=node_modules/@openzeppelin/contracts/"]
solc_version = "0.8.34"
exclude = ["contracts/mocks/**"]
EOF

cleanup() {
    rm -f "$FOUNDRY_TOML"
}
trap cleanup EXIT

echo "Running Slither..."
slither . \
    --config-file .slither.config.json \
    --checklist > "$REPORT_PATH" || true

echo
echo "The Slither report is stored in $REPORT_PATH."
echo
