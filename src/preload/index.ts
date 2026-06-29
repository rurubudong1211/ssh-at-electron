import { contextBridge, ipcRenderer } from 'electron'
import { ipcChannels, type IpcChannel } from '../shared/ipc'
import type { IpcResult } from '../shared/types'

const allowedChannels = new Set<IpcChannel>(ipcChannels)

async function invoke<T>(channel: IpcChannel, args?: unknown): Promise<T> {
  if (!allowedChannels.has(channel)) {
    throw new Error(`Unsupported IPC channel: ${channel}`)
  }

  const result = await ipcRenderer.invoke('ssh-at:invoke', channel, args) as IpcResult<T>
  if (result.ok) {
    return result.value
  }

  throw new Error(result.error)
}

contextBridge.exposeInMainWorld('sshAt', {
  invoke,
})
