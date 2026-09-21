// Keep this script synchronous: apply the saved palette before the first paint.
// A same-origin file lets CSP block inline JavaScript without a changing hash.
(() => {
  let theme = 'light'
  try { if (localStorage.getItem('ecic-theme') === 'dark') theme = 'dark' } catch { /* Storage may be unavailable. */ }
  document.documentElement.dataset.theme = theme
  document.documentElement.style.colorScheme = theme
  document.documentElement.style.backgroundColor = theme === 'dark' ? '#181D21' : '#FAFBFC'
  document.querySelector('meta[name="theme-color"]').content = theme === 'dark' ? '#181D21' : '#FAFBFC'
})()
