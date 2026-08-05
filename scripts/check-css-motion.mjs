/*
 * Fails the build when the stylesheet animates something the TV cannot animate
 * cheaply, or when it reaches for a focus selector this runtime does not have.
 *
 * The focus model is the centrepiece of the Cinema design and it fires on every
 * D-pad press. Before this guard, nine focusable surfaces transitioned
 * `box-shadow`, and several also transitioned `background` and `border-color`:
 * every remote press repainted the focused element for 140-200 ms. `transform`
 * and `opacity` are the only properties the compositor animates without paint or
 * layout, so everything else is rejected here unless it is listed in ALLOWED
 * with a reason.
 *
 * `will-change` is rejected outright. A stylesheet cannot say "only the focused
 * card", so any `will-change` rule over a grid promotes every card to its own
 * compositor layer at once. If layer promotion is ever needed it belongs in JS,
 * applied to the one focused element and removed after.
 *
 * The guard fails closed: a transition whose property cannot be attributed
 * (because it comes from a `var()`) is reported rather than assumed safe.
 */

import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parseStylesheet } from './css-baseline-scan.mjs'
import {
  findBannedSelectors,
  findKeyframePaintAnimations,
  findTransitionViolations,
  findWillChange,
} from './css-motion-scan.mjs'

/**
 * Transitions permitted above the rule, keyed `selector::property`. Every entry
 * must state why the paint cost is acceptable on the device. Keep this list
 * short: each entry is paint work on a real interaction.
 */
const ALLOWED = new Map([
  [
    '.spinner::background',
    'The loading spinner is a single element that is by definition already ' +
      'animating, and it is never focusable, so its paint never coincides with a ' +
      'D-pad press.',
  ],
])

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
      throw new Error(`The CSS motion check cannot read ${target.label}.`)
    }

    continue
  }

  scanned += 1
  scanSheet(target.label, readFileSync(target.path, 'utf8'))
}

if (!scanned) {
  throw new Error('The CSS motion check found no stylesheet to scan.')
}

function scanSheet(label, source) {
  const rules = parseStylesheet(source)

  const report = (category, detail, line, site, allowKey) => {
    if (allowKey && ALLOWED.has(allowKey)) {
      allowedHits.set(allowKey, (allowedHits.get(allowKey) ?? 0) + 1)
      return
    }

    findings.push({ category, detail, label, line, site })
  }

  for (const violation of findTransitionViolations(rules)) {
    const category =
      violation.kind === 'unresolved'
        ? 'transition whose property cannot be resolved'
        : violation.kind === 'blanket'
          ? 'transition: all'
          : `transitioned ${violation.kind} property`

    report(
      category,
      violation.property,
      violation.line,
      `${violation.prelude} { ${violation.detail} }`,
      `${violation.prelude}::${violation.property}`,
    )
  }

  for (const violation of findKeyframePaintAnimations(rules)) {
    report(
      `keyframed ${violation.kind} property`,
      `${violation.property} in @keyframes ${violation.animation}`,
      violation.line,
      `@keyframes ${violation.animation} { ${violation.prelude} { ${violation.detail} } }`,
      `@keyframes ${violation.animation}::${violation.property}`,
    )
  }

  for (const violation of findWillChange(rules)) {
    report(
      'will-change in the stylesheet',
      violation.detail,
      violation.line,
      `${violation.prelude} { ${violation.detail} }`,
      null,
    )
  }

  for (const violation of findBannedSelectors(rules)) {
    report(
      `${violation.feature} (Chromium ${violation.chromium})`,
      violation.feature,
      violation.line,
      violation.prelude,
      null,
    )
  }
}

if (findings.length) {
  const grouped = new Map()

  for (const finding of findings) {
    const list = grouped.get(finding.category) ?? []
    list.push(finding)
    grouped.set(finding.category, list)
  }

  const lines = [
    `The stylesheet has ${grouped.size} motion problem(s) the webOS target pays ` +
      'for on every interaction. transform and opacity are the only properties ' +
      'the compositor can animate without paint or layout.',
    '',
  ]

  for (const [category, list] of [...grouped.entries()].sort()) {
    lines.push(`  ${category} - ${list.length} use(s):`)

    for (const finding of list.slice(0, 12)) {
      lines.push(`    ${finding.label}:${finding.line}  ${finding.site}`)
    }

    if (list.length > 12) {
      lines.push(`    ... and ${list.length - 12} more`)
    }
  }

  lines.push(
    '',
    'Move the effect to transform/opacity, apply the property statically on',
    ':focus instead of transitioning it, or - only when the paint genuinely',
    'cannot coincide with an interaction - add it to ALLOWED in',
    'scripts/check-css-motion.mjs with a reason.',
  )

  throw new Error(lines.join('\n'))
}

const allowedSummary = [...allowedHits.entries()]
  .sort()
  .map(([key, hits]) => `${key} (${hits})`)
  .join(', ')

console.log(
  `Verified ${scanned} stylesheet(s) animate only compositor-safe properties and ` +
    'declare no will-change.' +
    (allowedSummary ? ` Allowed exceptions: ${allowedSummary}.` : ''),
)
