#!/bin/bash



## UTILITIES

# urlencode <string>
_util_urlencode () {
  local string="${1}"
  local strlen="${#string}"
  local encoded=""
  local pos c o

  for (( pos=0 ; pos<strlen ; pos++ )); do
     c=${string:${pos}:1}
     case "$c" in
        [-_.~a-zA-Z0-9] ) o="${c}" ;;
        * )               printf -v o '%%%02x' "'$c"
     esac
     encoded+="${o}"
  done
  echo "${encoded}"
  REPLY="${encoded}"
}

_util_urldecode () {
  printf -v REPLY '%b' "${1//%/\\x}"
  echo "${REPLY}"
}

# Log
_util_log () {
  while read; do printf '\e[0;30m\e[46m%s\e[0m \e[1;36m%s\e[0m\n' "[ELECTRON-CLOUD-DEPLOY]" "$REPLY"; done
}

# Log Variable
_util_log_debug () {
  if [ "$DEBUG" == 1 ]; then
      while read; do printf '\e[0;30m\e[42m%s\e[0m \e[1;32m%s\e[0m\n' "[ELECTRON-CLOUD-DEPLOY]" "$REPLY"; done
  fi
}

# Log Errors
_util_log_error () {
  while read; do printf '\e[0;30m\e[41m%s\e[0m \e[1;31m%s\e[0m\n' "[ELECTRON-CLOUD-DEPLOY]" "$REPLY"; done
}

# Check if tool exists
_util_command_exists () {
    type "$1" &> /dev/null ;
}

# Find files up the tree
_util_find_up () {
    # Recursively list a file from PWD up the directory tree to root
    [[ -n $1 ]] || { return 1; }
    local THERE=$PWD RC=2
    while [[ ${THERE} != / ]]
        do [[ -e ${THERE}/${2:-$1} ]] && { ls ${2:+$1} ${THERE}/${2:-$1}; RC=0; }
            THERE=$(dirname ${THERE})
        done
    [[ -e ${THERE}/${2:-$1} ]] && { ls ${2:+$1} /${2:-$1}; RC=0; }
    return ${RC}
}

# Install Minimum Toolset
_util_prerequisites_install () {
    if ! [ -x "$(command -v curl)" ]; then
      brew install curl || true
    fi
    if ! [ -x "$(command -v jq)" ]; then
      brew install jq || true
    fi
}

_util_prerequisites_install



### CONFIGURATION

# Global Environment
BINTRAY_USER="${BINTRAY_USER}"
BINTRAY_TOKEN="${BINTRAY_TOKEN}"

# Overrides
DEBUG="${DEBUG:-0}"

# Defaults
CACHE_TITLE="homebrew"
CACHE_MODULES_LIST=( fontconfig freetype gd gnutls graphicsmagick jasper libgphoto2 libicns libtasn1 libusb libusb-compat little-cms2 mono nettle openssl sane-backends webp wine )
CACHE_MODULES_HOME="$(brew --cellar)"
CACHE_HOMEPAGE="http://github.io/sidneys/electron-cloud-deploy"
CACHE_LICENSE="MIT"
CACHE_FILE_PREFIX="cache-"
CACHE_FILE_EXTENSION="tar.gz"
CACHE_PATH_SUBFOLDER="build/tools-cache"
APPLICATION_JSON_FILE_NAME="package.json"
LOGFILE_FILE_NAME="electron-cloud-deploy.log"

# Application
APPLICATION_PATH_ABSOLUTE=$( dirname $( _util_find_up ${APPLICATION_JSON_FILE_NAME} ) )
APPLICATION_JSON_PATH_ABSOLUTE="${APPLICATION_PATH_ABSOLUTE}"/"${APPLICATION_JSON_FILE_NAME}"
APPLICATION_NAME=$( cat ${APPLICATION_JSON_PATH_ABSOLUTE} | jq -r -M '.build.name // .name' )
APPLICATION_VERSION=$( cat ${APPLICATION_JSON_PATH_ABSOLUTE} | jq -r -M '.build.version // .version' )
APPLICATION_LICENSE=$( cat ${APPLICATION_JSON_PATH_ABSOLUTE} | jq -r -M '.build.license // .license' )
APPLICATION_HOMEPAGE=$( cat ${APPLICATION_JSON_PATH_ABSOLUTE} | jq -r -M '.build.homepage // .homepage' )

