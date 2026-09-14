Unicode true

# Octop desktop NSIS installer.
# Built by `wails3 task package` on a Windows runner:
#   makensis -DARG_WAILS_AMD64_BINARY=..\..\..\bin\Octop.exe project.nsi
#   makensis -DARG_WAILS_ARM64_BINARY=..\..\..\bin\Octop.exe project.nsi

!include "wails_tools.nsh"

SetCompressor /SOLID lzma

# The version information for this two must consist of 4 parts
VIProductVersion "${INFO_PRODUCTVERSION}.0"
VIFileVersion    "${INFO_PRODUCTVERSION}.0"

VIAddVersionKey "CompanyName"     "${INFO_COMPANYNAME}"
VIAddVersionKey "FileDescription" "${INFO_PRODUCTNAME} Installer"
VIAddVersionKey "ProductVersion"  "${INFO_PRODUCTVERSION}"
VIAddVersionKey "FileVersion"     "${INFO_PRODUCTVERSION}"
VIAddVersionKey "LegalCopyright"  "${INFO_COPYRIGHT}"
VIAddVersionKey "ProductName"     "${INFO_PRODUCTNAME}"

ManifestDPIAware true

!include "MUI.nsh"

!define MUI_ICON "..\icon.ico"
!define MUI_UNICON "..\icon.ico"
!define MUI_FINISHPAGE_NOAUTOCLOSE
!define MUI_ABORTWARNING
!define MUI_FINISHPAGE_RUN "$INSTDIR\${PRODUCT_EXECUTABLE}"

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_INSTFILES

!insertmacro MUI_LANGUAGE "SimpChinese"
!insertmacro MUI_LANGUAGE "English"
!insertmacro MUI_RESERVEFILE_LANGDLL

Name "${INFO_PRODUCTNAME}"
!ifndef INSTALLER_OUTFILE
    !define INSTALLER_OUTFILE "..\..\..\bin\${INFO_PROJECTNAME}-desktop-windows-${ARCH}-${INFO_PRODUCTVERSION}.exe"
!endif
OutFile "${INSTALLER_OUTFILE}"
!if "${WAILS_INSTALL_SCOPE}" == "user"
    InstallDir "$LOCALAPPDATA\Programs\${INFO_PRODUCTNAME}"
!else
    InstallDir "$PROGRAMFILES64\${INFO_PRODUCTNAME}"
!endif
ShowInstDetails show

Function .onInit
    IfSilent skipLang
    !insertmacro MUI_LANGDLL_DISPLAY
    skipLang:
    !insertmacro wails.checkArchitecture
FunctionEnd

Section
    !insertmacro wails.setShellContext

    !insertmacro wails.webview2runtime

    SetOutPath $INSTDIR

    !insertmacro wails.files

    CreateShortcut "$SMPROGRAMS\${INFO_PRODUCTNAME}.lnk" "$INSTDIR\${PRODUCT_EXECUTABLE}"
    CreateShortcut "$DESKTOP\${INFO_PRODUCTNAME}.lnk" "$INSTDIR\${PRODUCT_EXECUTABLE}"

    !insertmacro wails.associateFiles
    !insertmacro wails.associateCustomProtocols

    !insertmacro wails.writeUninstaller
SectionEnd

Section "uninstall"
    !insertmacro wails.setShellContext

    # Ask whether to also delete local user data (database, chats, agents, …).
    # Default is NO — keep the data at $INSTDIR\user-data.
    MessageBox MB_YESNO|MB_ICONQUESTION|MB_DEFBUTTON2 \
        "Do you also want to delete local data (database, chats, agents, etc.)?$\r$\n$\r$\n    Yes — delete them alongside the application.    $\r$\n    No (recommended) — keep them for a future install." \
        IDYES deleteAll IDNO keepData

    keepData:
        # Remove the application but preserve $INSTDIR\user-data.
        RMDir /r "$INSTDIR\asserts"
        RMDir /r "$INSTDIR\build"
        RMDir /r "$INSTDIR\runtime"
        RMDir /r "$INSTDIR\packages"
        # Remove remaining top-level files but keep unknown dirs (e.g. user-data).
        Delete "$INSTDIR\*.exe"
        Delete "$INSTDIR\*.json"
        Delete "$INSTDIR\*.py"
        Delete "$INSTDIR\*.txt"
        RMDir "$INSTDIR"
        Goto finish

    deleteAll:
        # Full removal including $INSTDIR\user-data and any legacy ~/.octop remnants.
        RMDir /r $INSTDIR
        IfFileExists "$USERPROFILE\.octop" 0 finish
        RMDir /r "$USERPROFILE\.octop"

    finish:
        Delete "$SMPROGRAMS\${INFO_PRODUCTNAME}.lnk"
        Delete "$DESKTOP\${INFO_PRODUCTNAME}.lnk"

        !insertmacro wails.unassociateFiles
        !insertmacro wails.unassociateCustomProtocols

        !insertmacro wails.deleteUninstaller
SectionEnd
