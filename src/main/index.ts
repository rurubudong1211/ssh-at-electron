import { app, BrowserWindow, clipboard, dialog, ipcMain, Menu, nativeImage, shell, Tray, type MessageBoxOptions } from 'electron'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { IpcChannel } from '../shared/ipc'
import type { AppSettings, ConfirmDialogOptions, HostEntry, IpcResult, SshConfig } from '../shared/types'
import {
  addHost,
  deleteHost,
  loadSshConfig,
  parseSshConfig,
  saveSshConfig,
  searchHosts,
  serializeSshConfig,
  updateHost,
} from './services/configService'
import { deleteBackup, listBackups, restoreBackup } from './services/backupService'
import {
  deleteSshKey,
  generateSshKey,
  getKeyFingerprint,
  readPublicKey,
  scanSshKeys,
} from './services/keyService'
import { loadSettings, saveSettings } from './services/settingsService'
import { ensureDir, getSshAtDir } from './services/paths'

const __dirname = dirname(fileURLToPath(import.meta.url))

let mainWindow: BrowserWindow | undefined
let tray: Tray | undefined
let isQuitting = false
const isSmokeTest = process.argv.includes('--smoke-test')

const handlers: Record<IpcChannel, (args: unknown) => Promise<unknown> | unknown> = {
  load_ssh_config: () => loadSshConfig(),
  save_ssh_config: (args) => saveSshConfig(getArg<SshConfig>(args, 'config')),
  serialize_ssh_config: (args) => serializeSshConfig(getArg<SshConfig>(args, 'config')),
  parse_ssh_config: (args) => parseSshConfig(getArg<string>(args, 'content')),
  add_host: (args) => addHost(getArg<HostEntry>(args, 'entry')),
  update_host: (args) => updateHost(getArg<string>(args, 'name'), getArg<HostEntry>(args, 'entry')),
  delete_host: (args) => deleteHost(getArg<string>(args, 'name')),
  search_hosts: (args) => searchHosts(getArg<string>(args, 'query')),
  scan_ssh_keys: () => scanSshKeys(),
  get_key_fingerprint: (args) => getKeyFingerprint(getArg<string>(args, 'path')),
  generate_ssh_key: (args) => {
    const payload = asRecord(args)
    return generateSshKey(
      String(payload.keyType),
      String(payload.name),
      optionalString(payload.comment),
      optionalString(payload.passphrase),
      optionalNumber(payload.bits),
    )
  },
  delete_ssh_key: (args) => deleteSshKey(getArg<string>(args, 'path')),
  read_public_key: (args) => readPublicKey(getArg<string>(args, 'privateKeyPath')),
  list_backups: () => listBackups(),
  restore_backup: (args) => restoreBackup(getArg<number>(args, 'backupId')),
  delete_backup: (args) => deleteBackup(getArg<number>(args, 'backupId')),
  open_config_dir: () => openConfigDir(),
  load_settings: () => loadSettings(),
  save_settings: (args) => saveSettings(getArg<AppSettings>(args, 'settings')),
  dialog_confirm: (args) => showConfirmDialog(args as ConfirmDialogOptions),
  clipboard_write_text: (args) => {
    clipboard.writeText(getArg<string>(args, 'text'))
  },
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: 'SSH-AT',
    show: false,
    webPreferences: {
      preload: resolvePreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.on('close', (event) => {
    if (isQuitting) {
      return
    }

    event.preventDefault()
    hideMainWindow()
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function createTray(): void {
  const iconPath = resolveTrayIconPath()
  const image = iconPath ? nativeImage.createFromPath(iconPath) : nativeImage.createEmpty()

  tray = new Tray(image)
  tray.setToolTip('SSH-AT')
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Show', click: showMainWindow },
    { label: 'Hide', click: hideMainWindow },
    {
      label: 'Quit',
      click: () => {
        isQuitting = true
        app.quit()
      },
    },
  ]))

  tray.on('click', () => {
    if (mainWindow?.isVisible()) {
      hideMainWindow()
    } else {
      showMainWindow()
    }
  })
}

function registerIpcHandlers(): void {
  ipcMain.handle('ssh-at:invoke', async (_event, channel: IpcChannel, args: unknown): Promise<IpcResult<unknown>> => {
    const handler = handlers[channel]
    if (!handler) {
      return { ok: false, error: `Unsupported IPC channel: ${channel}` }
    }

    try {
      const value = await handler(args)
      return { ok: true, value }
    } catch (error) {
      return { ok: false, error: errorToMessage(error) }
    }
  })
}

async function openConfigDir(): Promise<void> {
  const sshAtDir = getSshAtDir()
  await ensureDir(sshAtDir)

  const result = await shell.openPath(sshAtDir)
  if (result) {
    throw new Error(result)
  }
}

async function showConfirmDialog(options: ConfirmDialogOptions): Promise<boolean> {
  const dialogOptions: MessageBoxOptions = {
    type: options.kind === 'error' ? 'error' : options.kind === 'warning' ? 'warning' : 'info',
    title: options.title || 'Confirm',
    message: options.message,
    buttons: ['Cancel', 'OK'],
    cancelId: 0,
    defaultId: 1,
    noLink: true,
  }

  const result = mainWindow
    ? await dialog.showMessageBox(mainWindow, dialogOptions)
    : await dialog.showMessageBox(dialogOptions)

  return result.response === 1
}

function showMainWindow(): void {
  if (process.platform === 'darwin') {
    app.dock?.show()
  }

  if (!mainWindow) {
    createWindow()
  }

  mainWindow?.show()
  mainWindow?.focus()
}

function hideMainWindow(): void {
  mainWindow?.hide()

  if (process.platform === 'darwin') {
    app.dock?.hide()
  }
}

function resolvePreloadPath(): string {
  const candidates = [
    join(__dirname, '../preload/index.mjs'),
    join(__dirname, '../preload/index.js'),
  ]

  const preloadPath = candidates.find((candidate) => existsSync(candidate))
  if (!preloadPath) {
    throw new Error(`Preload script not found. Tried: ${candidates.join(', ')}`)
  }

  return preloadPath
}

function resolveTrayIconPath(): string | undefined {
  const candidates = [
    join(app.getAppPath(), 'assets/icons/icon.png'),
    join(process.resourcesPath, 'assets/icons/icon.png'),
    join(__dirname, '../../assets/icons/icon.png'),
  ]

  return candidates.find((candidate) => existsSync(candidate))
}

function getArg<T>(args: unknown, key: string): T {
  const record = asRecord(args)
  if (!(key in record)) {
    throw new Error(`Missing argument: ${key}`)
  }
  return record[key] as T
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object') {
    return {}
  }
  return value as Record<string, unknown>
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function errorToMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  return String(error)
}

app.on('before-quit', () => {
  isQuitting = true
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.whenReady().then(() => {
  registerIpcHandlers()

  if (isSmokeTest) {
    app.quit()
    return
  }

  createWindow()
  createTray()

  app.on('activate', () => {
    showMainWindow()
  })
}).catch((error) => {
  dialog.showErrorBox('Failed to start SSH-AT', errorToMessage(error))
})