# Log
LOGFILE_PATH_ABSOLUTE="${APPLICATION_PATH_ABSOLUTE}"/"${LOGFILE_FILE_NAME}"

# Cache
CACHE_VERSION="${APPLICATION_VERSION}"
CACHE_FILE_NAME="${CACHE_FILE_PREFIX}""${CACHE_TITLE}"
CACHE_PATH="${CACHE_PATH_SUBFOLDER}"/"${CACHE_VERSION}"
CACHE_PATH_ABSOLUTE="${APPLICATION_PATH_ABSOLUTE}"/"${CACHE_PATH}"
CACHE_FILEPATH="${CACHE_PATH}"/"${CACHE_FILE_NAME}"."${CACHE_FILE_EXTENSION}"
CACHE_FILEPATH_ABSOLUTE="${APPLICATION_PATH_ABSOLUTE}"/"${CACHE_FILEPATH}"

# Bintray
BINTRAY_BASEURL_API="https://api.bintray.com"
BINTRAY_BASEURL_DOWNLOAD="https://dl.bintray.com"

# Resource Paths
BINTRAY_API_RESOURCE_CONTENT="content"
BINTRAY_API_RESOURCE_PACKAGES="packages"
BINTRAY_API_RESOURCE_REPOS="repos"

# Queries
BINTRAY_API_QUERY_PUBLISH="publish"
BINTRAY_API_QUERY_VERSIONS="versions"

# Endpoints
BINTRAY_ENDPOINT_CONTENT="${BINTRAY_BASEURL_API}"/"${BINTRAY_API_RESOURCE_CONTENT}"
BINTRAY_ENDPOINT_REPO="${BINTRAY_BASEURL_API}"/"${BINTRAY_API_RESOURCE_REPOS}"
BINTRAY_ENDPOINT_PACKAGES="${BINTRAY_BASEURL_API}"/"${BINTRAY_API_RESOURCE_PACKAGES}"
BINTRAY_ENDPOINT_DOWNLOAD="${BINTRAY_BASEURL_DOWNLOAD}"

# Environment
_configuration_global_show () {
    if [ "$DEBUG" == 1 ]; then
      echo "------------------------------------------------------------------------" | _util_log_debug
      echo APPLICATION_HOMEPAGE ${APPLICATION_HOMEPAGE} | _util_log_debug
      echo APPLICATION_LICENSE ${APPLICATION_LICENSE} | _util_log_debug
      echo APPLICATION_NAME ${APPLICATION_NAME} | _util_log_debug
      echo APPLICATION_VERSION ${APPLICATION_VERSION} | _util_log_debug
      echo APPLICATION_JSON_FILE ${APPLICATION_JSON_FILE_NAME} | _util_log_debug
      echo APPLICATION_JSON_PATH_ABSOLUTE ${APPLICATION_JSON_PATH_ABSOLUTE} | _util_log_debug
      echo APPLICATION_PATH_ABSOLUTE ${APPLICATION_PATH_ABSOLUTE} | _util_log_debug
      echo APPLICATION_PATH_ABSOLUTE ${APPLICATION_PATH_ABSOLUTE} | _util_log_debug
      echo APPLICATION_PATH_ABSOLUTE ${APPLICATION_PATH_ABSOLUTE} | _util_log_debug
      echo BINTRAY_API_QUERY_PUBLISH ${BINTRAY_API_QUERY_PUBLISH} | _util_log_debug
      echo BINTRAY_API_QUERY_VERSIONS ${BINTRAY_API_QUERY_VERSIONS} | _util_log_debug
      echo BINTRAY_API_RESOURCE_CONTENT ${BINTRAY_API_RESOURCE_CONTENT} | _util_log_debug
      echo BINTRAY_API_RESOURCE_PACKAGES ${BINTRAY_API_RESOURCE_PACKAGES} | _util_log_debug
      echo BINTRAY_ENDPOINT_CONTENT ${BINTRAY_ENDPOINT_CONTENT} | _util_log_debug
      echo BINTRAY_ENDPOINT_DOWNLOAD ${BINTRAY_ENDPOINT_DOWNLOAD} | _util_log_debug
      echo BINTRAY_ENDPOINT_PACKAGES ${BINTRAY_ENDPOINT_PACKAGES} | _util_log_debug
      echo BINTRAY_ENDPOINT_REPO ${BINTRAY_ENDPOINT_REPO} | _util_log_debug
      echo BINTRAY_TOKEN ${BINTRAY_TOKEN} | _util_log_debug
      echo BINTRAY_USER ${BINTRAY_USER} | _util_log_debug
      echo CACHE_FILEPATH ${CACHE_FILEPATH} | _util_log_debug
      echo CACHE_FILEPATH_ABSOLUTE ${CACHE_FILEPATH_ABSOLUTE} | _util_log_debug
      echo CACHE_FILE_EXTENSION ${CACHE_FILE_EXTENSION} | _util_log_debug
      echo CACHE_FILE_NAME ${CACHE_FILE_NAME} | _util_log_debug
      echo CACHE_MODULES_HOME ${CACHE_MODULES_HOME} | _util_log_debug
      echo CACHE_MODULES_LIST ${CACHE_MODULES_LIST[@]} | _util_log_debug
      echo CACHE_PATH ${CACHE_PATH} | _util_log_debug
      echo CACHE_PATH_ABSOLUTE ${CACHE_PATH_ABSOLUTE} | _util_log_debug
      echo CACHE_VERSION ${CACHE_VERSION} | _util_log_debug
      echo DEBUG ${DEBUG} | _util_log_debug
      echo LOG_FILEPATH_ABSOLUTE ${LOGFILE_PATH_ABSOLUTE} | _util_log_debug
      echo SCRIPTS_ROOT ${SCRIPTS_ROOT} | _util_log_debug
      echo "------------------------------------------------------------------------" | _util_log_debug
  fi
}



