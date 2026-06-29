import { rename, readFile, stat, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import net from 'node:net'
import type { HostEntry, SshConfig, ValidationError } from '../../shared/types'
import { createBackup } from './backupService'
import { ensureDir, expandTilde, getSshConfigPath, pathExists } from './paths'

const optionWriters: Array<[keyof HostEntry, string, (value: unknown) => string]> = [
  ['hostname', 'HostName', String],
  ['user', 'User', String],
  ['port', 'Port', String],
  ['identity_file', 'IdentityFile', String],
  ['proxy_jump', 'ProxyJump', String],
  ['proxy_command', 'ProxyCommand', String],
  ['forward_agent', 'ForwardAgent', yesNo],
  ['strict_host_key_checking', 'StrictHostKeyChecking', String],
  ['server_alive_interval', 'ServerAliveInterval', String],
  ['server_alive_count_max', 'ServerAliveCountMax', String],
  ['compression', 'Compression', yesNo],
  ['connection_attempts', 'ConnectionAttempts', String],
  ['connect_timeout', 'ConnectTimeout', String],
  ['local_forward', 'LocalForward', String],
  ['remote_forward', 'RemoteForward', String],
  ['dynamic_forward', 'DynamicForward', String],
  ['pubkey_accepted_key_types', 'PubkeyAcceptedKeyTypes', String],
  ['host_key_algorithms', 'HostKeyAlgorithms', String],
]

export async function loadSshConfig(): Promise<SshConfig> {
  const configPath = getSshConfigPath()

  if (!(await pathExists(configPath))) {
    return emptyConfig()
  }

  const content = await readFile(configPath, 'utf8')
  return parseSshConfig(content)
}

export async function saveSshConfig(config: SshConfig): Promise<void> {
  const configPath = getSshConfigPath()

  if (await pathExists(configPath)) {
    const currentContent = await readFile(configPath, 'utf8')
    await createBackup(currentContent)
  }

  await writeConfigFile(config)
}

export async function addHost(entry: HostEntry): Promise<void> {
  await validateEntry(entry)
  const config = await loadSshConfig()
  config.hosts.push(normalizeHost(entry))
  await saveSshConfig(config)
}

export async function updateHost(name: string, entry: HostEntry): Promise<void> {
  await validateEntry(entry)
  const config = await loadSshConfig()
  const index = config.hosts.findIndex((host) => host.host === name)

  if (index === -1) {
    throw new Error(`Host '${name}' not found`)
  }

  config.hosts[index] = normalizeHost(entry)
  await saveSshConfig(config)
}

export async function deleteHost(name: string): Promise<void> {
  const config = await loadSshConfig()
  config.hosts = config.hosts.filter((host) => host.host !== name)
  await saveSshConfig(config)
}

export async function searchHosts(query: string): Promise<HostEntry[]> {
  const config = await loadSshConfig()
  const lower = query.toLowerCase()

  return config.hosts.filter((host) => {
    return (
      host.host.toLowerCase().includes(lower) ||
      Boolean(host.hostname?.toLowerCase().includes(lower)) ||
      Boolean(host.user?.toLowerCase().includes(lower))
    )
  })
}

export async function parseSshConfig(content: string): Promise<SshConfig> {
  const visitedFiles = new Set<string>()
  const configsToMerge: SshConfig[] = []
  const filesToProcess: Array<{ content: string; depth: number }> = [{ content, depth: 0 }]

  while (filesToProcess.length > 0) {
    const current = filesToProcess.pop()
    if (!current) {
      continue
    }

    if (current.depth > 10) {
      throw new Error('Include depth limit exceeded (max 10)')
    }

    const config = emptyConfig()
    let currentHost: HostEntry | undefined
    const includesToProcess: string[] = []

    for (const rawLine of current.content.split(/\r?\n/)) {
      const trimmed = rawLine.trim()

      if (!trimmed || trimmed.startsWith('#')) {
        continue
      }

      const parts = trimmed.split(/\s+/)
      const key = parts[0]
      if (!key || parts.length < 2) {
        continue
      }

      const value = parts.slice(1).join(' ')

      if (key.toLowerCase() === 'host') {
        if (currentHost) {
          config.hosts.push(currentHost)
        }
        currentHost = newHost(value)
        continue
      }

      if (key.toLowerCase() === 'include') {
        includesToProcess.push(expandTilde(value))
        continue
      }

      if (currentHost) {
        applyOptionToHost(currentHost, key, value)
      } else {
        config.global_options[key] = value
      }
    }

    if (currentHost) {
      config.hosts.push(currentHost)
    }

    configsToMerge.push(config)

    for (const includePath of includesToProcess) {
      if (visitedFiles.has(includePath) || !(await pathExists(includePath))) {
        continue
      }

      visitedFiles.add(includePath)

      try {
        const includeContent = await readFile(includePath, 'utf8')
        filesToProcess.push({ content: includeContent, depth: current.depth + 1 })
      } catch {
        // Match the Rust implementation: unreadable Include files are ignored.
      }
    }
  }

  return configsToMerge.reduce<SshConfig>((acc, config) => {
    acc.hosts.push(...config.hosts)
    Object.assign(acc.global_options, config.global_options)
    return acc
  }, emptyConfig())
}

export function serializeSshConfig(config: SshConfig): string {
  const lines: string[] = []

  for (const [key, value] of Object.entries(config.global_options || {})) {
    lines.push(`${key} ${value}`)
  }

  if (lines.length > 0 && config.hosts.length > 0) {
    lines.push('')
  }

  for (const host of config.hosts) {
    lines.push(`Host ${host.host}`)

    for (const [field, sshKey, formatter] of optionWriters) {
      const value = host[field]
      if (value !== undefined && value !== null && value !== '') {
        lines.push(`  ${sshKey} ${formatter(value)}`)
      }
    }

    for (const [key, value] of Object.entries(host.extra_options || {})) {
      if (value !== '') {
        lines.push(`  ${key} ${value}`)
      }
    }

    lines.push('')
  }

  return lines.join('\n')
}

export async function validateEntry(entry: HostEntry): Promise<void> {
  if (!entry.host.trim()) {
    throwValidation({ code: 'HostRequired' })
  }

  if (entry.hostname === undefined) {
    throwValidation({ code: 'HostNameRequired' })
  }
  validateHostname(entry.hostname ?? '')

  if (!entry.user?.trim()) {
    throwValidation({ code: 'UserRequired' })
  }

  if (entry.port !== undefined && entry.port <= 0) {
    throwValidation({ code: 'PortInvalid' })
  }

  await validateIdentityFile(entry.identity_file)
}

function emptyConfig(): SshConfig {
  return {
    hosts: [],
    global_options: {},
  }
}

function newHost(host: string): HostEntry {
  return {
    host,
    extra_options: {},
  }
}

function normalizeHost(entry: HostEntry): HostEntry {
  return {
    ...entry,
    extra_options: entry.extra_options || {},
  }
}

function applyOptionToHost(host: HostEntry, key: string, value: string): void {
  switch (key.toLowerCase()) {
    case 'hostname':
      host.hostname = value
      break
    case 'user':
      host.user = value
      break
    case 'port':
      host.port = parseInteger(value)
      break
    case 'identityfile':
      host.identity_file = value
      break
    case 'proxyjump':
      host.proxy_jump = value
      break
    case 'proxycommand':
      host.proxy_command = value
      break
    case 'forwardagent':
      host.forward_agent = parseYesNo(value)
      break
    case 'stricthostkeychecking':
      host.strict_host_key_checking = value
      break
    case 'serveraliveinterval':
      host.server_alive_interval = parseInteger(value)
      break
    case 'serveralivecountmax':
      host.server_alive_count_max = parseInteger(value)
      break
    case 'compression':
      host.compression = parseYesNo(value)
      break
    case 'connectionattempts':
      host.connection_attempts = parseInteger(value)
      break
    case 'connecttimeout':
      host.connect_timeout = parseInteger(value)
      break
    case 'localforward':
      host.local_forward = value
      break
    case 'remoteforward':
      host.remote_forward = value
      break
    case 'dynamicforward':
      host.dynamic_forward = value
      break
    case 'pubkeyacceptedkeytypes':
      host.pubkey_accepted_key_types = value
      break
    case 'hostkeyalgorithms':
      host.host_key_algorithms = value
      break
    default:
      host.extra_options = host.extra_options || {}
      host.extra_options[key] = value
  }
}

function parseInteger(value: string): number | undefined {
  const parsed = Number.parseInt(value, 10)
  return Number.isNaN(parsed) ? undefined : parsed
}

function parseYesNo(value: string): boolean | undefined {
  switch (value.toLowerCase()) {
    case 'yes':
    case 'true':
      return true
    case 'no':
    case 'false':
      return false
    default:
      return undefined
  }
}

function yesNo(value: unknown): string {
  return value ? 'yes' : 'no'
}

function validateHostname(hostname: string): void {
  const trimmed = hostname.trim()

  if (!trimmed) {
    throwValidation({ code: 'HostNameEmpty' })
  }

  const ipVersion = net.isIP(trimmed)
  if (ipVersion > 0) {
    if (trimmed === '0.0.0.0' || trimmed === '::') {
      throwValidation({ code: 'HostNameInvalidIp', params: { value: trimmed } })
    }
    return
  }

  if (!trimmed.includes('.')) {
    throwValidation({ code: 'HostNameInvalidDomain', params: { value: trimmed } })
  }

  if (trimmed.length > 253) {
    throwValidation({ code: 'HostNameTooLong', params: { length: trimmed.length } })
  }

  for (const label of trimmed.split('.')) {
    if (!label) {
      throwValidation({ code: 'HostNameConsecutiveDots' })
    }
    if (label.length > 63) {
      throwValidation({ code: 'HostNameLabelTooLong', params: { label } })
    }
    if (label.startsWith('-') || label.endsWith('-')) {
      throwValidation({ code: 'HostNameLabelInvalidHyphen', params: { label } })
    }

    for (const ch of label) {
      if (!/[a-zA-Z0-9-]/.test(ch)) {
        throwValidation({ code: 'HostNameInvalidChar', params: { ch, label } })
      }
    }
  }
}

async function validateIdentityFile(identityFile: string | undefined): Promise<void> {
  if (identityFile === undefined) {
    throwValidation({ code: 'IdentityFileRequired' })
  }

  const trimmed = identityFile?.trim() ?? ''
  if (!trimmed) {
    throwValidation({ code: 'IdentityFileEmpty' })
  }

  const expandedPath = expandTilde(trimmed)
  try {
    const metadata = await stat(expandedPath)
    if (!metadata.isFile()) {
      throwValidation({ code: 'IdentityFileNotExist', params: { path: trimmed } })
    }
  } catch {
    throwValidation({ code: 'IdentityFileNotExist', params: { path: trimmed } })
  }
}

async function writeConfigFile(config: SshConfig): Promise<void> {
  const configPath = getSshConfigPath()
  await ensureDir(dirname(configPath))

  const tempPath = `${configPath}.tmp`
  await writeFile(tempPath, serializeSshConfig(config), 'utf8')
  await rename(tempPath, configPath)
}

function throwValidation(error: ValidationError): never {
  throw new Error(JSON.stringify(error))
}
