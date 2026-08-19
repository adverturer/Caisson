; Caisson NSIS installer customization.
;
; Adds the bundled dsh runtime bin directory to the *current user* PATH so
; end users can run `dsh plugin --profile web add <name>` (and other dsh CLI
; commands) from any terminal without having to locate the bundled shim
; manually. The directory added is:
;
;   <installDir>\resources\runtime\node_modules\.bin
;
; Uses only NSIS built-in commands (ReadRegStr / WriteRegStr / SendMessage).
; No third-party plugin (EnVar etc.) required.

!macro customInstall
  ReadRegStr $R0 HKCU "Environment" "PATH"
  StrCpy $R1 "$INSTDIR\resources\runtime\node_modules\.bin"
  StrCmp $R0 "" 0 path_nonempty
    StrCpy $R0 "$R1"
    Goto write_path
  path_nonempty:
    StrCmp $R0 $R1 skip_write
    StrCpy $R0 "$R0;$R1"
  write_path:
    WriteRegStr HKCU "Environment" "PATH" "$R0"
  skip_write:
  ; Broadcast WM_SETTINGCHANGE to HWND_BROADCAST so open shells pick it up.
  SendMessage 0xFFFF 0x001A 0 "STR:Environment" /TIMEOUT=5000
!macroend

!macro customUnInstall
  ; Stale PATH entry after uninstall is harmless (directory no longer exists).
  ; Windows ignores missing PATH directories silently.
!macroend