### APPLICATION

# Validate App Configuration
_application_configuration_validate () {
    local JSON_PATH_ABSOLUTE="$1"

    local NAME=$( cat ${APPLICATION_JSON_PATH_ABSOLUTE} | jq -r -M '.build.name // .name' )
    local VERSION=$( cat ${APPLICATION_JSON_PATH_ABSOLUTE} | jq -r -M '.build.version // .version' )
    local LICENSE=$( cat ${APPLICATION_JSON_PATH_ABSOLUTE} | jq -r -M '.build.license // .license' )
    local HOMEPAGE=$( cat ${APPLICATION_JSON_PATH_ABSOLUTE} | jq -r -M '.build.homepage // .homepage' )

    if [ ! -f "${JSON_PATH_ABSOLUTE}" ]; then echo "${JSON_PATH_ABSOLUTE} Application package.json not found. Aborting." | _util_log_error; return 1; else return 0; fi

    if [ -z "$NAME" ]; then echo "Application 'name' required. Aborting." | _util_log_error; return 1; fi
    if [ -z "$VERSION" ]; then echo "Application 'version' required. Aborting." | _util_log_error; return 1; fi
    if [ -z "$LICENSE" ]; then echo "Application 'license' required. Aborting." | _util_log_error; return 1; fi
    if [ -z "$HOMEPAGE" ]; then echo "Application 'homepage' required. Aborting." | _util_log_error; return 1; fi

    return 0
}



### BINTRAY

# Validate Bintray Credentials
_bintray_credentials_validate () {
    local USER="$1"
    local TOKEN="$2"

    if [ -z "$USER" ]; then echo "Bintray Username required. Aborting." | _util_log_error; return 1; fi
    if [ -z "$TOKEN" ]; then echo "Bintray Token required (bintray.com/profile/edit). Aborting." | _util_log_error; return 1; fi

    return 0
}

