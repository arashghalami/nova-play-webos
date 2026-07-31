import type {
  AgeGuidance,
  ContentRating,
  RatingCandidate,
  RatingProvider,
  RatingResolution,
} from './types'

const MAX_RATING_LENGTH = 32
const MAX_SOURCE_LABEL_LENGTH = 40
const MAX_DESCRIPTORS = 8
const MAX_DESCRIPTOR_LENGTH = 40
const MAX_RATING_CANDIDATES = 16
const PROVIDER_ORDER: Record<RatingProvider, number> = {
  tmdb: 0,
  trakt: 1,
  xtream: 2,
}

const KIJKWIJZER_AGES: Record<string, number> = {
  AL: 0,
  '6': 6,
  '9': 9,
  '12': 12,
  '14': 14,
  '16': 16,
  '18': 18,
}

const MPAA_AGES: Record<string, number> = {
  G: 0,
  PG: 8,
  'PG-13': 13,
  R: 17,
  'NC-17': 18,
}

const TVPG_AGES: Record<string, number> = {
  'TV-Y': 0,
  'TV-Y7': 7,
  'TV-G': 0,
  'TV-PG': 10,
  'TV-14': 14,
  'TV-MA': 17,
}

const BBFC_AGES: Record<string, number> = {
  U: 0,
  PG: 8,
  '12A': 12,
  '12': 12,
  '15': 15,
  '18': 18,
}

const FSK_AGES: Record<string, number> = {
  'FSK 0': 0,
  'FSK 6': 6,
  'FSK 12': 12,
  'FSK 16': 16,
  'FSK 18': 18,
}

function asString(value: unknown): string | undefined {
  if (typeof value !== 'string' && typeof value !== 'number') {
    return undefined
  }

  return String(value)
}

function knownNumericClassification(value: string): boolean {
  return ['0', '6', '9', '12', '14', '15', '16', '18'].includes(value)
}

function normalizedSystem(system: string | undefined): string | undefined {
  if (!system) {
    return undefined
  }

  const value = system.trim().replace(/\s+/g, ' ')

  if (!value || value.length > MAX_RATING_LENGTH) {
    return undefined
  }

  const upper = value.toUpperCase()
  const aliases: Record<string, string> = {
    'TV-PG': 'TVPG',
    TVPG: 'TVPG',
    TVPARENTALGUIDELINES: 'TVPG',
    'TV PARENTAL GUIDELINES': 'TVPG',
    KIJKWIJZER: 'Kijkwijzer',
    MPAA: 'MPAA',
    BBFC: 'BBFC',
    FSK: 'FSK',
  }

  return aliases[upper]
}

function normalizedDescriptors(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined
  }

  const descriptors: string[] = []

  for (const entry of value) {
    const descriptor = asString(entry)?.trim().replace(/\s+/g, ' ')

    if (
      !descriptor ||
      descriptor.length > MAX_DESCRIPTOR_LENGTH ||
      descriptors.some((known) => known.toLowerCase() === descriptor.toLowerCase())
    ) {
      continue
    }

    descriptors.push(descriptor)

    if (descriptors.length === MAX_DESCRIPTORS) {
      break
    }
  }

  return descriptors.length ? descriptors : undefined
}

function isProvider(value: unknown): value is RatingProvider {
  return value === 'xtream' || value === 'tmdb' || value === 'trakt'
}

function candidateRegion(candidate: Pick<RatingCandidate, 'region' | 'retrievedRegion'>): string | undefined {
  return candidate.region ?? candidate.retrievedRegion
}

function ratingBelongsToSystem(value: string, system: string): boolean {
  if (system === 'Kijkwijzer') {
    return value in KIJKWIJZER_AGES
  }

  if (system === 'MPAA') {
    return value in MPAA_AGES
  }

  if (system === 'TVPG') {
    return value in TVPG_AGES
  }

  if (system === 'BBFC') {
    return value in BBFC_AGES
  }

  return system === 'FSK' && (value in FSK_AGES || ['0', '6', '12', '16', '18'].includes(value))
}

function candidateSystem(candidate: ContentRating): string | undefined {
  const suppliedSystem = normalizedSystem(candidate.system)
  const value = normalizeRatingValue(candidate.value)

  if (suppliedSystem && value && ratingBelongsToSystem(value, suppliedSystem)) {
    return suppliedSystem
  }

  return classificationSystem(candidate.value, candidate.region)
}

function isRecognized(candidate: RatingCandidate): boolean {
  return Boolean(candidateSystem(candidate))
}

function isOfficialNetherlands(candidate: RatingCandidate): boolean {
  return (
    candidate.provider !== 'xtream' &&
    candidate.official &&
    candidateRegion(candidate) === 'NL' &&
    candidateSystem(candidate) === 'Kijkwijzer'
  )
}

