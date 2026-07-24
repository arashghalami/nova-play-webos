import type { NavigationDirection } from './navigation'

export type RemoteKeyEvent = {
  key?: string
  keyCode?: number
  which?: number
}

export function remoteKeyCode(event: RemoteKeyEvent): number {
  return event.keyCode || event.which || 0
}

export function remoteDirection(event: RemoteKeyEvent): NavigationDirection | null {
  const code = remoteKeyCode(event)

  if (event.key === 'ArrowLeft' || event.key === 'Left' || code === 37) {
    return 'ArrowLeft'
  }

  if (event.key === 'ArrowUp' || event.key === 'Up' || code === 38) {
    return 'ArrowUp'
  }

  if (event.key === 'ArrowRight' || event.key === 'Right' || code === 39) {
    return 'ArrowRight'
  }

  if (event.key === 'ArrowDown' || event.key === 'Down' || code === 40) {
    return 'ArrowDown'
  }

  return null
}

export function isRemoteBack(event: RemoteKeyEvent): boolean {
  const code = remoteKeyCode(event)

  return (
    event.key === 'Escape' ||
    event.key === 'Back' ||
    event.key === 'GoBack' ||
    event.key === 'BrowserBack' ||
    code === 461 ||
    code === 10009
  )
}