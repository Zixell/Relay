import type { RelayAPI } from '../../../preload'

declare global {
  interface Window {
    api: RelayAPI
  }
}

export {}
