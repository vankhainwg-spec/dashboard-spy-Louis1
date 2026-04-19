// Content script — runs in page context. NOT ES module.
// Listens for SCRAPE_DASHBOARD message from service worker.

function parseStats() {
  const labels = ['Total Views', 'Visits', 'Orders', 'Revenue']
  const out = {}
  for (const label of labels) {
    const h3s = [...document.querySelectorAll('h3')].filter(el => el.textContent.trim() === label)
    const target = h3s.find(h3 => {
      const txt = h3.parentElement.innerText
      return txt.split('\n').length >= 2 && /\d/.test(txt)
    })
    if (target) {
      const lines = target.parentElement.innerText.split('\n').map(s => s.trim()).filter(Boolean)
      const value = lines[2] || lines[1]
      const delta = lines.find(l => l.includes('%'))
      out[label] = { value, delta }
    }
  }
  return out
}

function parseNum(s) {
  if (!s) return null
  return parseFloat(String(s).replace(/[^\d.-]/g, '')) || 0
}

function parseDelta(s) {
  if (!s) return null
  const neg = s.includes('↓') || s.includes('-')
  const n = parseFloat(String(s).replace(/[^\d.]/g, ''))
  if (isNaN(n)) return null
  return neg ? -n : n
}

async function clickDateRange(optionText) {
  const trigger = document.querySelector('button.wt-menu__trigger[aria-haspopup="true"]')
  if (!trigger) throw new Error('Date Range trigger not found')
  trigger.click()
  await new Promise(r => setTimeout(r, 500))
  const options = [...document.querySelectorAll('button.wt-options__item')]
  const opt = options.find(o => o.textContent.trim() === optionText)
  if (!opt) throw new Error(`Option ${optionText} not found`)
  opt.click()
  await new Promise(r => setTimeout(r, 1500))
}

function buildPayload(stats, period) {
  return {
    period,
    views: parseNum(stats['Total Views']?.value),
    visits: parseNum(stats['Visits']?.value),
    orders: parseNum(stats['Orders']?.value),
    revenue: parseNum(stats['Revenue']?.value),
    views_delta_pct: parseDelta(stats['Total Views']?.delta),
    visits_delta_pct: parseDelta(stats['Visits']?.delta),
    orders_delta_pct: parseDelta(stats['Orders']?.delta),
    revenue_delta_pct: parseDelta(stats['Revenue']?.delta),
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type !== 'SCRAPE_DASHBOARD') return

  ;(async () => {
    try {
      await new Promise(r => setTimeout(r, 3000))

      // Today (default view)
      const todayStats = parseStats()
      chrome.runtime.sendMessage({ type: 'STATS_PARSED', payload: buildPayload(todayStats, 'today') })

      // Switch to Yesterday
      await clickDateRange('Yesterday')
      const ydayStats = parseStats()
      chrome.runtime.sendMessage({ type: 'STATS_PARSED', payload: buildPayload(ydayStats, 'yday') })

      // Restore to Today
      await clickDateRange('Today')
      await new Promise(r => setTimeout(r, 1000))

      chrome.runtime.sendMessage({ type: 'DONE' })
      sendResponse({ ok: true })
    } catch (err) {
      chrome.runtime.sendMessage({ type: 'ERROR', error: err.message })
      sendResponse({ ok: false, error: err.message })
    }
  })()

  return true // async sendResponse
})

console.log('[DashboardSpy Louis1] Content script loaded')
