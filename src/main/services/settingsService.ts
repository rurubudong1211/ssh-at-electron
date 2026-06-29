import { readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { AppSettings } from '../../shared/types'
import { ensureDir, getSettingsPath, pathExists } from './paths'

export const defaultSettings: AppSettings = {
  auto_backup: true,
  backup_limit: 10,
  confirm_delete: true,
}

export async function loadSettings(): Promise<AppSettings> {
  const settingsPath = getSettingsPath()

  if (!(await pathExists(settingsPath))) {
    return { ...defaultSettings }
  }

  const content = await readFile(settingsPath, 'utf8')
  const parsed = JSON.parse(content) as Partial<AppSettings>

  return {
    auto_backup: parsed.auto_backup ?? defaultSettings.auto_backup,
    backup_limit: parsed.backup_limit ?? defaultSettings.backup_limit,
    confirm_delete: parsed.confirm_delete ?? defaultSettings.confirm_delete,
  }
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  const settingsPath = getSettingsPath()
  await ensureDir(dirname(settingsPath))
  await writeFile(settingsPath, JSON.stringify(settings, null, 2), 'utf8')
}
