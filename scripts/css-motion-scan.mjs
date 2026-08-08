/*
 * Motion and paint-cost scanner for the packaged stylesheet.
 *
 * Sibling of `css-baseline-scan.mjs`. That module answers "will the target
 * parse this?"; this one answers "will the target paint this cheaply enough to
 * survive a D-pad press?". Different failure modes, different remedies, so they
 * are separate scanners over the same parse.
 *
 * Why it exists: focus changes on every remote press, and the pre-Cinema
 * stylesheet transitioned `box-shadow`, `background` and `border-color` on nine
 * focusable surfaces. Transitioning a paint property repaints its element on
 * every frame for the whole duration; transitioning a layout property runs
 * layout as well. `transform` and `opacity` are the only two properties the
 * compositor can animate without either.
 *
 * This module only parses and reports. `check-css-motion.mjs` owns the
 * allowlist and the pass/fail decision, matching how `check-css-baseline.mjs`
 * relates to `css-baseline-scan.mjs`.
 */

/** Properties whose animation forces a repaint of the element. */
const PAINT_PROPERTIES = new Set([
  'background',
  'background-color',
  'background-image',
  'background-position',
  'background-size',
  'border',
  'border-color',
  'border-top-color',
  'border-right-color',
  'border-bottom-color',
  'border-left-color',
  'box-shadow',
  'text-shadow',
  'filter',
  'backdrop-filter',
  '-webkit-backdrop-filter',
  '-webkit-filter',
])

/** Properties whose animation forces layout, which is strictly worse than paint. */
const LAYOUT_PROPERTIES = new Set([
  'width',
  'height',
  'min-width',
  'min-height',
  'max-width',
  'max-height',
  'top',
  'right',
  'bottom',
  'left',
  'margin',
  'margin-top',
  'margin-right',
  'margin-bottom',
  'margin-left',
  'padding',
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  'font-size',
  'line-height',
  'flex',
  'flex-basis',
  'gap',
  'row-gap',
  'column-gap',
])

/** Reported when a transition names no attributable property. */
export const UNRESOLVED_PROPERTY = '(unresolved)'

const TIME_PATTERN = /^-?[0-9.]+m?s$/
const EASING_PATTERN =
  /^(?:linear|ease|ease-in|ease-out|ease-in-out|step-start|step-end|cubic-bezier\(.*\)|steps\(.*\)|var\(.*\))$/

export function transitionPropertyClass(property) {
  if (property === 'all') {
    return 'blanket'
  }

  if (property === 'transform' || property === 'opacity') {
    return null
  }

  if (PAINT_PROPERTIES.has(property)) {
    return 'paint'
  }

  if (LAYOUT_PROPERTIES.has(property)) {
    return 'layout'
  }

  return 'non-compositor'
}

/** Splits on top-level commas, ignoring commas inside functions. */
function splitTopLevel(value) {
  const parts = []
  let depth = 0
  let current = ''

  for (const character of value) {
    if (character === '(') {
      depth += 1
    } else if (character === ')') {
      depth = Math.max(0, depth - 1)
    }

    if (character === ',' && depth === 0) {
      parts.push(current.trim())
      current = ''
      continue
    }

    current += character
  }

  if (current.trim()) {
    parts.push(current.trim())
  }

  return parts
}

/** Whitespace-tokenizes a transition segment without splitting function calls. */
function tokenize(segment) {
  const tokens = []
  let depth = 0
  let current = ''

  for (const character of segment) {
    if (character === '(') {
      depth += 1
    } else if (character === ')') {
      depth = Math.max(0, depth - 1)
    }

    if (/\s/.test(character) && depth === 0) {
      if (current) {
        tokens.push(current)
        current = ''
      }

      continue
    }

    current += character
  }

  if (current) {
    tokens.push(current)
  }

  return tokens
}

/**
 * Returns the property a `transition` shorthand segment applies to, or null for
 * an empty or `none` segment. CSS defaults an omitted transition-property to
 * `all`. Returns UNRESOLVED_PROPERTY when the segment cannot be attributed —
 * the caller reports that rather than assuming it is safe, so the check fails
 * closed.
 */