# Upload Artifact
_bintray_artifact_upload () {
    local REPO="$1"
    local PACKAGE="$2"
    local VERSION="$3"
    local FILE_PATH="$4"
    local FILE_NAME="$(basename ${FILE_PATH})"
    local FILE_NAME_URLENCODED="$(_util_urlencode ${FILE_NAME})"

    echo REPO ${REPO} | _util_log_debug
    echo PACKAGE ${PACKAGE} | _util_log_debug
    echo VERSION ${VERSION} | _util_log_debug
    echo FILE_PATH ${FILE_PATH} | _util_log_debug
    echo FILE_NAME ${FILE_NAME} | _util_log_debug
    echo FILE_NAME_URLENCODED ${FILE_NAME_URLENCODED} | _util_log_debug
    echo LOGFILE_PATH_ABSOLUTE ${LOGFILE_PATH_ABSOLUTE} | _util_log_debug
    echo BINTRAY_USER ${BINTRAY_USER} | _util_log_debug
    echo BINTRAY_TOKEN ${BINTRAY_TOKEN} | _util_log_debug
    echo BINTRAY_ENDPOINT_CONTENT ${BINTRAY_ENDPOINT_CONTENT} | _util_log_debug

    echo "Initiating upload: '$FILE_NAME'  -->  '$FILE_NAME_URLENCODED'" | _util_log

    if curl --fail --silent --output /dev/null --head "${BINTRAY_ENDPOINT_DOWNLOAD}" > /dev/null ; then
      echo "Package already uploaded." | _util_log
    else
        if curl --progress-bar --upload-file "${FILE_PATH}" --user "${BINTRAY_USER}":"${BINTRAY_TOKEN}" "${BINTRAY_ENDPOINT_CONTENT}"/"${REPO}"/"${PACKAGE}"/"${VERSION}"/"${FILE_NAME_URLENCODED}" | tee -a "${LOGFILE_PATH_ABSOLUTE}" | jq -r -M '.message' | _util_log ; test ${PIPESTATUS[0]} -eq 0; then
        return 0
      else
        echo "Upload failed." | _util_log_error
        return 1
      fi
    fi

    return 0
}

# Download Artifact
_bintray_artifact_download () {
    local REPO="$1"
    local FILE="$2"
    local DESTINATION="$3"

    local FILE_NAME="$(basename ${FILE})"
    local FILE_NAME_URLENCODED="$(_util_urlencode ${FILE_NAME})"
    local FILE_NAME_URLDECODED="$(_util_urldecode ${FILE_NAME})"

    local OUTPUT="${DESTINATION}"/"${FILE_NAME}"
    local URL="${BINTRAY_ENDPOINT_DOWNLOAD}"/"${REPO}"/"${FILE_NAME}"

    echo REPO ${REPO} | _util_log_debug
    echo FILE_PATH ${FILE} | _util_log_debug
    echo OUTPUT ${OUTPUT} | _util_log_debug
    echo URL ${URL} | _util_log_debug
    echo DESTINATION ${DESTINATION} | _util_log_debug
    echo FILE_NAME ${FILE_NAME} | _util_log_debug
    echo FILE_NAME_URLENCODED ${FILE_NAME_URLENCODED} | _util_log_debug
    echo FILE_NAME_URLDECODED ${FILE_NAME_URLDECODED} | _util_log_debug
    echo LOGFILE_PATH_ABSOLUTE ${LOGFILE_PATH_ABSOLUTE} | _util_log_debug
    echo BINTRAY_ENDPOINT_DOWNLOAD ${BINTRAY_ENDPOINT_DOWNLOAD} | _util_log_debug
    echo BINTRAY_USER ${BINTRAY_USER} | _util_log_debug
    echo BINTRAY_TOKEN ${BINTRAY_TOKEN} | _util_log_debug

    if curl --fail --silent --output /dev/null --head "${URL}"; then
      echo "Downloading: '${URL}'" | _util_log
      echo "To: '${OUTPUT}'" | _util_log
      if curl --progress-bar --location --url "${URL}" --output "${OUTPUT}" | tee -a "${LOGFILE_PATH_ABSOLUTE}" | jq -r -M '.message' | _util_log ; test ${PIPESTATUS[0]} -eq 0; then
        echo "Download successful: ${OUTPUT}" | _util_log
        return 0
        if ! tar -tf "${OUTPUT}" &>/dev/null; then
          rm "${OUTPUT}";
          echo "Package incomplete." | _util_log_error
          return 1
        fi
      else
        echo "Download failed." | _util_log_error
        return 1
      fi
    else
      echo "Package not available: ${URL}" | _util_log_error
      return 1
    fi
}

