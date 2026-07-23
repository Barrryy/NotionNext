import { useEffect } from 'react'

export default function DisableCopy() {
  useEffect(() => {
    const html = document.getElementsByTagName('html')[0]
    const handleCopy = event => {
      event.preventDefault()
      alert('抱歉，本网页内容不可复制捏，想要分享的话请分享网址吧 :)\n如需复制代码，请使用代码块右上角的复制按钮（若无复制按钮请刷新页面）。')
    }

    html.classList.add('forbid-copy')
    document.addEventListener('copy', handleCopy)

    return () => {
      html.classList.remove('forbid-copy')
      document.removeEventListener('copy', handleCopy)
    }
  }, [])

  return null
}
