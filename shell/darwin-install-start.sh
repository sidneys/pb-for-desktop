#!/bin/bash

# Build
echo "Building.."
npm run build darwin

# Install
echo "Installing.."
rm -rf "/Applications/PB for Desktop.app"
mv "./build/staging/PB for Desktop-darwin-x64/PB for Desktop.app" "/Applications/"

# Start
echo "Starting.."
DEBUG=1 open "/Applications/PB for Desktop.app"
