#!/usr/bin/env bash
# JioTv Max Release CLI Launcher
cd "$(dirname "$0")/updater-cli"
node --import tsx/esm src/index.ts "$@"
