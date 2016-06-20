'use strict';

/**
 * Modules
 * External
 */
const path = require('path'),
    childProcess = require('child_process'),
    glob = require('glob'),
    _ = require('lodash'),
    publishRelease = require('publish-release'),
    semverUtils = require('semver-utils'),
    ghReleases = require('got-github-releases');


/**
 * Modules
 * Internal
 */
const packageJson = require('./package.json');


/**
 * Logger
 */
let log = function() {
    var args = Array.from(arguments);

    var title = args[0],
        text = args.slice(1),
        textList = [];

    for (let value of text) {
        if (_.isPlainObject(value)) {
            textList.push('\r\n' + JSON.stringify(value, null, 4) + '\r\n');
        } else {
            textList.push(value);
        }
    }

    console.log('\x1b[1m%s: %s\x1b[0m', title, textList.join(' '));
};


/**
 * Deployment asset list
 */
let assetList = glob.sync(path.join(path.resolve(packageJson.build.directoryRelease), '*.zip'));


/**
 * Options for publish-release
 */
let createPublishOptions = function() {
    return {
        token: process.env.GITHUB_TOKEN,
        owner: packageJson.author.name,
        repo: packageJson.name,
        tag: 'v' + packageJson.version,
        name: packageJson.build.productName + ' ' + 'v' + packageJson.version,
        notes: packageJson.version,
        draft: true,
        reuseRelease: true,
        reuseDraftOnly: true,
        assets: assetList,
        target_commitish: 'master'
    };
};

var createReleaseNotes = function(cb) {
    ghReleases(packageJson.author.name + '/' + packageJson.name).then(function(releases) {
        var startTag = 'v' + semverUtils.parse(releases.latest.tag_name).version,
            endTag = 'v' + semverUtils.parse(packageJson.version).version,
            text = childProcess.execSync('git log --pretty=format:"%s" ' + startTag + '...' + endTag);

        console.log(startTag)
        console.log(endTag)

        cb(text.toString());
    });
};

/**
 * Publish
 */
log('Number of assets ready for publishing', assetList.length);

createReleaseNotes(function(result) {
    console.log(result)
});

return
let release = publishRelease(createPublishOptions(), function(err) {
    if (err) {
        log('Publishing error', JSON.stringify(err, null, 4));
        return process.exit(1);
    }
});

var i = 1;
release.on('create-release', function() {
    log('Starting to publish asset', i + 'of' + assetList.length);
    i = i + 1;
});

release.on('created-release', function() {
    log('Release created', 'https://github.com/' + packageJson.author.name + '/' + packageJson.name + '/releases/tag/' + packageJson.version);
});

release.on('upload-asset', function(name) {
    log('Asset upload commencing', name);
});

release.on('uploaded-asset', function(name) {
    log('Asset upload complete', name);
});

release.on('upload-progress', function(name, progress) {

    log('Asset uploading', name, Math.round(progress.percentage) + ' ' + '%');
});
