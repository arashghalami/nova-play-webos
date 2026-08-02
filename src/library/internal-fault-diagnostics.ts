import { LibraryWriteAbortedError } from './catalog-repository'

/**
 * Probe builds may record a bounded diagnostic signature for faults thrown by
 * local application code. Provider errors are deliberately excluded because
 * their text can contain provider-controlled URLs, credentials, or payload
 * fragments.
 */
export function internalFaultTraceData(
  reason: unknown,
  providerError: boolean,
  enabled: boolean,
): Record<string, string> {
  if (
    !enabled ||
    providerError ||
    reason instanceof LibraryWriteAbortedError ||
    !(reason instanceof Error)
  ) {
    return {}
  }

  const data: Record<string, string> = {
    faultType: boundedInternalFaultText(reason.name),
  }
  const message = boundedInternalFaultText(reason.message)

  if (message) {
    data.faultMessage = message
  }

  const frames = internalFaultFrames(reason.stack)

  frames.forEach((frame, index) => {
    data[`faultFrame${index + 1}`] = frame
  })

  return data
}

function boundedInternalFaultText(value: string): string {
  return value
    .replace(/(?:https?|wss?):\/\/[^\s)]+/gi, '[url]')
    .replace(
      /\b(credential|password|token|secret|authorization|username)\s*([=:])\s*\S+/gi,
      '$1$2***',
    )
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160)
}

function internalFaultFrames(stack: string | undefined): string[] {
  if (!stack) {
    return []
  }

  const frames: string[] = []
  const pattern = /([A-Za-z0-9_-]+\.(?:js|ts)):(\d+):(\d+)/g
  let match: RegExpExecArray | null

  while ((match = pattern.exec(stack)) !== null && frames.length < 3) {
    frames.push(`${match[1]}:${match[2]}:${match[3]}`)
  }

  return frames
}