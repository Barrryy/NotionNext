/* eslint no-dupe-keys: 'error' */

/**
 * 静态短链接配置
 *
 * 只在这里维护短链接：
 * - key 是一级路径，例如 github 对应 /github
 * - value 是目标地址，仅允许 http:// 或 https://
 * - slug 仅允许小写字母、数字和连字符
 * - 禁止32位的一级路径
 *
 * 重复的 key 不会被保留，请保持 ESLint 的 no-dupe-keys 规则开启。
 */
const SHORT_LINKS = Object.freeze({
  qt: 'https://barryzed.notion.site/Qt-4137754580108090bc96cf5b55997f0f'
})

/**
 * NotionNext 已有入口和静态资源目录。
 * 这些一级路径不会被短链接配置覆盖。
 */
const RESERVED_SHORT_LINK_SLUGS = Object.freeze([
  '_next',
  'admin',
  'api',
  'archive',
  'article',
  'auth',
  'category',
  'dashboard',
  'favicon.ico',
  'feed',
  'page',
  'robots.txt',
  'rss',
  'search',
  'sign-in',
  'sign-up',
  'sitemap.xml',
  'tag',
  'trpc',
  'user',
  // public 目录中的一级静态资源入口
  'ads.txt',
  'bead-pattern-generator',
  'brand',
  'css',
  'cus.html',
  'dplayer.htm',
  'favicon.png',
  'favicon.svg',
  'games-external',
  'icon-192.png',
  'icon-512.png',
  'images',
  'js',
  'manifest.json',
  'qrcode.png',
  'reward_code_alipay.png',
  'reward_code_wechat.png',
  'svg',
  'sw.js',
  'themes',
  'vendor',
  'videos',
  'webfonts'
])

const SHORT_LINK_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const FORBIDDEN_SLUG_LENGTH = 32
const SINGLE_SEGMENT_PATH_PATTERN = /^\/([^/]+)\/?$/
const NOTION_ID_PATH_PATTERN =
  /^(?:[a-z0-9]{32}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/
const RESERVED_SLUG_SET = new Set(RESERVED_SHORT_LINK_SLUGS)

function isValidHttpUrl(value) {
  if (typeof value !== 'string') {
    return false
  }

  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

/**
 * 开发环境加载配置时立即提示无效项，避免错误配置静默失效。
 */
function validateShortLinks() {
  if (process.env.NODE_ENV === 'production') {
    return
  }

  Object.entries(SHORT_LINKS).forEach(([slug, target]) => {
    const problems = []

    if (!SHORT_LINK_SLUG_PATTERN.test(slug)) {
      problems.push('slug 只能包含小写字母、数字和连字符')
    }

    if (RESERVED_SLUG_SET.has(slug)) {
      problems.push('slug 与 NotionNext 保留路径冲突，已忽略')
    }

    if (slug.length === FORBIDDEN_SLUG_LENGTH) {
      problems.push('slug 不能是 32 个字符长')
    }

    if (NOTION_ID_PATH_PATTERN.test(slug)) {
      problems.push('slug 形似 Notion ID，会继续交给 UUID_REDIRECT 处理')
    }

    if (!isValidHttpUrl(target)) {
      problems.push('目标地址必须是有效的 HTTP 或 HTTPS URL')
    }

    if (problems.length > 0) {
      console.warn(`[shortlinks] /${slug}: ${problems.join('；')}`)
    }
  })
}

/**
 * 仅解析 /slug 或 /slug/，多级路径继续交给 NotionNext。
 * @param {string} pathname
 * @returns {string | null}
 */
function resolveShortLink(pathname) {
  const match = SINGLE_SEGMENT_PATH_PATTERN.exec(pathname || '')
  const slug = match?.[1]

  if (
    !slug ||
    !SHORT_LINK_SLUG_PATTERN.test(slug) ||
    slug.length === FORBIDDEN_SLUG_LENGTH ||
    RESERVED_SLUG_SET.has(slug) ||
    NOTION_ID_PATH_PATTERN.test(slug) ||
    !Object.prototype.hasOwnProperty.call(SHORT_LINKS, slug)
  ) {
    return null
  }

  const target = SHORT_LINKS[slug]
  return isValidHttpUrl(target) ? target : null
}

validateShortLinks()

module.exports = {
  SHORT_LINKS,
  RESERVED_SHORT_LINK_SLUGS,
  resolveShortLink
}
