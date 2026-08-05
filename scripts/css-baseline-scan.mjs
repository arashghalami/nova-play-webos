/*
 * Shared Chromium-baseline scanner for the packaged stylesheet.
 *
 * The webOS 6.5.3 target runs Chromium 79. Features introduced after that are
 * parsed and silently discarded: no error, no fallback, no visible symptom
 * until a device screenshot is compared against intent. Three defects have now
 * been traced to exactly this (over-broad URL scrubbing, `inset: 0`, and
 * `:focus-visible` without a `:focus` fallback), so the baseline is enforced
 * mechanically rather than by review.
 *
 * This module only parses and reports. `check-css-baseline.mjs` owns the
 * allowlist and the pass/fail decision.
 */

export const CHROMIUM_BASELINE = 79

/**
 * Splits a stylesheet into flat rule records. Comments are blanked (not
 * removed) so reported line numbers stay aligned with the source file.
 */
export function parseStylesheet(source) {
  const text = blankComments(source)
  const rules = []
  const stack = []
  let buffer = ''
  let bufferStart = 0
  let index = 0

  const lineAt = (offset) => {
    let line = 1

    for (let scan = 0; scan < offset && scan < text.length; scan += 1) {
      if (text[scan] === '\n') {
        line += 1
      }
    }

    return line
  }

  const lineStarts = [0]

  for (let scan = 0; scan < text.length; scan += 1) {
    if (text[scan] === '\n') {
      lineStarts.push(scan + 1)
    }
  }

  const fastLineAt = (offset) => {
    let low = 0
    let high = lineStarts.length - 1

    while (low < high) {
      const mid = (low + high + 1) >> 1

      if (lineStarts[mid] <= offset) {
        low = mid
      } else {
        high = mid - 1
      }
    }

    return low + 1
  }

  void lineAt

  while (index < text.length) {
    const character = text[index]

    if (character === '"' || character === "'") {
      const end = skipString(text, index)
      buffer += text.slice(index, end)
      index = end
      continue
    }

    if (character === '{') {
      const prelude = buffer.trim()
      stack.push({
        prelude,
        preludeLine: fastLineAt(bufferStart + (buffer.length - buffer.trimStart().length)),
      })
      buffer = ''
      index += 1
      bufferStart = index
      continue
    }

    if (character === '}') {
      const block = stack.pop()

      if (block) {
        pushRule(rules, stack, block, buffer, bufferStart, fastLineAt)
      }

      buffer = ''
      index += 1
      bufferStart = index
      continue
    }

    if (character === ';' && stack.length === 0) {
      // Top-level at-statement such as `@charset` or `@import`.
      const statement = buffer.trim()

      if (statement) {
        rules.push({
          kind: 'at-statement',
          prelude: statement,
          line: fastLineAt(bufferStart),
          declarations: [],
          ancestors: [],
        })
      }

      buffer = ''
      index += 1
      bufferStart = index
      continue
    }

    buffer += character
    index += 1
  }

  return rules
}

function pushRule(rules, stack, block, body, bodyStart, fastLineAt) {
  const declarations = parseDeclarations(body, bodyStart, fastLineAt)
  rules.push({
    kind: block.prelude.startsWith('@') ? 'at-rule' : 'style-rule',
    prelude: block.prelude,
    line: block.preludeLine,
    declarations,
    ancestors: stack.map((entry) => entry.prelude),
  })
}

function parseDeclarations(body, bodyStart, fastLineAt) {
  const declarations = []
  let depth = 0
  let start = 0
  let index = 0

  const commit = (end) => {
    const raw = body.slice(start, end)
    const colon = indexOfTopLevel(raw, ':')

    if (colon > 0) {
      const property = raw.slice(0, colon).trim()
      const value = raw.slice(colon + 1).trim()

      if (property && !property.includes('{')) {
        const offset = bodyStart + start + (raw.length - raw.trimStart().length)
        declarations.push({
          property,
          value,
          line: fastLineAt(offset),
        })
      }
    }
  }

  while (index < body.length) {
    const character = body[index]

    if (character === '"' || character === "'") {
      index = skipString(body, index)
      continue
    }

    if (character === '(') {
      depth += 1
    } else if (character === ')') {
      depth = Math.max(0, depth - 1)
    } else if (character === ';' && depth === 0) {
      commit(index)
      start = index + 1
    }

    index += 1
  }

  commit(body.length)
  return declarations
}

