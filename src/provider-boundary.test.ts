import { describe, expect, it } from 'vitest'

const runtimeSources = import.meta.glob('./**/*.ts', {
  eager: true,
  import: 'default',
  query: '?raw',
}) as Record<string, string>

describe('provider request boundary', () => {
  it('allows only ProviderBroker to import XtreamClient at runtime', () => {
    const bypasses = Object.entries(runtimeSources)
      .filter(([path]) => !path.endsWith('.test.ts'))
      .filter(
        ([path, source]) =>
          path !== './provider-broker.ts' &&
          /from ['"]\.\/xtream-client['"]/.test(source),
      )
      .map(([path]) => path)

    expect(bypasses).toEqual([])
    expect(runtimeSources['./provider-broker.ts']).toMatch(
      /from ['"]\.\/xtream-client['"]/,
    )
  })

  it('routes application code through ProviderBroker rather than XtreamClient', () => {
    const mainSource = runtimeSources['./main.ts']

    expect(mainSource).toMatch(/from ['"]\.\/provider-broker['"]/)
    expect(mainSource).not.toMatch(/from ['"]\.\/xtream-client['"]/)
  })
})