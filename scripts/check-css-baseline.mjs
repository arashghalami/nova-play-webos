/*
 * Fails the build when the stylesheet uses a CSS feature the webOS runtime does
 * not implement.
 *
 * The physical target is OLED55G1RLA / webOS 6.5.3, whose engine is Chromium 79.
 * Chromium discards declarations it does not recognize and invalidates selectors
 * it cannot parse, both without any error. Three separate defects in this
 * codebase have now been traced to that silence:
 *
 *   1. `inset: 0` (Chromium 87) left the fixed player surface unsized, so SD and
 *      cinemascope streams rendered at their intrinsic pixel size.
 *   2. `:focus-visible` (Chromium 86) dropped focus styling on a D-pad-only app,
 *      and - because an unknown pseudo-class invalidates the whole selector list
 *      it appears in - also dropped the `:focus` fallbacks authored beside it and
 *      one unrelated rule that shared the list.
 *   3. `aspect-ratio` (Chromium 88) let poster boxes collapse onto their child's
 *      intrinsic height, so circular portraits became ellipses and image-less
 *      placeholders had no height at all.
 *
 * Each was first found at a single site and each turned out to be a class. The
 * remedy is this check rather than another local patch.
 *
 * Progressive enhancements belong in ALLOWED below, with a reason stating what
 * the Chromium 79 rendering looks like without them.
 */

import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  CHROMIUM_BASELINE,
  buildDisplayIndex,
  parseStylesheet,
  selectorLookupKeys,
  splitSelectors,
} from './css-baseline-scan.mjs'

/**
 * Features that may exceed the baseline because losing them costs only
 * appearance the runtime never had. Every entry states the Chromium 79 result.
 */
const ALLOWED = new Map([
  [
    'accent-color',
    'Tints native checkbox/radio/range controls. Chromium 79 draws the default ' +
      'UA accent instead; every control remains visible and operable.',
  ],
  [
    'color-scheme',
    'Opts UA-drawn form controls and scrollbars into dark rendering. Chromium 79 ' +
      'uses light UA chrome, which the sheet already overrides for every control ' +
      'the app draws itself.',
  ],
  [
    'scrollbar-width',
    'Thins the Firefox/Chromium standard scrollbar on the metadata rails. ' +
      'Chromium 79 draws its default scrollbar, and the TV never shows one ' +
      'because those rails are driven by D-pad focus scrolling.',
  ],
])

/**
 * Unprefixed properties the target reaches through a `-webkit-` spelling. The
 * unprefixed form is allowed only when the same rule also declares the prefixed
 * one, so the Chromium 79 rendering is identical rather than merely similar.
 */
const PREFIX_FALLBACKS = new Map([
  ['appearance', '-webkit-appearance'],
  ['mask', '-webkit-mask'],
  ['mask-image', '-webkit-mask-image'],
  ['mask-size', '-webkit-mask-size'],
  ['mask-position', '-webkit-mask-position'],
  ['mask-repeat', '-webkit-mask-repeat'],
  ['mask-composite', '-webkit-mask-composite'],
])

/**
 * Selectors whose `display` comes from a class declared elsewhere on the same
 * element, so the sheet alone cannot resolve it. Each entry names the co-class
 * that supplies the value, and is what makes the gap check fail-closed: an
 * unclassified `gap` is reported rather than assumed safe.
 */
const GAP_CONTAINER_KINDS = new Map([
  ['.detail-layout-cinematic', { kind: 'grid', via: '.detail-layout' }],
  ['.series-detail-layout', { kind: 'grid', via: '.detail-layout' }],
  ['.player-control-dock', { kind: 'flex', via: '.player-controls' }],
])