function indexOfTopLevel(text, target) {
  let depth = 0

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]

    if (character === '"' || character === "'") {
      index = skipString(text, index) - 1
      continue
    }

    if (character === '(') {
      depth += 1
    } else if (character === ')') {
      depth = Math.max(0, depth - 1)
    } else if (character === target && depth === 0) {
      return index
    }
  }

  return -1
}

function skipString(text, start) {
  const quote = text[start]
  let index = start + 1

  while (index < text.length) {
    if (text[index] === '\\') {
      index += 2
      continue
    }

    if (text[index] === quote) {
      return index + 1
    }

    index += 1
  }

  return index
}

function blankComments(source) {
  let output = ''
  let index = 0

  while (index < source.length) {
    if (source[index] === '"' || source[index] === "'") {
      const end = skipString(source, index)
      output += source.slice(index, end)
      index = end
      continue
    }

    if (source[index] === '/' && source[index + 1] === '*') {
      const end = source.indexOf('*/', index + 2)
      const stop = end < 0 ? source.length : end + 2
      // Preserve newlines so line numbers survive.
      for (const character of source.slice(index, stop)) {
        output += character === '\n' ? '\n' : ' '
      }
      index = stop
      continue
    }

    output += source[index]
    index += 1
  }

  return output
}

/**
 * Resolves the effective `display` values for each selector in the sheet.
 * A `gap` declaration is only a Chromium-84 risk when its box is a flex
 * container; grid gap has been supported since Chromium 66.
 */
export function buildDisplayIndex(rules) {
  const bySelector = new Map()

  for (const rule of rules) {
    if (rule.kind !== 'style-rule') {
      continue
    }

    const displays = rule.declarations
      .filter((declaration) => declaration.property === 'display')
      .map((declaration) => declaration.value.toLowerCase())

    if (!displays.length) {
      continue
    }

    for (const selector of splitSelectors(rule.prelude)) {
      const key = normalizeSelector(selector)
      const existing = bySelector.get(key) ?? new Set()

      for (const display of displays) {
        existing.add(display)
      }

      bySelector.set(key, existing)
    }
  }

  return bySelector
}

export function splitSelectors(prelude) {
  const selectors = []
  let depth = 0
  let current = ''

  for (let index = 0; index < prelude.length; index += 1) {
    const character = prelude[index]

    if (character === '"' || character === "'") {
      const end = skipString(prelude, index)
      current += prelude.slice(index, end)
      index = end - 1
      continue
    }

    if (character === '(' || character === '[') {
      depth += 1
    } else if (character === ')' || character === ']') {
      depth = Math.max(0, depth - 1)
    }

    if (character === ',' && depth === 0) {
      selectors.push(current.trim())
      current = ''
      continue
    }

    current += character
  }

  if (current.trim()) {
    selectors.push(current.trim())
  }

  return selectors
}

export function normalizeSelector(selector) {
  return selector.replace(/\s+/g, ' ').trim()
}

/**
 * Strips trailing pseudo-classes/elements so `.x:hover { gap }` can resolve the
 * display value declared on the base `.x` rule.
 */
export function selectorLookupKeys(selector) {
  const normalized = normalizeSelector(selector)
  const keys = [normalized]
  const stripped = normalized.replace(/(::?[a-z-]+(\([^)]*\))?)+$/i, '').trim()

  if (stripped && stripped !== normalized) {
    keys.push(stripped)
  }

  return keys
}
