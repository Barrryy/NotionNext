import BLOG from '@/blog.config'
import { siteConfig } from '@/lib/config'
import { fetchGlobalAllData } from '@/lib/db/SiteDataApi'
import { getTaxonomySlugs, resolveTaxonomyName } from '@/lib/utils/taxonomySlug'
import { DynamicLayout } from '@/themes/theme'

const Tag = props => {
  const theme = siteConfig('THEME', BLOG.THEME, props.NOTION_CONFIG)
  return <DynamicLayout theme={theme} layoutName='LayoutPostList' {...props} />
}

export async function getStaticProps({ params: { tag, page }, locale }) {
  const from = 'tag-page-props'
  const props = await fetchGlobalAllData({ from, locale })
  const tagName = resolveTaxonomyName(tag, props.tagOptions)
  // 过滤状态、标签
  props.posts = props.allPages
    ?.filter(page => page.type === 'Post' && page.status === 'Published')
    .filter(post => post && post?.tags && post?.tags.includes(tagName))
  // 处理文章数
  props.postCount = props.posts.length
  const POSTS_PER_PAGE = siteConfig('POSTS_PER_PAGE', 12, props?.NOTION_CONFIG)
  // 处理分页
  props.posts = props.posts.slice(
    POSTS_PER_PAGE * (page - 1),
    POSTS_PER_PAGE * page
  )

  props.tag = tagName
  props.page = page
  delete props.allPages
  return {
    props,
    revalidate: process.env.EXPORT
      ? undefined
      : siteConfig(
          'NEXT_REVALIDATE_SECOND',
          BLOG.NEXT_REVALIDATE_SECOND,
          props.NOTION_CONFIG
        )
  }
}

export async function getStaticPaths() {
  const from = 'tag-page-static-path'
  const { tagOptions, allPages, NOTION_CONFIG } = await fetchGlobalAllData({
    from
  })
  const tagNames = getTagNames(tagOptions)
  const paths = []
  tagNames.forEach(tagName => {
    // 过滤状态类型
    const tagPosts = allPages
      ?.filter(page => page.type === 'Post' && page.status === 'Published')
      .filter(post => post && post?.tags && post?.tags.includes(tagName))
    // 处理文章页数
    const postCount = tagPosts.length
    const totalPages = Math.ceil(
      postCount / siteConfig('POSTS_PER_PAGE', null, NOTION_CONFIG)
    )
    if (totalPages > 1) {
      for (let i = 1; i <= totalPages; i++) {
        getTaxonomySlugs(tagName, tagOptions).forEach(tagSlug => {
          paths.push({ params: { tag: tagSlug, page: '' + i } })
        })
      }
    }
  })
  return {
    paths: paths,
    fallback: true
  }
}

function getTagNames(tags) {
  if (!Array.isArray(tags)) {
    return []
  }
  return tags.map(tag => tag.name)
}

export default Tag
