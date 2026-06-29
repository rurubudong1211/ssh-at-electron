import { execFile } from 'node:child_process'
import { constants } from 'node:fs'
import { access, readdir, readFile, rm, stat } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import type { KeyInfo, KeyType } from '../../shared/types'
import { loadSshConfig } from './configService'
import { ensureDir, expandTilde, getCredsDir, getSshDir, pathExists } from './paths'
import { formatDisplayDate } from './time'

const execFileAsync = promisify(execFile)

export async function scanSshKeys(): Promise<KeyInfo[]> {
  const paths = new Set<string>()

  for (const dir of [getSshDir(), getCredsDir()]) {
    await collectKeyFilesFromDir(dir, paths)
  }

  try {
    const config = await loadSshConfig()
    for (const host of config.hosts) {
      if (host.identity_file) {
        const expanded = expandTilde(host.identity_file)
        if (await pathExists(expanded)) {
          paths.add(expanded)
        }
      }
    }
  } catch {
    // Config parsing should not prevent key management from opening.
  }

  const keys: KeyInfo[] = []
  for (const keyPath of paths) {
    try {
      keys.push(await scanKeyFile(keyPath))
    } catch {
      // Ignore non-key files in SSH directories.
    }
  }

  keys.sort((a, b) => a.path.localeCompare(b.path))
  return keys
}

export async function getKeyFingerprint(keyPath: string): Promise<string> {
  const { stdout, stderr } = await execFileAsync('ssh-keygen', ['-lf', keyPath, '-E', 'sha256'], {
    windowsHide: true,
  })

  if (stderr) {
    // ssh-keygen often writes nothing to stderr on success; keep stderr checks non-fatal.
  }

  const parts = stdout.trim().split(/\s+/)
  if (parts.length >= 2) {
    return parts[1]
  }

  throw new Error('Failed to parse fingerprint from ssh-keygen output')
}

export async function generateSshKey(
  keyType: string,
  name: string,
  comment?: string,
  passphrase?: string,
  bits?: number,
): Promise<void> {
  const normalizedName = name.trim()

  if (!normalizedName) {
    throw new Error('Key name cannot be empty')
  }
  if (normalizedName.includes('/') || normalizedName.includes('\\') || normalizedName.includes('..')) {
    throw new Error('Key name cannot contain path separators or ..')
  }

  const typeArg = keyTypeToSshKeygenArg(keyType)
  const credsDir = getCredsDir()
  await ensureDir(credsDir)

  const privateKeyPath = path.join(credsDir, normalizedName)
  if (await pathExists(privateKeyPath)) {
    throw new Error(`Key already exists: ${privateKeyPath}`)
  }

  const args = ['-t', typeArg, '-f', privateKeyPath, '-N', passphrase || '']
  if (bits) {
    args.push('-b', bits.toString())
  }
  if (comment) {
    args.push('-C', comment)
  }

  try {
    await execFileAsync('ssh-keygen', args, { windowsHide: true })
  } catch (error) {
    throw new Error(`ssh-keygen failed: ${formatExecError(error)}`)
  }
}

export async function deleteSshKey(privateKeyPath: string): Promise<void> {
  const metadata = await stat(privateKeyPath).catch(() => undefined)
  if (!metadata) {
    throw new Error(`Private key not found: ${privateKeyPath}`)
  }
  if (!metadata.isFile()) {
    throw new Error(`Path is not a file: ${privateKeyPath}`)
  }

  await rm(privateKeyPath)

  const publicKeyPath = `${privateKeyPath}.pub`
  if (await pathExists(publicKeyPath)) {
    await rm(publicKeyPath)
  }
}

export async function readPublicKey(privateKeyPath: string): Promise<string> {
  const publicKeyPath = `${privateKeyPath}.pub`
  if (!(await pathExists(publicKeyPath))) {
    throw new Error(`Public key not found: ${publicKeyPath}`)
  }

  return readFile(publicKeyPath, 'utf8')
}

async function collectKeyFilesFromDir(dir: string, paths: Set<string>): Promise<void> {
  if (!(await pathExists(dir))) {
    return
  }

  const entries = await readdir(dir, { withFileTypes: true }).catch(() => [])

  for (const entry of entries) {
    if (!entry.isFile() || path.extname(entry.name) === '.pub') {
      continue
    }
    paths.add(path.join(dir, entry.name))
  }
}

async function scanKeyFile(keyPath: string): Promise<KeyInfo> {
  const content = await readFile(keyPath, 'utf8')
  if (!isPrivateKey(content)) {
    throw new Error('Not a valid private key file')
  }

  const metadata = await stat(keyPath)
  const fingerprint = await getKeyFingerprint(keyPath).catch(() => undefined)

  return {
    path: keyPath,
    key_type: detectKeyType(content),
    fingerprint,
    comment: undefined,
    size: undefined,
    created: formatDisplayDate(metadata.mtime),
    is_encrypted: content.includes('ENCRYPTED'),
  }
}

function isPrivateKey(content: string): boolean {
  return content.includes('BEGIN') && content.includes('PRIVATE KEY')
}

function detectKeyType(content: string): KeyType {
  if (content.includes('RSA PRIVATE KEY')) {
    return 'RSA'
  }
  if (content.includes('OPENSSH PRIVATE KEY')) {
    return 'Ed25519'
  }
  if (content.includes('EC PRIVATE KEY')) {
    return 'ECDSA'
  }
  if (content.includes('DSA PRIVATE KEY')) {
    return 'DSA'
  }
  return 'Unknown'
}

function keyTypeToSshKeygenArg(keyType: string): string {
  switch (keyType) {
    case 'RSA':
      return 'rsa'
    case 'Ed25519':
      return 'ed25519'
    case 'ECDSA':
      return 'ecdsa'
    case 'DSA':
      return 'dsa'
    default:
      throw new Error('Cannot generate key of unknown type')
  }
}

function formatExecError(error: unknown): string {
  if (error && typeof error === 'object') {
    const maybeError = error as { stderr?: string; message?: string }
    return maybeError.stderr?.trim() || maybeError.message || String(error)
  }
  return String(error)
}

export async function canExecuteSshKeygen(): Promise<boolean> {
  try {
    await access('ssh-keygen', constants.X_OK)
    return true
  } catch {
    try {
      await execFileAsync('ssh-keygen', ['-V'], { windowsHide: true })
    } catch (error) {
      return Boolean(formatExecError(error).includes('option requires an argument'))
    }
    return true
  }
}