function comparisonPriority(candidate: RatingCandidate, preferredRegion: string): number {
  const region = candidateRegion(candidate)
  const system = candidateSystem(candidate)

  if (isOfficialNetherlands(candidate)) {
    return 0
  }

  if (candidate.provider === 'tmdb' && candidate.official && region === preferredRegion && isRecognized(candidate)) {
    return 1
  }

  if (candidate.provider === 'trakt' && candidate.official && region === preferredRegion && isRecognized(candidate)) {
    return 2
  }

  if (candidate.provider === 'trakt' && isRecognized(candidate)) {
    return 3
  }

  if (candidate.provider === 'tmdb' && region === 'US' && isRecognized(candidate)) {
    return 4
  }

  if (candidate.provider === 'tmdb' && region === 'GB' && isRecognized(candidate)) {
    return 5
  }

  if (candidate.provider !== 'xtream' && candidate.official && system) {
    return 6
  }

  if (candidate.provider === 'xtream' && isRecognized(candidate)) {
    return 7
  }

  return 8
}

function compareRatingCandidates(
  left: RatingCandidate,
  right: RatingCandidate,
  preferredRegion: string,
): number {
  const priority =
    comparisonPriority(left, preferredRegion) -
    comparisonPriority(right, preferredRegion)

  if (priority !== 0) {
    return priority
  }

  const providerPriority =
    PROVIDER_ORDER[left.provider] - PROVIDER_ORDER[right.provider]

  if (providerPriority !== 0) {
    return providerPriority
  }

  return [
    candidateRegion(left) ?? '',
    candidateSystem(left) ?? '',
    left.value,
    left.sourceLabel,
  ].join('|').localeCompare([
    candidateRegion(right) ?? '',
    candidateSystem(right) ?? '',
    right.value,
    right.sourceLabel,
  ].join('|'))
}

function sourceForProvider(provider: RatingProvider): ContentRating['source'] {
  return provider === 'xtream' ? 'xtream' : 'external'
}

export function normalizeRatingValue(value: unknown): string | undefined {
  const source = asString(value)?.trim().replace(/\s+/g, ' ')

  if (!source || source.length > MAX_RATING_LENGTH || /[\u0000-\u001F\u007F]/.test(source)) {
    return undefined
  }

  const normalized = source.toUpperCase()

  if (
    /^(?:IMDB|TMDB|ROTTEN TOMATOES|METASCORE|SCORE|RATING)\b/.test(normalized) ||
    /^\d+\.\d+$/.test(normalized) ||
    (/^\d+$/.test(normalized) && !knownNumericClassification(normalized))
  ) {
    return undefined
  }

  return normalized
}

export function normalizeRegion(value: unknown): string | undefined {
  const source = asString(value)?.trim().toUpperCase()
  return source && /^[A-Z]{2}$/.test(source) ? source : undefined
}

export function classificationSystem(
  value: string,
  region?: string,
  _mediaType?: 'movie' | 'tv',
): string | undefined {
  const classification = normalizeRatingValue(value)

  if (!classification) {
    return undefined
  }

  const normalizedRegion = normalizeRegion(region)

  if (normalizedRegion === 'NL' && classification in KIJKWIJZER_AGES) {
    return 'Kijkwijzer'
  }

  if (normalizedRegion === 'GB' && classification in BBFC_AGES) {
    return 'BBFC'
  }

  if (classification in FSK_AGES) {
    return 'FSK'
  }

  if (normalizedRegion === 'DE' && ['0', '6', '12', '16', '18'].includes(classification)) {
    return 'FSK'
  }

  if (classification in TVPG_AGES) {
    return 'TVPG'
  }

  if (classification in MPAA_AGES) {
    return 'MPAA'
  }

  return undefined
}

export function ageGuidanceForRating(rating: ContentRating): AgeGuidance | undefined {
  const value = normalizeRatingValue(rating.value)

  if (!value) {
    return undefined
  }

  const system = candidateSystem(rating)
  let suggestedMinimumAge = rating.minimumAge

  if (
    suggestedMinimumAge !== undefined &&
    (!Number.isInteger(suggestedMinimumAge) || suggestedMinimumAge < 0 || suggestedMinimumAge > 21)
  ) {
    suggestedMinimumAge = undefined
  }

  if (suggestedMinimumAge === undefined) {
    if (system === 'Kijkwijzer') {
      suggestedMinimumAge = KIJKWIJZER_AGES[value]
    } else if (system === 'MPAA') {
      suggestedMinimumAge = MPAA_AGES[value]
    } else if (system === 'TVPG') {
      suggestedMinimumAge = TVPG_AGES[value]
    } else if (system === 'BBFC') {
      suggestedMinimumAge = BBFC_AGES[value]
    } else if (system === 'FSK') {
      suggestedMinimumAge = FSK_AGES[value] ?? (['0', '6', '12', '16', '18'].includes(value) ? Number(value) : undefined)
    }
  }

  if (suggestedMinimumAge === undefined) {
    return undefined
  }

  if (system === 'MPAA' || system === 'TVPG') {
    return {
      suggestedMinimumAge,
      basis: 'derived',
      confidence: 'medium',
    }
  }

  if (rating.official && (system === 'Kijkwijzer' || system === 'BBFC' || system === 'FSK' || /^\d+$/.test(value))) {
    return {
      suggestedMinimumAge,
      basis: 'official-certification',
      confidence: 'high',
    }
  }

  return {
    suggestedMinimumAge,
    basis: rating.official ? 'official-certification' : 'provider-value',
    confidence: rating.official ? 'medium' : 'low',
  }
}