# Publish Uploaded Artifacts
_bintray_artifact_publish_all () {
    local REPO="$1"
    local PACKAGE="$2"
    local VERSION="$3"

    echo REPO ${REPO} | _util_log_debug
    echo PACKAGE ${PACKAGE} | _util_log_debug
    echo VERSION ${VERSION} | _util_log_debug
    echo BINTRAY_USER ${BINTRAY_USER} | _util_log_debug
    echo BINTRAY_TOKEN ${BINTRAY_TOKEN} | _util_log_debug
    echo BINTRAY_ENDPOINT_CONTENT ${BINTRAY_ENDPOINT_CONTENT} | _util_log_debug
    echo BINTRAY_API_QUERY_PUBLISH ${BINTRAY_API_QUERY_PUBLISH} | _util_log_debug

    echo "Publishing uploaded artifacts for: '${REPO}/${PACKAGE}/${VERSION}'" | _util_log

    if curl --silent -X POST --user "${BINTRAY_USER}":"${BINTRAY_TOKEN}" -H "Content-Type: application/json"  -d "{\"publish_wait_for_secs\":-1}" "${BINTRAY_ENDPOINT_CONTENT}"/"${REPO}"/"${PACKAGE}"/"${VERSION}"/"${BINTRAY_API_QUERY_PUBLISH}" | echo "Published artifacts: $(jq -r -M '.files')" | _util_log; then
      return 0
    else
      echo "Publishing failed." | _util_log_error
      return 1
    fi
}

# Remove Uploaded Artifact
_bintray_artifact_delete () {
    local REPO="$1"
    local FILE_PATH="$2"
    local FILE_NAME="$(basename ${FILE_PATH})"
    local FILE_NAME_URLENCODED="$(_util_urlencode ${FILE_NAME})"

    echo REPO ${REPO} | _util_log_debug
    echo FILE_PATH ${FILE_PATH} | _util_log_debug
    echo FILE_NAME ${FILE_NAME} | _util_log_debug
    echo FILE_NAME_URLENCODED ${FILE_NAME_URLENCODED} | _util_log_debug
    echo BINTRAY_USER ${BINTRAY_USER} | _util_log_debug
    echo BINTRAY_TOKEN ${BINTRAY_TOKEN} | _util_log_debug
    echo BINTRAY_ENDPOINT_CONTENT ${BINTRAY_ENDPOINT_CONTENT} | _util_log_debug

    if curl --silent -X DELETE --user "${BINTRAY_USER}":"${BINTRAY_TOKEN}" "${BINTRAY_ENDPOINT_CONTENT}"/"${REPO}"/"${FILE_NAME_URLENCODED}" | jq -r -M '.message' | _util_log; then
      return 0
    else
      echo "Could not delete uploaded artifact." | _util_log_error
      return 1
    fi
}

# Add Version
_bintray_version_add () {
    local REPO="$1"
    local PACKAGE="$2"
    local VERSION="$3"

    echo REPO ${REPO} | _util_log_debug
    echo PACKAGE ${PACKAGE} | _util_log_debug
    echo VERSION ${VERSION} | _util_log_debug
    echo BINTRAY_USER ${BINTRAY_USER} | _util_log_debug
    echo BINTRAY_TOKEN ${BINTRAY_TOKEN} | _util_log_debug
    echo BINTRAY_ENDPOINT_PACKAGES ${BINTRAY_ENDPOINT_PACKAGES} | _util_log_debug

    echo "Adding version: '${REPO}/${PACKAGE}/${VERSION}'" | _util_log

    if curl --silent -X POST --user "${BINTRAY_USER}":"${BINTRAY_TOKEN}"  -H "Content-Type: application/json"  -d "{\"name\":\"${VERSION}\",\"desc\":\"${VERSION}\"}" "${BINTRAY_ENDPOINT_PACKAGES}"/"${REPO}"/"${PACKAGE}"/"${VERSION}"/"${BINTRAY_API_QUERY_VERSIONS}" | jq -r -M '.message' | _util_log; then
      echo "Version created: '${VERSION}'" | _util_log
      return 0
    else
      echo "Version could not be created." | _util_log_error
      return 1
    fi
}

