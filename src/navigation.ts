export type NavigationDirection = 'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown'

export type NavigationItem = {
  id: string
  zoneId: string
  left: number
  top: number
  width: number
  height: number
}

type NavigationRow = NavigationItem[]

type NavigationZone = {
  id: string
  items: NavigationItem[]
  left: number
  top: number
  right: number
  bottom: number
}

const rowTolerance = (item: NavigationItem): number => Math.max(8, item.height * 0.35)

const centerX = (item: NavigationItem): number => item.left + item.width / 2

function rowsFor(items: NavigationItem[]): NavigationRow[] {
  const rows: NavigationRow[] = []

  items
    .slice()
    .sort((left, right) => left.top - right.top || left.left - right.left)
    .forEach((item) => {
      const row = rows[rows.length - 1]

      if (!row || Math.abs(item.top - row[0].top) > rowTolerance(item)) {
        rows.push([item])
      } else {
        row.push(item)
      }
    })

  rows.forEach((row) => row.sort((left, right) => left.left - right.left))
  return rows
}

function closestColumn(items: NavigationItem[], origin: NavigationItem): NavigationItem | null {
  return (
    items
      .slice()
      .sort(
        (left, right) =>
          Math.abs(centerX(left) - centerX(origin)) - Math.abs(centerX(right) - centerX(origin)),
      )[0] ?? null
  )
}

function zonesFor(items: NavigationItem[]): NavigationZone[] {
  const itemsByZone = new Map<string, NavigationItem[]>()

  items.forEach((item) => {
    const zoneItems = itemsByZone.get(item.zoneId) ?? []
    zoneItems.push(item)
    itemsByZone.set(item.zoneId, zoneItems)
  })

  return [...itemsByZone.entries()].map(([id, zoneItems]) => ({
    id,
    items: zoneItems,
    left: Math.min(...zoneItems.map((item) => item.left)),
    top: Math.min(...zoneItems.map((item) => item.top)),
    right: Math.max(...zoneItems.map((item) => item.left + item.width)),
    bottom: Math.max(...zoneItems.map((item) => item.top + item.height)),
  }))
}

function boundaryRow(
  zone: NavigationZone,
  direction: Extract<NavigationDirection, 'ArrowUp' | 'ArrowDown'>,
): NavigationItem[] {
  const rows = rowsFor(zone.items)
  return direction === 'ArrowUp' ? rows[rows.length - 1] ?? [] : rows[0] ?? []
}

function adjacentZone(
  zones: NavigationZone[],
  originZone: NavigationZone,
  direction: Extract<NavigationDirection, 'ArrowUp' | 'ArrowDown'>,
): NavigationZone | null {
  const originY = (originZone.top + originZone.bottom) / 2

  return (
    zones
      .filter((zone) => zone.id !== originZone.id)
      .map((zone) => {
        const zoneY = (zone.top + zone.bottom) / 2
        const inDirection = direction === 'ArrowUp' ? zoneY < originY - 4 : zoneY > originY + 4

        return inDirection ? { zone, distance: Math.abs(zoneY - originY) } : null
      })
      .filter((candidate): candidate is { zone: NavigationZone; distance: number } => Boolean(candidate))
      .sort((left, right) => left.distance - right.distance)[0]?.zone ?? null
  )
}

/**
 * Resolves TV D-pad focus within explicit navigation zones.
 *
 * Horizontal navigation wraps within the current visual row. Vertical navigation
 * moves through rows first, then enters the closest zone above or below.
 */
export function resolveNavigationTarget(
  items: NavigationItem[],
  originId: string,
  direction: NavigationDirection,
): string | null {
  const origin = items.find((item) => item.id === originId)

  if (!origin) {
    return null
  }

  const zones = zonesFor(items)
  const originZone = zones.find((zone) => zone.id === origin.zoneId)

  if (!originZone) {
    return null
  }

  const rows = rowsFor(originZone.items)
  const rowIndex = rows.findIndex((row) => row.some((item) => item.id === origin.id))
  const row = rows[rowIndex]
  const column = row?.findIndex((item) => item.id === origin.id) ?? -1
  let target: NavigationItem | null = null

  if (direction === 'ArrowRight' && row?.length) {
    target = row[(column + 1) % row.length]
  } else if (direction === 'ArrowLeft' && row?.length) {
    target = row[(column - 1 + row.length) % row.length]
  } else if (direction === 'ArrowUp' || direction === 'ArrowDown') {
    const nextRow = rows[rowIndex + (direction === 'ArrowUp' ? -1 : 1)]
    target = nextRow ? closestColumn(nextRow, origin) : null

    if (!target) {
      const nextZone = adjacentZone(zones, originZone, direction)
      target = nextZone ? closestColumn(boundaryRow(nextZone, direction), origin) : null
    }
  }

  return target && target.id !== origin.id ? target.id : null
}