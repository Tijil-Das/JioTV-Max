@echo off
:: JioTv Max Release CLI Launcher
cd /d "%~dp0updater-cli"
node --import tsx/esm src/index.ts %*
