# PB for Desktop    

[![Build status](https://ci.appveyor.com/api/projects/status/d69sb6iav7tnrldq?svg=true)](https://ci.appveyor.com/project/sidneys/pb-for-desktop) [![build status](http://img.shields.io/travis/sidneys/pb-for-desktop.svg?style=flat)](http://travis-ci.org/sidneys/pb-for-desktop) [![issues](https://img.shields.io/github/issues/sidneys/pb-for-desktop.svg)](https://github.com/sidneys/pb-for-desktop/issues) [![Join the chat at https://gitter.im/sidneys/pb-for-desktop](https://badges.gitter.im/sidneys/pb-for-desktop.svg)](https://gitter.im/sidneys/pb-for-desktop?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge)  

---

**PB for Desktop** is a lightweight & unobstrusive cross-platform client for [PushBullet](https://pushbullet.com/).

Receive native push notifications on OS X, Windows and Linux.

*Not affiliated with PushBullet Inc..*


## Contents

1. [Features](#features)
2. [Installation](#installation)
3. [CLI](#cli)
4. [Developers](#developers)
5. [How to Build](#how-to-build)
6. [Author](#author)
7. [License](#license)


## <a name="features"/>Features

**Native Notifications**

Uses the macOS Notification Center and the Windows 10 Action Center.

**Unobstrusive**

Small resource footprint - runs as a macOS Menu Bar app or a Windows System Tray app.

**Simple Setup**

No wrestling with API-Keys or other technical knowledge required.
Login to Pushbullet using Google or Facebook.

**Channel Images**

Channel-specific  (e.g. [IFTTT](https://ifttt.com/), [Zapier](https://zapier.com/), [Chat](http://lifehacker.com/huge-pushbullet-update-adds-instant-messaging-chat-hea-1714870644)) icon images for most notifications.

**Image Thumbnails**

Preview thumbnails for pushes containing images.

**Custom Sound Effects**

Use the default Pushbullet sound or one of your choice.

**Notification Emoji** 👾

Use tags to add Emojis to notifications.

*Examples*

- Add **{video}** to YouTube pushes to show a 📺 in front of notifications
- Add **{social}** to reddit pushes with to show a 🍻 with notifications



## <a name="installation"/>Installation

Download the latest version on the [Releases page](https://github.com/sidneys/pb-for-desktop/releases).



## <a name="cli"/>CLI

Install the global node package

```bash
npm install --global pb-for-desktop
```

Run it

```bash
pb-for-desktop
```



## <a name="developers"/>Developers

### Environment

After cloning, install the required packages:

```bash
npm install
```

Fire up a local Electron instance:

```bash
./node_modules/.bin/electron ./app/main.js
```



## <a name="how-to-build"/>How to Build

### Prerequisites

All platforms can only be built on macOS. Building the Windows binaries on macOS or Linux moreover requires [wine](https://winehq.org) and [mono](https://nsis.sourceforge.net/Docs/Chapter3.htm), whereas building for Linux requires [fakeroot](https://wiki.debian.org/FakeRoot) and [dpkg](https://wiki.ubuntuusers.de/dpkg/).

To install these prerequisites on macOS (using [Homebrew](https://brew.sh)), run:

```bash
brew install --verbose wine mono
brew install --verbose fakeroot dpkg
```

### To build all platforms

To build binaries for all platforms (which can be built under the current platform), run:

```bash
npm run build <darwin|linux|win32>
```

### To build a specific platform

#### macOS

```bash
npm run build darwin
```

#### Windows

```bash
npm run build win32
```

#### Linux

```bash
npm run build linux
```

### Artifacts

Build artifacts will be placed within **pb-for-desktop/build/releases**.



## <a name="author"/>Author

[sidneys](http://sidneys.github.io)



## <a name="license"/>License

MIT
