import { createHash } from 'node:crypto'
import { readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { BackupInfo } from '../../shared/types'
import { loadSettings } from './settingsService'
import { ensureDir, getBackupDir, getSshConfigPath, pathExists } from './paths'
import { formatTimestamp } from './time'

export async function createBackup(configContent: string): Promise<BackupInfo> {
  const settings = await loadSettings()

  if (!settings.auto_backup) {
    return {
      id: 0,
      timestamp: '',
      file_path: '',
      config_hash: '',
      host_count: 0,
      size_bytes: 0,
    }
  }

  return createBackupWithLimit(configContent, settings.backup_limit)
}

export async function createBackupWithLimit(configContent: string, limit: number): Promise<BackupInfo> {
  const backupDir = getBackupDir()
  await ensureDir(backupDir)

  const timestamp = formatTimestamp()
  const backupPath = path.join(backupDir, `${timestamp}.config`)
  await writeFile(backupPath, configContent, 'utf8')

  const metadata = await stat(backupPath)
  const backupInfo = buildBackupInfo(backupPath, timestamp, configContent, metadata.size, metadata.mtime)
  await cleanupOldBackups(limit)

  return backupInfo
}

export async function listBackups(): Promise<BackupInfo[]> {
  const backupDir = getBackupDir()
  if (!(await pathExists(backupDir))) {
    return []
  }

  const entries = await readdir(backupDir, { withFileTypes: true })
  const backups: BackupInfo[] = []

  for (const entry of entries) {
    if (!entry.isFile() || path.extname(entry.name) !== '.config') {
      continue
    }

    const filePath = path.join(backupDir, entry.name)
    try {
      const [content, metadata] = await Promise.all([
        readFile(filePath, 'utf8'),
        stat(filePath),
      ])
      backups.push(buildBackupInfo(filePath, path.basename(entry.name, '.config'), content, metadata.size, metadata.mtime))
    } catch {
      // Keep the list resilient if a backup is deleted while we scan.
    }
  }

  backups.sort((a, b) => b.timestamp.localeCompare(a.timestamp))
  return backups
}

export async function restoreBackup(backupId: number): Promise<void> {
  const backups = await listBackups()
  const backup = backups.find((item) => item.id === backupId)

  if (!backup) {
    throw new Error('Backup not found')
  }

  const backupContent = await readFile(backup.file_path, 'utf8')
  const configPath = getSshConfigPath()

  if (await pathExists(configPath)) {
    const currentContent = await readFile(configPath, 'utf8')
    await createBackup(currentContent)
  }

  await ensureDir(path.dirname(configPath))
  await writeFile(configPath, backupContent, 'utf8')
}

export async function deleteBackup(backupId: number): Promise<void> {
  const backups = await listBackups()
  const backup = backups.find((item) => item.id === backupId)

  if (!backup) {
    throw new Error('Backup not found')
  }

  await rm(backup.file_path)
}

async function cleanupOldBackups(limit: number): Promise<void> {
  const backups = await listBackups()

  if (backups.length <= limit) {
    return
  }

  const sorted = backups.sort((a, b) => b.timestamp.localeCompare(a.timestamp))
  await Promise.all(sorted.slice(limit).map((backup) => rm(backup.file_path).catch(() => undefined)))
}

function buildBackupInfo(filePath: string, timestamp: string, content: string, size: number, modified: Date): BackupInfo {
  return {
    id: Math.floor(modified.getTime() / 1000),
    timestamp,
    file_path: filePath,
    config_hash: createHash('sha256').update(content).digest('hex'),
    host_count: countHosts(content),
    size_bytes: size,
  }
}

function countHosts(content: string): number {
  return content.split(/\r?\n/).filter((line) => line.trim().startsWith('Host ')).length
}
