import { buildSlugMap, fromSlug, toSlug } from './slugMap'

function getOptionNames(options = []) {
  if (!Array.isArray(options)) {
    return []
  }
  return options.map(option => option?.name).filter(Boolean)
}

export function buildTaxonomySlugMap(options = []) {
  return buildSlugMap(getOptionNames(options))
}

export function resolveTaxonomyName(nameOrSlug, options = []) {
  return fromSlug(nameOrSlug, buildTaxonomySlugMap(options))
}

export function getTaxonomySlugs(name, options = []) {
  if (!name) {
    return []
  }
  const slugMap = buildTaxonomySlugMap(options)
  return Array.from(new Set([toSlug(name, slugMap), name]))
}