/** Properties whose mere presence is above the baseline. */
const PROPERTIES = [
  ['aspect-ratio', 88],
  ['inset', 87],
  ['inset-block', 87],
  ['inset-block-start', 87],
  ['inset-block-end', 87],
  ['inset-inline', 87],
  ['inset-inline-start', 87],
  ['inset-inline-end', 87],
  ['accent-color', 93],
  ['color-scheme', 81],
  ['content-visibility', 85],
  ['contain-intrinsic-size', 83],
  ['contain-intrinsic-width', 95],
  ['contain-intrinsic-height', 95],
  ['appearance', 84],
  ['scrollbar-gutter', 94],
  ['scrollbar-width', 121],
  ['scrollbar-color', 121],
  ['text-wrap', 114],
  ['text-wrap-style', 114],
  ['text-decoration-thickness', 89],
  ['text-underline-offset', 87],
  ['forced-color-adjust', 89],
  ['print-color-adjust', 92],
  ['overflow-clip-margin', 90],
  ['object-view-box', 104],
  ['container', 105],
  ['container-type', 105],
  ['container-name', 105],
  ['field-sizing', 123],
  ['hyphenate-character', 106],
  ['transition-behavior', 117],
  ['anchor-name', 125],
  ['position-anchor', 125],
  ['position-area', 125],
  ['inset-area', 125],
  ['text-box-trim', 133],
  ['text-box-edge', 133],
  // Individual transform properties, not the `transform` function list.
  ['translate', 104],
  ['rotate', 104],
  ['scale', 104],
  // Unprefixed masking. `-webkit-mask*` is the Chromium 79 spelling.
  ['mask', 120],
  ['mask-image', 120],
  ['mask-size', 120],
  ['mask-position', 120],
  ['mask-repeat', 120],
  ['mask-composite', 120],
]

/** Property/value pairs where only the value is above the baseline. */
const PROPERTY_VALUES = [
  ['overflow', /(^|\s)clip($|\s)/, 90, 'overflow: clip'],
  ['overflow-x', /(^|\s)clip($|\s)/, 90, 'overflow-x: clip'],
  ['overflow-y', /(^|\s)clip($|\s)/, 90, 'overflow-y: clip'],
  ['width', /\bstretch\b/, 130, 'width: stretch'],
]

