import { describe, expect, it, vi } from 'vitest'
import {
  BrowserProviderTransport,
  DeniedProviderTransport,
  FixtureProviderTransport,
  providerTransportForEnvironment,
} from './provider-transport'

describe('provider transport', () => {
  it('refuses real provider networking in development by default', async () => {
    const transport = new DeniedProviderTransport()

    await expect(transport.fetch('https://provider.example/player_api.php')).rejects.toThrow(
      'Real IPTV provider networking is disabled in development',
    )
  })

  it('returns a fresh fixture response for every static fixture lookup', async () => {
    const fixture = new Response('fixture body', {
      status: 200,
      headers: { 'content-type': 'text/plain' },
    })
    const transport = new FixtureProviderTransport({
      'https://provider.example/player_api.php?action=get_live_categories': fixture,
    })

    const first = await transport.fetch(
      'https://provider.example/player_api.php?action=get_live_categories',
    )
    const second = await transport.fetch(
      'https://provider.example/player_api.php?action=get_live_categories',
    )

    expect(first).not.toBe(fixture)
    expect(second).not.toBe(first)
    await expect(first.text()).resolves.toBe('fixture body')
    await expect(second.text()).resolves.toBe('fixture body')
  })

  it('supports fixture factories and fails closed when a fixture is absent', async () => {
    const createResponse = vi.fn(() => new Response('factory fixture'))
    const transport = new FixtureProviderTransport({
      'https://provider.example/player_api.php': createResponse,
    })

    await expect(transport.fetch('https://provider.example/player_api.php')).resolves.toBeInstanceOf(
      Response,
    )
    expect(createResponse).toHaveBeenCalledTimes(1)
    await expect(transport.fetch('https://provider.example/missing')).rejects.toThrow(
      'No provider fixture is registered',
    )
  })

  it('selects the denied transport only for unapproved development networking', () => {
    expect(
      providerTransportForEnvironment({
        DEV: true,
        MODE: 'development',
      }),
    ).toBeInstanceOf(DeniedProviderTransport)
    expect(
      providerTransportForEnvironment({
        DEV: true,
        MODE: 'development',
        VITE_ALLOW_REAL_PROVIDER: 'true',
      }),
    ).toBeInstanceOf(BrowserProviderTransport)
    expect(
      providerTransportForEnvironment({
        DEV: false,
        MODE: 'production',
      }),
    ).toBeInstanceOf(BrowserProviderTransport)
    expect(
      providerTransportForEnvironment({
        DEV: true,
        MODE: 'test',
      }),
    ).toBeInstanceOf(BrowserProviderTransport)
  })
})