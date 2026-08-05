/*
 * Asserts the packaged stylesheet honors the Nova Play Cinema design contract.
 *
 * These are not style preferences. Each assertion pins a decision that a
 * device screenshot would otherwise be the only way to catch:
 *
 *   - A tinted canvas or a saturated focus colour is what made the app read as
 *     a dashboard rather than a cinema surface. Neutrality is measurable, so it
 *     is measured here instead of re-litigated per rule.
 *   - `font-family: Inter` was declared for a year while no Inter was shipped,
 *     so every TV rendered LG's system font. A named family that no `@font-face`
 *     provides is now a test failure.
 *   - A packaged webOS app has no network guarantee at first paint. A remote
 *     font `src` would silently fall back on the TV and nowhere else.
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseStylesheet, splitSelectors } from './css-baseline-scan.mjs'

/**
 * Comma-splits a declaration value. `splitSelectors` already splits on
 * top-level commas while respecting quotes and parens, which is exactly the
 * grammar a font-family list needs; this alias keeps the call site honest about
 * what is being split.
 */
const splitCommaList = splitSelectors

const STYLESHEET = resolve('src', 'style.css')
const source = readFileSync(STYLESHEET, 'utf8')
const rules = parseStylesheet(source)

/** Tokens that paint large areas. A colour cast here tints the whole app. */
const NEUTRAL_SURFACE_TOKENS = ['--canvas', '--surface', '--surface-raised', '--surface-focus']

/** Maximum spread between R, G and B for a colour to count as neutral (0-255). */
const NEUTRAL_TOLERANCE = 10

/** The design system's weight scale. Nine ad-hoc weights is not a system. */
const WEIGHT_SCALE = new Set([400, 500, 600, 700, 800, 900])

function customProperties() {
  const properties = new Map()

  for (const rule of rules) {
    if (rule.kind !== 'style-rule') {
      continue
    }

    if (!splitSelectors(rule.prelude).some((selector) => selector.includes(':root'))) {
      continue
    }

    for (const declaration of rule.declarations) {
      if (declaration.property.startsWith('--')) {
        // Later declarations win, matching the cascade.
        properties.set(declaration.property, declaration.value)
      }
    }
  }

  return properties
}

function declarationsFor(selectorTest, property) {
  const values = []

  for (const rule of rules) {
    if (rule.kind !== 'style-rule') {
      continue
    }

    if (!splitSelectors(rule.prelude).some(selectorTest)) {
      continue
    }

    for (const declaration of rule.declarations) {
      if (declaration.property === property) {
        values.push(declaration)
      }
    }
  }

  return values
}

function fontFaces() {
  return rules
    .filter((rule) => rule.prelude.replace(/\s+/g, ' ').trim().startsWith('@font-face'))
    .map((rule) => {
      const read = (property) =>
        rule.declarations.find((declaration) => declaration.property === property)?.value ?? ''

      return {
        family: read('font-family').replace(/['"]/g, '').trim(),
        src: read('src'),
        weight: read('font-weight'),
        display: read('font-display'),
      }
    })
}

/** Returns [r, g, b] in 0-255, or null when the value is not a literal colour. */
function channels(value) {
  const text = value.trim()
  const hex = text.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)

  if (hex) {
    const digits =
      hex[1].length === 3
        ? [...hex[1]].map((digit) => `${digit}${digit}`)
        : [hex[1].slice(0, 2), hex[1].slice(2, 4), hex[1].slice(4, 6)]

    return digits.map((pair) => Number.parseInt(pair, 16))
  }

  const rgb = text.match(/^rgb\(\s*([0-9.]+)[\s,]+([0-9.]+)[\s,]+([0-9.]+)/i)

  return rgb ? [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])] : null
}

const spread = (rgb) => Math.max(...rgb) - Math.min(...rgb)

/**
 * Literals are allowed a slight cool cast so neutral surfaces do not read as
 * dead flat grey, but nothing beyond that. Anything genuinely hued must be a
 * token.
 */
const LITERAL_TINT_TOLERANCE = 24