# Add Package
_bintray_package_add () {
    local PACKAGE="$1"
    local URL="$2"
    local LICENSE="$3"

    echo PACKAGE ${PACKAGE} | _util_log_debug
    echo URL ${URL} | _util_log_debug
    echo LICENSE ${LICENSE} | _util_log_debug
    echo BINTRAY_USER ${BINTRAY_USER} | _util_log_debug
    echo BINTRAY_TOKEN ${BINTRAY_TOKEN} | _util_log_debug
    echo BINTRAY_ENDPOINT_PACKAGES ${BINTRAY_ENDPOINT_PACKAGES} | _util_log_debug

    if curl --silent -X POST --user "${BINTRAY_USER}":"${BINTRAY_TOKEN}"  -H "Content-Type: application/json" -d "{\"name\":\"${PACKAGE}\",\"desc\":\"${PACKAGE}\",\"vcs_url\":\"${URL}\",\"licenses\":[\"${LICENSE}\"]}" "${BINTRAY_ENDPOINT_PACKAGES}"/"${PACKAGE}" | jq -r -M '.message' | _util_log; then
      echo "Package created: '${PACKAGE}'" | _util_log
      return 0
    else
      echo "Package could not be created." | _util_log_error
      return 1
    fi
}

# Add Repo
_bintray_repo_add () {
    local REPO="$1"

    echo REPO ${REPO} | _util_log_debug
    echo BINTRAY_USER ${BINTRAY_USER} | _util_log_debug
    echo BINTRAY_TOKEN ${BINTRAY_TOKEN} | _util_log_debug
    echo BINTRAY_ENDPOINT_REPO ${BINTRAY_ENDPOINT_REPO} | _util_log_debug

    echo "Creating repository '${REPO}'" | _util_log
    if curl --silent -X POST --user "${BINTRAY_USER}":"${BINTRAY_TOKEN}"  -H "Content-Type: application/json"  -d "{\"type\":\"generic\",\"private\":false,\"desc\":\"${REPO}\"}" "${BINTRAY_ENDPOINT_REPO}"/"${REPO}" | jq -r -M '.message' | _util_log; then
      return 0
    else
      echo "Repo could not be created." | _util_log_error
      return 1
    fi
}


### CACHE

# Validate Cache Configuration
_ecd_cache_configuration_validate () {
    if [ -z "$CACHE_HOMEPAGE" ]; then echo "CACHE: homepage missing. Aborting." | _util_log_error; return 1; fi
    if [ -z "$CACHE_LICENSE" ]; then echo "CACHE: license missing. Aborting." | _util_log_error; return 1; fi
}

# Validate Cached Homebrew Modules
_ecd_cache_modules_validate () {
    echo "Cached Modules status:" | _util_log

    brew doctor; brew outdated
    fakeroot -v; tar --version; dpkg --version
}

# Initialize Cache Folder
_ecd_cache_folder_initialize () {
    if [ ! -d "${CACHE_PATH_ABSOLUTE}" ]; then
      mkdir -p "${CACHE_PATH_ABSOLUTE}" && chmod -R 777 "${CACHE_PATH_ABSOLUTE}"
    fi
    if [ ! -d "${CACHE_PATH_ABSOLUTE}" ]; then
        echo "Cache folder not found." | _util_log
        return 1
    fi
    echo "Using cache folder: '${CACHE_PATH_ABSOLUTE}'" | _util_log

    return 0
}

# List Cached Modules
ecd_cache_list () {
    _ecd_cache_folder_initialize || return 1

    echo "------------------------" | _util_log
    brew info "${CACHE_MODULES_LIST[@]}" --json=v1 | node -e "(JSON.parse(require('fs').readFileSync('/dev/stdin').toString())).forEach(function(f) { console.log(f.name + ' ' + f.installed[0].version) });" | _util_log
    echo "------------------------" | _util_log
}

# Tar Cached Modules
ecd_cache_pack () {
    _ecd_cache_folder_initialize || return 1

    echo "Packaging modules." | _util_log
    if [ -f "${CACHE_FILEPATH_ABSOLUTE}" ]; then
        rm "${CACHE_FILEPATH_ABSOLUTE}"
        echo "Removed existing cache package: '${CACHE_FILEPATH}'" | _util_log
    fi
    if tar -czvf "${CACHE_FILEPATH_ABSOLUTE}" --directory "${CACHE_MODULES_HOME}" "${CACHE_MODULES_LIST[@]}"; then
      echo "Packaging complete." | _util_log && ecd_cache_list
      return 0
    fi
}

# Unpack & Install Cached Modules
ecd_cache_install () {
    _ecd_cache_folder_initialize || return 1

    tar -zxf "${CACHE_FILEPATH_ABSOLUTE}" --directory "${CACHE_MODULES_HOME}"
    brew link --overwrite "${CACHE_MODULES_LIST[@]}" && echo "Installed modules." | _util_log

    brew uninstall --force dpkg fakeroot gnu-tar pkg-config xz || true
    brew install --force dpkg fakeroot gnu-tar pkg-config xz || true

    _ecd_cache_modules_validate
}