/** Selector fragments above the baseline. */
const SELECTORS = [
  [/:focus-visible\b/, 86, ':focus-visible'],
  [/:is\(/, 88, ':is()'],
  [/:where\(/, 88, ':where()'],
  [/:has\(/, 105, ':has()'],
  [/::marker\b/, 86, '::marker'],
  [/::file-selector-button\b/, 89, '::file-selector-button'],
  [/:autofill\b/, 87, ':autofill'],
  [/:modal\b/, 105, ':modal'],
  [/:dir\(/, 120, ':dir()'],
  [/:user-valid\b/, 119, ':user-valid'],
  [/:user-invalid\b/, 119, ':user-invalid'],
  [/::backdrop\b/, 37, null], // supported; listed to document the check ran
]

/** At-rules above the baseline. */
const AT_RULES = [
  [/^@layer\b/, 99, '@layer'],
  [/^@container\b/, 105, '@container'],
  [/^@property\b/, 85, '@property'],
  [/^@scope\b/, 118, '@scope'],
  [/^@starting-style\b/, 117, '@starting-style'],
]

/** Value-level functions and units above the baseline. */
const VALUE_PATTERNS = [
  [/\bcolor-mix\(/, 111, 'color-mix()'],
  [/\boklch\(/, 111, 'oklch()'],
  [/\boklab\(/, 111, 'oklab()'],
  [/\blch\(/, 111, 'lch()'],
  [/\blab\(/, 111, 'lab()'],
  [/\bhwb\(/, 101, 'hwb()'],
  [/\blight-dark\(/, 123, 'light-dark()'],
  [/(^|[\s(,])image-set\(/, 90, 'image-set()'],
  [/\b(?:round|mod|rem|abs|sign)\(/, 125, 'CSS stepped/sign math functions'],
  [/\b(?:pow|sqrt|hypot|log|exp)\(/, 125, 'CSS exponential math functions'],
  [/\b(?:sin|cos|tan|asin|acos|atan|atan2)\(/, 111, 'CSS trigonometric functions'],
  [/\brevert-layer\b/, 99, 'revert-layer'],
  [/(^|[\s(,:])revert(\s|$|;|,|\))/, 84, 'revert'],
  [/\b\d*\.?\d+(?:dvh|dvw|svh|svw|lvh|lvw|dvmin|dvmax|svmin|svmax|lvmin|lvmax|dvb|dvi)\b/, 108, 'dynamic viewport units'],
  [/\b\d*\.?\d+(?:cqw|cqh|cqi|cqb|cqmin|cqmax)\b/, 105, 'container query units'],
  [/\b\d*\.?\d+(?:rlh|lh)\b/, 109, 'line-height units'],
  [/\b\d*\.?\d+ic\b/, 106, 'ic unit'],
]

const GAP_PROPERTIES = new Set(['gap', 'row-gap', 'column-gap'])
const FLEX_DISPLAYS = new Set(['flex', 'inline-flex'])

const targets = [
  { label: 'src/style.css', path: resolve('src', 'style.css'), required: true },
  { label: 'webos-app/style.css', path: resolve('webos-app', 'style.css'), required: false },
]

const findings = []
const allowedHits = new Map()
let scanned = 0

for (const target of targets) {
  if (!existsSync(target.path)) {
    if (target.required) {
      throw new Error(`The CSS baseline check cannot read ${target.label}.`)
    }

    continue
  }

  scanned += 1
  scanSheet(target.label, readFileSync(target.path, 'utf8'))
}

if (!scanned) {
  throw new Error('The CSS baseline check found no stylesheet to scan.')
}

function scanSheet(label, source) {
  const rules = parseStylesheet(source)
  const displays = buildDisplayIndex(rules)

  const report = (feature, chromium, line, detail) => {
    if (ALLOWED.has(feature)) {
      const hits = allowedHits.get(feature) ?? 0
      allowedHits.set(feature, hits + 1)
      return
    }

    findings.push({ feature, chromium, label, line, detail })
  }

  for (const rule of rules) {
    for (const [pattern, chromium, feature] of AT_RULES) {
      if (feature && pattern.test(rule.prelude)) {
        report(feature, chromium, rule.line, rule.prelude.slice(0, 80))
      }
    }

    if (rule.kind === 'style-rule') {
      for (const [pattern, chromium, feature] of SELECTORS) {
        if (feature && chromium > CHROMIUM_BASELINE && pattern.test(rule.prelude)) {
          report(feature, chromium, rule.line, rule.prelude.replace(/\s+/g, ' ').slice(0, 100))
        }
      }
    }

    for (const declaration of rule.declarations) {
      const property = declaration.property.toLowerCase()
      const value = declaration.value.toLowerCase()

      if (property.startsWith('--')) {
        // Custom property values are only inert text until a var() substitutes
        // them, but the substituted result still has to parse on the target.
        checkValue(property, value, declaration.line, report)
        continue
      }

      for (const [name, chromium] of PROPERTIES) {
        if (property !== name) {
          continue
        }

        if (hasPrefixedFallback(rule, name, value)) {
          continue
        }

        report(name, chromium, declaration.line, `${property}: ${declaration.value}`)
      }

      for (const [name, pattern, chromium, feature] of PROPERTY_VALUES) {
        if (property === name && pattern.test(value)) {
          report(feature, chromium, declaration.line, `${property}: ${declaration.value}`)
        }
      }

      checkValue(property, value, declaration.line, report)

      if (!GAP_PROPERTIES.has(property)) {
        continue
      }

      const container = classifyGapContainer(rule, displays)
      const site = `${rule.prelude.replace(/\s+/g, ' ').slice(0, 70)} { ${property}: ${declaration.value} }`

      if (container === 'flex') {
        report('gap on a flex container', 84, declaration.line, site)
      } else if (container === 'unknown') {
        /*
         * Fail closed. `.player-control-dock` took its `display: flex` from a
         * co-class and so slipped past an earlier version of this check; an
         * unprovable container is reported rather than assumed to be a grid.
         */
        report(
          'gap whose container type cannot be resolved',
          84,
          declaration.line,
          `${site} - no display declared for this selector; classify it in GAP_CONTAINER_KINDS`,
        )
      }
    }
  }
}

function hasPrefixedFallback(rule, property, value) {
  const prefixed = PREFIX_FALLBACKS.get(property)

  if (!prefixed) {
    return false
  }

  return rule.declarations.some(
    (declaration) =>
      declaration.property.toLowerCase() === prefixed &&
      declaration.value.toLowerCase() === value,
  )
}

function checkValue(property, value, line, report) {
  for (const [pattern, chromium, feature] of VALUE_PATTERNS) {
    if (pattern.test(value)) {
      report(feature, chromium, line, `${property}: ${value.slice(0, 70)}`)
    }
  }
}

/**
 * Grid gap has been supported since Chromium 66, so only a flex container's gap
 * is a baseline violation. `display` may be declared in a different rule for the
 * same selector, so resolve it across the whole sheet before deciding.
 *
 * Returns 'flex', 'grid', or 'unknown'.
 */
function classifyGapContainer(rule, displays) {
  const resolved = new Set(
    rule.declarations
      .filter((declaration) => declaration.property === 'display')
      .map((declaration) => declaration.value.toLowerCase()),
  )
  let declaredKind = null

  for (const selector of splitSelectors(rule.prelude)) {
    for (const key of selectorLookupKeys(selector)) {
      for (const display of displays.get(key) ?? []) {
        resolved.add(display)
      }

      const classified = GAP_CONTAINER_KINDS.get(key)

      if (classified) {
        declaredKind = classified.kind === 'flex' ? 'flex' : declaredKind ?? 'grid'
      }
    }
  }

  for (const display of resolved) {
    if (FLEX_DISPLAYS.has(display.trim())) {
      return 'flex'
    }
  }

  if (declaredKind) {
    return declaredKind
  }

  for (const display of resolved) {
    if (display.includes('grid')) {
      return 'grid'
    }
  }

  return 'unknown'
}

if (findings.length) {
  const grouped = new Map()

  for (const finding of findings) {
    const list = grouped.get(finding.feature) ?? []
    list.push(finding)
    grouped.set(finding.feature, list)
  }

  const lines = [
    `The stylesheet uses ${grouped.size} CSS feature(s) above the Chromium ` +
      `${CHROMIUM_BASELINE} webOS baseline. Chromium ${CHROMIUM_BASELINE} drops ` +
      'these silently, so the TV renders something other than what is authored.',
    '',
  ]

  for (const [feature, list] of [...grouped.entries()].sort()) {
    lines.push(`  ${feature} (Chromium ${list[0].chromium}) - ${list.length} use(s):`)

    for (const finding of list.slice(0, 12)) {
      lines.push(`    ${finding.label}:${finding.line}  ${finding.detail}`)
    }

    if (list.length > 12) {
      lines.push(`    ... and ${list.length - 12} more`)
    }
  }

  lines.push(
    '',
    'Replace each with a Chromium-79-safe equivalent, or - only when losing the',
    'feature costs appearance alone - add it to ALLOWED in',
    'scripts/check-css-baseline.mjs with a reason describing the Chromium 79',
    'rendering.',
  )

  throw new Error(lines.join('\n'))
}

const allowedSummary = [...allowedHits.entries()]
  .sort()
  .map(([feature, hits]) => `${feature} (${hits})`)
  .join(', ')

console.log(
  `Verified ${scanned} stylesheet(s) contain no CSS feature above the Chromium ` +
    `${CHROMIUM_BASELINE} webOS baseline.` +
    (allowedSummary ? ` Allowed progressive enhancements: ${allowedSummary}.` : ''),
)