/** Every literal colour in a declaration value, hex and rgb()/rgba() alike. */
function literalColours(value) {
  const found = []

  for (const hex of value.match(/#[0-9a-f]{3,8}\b/gi) ?? []) {
    const body = hex.slice(1)

    // Only 3- and 6-digit forms carry an unambiguous opaque triple.
    if (body.length !== 3 && body.length !== 6) {
      continue
    }

    const digits =
      body.length === 3
        ? [...body].map((digit) => `${digit}${digit}`)
        : [body.slice(0, 2), body.slice(2, 4), body.slice(4, 6)]

    found.push({ text: hex, rgb: digits.map((pair) => Number.parseInt(pair, 16)) })
  }

  for (const call of value.match(/rgba?\(\s*[0-9]+[\s,]+[0-9]+[\s,]+[0-9]+/gi) ?? []) {
    const numbers = (call.match(/[0-9]+/g) ?? []).map(Number)

    if (numbers.length >= 3) {
      found.push({ text: `rgb(${numbers.slice(0, 3).join(' ')})`, rgb: numbers.slice(0, 3) })
    }
  }

  return found
}

function milliseconds(value) {
  const match = value.trim().match(/^([0-9.]+)ms$/)
  return match ? Number(match[1]) : Number.NaN
}

describe('Cinema design contract: colour', () => {
  it('paints every large surface with a neutral, uncast colour', () => {
    const properties = customProperties()
    const cast = []

    for (const token of NEUTRAL_SURFACE_TOKENS) {
      const value = properties.get(token)
      expect(value, `${token} must be declared on :root`).toBeDefined()

      const rgb = channels(value)
      expect(rgb, `${token} must be a literal colour, got "${value}"`).not.toBeNull()

      if (spread(rgb) > NEUTRAL_TOLERANCE) {
        cast.push(`${token}: ${value} (channel spread ${spread(rgb)})`)
      }
    }

    expect(cast, 'these surface tokens carry a colour cast').toEqual([])
  })

  it('uses a near-white focus colour so focus reads as light, not as a hue', () => {
    const properties = customProperties()
    const rgb = channels(properties.get('--focus') ?? '')

    expect(rgb, '--focus must be a literal colour').not.toBeNull()
    expect(spread(rgb), '--focus must be neutral, not tinted').toBeLessThanOrEqual(
      NEUTRAL_TOLERANCE,
    )
    expect(Math.min(...rgb), '--focus must be near-white').toBeGreaterThanOrEqual(219)
  })

  it('routes every tinted colour through a token instead of a literal', () => {
    /*
     * Retuning the :root tokens is not enough on its own: this sheet carried 327
     * tinted colour literals outside the token block, which is why a token-only
     * change still rendered a blue app. Neutral surfaces are only neutral if the
     * literals are too, and any colour that is deliberately hued belongs in a
     * token where it can be reasoned about once.
     */
    const tinted = []

    for (const rule of rules) {
      if (
        rule.kind === 'style-rule' &&
        splitSelectors(rule.prelude).some((selector) => selector.includes(':root'))
      ) {
        continue
      }

      for (const declaration of rule.declarations) {
        if (declaration.property.startsWith('--')) {
          continue
        }

        for (const colour of literalColours(declaration.value)) {
          if (spread(colour.rgb) > LITERAL_TINT_TOLERANCE) {
            tinted.push(
              `style.css:${declaration.line} ${declaration.property}: ${colour.text} (spread ${spread(colour.rgb)})`,
            )
          }
        }
      }
    }

    expect(tinted.slice(0, 40), `${tinted.length} tinted literal colour(s)`).toEqual([])
  })

  it('keeps the body canvas flat rather than washing it with radial gradients', () => {
    const gradients = declarationsFor(
      (selector) => selector.trim() === 'body',
      'background',
    ).filter((declaration) => /radial-gradient/i.test(declaration.value))

    expect(
      gradients.map((declaration) => `style.css:${declaration.line}`),
      'body must not paint radial gradients; they cost paint on every scroll and read as a dashboard',
    ).toEqual([])
  })
})

describe('Cinema design contract: semantic state', () => {
  /*
   * Reducing the palette to one accent is a mechanical sweep, and the first run
   * of that sweep flattened five states that carry meaning by colour alone: the
   * error icon, the filled favourite star, the primary CTA, the progress bar and
   * the spinner all came out grey. Neutralising a surface is correct; neutralising
   * a signal is a defect. These pin the signals.
   */
  const semanticSites = [
    ['.favorite-button.is-favorite', 'color', '--accent-gold'],
    ['.error-icon', 'background', '--danger'],
    ['.primary-button', 'background', '--focus'],
    ['.spinner', 'border-top-color', '--focus'],
    ['.resume-progress::after', 'background', '--brand'],
  ]

  for (const [selector, property, token] of semanticSites) {
    it(`keeps ${selector} carrying its state through ${token}`, () => {
      const declarations = declarationsFor(
        (candidate) => candidate.trim() === selector,
        property,
      )

      expect(declarations.length, `${selector} must declare ${property}`).toBeGreaterThan(0)
      expect(
        declarations.some((declaration) => declaration.value.includes(`var(${token})`)),
        `${selector} { ${property} } must reference var(${token}), not a neutral literal`,
      ).toBe(true)
    })
  }
})

describe('Cinema design contract: typography', () => {
  it('ships the first font family it asks for', () => {
    const rootFontFamily = declarationsFor(
      (selector) => selector.includes(':root'),
      'font-family',
    )

    expect(rootFontFamily.length, ':root must declare a font-family').toBeGreaterThan(0)

    const declared = rootFontFamily[rootFontFamily.length - 1].value
    const first = splitCommaList(declared)[0].replace(/['"]/g, '').trim()
    const provided = fontFaces().map((face) => face.family)

    expect(
      provided,
      `":root" asks for "${first}" first, so an @font-face must provide it`,
    ).toContain(first)
  })

  it('loads every bundled face from the package, never from the network', () => {
    const faces = fontFaces()
    expect(faces.length, 'at least one @font-face must be declared').toBeGreaterThan(0)

    const remote = faces.filter((face) => /url\(\s*['"]?https?:/i.test(face.src))

    expect(
      remote.map((face) => face.family),
      'a packaged webOS app has no network guarantee at first paint',
    ).toEqual([])
  })

  it('draws every weight from the design system scale', () => {
    const offScale = []

    for (const rule of rules) {
      for (const declaration of rule.declarations) {
        if (declaration.property !== 'font-weight') {
          continue
        }

        const weight = Number(declaration.value.trim())

        if (Number.isFinite(weight) && !WEIGHT_SCALE.has(weight)) {
          offScale.push(`style.css:${declaration.line} font-weight: ${declaration.value}`)
        }
      }
    }

    expect(offScale, 'these weights are outside the 400-900 hundreds scale').toEqual([])
  })
})

describe('Cinema design contract: motion', () => {
  it('gives transitions a duration that reads as considered on a 55-inch panel', () => {
    const properties = customProperties()

    expect(milliseconds(properties.get('--motion-fast') ?? '')).toBeGreaterThanOrEqual(160)
    expect(milliseconds(properties.get('--motion') ?? '')).toBeGreaterThanOrEqual(240)
  })
})
