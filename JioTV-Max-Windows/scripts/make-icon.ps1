# Invokes derive-icons.ps1 to re-derive build/icon.png and all project assets from Icon-Pack/2048 x 2048.png
$script = Join-Path $PSScriptRoot "derive-icons.ps1"
& $script
