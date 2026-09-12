; Nova Downloader — NSIS customisations for electron-builder.
;
; Two jobs:
;   1. default the install folder to D:\ instead of C:\Program Files
;   2. register the packed extension with Chrome and Edge
;
; electron-builder defines PROJECT_DIR, BUILD_RESOURCES_DIR, PRODUCT_FILENAME and
; INSTALL_REGISTRY_KEY before including this file.

; Written by tools/pack-crx.js (npm run pack:crx): NOVA_EXT_ID, NOVA_EXT_VERSION.
; Guarded, so `electron-builder` alone still produces a working installer — just
; one that skips the browser registration instead of failing to compile.
!if /FileExists "${BUILD_RESOURCES_DIR}\dist\crx-id.nsh"
  !include "${BUILD_RESOURCES_DIR}\dist\crx-id.nsh"
!endif

!define NOVA_UPDATES_URL "http://127.0.0.1:8765/ext/updates.xml"
!define NOVA_CRX "$INSTDIR\resources\ext\nova-downloader.crx"

; ---------------------------------------------------------------------------
; Default install folder
; ---------------------------------------------------------------------------
; preInit runs inside .onInit, before the directory page reads InstallLocation,
; which is the only point where the default is still changeable. Both hives and
; both registry views, because which one is consulted depends on elevation and on
; whether a previous per-user install left a value behind.
!macro preInit
  StrCpy $0 "D:\${PRODUCT_FILENAME}"
  ; No D: drive on this machine (or it's an empty card reader) — a default that
  ; can't be written to would be worse than the usual location.
  IfFileExists "D:\*.*" +2 0
  StrCpy $0 "$PROGRAMFILES64\${PRODUCT_FILENAME}"

  SetRegView 64
  WriteRegExpandStr HKLM "${INSTALL_REGISTRY_KEY}" "InstallLocation" "$0"
  WriteRegExpandStr HKCU "${INSTALL_REGISTRY_KEY}" "InstallLocation" "$0"
  SetRegView 32
  WriteRegExpandStr HKLM "${INSTALL_REGISTRY_KEY}" "InstallLocation" "$0"
  WriteRegExpandStr HKCU "${INSTALL_REGISTRY_KEY}" "InstallLocation" "$0"
  SetRegView lastused
!macroend

; ---------------------------------------------------------------------------
; Browser registration
; ---------------------------------------------------------------------------
; Two mechanisms, because neither one covers every machine:
;
;   ExtensionInstallForcelist — installs silently and can't be switched off, and
;   points at the app's own loopback server so no internet is involved. But for a
;   package that isn't on the Web Store, Chrome only honours it when the machine
;   is managed (AD domain, Entra, or Chrome Browser Cloud Management), and recent
;   Chrome restricts off-store force-installs further still.
;
;   Extensions\<id> with a local path — the ordinary Windows external install.
;   Works on an unmanaged machine, but Chrome brings the extension in disabled
;   and asks the user to turn it on; it will not enable an off-store extension
;   by itself.
;
; Whichever one the machine allows, the extension ends up in the browser without
; the user hunting for a folder. The version below has to match the packed CRX
; or Chrome ignores the entry.
!macro novaRegisterBrowsers
  WriteRegStr HKLM "SOFTWARE\Policies\Google\Chrome\ExtensionInstallForcelist" "1000" "${NOVA_EXT_ID};${NOVA_UPDATES_URL}"
  WriteRegStr HKLM "SOFTWARE\Policies\Microsoft\Edge\ExtensionInstallForcelist" "1000" "${NOVA_EXT_ID};${NOVA_UPDATES_URL}"
  WriteRegStr HKLM "SOFTWARE\Google\Chrome\Extensions\${NOVA_EXT_ID}" "path" "${NOVA_CRX}"
  WriteRegStr HKLM "SOFTWARE\Google\Chrome\Extensions\${NOVA_EXT_ID}" "version" "${NOVA_EXT_VERSION}"
  WriteRegStr HKLM "SOFTWARE\Microsoft\Edge\Extensions\${NOVA_EXT_ID}" "path" "${NOVA_CRX}"
  WriteRegStr HKLM "SOFTWARE\Microsoft\Edge\Extensions\${NOVA_EXT_ID}" "version" "${NOVA_EXT_VERSION}"

  WriteRegStr HKCU "Software\Google\Chrome\Extensions\${NOVA_EXT_ID}" "path" "${NOVA_CRX}"
  WriteRegStr HKCU "Software\Google\Chrome\Extensions\${NOVA_EXT_ID}" "version" "${NOVA_EXT_VERSION}"
  WriteRegStr HKCU "Software\Microsoft\Edge\Extensions\${NOVA_EXT_ID}" "path" "${NOVA_CRX}"
  WriteRegStr HKCU "Software\Microsoft\Edge\Extensions\${NOVA_EXT_ID}" "version" "${NOVA_EXT_VERSION}"
!macroend

!macro novaUnregisterBrowsers
  DeleteRegValue HKLM "SOFTWARE\Policies\Google\Chrome\ExtensionInstallForcelist" "1000"
  DeleteRegValue HKLM "SOFTWARE\Policies\Microsoft\Edge\ExtensionInstallForcelist" "1000"
  DeleteRegKey HKLM "SOFTWARE\Google\Chrome\Extensions\${NOVA_EXT_ID}"
  DeleteRegKey HKLM "SOFTWARE\Microsoft\Edge\Extensions\${NOVA_EXT_ID}"

  DeleteRegKey HKCU "Software\Google\Chrome\Extensions\${NOVA_EXT_ID}"
  DeleteRegKey HKCU "Software\Microsoft\Edge\Extensions\${NOVA_EXT_ID}"
!macroend

!macro customInstall
  !ifdef NOVA_EXT_ID
    ; A 64-bit browser reads the 64-bit view; a 32-bit one reads Wow6432Node. The
    ; installer is 32-bit, so writing only the default view would miss 64-bit
    ; Chrome entirely.
    SetRegView 64
    !insertmacro novaRegisterBrowsers
    SetRegView 32
    !insertmacro novaRegisterBrowsers
    SetRegView lastused

    ; The app reads this back to tell the user whether the browser hookup was
    ; registered, and against which id.
    WriteRegStr SHCTX "${INSTALL_REGISTRY_KEY}" "ExtensionId" "${NOVA_EXT_ID}"
  !endif
!macroend

!macro customUnInstall
  !ifdef NOVA_EXT_ID
    SetRegView 64
    !insertmacro novaUnregisterBrowsers
    SetRegView 32
    !insertmacro novaUnregisterBrowsers
    SetRegView lastused
  !endif
!macroend
