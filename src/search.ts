// Shared keyword-search helpers.
//
// This module is deliberately ES2015-compatible for the webOS bundle: it does
// NOT rely on String.prototype.normalize (which is unavailable/unreliable on
// the target webview). Accent folding is done with an explicit lookup table so
// the same logic runs identically when building the search index and when
// matching a query.

// Lowercase accented character -> ASCII base. foldText() lowercases before
// mapping, so only lowercase forms need entries here. Values may be longer than
// one character (e.g. ß -> ss) and that is handled by string concatenation.
const DIACRITIC_MAP: Record<string, string> = {
  à: 'a', á: 'a', â: 'a', ã: 'a', ä: 'a', å: 'a', ā: 'a', ă: 'a', ą: 'a',
  ç: 'c', ć: 'c', č: 'c', ĉ: 'c', ċ: 'c',
  ď: 'd', đ: 'd', ð: 'd',
  è: 'e', é: 'e', ê: 'e', ë: 'e', ē: 'e', ĕ: 'e', ė: 'e', ę: 'e', ě: 'e',
  ĝ: 'g', ğ: 'g', ġ: 'g', ģ: 'g',
  ĥ: 'h', ħ: 'h',
  ì: 'i', í: 'i', î: 'i', ï: 'i', ī: 'i', ĭ: 'i', į: 'i', ı: 'i',
  ĵ: 'j',
  ķ: 'k',
  ł: 'l', ĺ: 'l', ļ: 'l', ľ: 'l',
  ñ: 'n', ń: 'n', ņ: 'n', ň: 'n',
  ò: 'o', ó: 'o', ô: 'o', õ: 'o', ö: 'o', ø: 'o', ō: 'o', ŏ: 'o', ő: 'o',
  ŕ: 'r', ŗ: 'r', ř: 'r',
  ś: 's', š: 's', ş: 's', ŝ: 's', ș: 's',
  ť: 't', ţ: 't', ț: 't', ŧ: 't',
  ù: 'u', ú: 'u', û: 'u', ü: 'u', ū: 'u', ŭ: 'u', ů: 'u', ű: 'u', ų: 'u',
  ŵ: 'w',
  ý: 'y', ÿ: 'y', ŷ: 'y',
  ź: 'z', ž: 'z', ż: 'z',
  ß: 'ss', æ: 'ae', œ: 'oe',
}

/**
 * Lowercase and strip common Latin diacritics so that "Pokémon" and "pokemon"
 * (or "Elétra" and "eletra") compare equal. Safe to call on already-folded text
 * (it is idempotent for ASCII input).
 */
export function foldText(value: string): string {
  const lowered = value.toLowerCase()
  let result = ''

  for (let index = 0; index < lowered.length; index += 1) {
    const character = lowered[index]
    const replacement = DIACRITIC_MAP[character]
    result += replacement !== undefined ? replacement : character
  }

  return result
}

/**
 * Produce folded word tokens for every Unicode letter/number run. This is the
 * shared tokenizer for full scans, index construction, and indexed queries:
 * punctuation and whitespace are separators, while every script remains
 * searchable (including Cyrillic, Arabic, CJK, and supplementary-plane text).
 */
export function searchTokens(value: string): string[] {
  return foldText(value).match(/[\p{L}\p{N}]+/gu) ?? []
}

/** Split a raw query with the same Unicode separator rules as the search index. */
export function queryTokens(query: string): string[] {
  return searchTokens(query)
}

/**
 * True when every token in `tokens` appears somewhere in `haystack`.
 *
 * `haystack` is expected to already be folded (e.g. a cached searchName). An
 * empty token list matches everything, mirroring the previous
 * `.includes('')` === true behaviour for an empty query.
 */
export function matchesQuery(haystack: string, tokens: readonly string[]): boolean {
  for (let index = 0; index < tokens.length; index += 1) {
    if (haystack.indexOf(tokens[index]) === -1) {
      return false
    }
  }

  return true
}

/** Convenience folded+trimmed form of a raw query for cache keys and status text. */
export function normalizeQuery(query: string): string {
  return foldText(query).trim()
}