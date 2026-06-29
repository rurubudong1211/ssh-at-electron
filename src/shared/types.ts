export interface HostEntry {
  host: string
  hostname?: string
  user?: string
  port?: number
  identity_file?: string
  proxy_jump?: string
  proxy_command?: string
  forward_agent?: boolean
  strict_host_key_checking?: string
  server_alive_interval?: number
  server_alive_count_max?: number
  compression?: boolean
  connection_attempts?: number
  connect_timeout?: number
  local_forward?: string
  remote_forward?: string
  dynamic_forward?: string
  pubkey_accepted_key_types?: string
  host_key_algorithms?: string
  extra_options?: Record<string, string>
}

export interface SshConfig {
  hosts: HostEntry[]
  global_options: Record<string, string>
}

export type KeyType = 'RSA' | 'Ed25519' | 'ECDSA' | 'DSA' | 'Unknown'

export interface KeyInfo {
  path: string
  key_type: KeyType
  fingerprint?: string
  comment?: string
  size?: number
  created?: string
  is_encrypted: boolean
}

export interface BackupInfo {
  id: number
  timestamp: string
  file_path: string
  config_hash: string
  host_count: number
  size_bytes: number
}

export interface AppSettings {
  auto_backup: boolean
  backup_limit: number
  confirm_delete: boolean
}

export type ValidationError =
  | { code: 'HostRequired' }
  | { code: 'HostNameRequired' }
  | { code: 'HostNameEmpty' }
  | { code: 'HostNameInvalidDomain'; params: { value: string } }
  | { code: 'HostNameTooLong'; params: { length: number } }
  | { code: 'HostNameInvalidIp'; params: { value: string } }
  | { code: 'HostNameConsecutiveDots' }
  | { code: 'HostNameLabelTooLong'; params: { label: string } }
  | { code: 'HostNameLabelInvalidHyphen'; params: { label: string } }
  | { code: 'HostNameInvalidChar'; params: { ch: string; label: string } }
  | { code: 'PortInvalid' }
  | { code: 'UserRequired' }
  | { code: 'IdentityFileRequired' }
  | { code: 'IdentityFileEmpty' }
  | { code: 'IdentityFileExpandFailed' }
  | { code: 'IdentityFileNotExist'; params: { path: string } }

export type IpcResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string }

export interface ConfirmDialogOptions {
  title?: string
  message: string
  kind?: 'info' | 'warning' | 'error'
}
