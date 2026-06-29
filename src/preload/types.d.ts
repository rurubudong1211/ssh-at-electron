import type { IpcChannel } from '../shared/ipc'

declare global {
  interface Window {
    sshAt: {
      invoke<T>(channel: IpcChannel, args?: unknown): Promise<T>
    }
  }
}

export {}
