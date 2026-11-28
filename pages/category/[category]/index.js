import BLOG from '@/blog.config'
import { siteConfig } from '@/lib/config'
import { fetchGlobalAllData } from '@/lib/db/SiteDataApi'
import { getTaxonomySlugs, resolveTaxonomyName } from '@/lib/utils/taxonomySlug'
import { DynamicLayout } from '@/themes/theme'

/**
 * 分类页
 * @param {*} props
 * @returns
 */
export default function Category(props) {
  const theme = siteConfig('THEME', BLOG.THEME, props.NOTION_CONFIG)
  return <DynamicLayout theme={theme} layoutName='LayoutPostList' {...props} />
}

export async function getStaticProps({ params: { category }, locale }) {
  const from = 'category-props'
  let props = await fetchGlobalAllData({ from, locale })
  // URL 里的英文 slug 先还原成中文分类名
  const categoryName = resolveTaxonomyName(category, props.categoryOptions)

  // 过滤状态
  props.posts = props.allPages?.filter(
    page => page.type === 'Post' && page.status === 'Published'
  )
  // 处理过滤
  props.posts = props.posts.filter(
    post => post && post.category && post.category.includes(categoryName)
  )

  // 处理文章页数
  props.postCount = props.posts.length
  // 处理分页
  const POST_LIST_STYLE = siteConfig(
    'POST_LIST_STYLE',
    'page',
    props?.NOTION_CONFIG
  )
  if (POST_LIST_STYLE === 'scroll') {
    // 滚动列表 给前端返回所有数据
  } else if (POST_LIST_STYLE === 'page') {
    props.posts = props.posts?.slice(
      0,
      siteConfig('POSTS_PER_PAGE', 12, props?.NOTION_CONFIG)
    )
  }

  delete props.allPages

  props = { ...props, category: categoryName }

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
  const from = 'category-paths'
  const { categoryOptions } = await fetchGlobalAllData({ from })
  const categories = Array.isArray(categoryOptions) ? categoryOptions : []
  return {
    paths: categories.map(category => ({
      params: { category: getTaxonomySlugs(category?.name, categories)[0] }
    })),
    fallback: true
  }
}
