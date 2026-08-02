export type ProviderTransport = {
  fetch(url: string, init?: RequestInit): Promise<Response>
}

export class BrowserProviderTransport implements ProviderTransport {
  fetch(url: string, init?: RequestInit): Promise<Response> {
    return fetch(url, init)
  }
}

export class DeniedProviderTransport implements ProviderTransport {
  async fetch(_url: string, _init?: RequestInit): Promise<Response> {
    throw new Error(
      'Real IPTV provider networking is disabled in development. Set VITE_ALLOW_REAL_PROVIDER=true only for an explicit device test.',
    )
  }
}

export class FixtureProviderTransport implements ProviderTransport {
  private readonly responses: Map<string, Response | (() => Response | Promise<Response>)>

  constructor(
    responses: Record<string, Response | (() => Response | Promise<Response>)>,
  ) {
    this.responses = new Map(Object.entries(responses))
  }

  async fetch(url: string): Promise<Response> {
    const response = this.responses.get(url)

    if (!response) {
      throw new Error(`No provider fixture is registered for ${url}.`)
    }

    return typeof response === 'function' ? response() : response.clone()
  }
}

export type ProviderTransportEnvironment = {
  DEV: boolean
  MODE: string
  VITE_ALLOW_REAL_PROVIDER?: string
}

export function providerTransportForEnvironment(
  environment: ProviderTransportEnvironment,
): ProviderTransport {
  const realProviderAllowed =
    environment.VITE_ALLOW_REAL_PROVIDER === 'true' || environment.MODE === 'test'

  if (environment.DEV && !realProviderAllowed) {
    return new DeniedProviderTransport()
  }

  return new BrowserProviderTransport()
}

export function appProviderTransport(): ProviderTransport {
  return providerTransportForEnvironment(import.meta.env)
}