# Uploads Cached Modules
ecd_cache_put () {
    BINTRAY_REPO="${CACHE_FILE_NAME}"

    _ecd_cache_folder_initialize || return 1
    _ecd_cache_configuration_validate || return 1
    _bintray_credentials_validate "${BINTRAY_USER}" "${BINTRAY_TOKEN}" || return 1

    _bintray_repo_add "${BINTRAY_USER}"/"${BINTRAY_REPO}"
    _bintray_package_add "${BINTRAY_USER}"/"${BINTRAY_REPO}" "${CACHE_HOMEPAGE}" "${CACHE_LICENSE}"
    _bintray_version_add "${BINTRAY_USER}"/"${BINTRAY_REPO}" "${CACHE_FILE_NAME}" "${CACHE_VERSION}"
    _bintray_artifact_delete "${BINTRAY_USER}"/"${BINTRAY_REPO}" "${CACHE_FILEPATH_ABSOLUTE}"
    _bintray_artifact_upload "${BINTRAY_USER}"/"${BINTRAY_REPO}" "${CACHE_FILE_NAME}" "${CACHE_VERSION}" "${CACHE_FILEPATH_ABSOLUTE}"
    _bintray_artifact_publish_all "${BINTRAY_USER}"/"${BINTRAY_REPO}" "${CACHE_FILE_NAME}" "${CACHE_VERSION}"

    return 0
}

# Fetch Cached Modules
ecd_cache_get () {
    BINTRAY_REPO="${CACHE_FILE_NAME}"

    _ecd_cache_folder_initialize
    _bintray_artifact_download "${BINTRAY_USER}"/"${BINTRAY_REPO}" "${CACHE_FILE_NAME}.${CACHE_FILE_EXTENSION}" "${CACHE_PATH_ABSOLUTE}"

    return 0
}



### DEPLOY

# Deploy / Upload Build Artifacts
ecd_app_deploy () {
    _application_configuration_validate "${APPLICATION_JSON_PATH_ABSOLUTE}" || return 1
    _bintray_credentials_validate "${BINTRAY_USER}" "${BINTRAY_TOKEN}" || return 1

    local APPLICATION_VERSION="${APPLICATION_VERSION}"
    local APPLICATION_NAME="${APPLICATION_NAME}"
    local APPLICATION_HOMEPAGE="${APPLICATION_HOMEPAGE}"
    local APPLICATION_LICENSE="${APPLICATION_LICENSE}"
    local BINTRAY_REPO="${APPLICATION_NAME}"

    echo "Application: ${APPLICATION_NAME} ($# artifacts)" | _util_log
    echo "Version: ${APPLICATION_VERSION}" | _util_log
    echo "License: ${APPLICATION_LICENSE}" | _util_log
    echo "Homepage: ${APPLICATION_HOMEPAGE}" | _util_log
    echo "Bintray User: ${BINTRAY_USER}" | _util_log
    echo "Bintray Repository: ${BINTRAY_REPO}" | _util_log

    _bintray_repo_add "${BINTRAY_USER}"/"${BINTRAY_REPO}"
    _bintray_package_add "${BINTRAY_USER}"/"${BINTRAY_REPO}" "${APPLICATION_HOMEPAGE}" "${APPLICATION_LICENSE}"
    _bintray_version_add "${BINTRAY_USER}"/"${BINTRAY_REPO}" "${APPLICATION_NAME}" "${APPLICATION_VERSION}"

    IFS=$'\n'
    for f in "$@"; do
        echo "Deploying artifact: '${f}'." | _util_log
        _bintray_artifact_delete "${BINTRAY_USER}"/"${BINTRAY_REPO}" "${f}"
        _bintray_artifact_upload "${BINTRAY_USER}"/"${BINTRAY_REPO}" "${APPLICATION_NAME}" "${APPLICATION_VERSION}" "${f}"
    done
    unset IFS

    _bintray_artifact_publish_all "${BINTRAY_USER}"/"${BINTRAY_REPO}" "${APPLICATION_NAME}" "${APPLICATION_VERSION}"

    return 0
}



## MAIN
_configuration_global_show
