import { access, mkdir } from 'node:fs/promises'
import { constants } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export function getHomeDir(): string {
  return process.env.SSH_AT_HOME_OVERRIDE || process.env.HOME || os.homedir()
}

export function getSshDir(): string {
  return path.join(getHomeDir(), '.ssh')
}

export function getSshConfigPath(): string {
  return path.join(getSshDir(), 'config')
}

export function getSshAtDir(): string {
  return path.join(getHomeDir(), '.ssh-at')
}

export function getCredsDir(): string {
  return path.join(getSshAtDir(), 'creds')
}

export function getBackupDir(): string {
  return path.join(getSshAtDir(), 'backups')
}

export function getSettingsPath(): string {
  return path.join(getSshAtDir(), 'settings.json')
}

export function expandTilde(input: string): string {
  if (input === '~') {
    return getHomeDir()
  }
  if (input.startsWith('~/') || input.startsWith('~\\')) {
    return path.join(getHomeDir(), input.slice(2))
  }
  return input
}

export async function pathExists(target: string): Promise<boolean> {
  try {
    await access(target, constants.F_OK)
    return true
  } catch {
    return false
  }
}

export async function ensureDir(target: string): Promise<void> {
  await mkdir(target, { recursive: true })
}