export function normalizeRatingCandidate(value: unknown): RatingCandidate | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return undefined
  }

  const record = value as Record<string, unknown>
  const provider = record.provider

  if (!isProvider(provider)) {
    return undefined
  }

  const ratingValue = normalizeRatingValue(record.value)
  const sourceLabel = asString(record.sourceLabel)?.trim().replace(/\s+/g, ' ')

  if (
    !ratingValue ||
    !sourceLabel ||
    sourceLabel.length > MAX_SOURCE_LABEL_LENGTH ||
    /[\u0000-\u001F\u007F]/.test(sourceLabel) ||
    (record.official !== undefined && typeof record.official !== 'boolean')
  ) {
    return undefined
  }

  const region = normalizeRegion(record.region)
  const retrievedRegion = normalizeRegion(record.retrievedRegion)
  const rawMinimumAge = record.minimumAge

  if (
    (record.region !== undefined && !region) ||
    (record.retrievedRegion !== undefined && !retrievedRegion) ||
    (rawMinimumAge !== undefined &&
      (typeof rawMinimumAge !== 'number' ||
        !Number.isInteger(rawMinimumAge) ||
        rawMinimumAge < 0 ||
        rawMinimumAge > 21))
  ) {
    return undefined
  }

  const suppliedSystem = normalizedSystem(asString(record.system))

  if (
    (record.system !== undefined && !suppliedSystem) ||
    (suppliedSystem && !ratingBelongsToSystem(ratingValue, suppliedSystem))
  ) {
    return undefined
  }

  const system = suppliedSystem ?? classificationSystem(ratingValue, region ?? retrievedRegion)
  const minimumAge = rawMinimumAge as number | undefined

  const candidate: RatingCandidate = {
    value: ratingValue,
    system,
    region,
    retrievedRegion,
    minimumAge,
    descriptors: normalizedDescriptors(record.descriptors),
    provider,
    sourceLabel,
    source: sourceForProvider(provider),
    official: record.official === true,
  }
  const guidance = ageGuidanceForRating(candidate)

  return {
    ...candidate,
    minimumAge: candidate.minimumAge ?? guidance?.suggestedMinimumAge,
  }
}

export function dedupeRatingCandidates(candidates: RatingCandidate[]): RatingCandidate[] {
  const deduped: RatingCandidate[] = []
  const keys = new Set<string>()

  for (const candidate of candidates) {
    const normalized = normalizeRatingCandidate(candidate)

    if (!normalized) {
      continue
    }

    const key = [
      normalized.provider,
      normalized.value,
      normalized.system ?? '',
      normalized.region ?? '',
      normalized.retrievedRegion ?? '',
    ].join('|')

    if (keys.has(key)) {
      continue
    }

    keys.add(key)
    deduped.push(normalized)
  }

  return deduped.length <= MAX_RATING_CANDIDATES
    ? deduped
    : deduped
        .sort((left, right) => compareRatingCandidates(left, right, 'NL'))
        .slice(0, MAX_RATING_CANDIDATES)
}

export function resolveContentRating(
  candidates: RatingCandidate[],
  preferredRegion = 'NL',
): RatingResolution {
  const normalizedPreferredRegion = normalizeRegion(preferredRegion) ?? 'NL'
  const normalized = dedupeRatingCandidates(candidates)
  const selected = [...normalized].sort(
    (left, right) =>
      compareRatingCandidates(left, right, normalizedPreferredRegion),
  )[0]

  if (!selected || comparisonPriority(selected, normalizedPreferredRegion) === 8) {
    return {
      candidates: normalized,
      preferredRegion: normalizedPreferredRegion,
      fallbackUsed: false,
    }
  }

  return {
    selected,
    candidates: normalized,
    ageGuidance: ageGuidanceForRating(selected),
    preferredRegion: normalizedPreferredRegion,
    fallbackUsed: comparisonPriority(selected, normalizedPreferredRegion) >= 3,
  }
}

function displaySystem(system: string | undefined): string | undefined {
  return system === 'TVPG' ? 'TV-PG' : system
}

export function ratingSourceSummary(resolution: RatingResolution): string {
  const { selected } = resolution

  if (!selected) {
    return ''
  }

  const sourceLabel =
    selected.provider === 'trakt' && resolution.fallbackUsed
      ? `${selected.sourceLabel} fallback`
      : selected.sourceLabel
  const region = candidateRegion(selected)
  const system = displaySystem(candidateSystem(selected))
  const parts = [sourceLabel, region, system ?? selected.value].filter(
    (part, index, values): part is string => Boolean(part) && values.indexOf(part) === index,
  )

  return parts.join(' · ')
}