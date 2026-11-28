import {
  buildTaxonomySlugMap,
  getTaxonomySlugs,
  resolveTaxonomyName
} from '@/lib/utils/taxonomySlug'

const options = [{ name: '学习笔记' }, { name: '原创' }, { name: 'NFEU' }]

describe('taxonomy slug helpers', () => {
  it('builds mapped slugs for category and tag options', () => {
    expect(buildTaxonomySlugMap(options)).toEqual({
      学习笔记: 'study-notes',
      原创: 'original',
      NFEU: 'nfeu'
    })
  })

  it('resolves English slugs back to the original taxonomy name', () => {
    expect(resolveTaxonomyName('study-notes', options)).toBe('学习笔记')
    expect(resolveTaxonomyName('original', options)).toBe('原创')
  })

  it('keeps original Chinese names and paths working', () => {
    expect(resolveTaxonomyName('学习笔记', options)).toBe('学习笔记')
    expect(getTaxonomySlugs('学习笔记', options)).toEqual([
      'study-notes',
      '学习笔记'
    ])
  })
})
