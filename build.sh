#!/bin/bash
APPNAME=Pushbullet-Electron
electron-packager . $APPNAME --platform=linux --arch=x64 --version=0.36.4 --overwrite=true --asar=false --app_version=0.0.1 --appname=$APPNAME --out=releases --overwrite=true --icon=images/app.png