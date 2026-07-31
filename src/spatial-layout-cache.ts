export type SpatialLayoutCache<Root extends object, Layout> = {
  get(root: Root, build: () => Layout): Layout
  invalidate(): void
  readonly populated: boolean
}

/**
 * Retains a measured navigation layout until the owning DOM root changes or an
 * explicit layout invalidation occurs.
 */
export function createSpatialLayoutCache<Root extends object, Layout>(): SpatialLayoutCache<
  Root,
  Layout
> {
  let cachedRoot: Root | null = null
  let cachedLayout: Layout | null = null

  return {
    get(root, build): Layout {
      if (cachedRoot !== root || cachedLayout === null) {
        cachedRoot = root
        cachedLayout = build()
      }

      return cachedLayout
    },

    invalidate(): void {
      cachedRoot = null
      cachedLayout = null
    },

    get populated(): boolean {
      return cachedLayout !== null
    },
  }
}