function segmentProperty(segment) {
  const tokens = tokenize(segment)

  for (const token of tokens) {
    const lower = token.toLowerCase()

    if (lower === 'none') {
      return null
    }

    if (TIME_PATTERN.test(lower) || EASING_PATTERN.test(lower)) {
      continue
    }

    if (lower.startsWith('var(')) {
      return UNRESOLVED_PROPERTY
    }

    return lower
  }

  // A timing-only shorthand (`200ms ease`) defaults transition-property to `all`.
  return tokens.some((token) => token.toLowerCase().includes('var('))
    ? UNRESOLVED_PROPERTY
    : tokens.length
      ? 'all'
      : null
}

function transitionedProperties(declaration) {
  const property = declaration.property.toLowerCase()

  if (property === 'transition') {
    return splitTopLevel(declaration.value).map(segmentProperty)
  }

  if (property === 'transition-property') {
    return splitTopLevel(declaration.value).map((entry) => {
      const lower = entry.trim().toLowerCase()

      if (!lower || lower === 'none') {
        return null
      }

      return lower.startsWith('var(') ? UNRESOLVED_PROPERTY : lower
    })
  }

  return []
}

const summarize = (prelude) => prelude.replace(/\s+/g, ' ').trim()

/**
 * Reports every transition of a paint-expensive, layout-triggering, blanket
 * (`all`) or unattributable property.
 */
export function findTransitionViolations(rules) {
  const findings = []

  for (const rule of rules) {
    for (const declaration of rule.declarations) {
      for (const property of transitionedProperties(declaration)) {
        if (property === null) {
          continue
        }

        const kind =
          property === UNRESOLVED_PROPERTY ? 'unresolved' : transitionPropertyClass(property)

        if (!kind) {
          continue
        }

        findings.push({
          property,
          kind,
          line: declaration.line,
          prelude: summarize(rule.prelude),
          detail: `${declaration.property}: ${declaration.value.replace(/\s+/g, ' ').trim()}`,
        })
      }
    }
  }

  return findings
}

/**
 * Reports every `will-change` in the sheet. Layer promotion has to be applied by
 * JS to the single focused element: a stylesheet cannot express "only the
 * focused one", so a `will-change` rule over a grid promotes every card at once
 * and spends GPU memory the TV does not have.
 */
export function findWillChange(rules) {
  const findings = []

  for (const rule of rules) {
    for (const declaration of rule.declarations) {
      if (declaration.property.toLowerCase() === 'will-change') {
        findings.push({
          property: 'will-change',
          line: declaration.line,
          prelude: summarize(rule.prelude),
          detail: `will-change: ${declaration.value}`,
        })
      }
    }
  }

  return findings
}

/**
 * Selectors this runtime does not implement, reported from the focus model's
 * side. `:focus-visible` is Chromium 86 against a Chromium 79 target, and an
 * unknown pseudo-class invalidates the entire selector list it appears in — so a
 * `:focus` fallback authored in the same list is discarded with it. That is a
 * shipped defect in this repo, not a hypothetical.
 */
export function findBannedSelectors(rules) {
  const banned = [[/:focus-visible\b/, ':focus-visible', 86]]
  const findings = []

  for (const rule of rules) {
    if (rule.kind !== 'style-rule') {
      continue
    }

    for (const [pattern, feature, chromium] of banned) {
      if (pattern.test(rule.prelude)) {
        findings.push({
          feature,
          chromium,
          line: rule.line,
          prelude: summarize(rule.prelude),
        })
      }
    }
  }

  return findings
}

/**
 * Reports paint/layout properties animated inside `@keyframes`. A keyframed
 * `box-shadow` is worse than a transitioned one: it repaints for as long as the
 * animation runs, and the sync-status pulse runs indefinitely while a library
 * acquisition is in progress.
 */
export function findKeyframePaintAnimations(rules) {
  const findings = []

  for (const rule of rules) {
    const keyframes = (rule.ancestors ?? []).find((ancestor) =>
      /^@(?:-webkit-)?keyframes\b/.test(ancestor.trim()),
    )

    if (!keyframes) {
      continue
    }

    const animation = summarize(keyframes).split(/\s+/).pop() ?? ''

    for (const declaration of rule.declarations) {
      const property = declaration.property.toLowerCase()
      const kind = transitionPropertyClass(property)

      if (kind) {
        findings.push({
          property,
          kind,
          animation,
          line: declaration.line,
          prelude: summarize(rule.prelude),
          detail: `${declaration.property}: ${declaration.value}`,
        })
      }
    }
  }

  return findings
}
