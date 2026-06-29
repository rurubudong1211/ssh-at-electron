import type {
  AppSettings,
  BackupInfo,
  ConfirmDialogOptions,
  HostEntry,
  KeyInfo,
  SshConfig,
} from '../../shared/types'
import type { IpcChannel } from '../../shared/ipc'

export type { AppSettings, BackupInfo, HostEntry, KeyInfo, SshConfig }

function invoke<T>(channel: IpcChannel, args?: unknown): Promise<T> {
  if (!window.sshAt) {
    return Promise.reject(new Error('Electron preload API is not available'))
  }
  return window.sshAt.invoke<T>(channel, args)
}

// Config operations
export const loadSshConfig = (): Promise<SshConfig> =>
  invoke('load_ssh_config')

export const saveSshConfig = (config: SshConfig): Promise<void> =>
  invoke('save_ssh_config', { config })

export const serializeSshConfig = (config: SshConfig): Promise<string> =>
  invoke('serialize_ssh_config', { config })

export const parseSshConfig = (content: string): Promise<SshConfig> =>
  invoke('parse_ssh_config', { content })

export const addHost = (entry: HostEntry): Promise<void> =>
  invoke('add_host', { entry })

export const updateHost = (name: string, entry: HostEntry): Promise<void> =>
  invoke('update_host', { name, entry })

export const deleteHost = (name: string): Promise<void> =>
  invoke('delete_host', { name })

export const searchHosts = (query: string): Promise<HostEntry[]> =>
  invoke('search_hosts', { query })

// Key operations
export const scanSshKeys = (): Promise<KeyInfo[]> =>
  invoke('scan_ssh_keys')

export const getKeyFingerprint = (path: string): Promise<string> =>
  invoke('get_key_fingerprint', { path })

export const generateSshKey = (
  keyType: string,
  name: string,
  comment?: string,
  passphrase?: string,
  bits?: number
): Promise<void> =>
  invoke('generate_ssh_key', { keyType, name, comment, passphrase, bits })

export const deleteSshKey = (path: string): Promise<void> =>
  invoke('delete_ssh_key', { path })

export const readPublicKey = (privateKeyPath: string): Promise<string> =>
  invoke('read_public_key', { privateKeyPath })

// Backup operations
export const listBackups = (): Promise<BackupInfo[]> =>
  invoke('list_backups')

export const restoreBackup = (backupId: number): Promise<void> =>
  invoke('restore_backup', { backupId })

export const deleteBackup = (backupId: number): Promise<void> =>
  invoke('delete_backup', { backupId })

// System operations
export const openConfigDir = (): Promise<void> =>
  invoke('open_config_dir')

export const askConfirm = (options: ConfirmDialogOptions): Promise<boolean> =>
  invoke('dialog_confirm', options)

export const writeClipboardText = (text: string): Promise<void> =>
  invoke('clipboard_write_text', { text })

// Settings operations
export const loadSettings = (): Promise<AppSettings> =>
  invoke('load_settings')

export const saveSettings = (settings: AppSettings): Promise<void> =>
  invoke('save_settings', { settings })
