#!/usr/bin/env bash

set -euo pipefail

echo

if ! command -v aderyn > /dev/null 2>&1; then
    echo "Aderyn is not found."
    echo "Please, install Aderyn: "
    echo "\`https://github.com/Cyfrin/aderyn?tab=readme-ov-file#usage\`."
    echo
    exit 1
fi

REPORT_DIR="./security-reports"
REPORT_PATH="$REPORT_DIR/Aderyn.md"

mkdir -p "$REPORT_DIR"

echo "Running Aderyn..."
aderyn --output "$REPORT_PATH"

echo
echo "The Aderyn report is stored in $REPORT_PATH."
echo
