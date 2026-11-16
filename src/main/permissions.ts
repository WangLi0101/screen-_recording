import { shell, systemPreferences } from 'electron'
import type { PermissionSnapshot, PermissionStatus } from '../shared/types'

function mapStatus(value: string): PermissionStatus {
  if (value === 'granted' || value === 'denied' || value === 'restricted' || value === 'not-determined') {
    if (value === 'granted') return 'granted'
    if (value === 'denied' || value === 'restricted') return 'denied'
    return 'unknown'
  }
  return 'unknown'
}

export function getPermissions(): PermissionSnapshot {
  if (process.platform === 'darwin') {
    return {
      screen: mapStatus(systemPreferences.getMediaAccessStatus('screen')),
      microphone: mapStatus(systemPreferences.getMediaAccessStatus('microphone')),
      // macOS 14.2+ gates system audio behind a separate TCC prompt that has no public status API.
      systemAudio: 'unknown',
      accessibility: systemPreferences.isTrustedAccessibilityClient(false) ? 'granted' : 'denied'
    }
  }
  if (process.platform === 'win32') {
    return {
      screen: 'not-applicable',
      // Windows exposes no status API; the recorder validates with a live level check.
      microphone: 'unknown',
      systemAudio: 'not-applicable',
      accessibility: 'not-applicable'
    }
  }
  return {
    screen: 'unknown',
    microphone: 'unknown',
    systemAudio: 'unknown',
    accessibility: 'not-applicable'
  }
}

export async function openSystemSettings(kind: 'screen' | 'microphone' | 'systemAudio' | 'accessibility'): Promise<void> {
  if (process.platform === 'darwin') {
    const map: Record<string, string> = {
      screen: 'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture',
      microphone: 'x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone',
      systemAudio: 'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture',
      accessibility: 'x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility'
    }
    await shell.openExternal(map[kind])
    return
  }
  if (process.platform === 'win32') {
    const uri =
      kind === 'microphone' ? 'ms-settings:privacy-microphone' : 'ms-settings:privacy'
    await shell.openExternal(uri)
  }
}