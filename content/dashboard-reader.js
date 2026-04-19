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

// Human-like click — dispatch full mouse event sequence với coords thật
// Thay vì element.click() thuần (chỉ fire 'click' event), emit mouseover → mousemove → mousedown → mouseup → click
// với clientX/Y lấy từ bounding rect, giống user hover và click thật
async function humanClick(el) {
  if (!el) throw new Error('humanClick: element is null')
  const rect = el.getBoundingClientRect()
  // Target point với jitter nhỏ quanh center (không click chính xác giữa pixel)
  const x = rect.left + rect.width / 2 + (Math.random() - 0.5) * rect.width * 0.3
  const y = rect.top + rect.height / 2 + (Math.random() - 0.5) * rect.height * 0.3

  const fire = (type, delay = 0) => new Promise(r => setTimeout(() => {
    el.dispatchEvent(new MouseEvent(type, {
      bubbles: true, cancelable: true, view: window,
      clientX: x, clientY: y, button: 0, buttons: type === 'mousedown' ? 1 : 0,
    }))
    r()
  }, delay))

  // Scroll element vào view nếu cần (giống user scroll để thấy trước khi click)
  if (rect.top < 0 || rect.bottom > window.innerHeight) {
    el.scrollIntoView({ behavior: 'instant', block: 'center' })
    await new Promise(r => setTimeout(r, 200 + Math.random() * 150))
  }

  // Hover sequence
  await fire('mouseover', 0)
  await fire('mousemove', 30 + Math.random() * 50)
  await new Promise(r => setTimeout(r, 80 + Math.random() * 180)) // hover 80-260ms
  // Click sequence
  await fire('mousedown', 0)
  await new Promise(r => setTimeout(r, 40 + Math.random() * 80))  // press 40-120ms
  await fire('mouseup', 0)
  await fire('click', 0)
}

// Random delay helper — mimic human reaction time
const humanDelay = (min, max) => new Promise(r => setTimeout(r, min + Math.random() * (max - min)))

async function clickDateRange(optionText) {
  const trigger = document.querySelector('button.wt-menu__trigger[aria-haspopup="true"]')
  if (!trigger) throw new Error('Date Range trigger not found')
  await humanClick(trigger)
  await humanDelay(400, 800) // wait dropdown animate open

  const options = [...document.querySelectorAll('button.wt-options__item')]
  const opt = options.find(o => o.textContent.trim() === optionText)
  if (!opt) throw new Error(`Option ${optionText} not found`)
  await humanClick(opt)
  await humanDelay(1200, 2000) // wait DOM re-render stats
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
      // Random initial wait 3-6s — user reading dashboard before action
      await humanDelay(3000, 6000)

      // Today (default view)
      const todayStats = parseStats()
      chrome.runtime.sendMessage({ type: 'STATS_PARSED', payload: buildPayload(todayStats, 'today') })

      // Pause như user đọc số xong rồi mới switch
      await humanDelay(800, 1800)

      // Switch to Yesterday
      await clickDateRange('Yesterday')
      const ydayStats = parseStats()
      chrome.runtime.sendMessage({ type: 'STATS_PARSED', payload: buildPayload(ydayStats, 'yday') })

      // Pause before restoring
      await humanDelay(600, 1400)

      // Restore to Today
      await clickDateRange('Today')
      await humanDelay(800, 1500)

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
