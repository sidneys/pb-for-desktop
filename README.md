# PB for Desktop [![travis](http://img.shields.io/travis/sidneys/pb-for-desktop.svg?style=flat-square)](http://travis-ci.org/sidneys/pb-for-desktop) [![appveyor](https://ci.appveyor.com/api/projects/status/g89n15qx2a88npgb?svg=true)](https://ci.appveyor.com/project/sidneys/pb-for-desktop) [![npm](https://img.shields.io/npm/v/pb-for-desktop.svg?style=flat-square)](https://npmjs.com/package/pb-for-desktop)

<p align="center">
  <b>PB for Desktop</b> is a <b>lightweight</b> open-source <b>Desktop app</b> for <b><a href="https://pushbullet.com/">PushBullet</a></b>.<br>
  Receive native push notifications on macOS, Windows and Linux.</b><br><br>
  <img height="200px" src="https://raw.githubusercontent.com/sidneys/pb-for-desktop/release/resources/graphics/icon.png"/><br><br>
  <i>Not affiliated with PushBullet Incorporated.</i><br><br>
</p>


------

![Screenshot: Pushbullet for Desktop (macOS)](https://raw.githubusercontent.com/sidneys/pb-for-desktop/release/resources/screenshots/screenshot-macos.png)

![Screenshot: Pushbullet for Desktop (Windows)](https://raw.githubusercontent.com/sidneys/pb-for-desktop/release/resources/screenshots/screenshot-win32.png)

![Screenshot: Pushbullet for Desktop (Linux)](https://raw.githubusercontent.com/sidneys/pb-for-desktop/release/resources/screenshots/screenshot-linux.png)

------

> **Native Notifications**

Uses the macOS [Notification Center](https://en.wikipedia.org/wiki/Notification_Center), the Windows 10 [Action Center](https://en.wikipedia.org/wiki/Action_Center) and [libnotify](https://launchpad.net/ubuntu/+source/libnotify) for Linux.

> **Cross-Platform**

Tested on macOS (10.11, 10.12), Windows 10 (Anniversary Update) and Debian Linux (Ubuntu 16.04, elementary OS 0.4)

> **Unobstrusive**

Small resource footprint - runs as a macOS Menu Bar app or a Windows System Tray app.

> **Simple Setup**

No wrestling with API-Keys or other technical knowledge required.
Login to Pushbullet using Google or Facebook.

> **Channel Images**

Channel-specific  (e.g. [IFTTT](https://ifttt.com/), [Zapier](https://zapier.com/), [Chat](http://lifehacker.com/huge-pushbullet-update-adds-instant-messaging-chat-hea-1714870644)) icon images for most notifications.

> **Push Previews**

Preview thumbnails for pushes containing images.

> **Custom Sound Effects**

Use the default Pushbullet sound or one of your choice.

> **Dedicated Push Target**

Use the *PB for Desktop* PushBullet device to only send pushes to your desktop.

> **Mirroring**

Mirror Android notifications (Android only).

> **SMS** [![Feature Status: Beta](https://img.shields.io/badge/feature-alpha-blue.svg?style=flat-square)]()

Send & receive SMS to Android devices.

> **Emoji** [![Feature Status: Alpha](https://img.shields.io/badge/feature-beta-red.svg?style=flat-square)]()

Use tags to add emoji to notifications, e.g.: add  `{video}` to show a 📺 with every notification.


## Contents

1. [Installation](#installation)
2. [Developers](#development)
3. [Continuous Integration](#continuous-integration)
4. [Up Next](#up-next)
5. [Contact](#contact)
6. [Author](#author)


## <a name="installation"/></a> Installation

### Standard Installation

Download the latest version of PB for Desktop on the [Releases](https://github.com/sidneys/pb-for-desktop/releases) page.

### Installation as Commandline Tool

```bash
npm install --global pb-for-desktop		# Installs the node CLI module
pb-for-desktop							# Runs it
```


## <a name="developers"/></a> Developers

### Sources

Clone the repo and install dependencies.

```shell
git clone https://github.com/sidneys/pb-for-desktop.git pb-for-desktop
cd pb-for-desktop
npm install
```

### Scripts

#### npm run **start**

Run the app with integrated Electron.

```bash
npm run start
npm run start:dev 					# with Debugging Tools
npm run start:livereload 			# with Debugging Tools and Livereload
```

#### npm run **localsetup**

Install the app in the System app folder and start it.

```bash
npm run localsetup
npm run localsetup:rebuild			# Build before installation
npm run localsetup:rebuild:dev 		# Build before installation, use Developer Tools
```

#### npm run **build**

Build the app and create installers (see [requirements](#build-requirements)).

```bash
npm run build					# build all available platforms
npm run build macos windows		# build specific platforms (macos/linux/windows)
```

### Build Requirements

* Building for Windows requires [`wine`](https://winehq.org) and [`mono`](https://nsis.sourceforge.net/Docs/Chapter3.htm) (on macOS, Linux)
* Building for Linux requires  [`fakeroot`](https://wiki.debian.org/FakeRoot) and [`dpkg `](https://wiki.ubuntuusers.de/dpkg/) (on macOS, Windows)
* Only macOS can build for other platforms.

#### macOS Build Setup

Install [Homebrew](https://brew.sh), then run:

```bash
brew install wine mono fakeroot dpkg
```

#### Linux  Build Setup

```bash
sudo apt-get install wine mono fakeroot dpkg
```


## <a name="continuous-integration"/></a> Continuous Integration

> Turnkey **build-in-the-cloud** integration.

The CI deployment is managed by a custom layer of node scripts and Electron-optimized configuration templates.
Completed Installation packages are deployed to [GitHub Releases](https://github.com/sidneys/pb-for-desktop/releases). Builds for all platforms and architectures take about 5 minutes.
Backed by the open-source-friendly guys at [Travis](http://travis-ci.org/) and AppVeyor](https://ci.appveyor.com/) and running [electron-packager](https://github.com/electron-userland/electron-packager) under the hood.

### Setup

1.  [Fork](https://github.com/sidneys/pb-for-desktop/fork) the repo
2.  Generate your GitHub [Personal Access Token](https://github.com/settings/tokens) using "repo" as scope. Copy it to the clipboard.
3.  **macOS + Linux**
     1. Sign in to [Travis](http://travis-ci.org/) using GitHub.
     2. Open your [Travis Profile](https://travis-ci.org/profile), click "Sync Account" and wait for the process to complete.
     3. Find this repository in the list, enable it and click "⚙" to open its settings.
     4. Create a new Environment Variable named **GITHUB_TOKEN**. Paste your Token from step 2 as *value*. 
4.  **Windows**
     1. Sign in to [AppVeyor](https://ci.appveyor.com/) using GitHub.
     2. Click on ["New Project"](https://ci.appveyor.com/projects/new), select "GitHub", look up this repo in the list and click "Add".
     3. After import navigate to the *Settings* > *Environment* subsection
     4. Select "Add Variable", insert **GITHUB_TOKEN** for *name*, paste your Token as *value*. Save.

### Triggering Builds

1. Add a new Tag to start the build process:

   ```shell
   git tag -a v1.0.1
   git push --tags
   ```
   The builds are started in parallel and added to the "Releases" page of the GitHub repo (in draft mode).

2. Use the editing feature to publish the new app version.

3. There is no step 3


## <a name="up-next"/></a> Up Next

- [ ] SMS (Android)
- [ ] In-App Updates (Squirrel)
- [ ] Signed binaries
- [ ] E2E Testing ([Spectron](https://github.com/electron/spectron))


## <a name="contribute"/></a> Contact ![Contributions Wanted](https://img.shields.io/badge/contributions-wanted-red.svg?style=flat-square)

* [Dev Chat](http://gitter.im/sidneys/pb-for-desktop): Talk about features and suggestions.
* [Issues](http;//github.com/sidneys/pb-for-desktop/issues) File bugs and document issues.


## <a name="author"/></a> Author

[sidneys](http://sidneys.github.io) 2016