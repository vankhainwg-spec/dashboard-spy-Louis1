import { STORE_ID, DASHBOARD_URL, LARK_WORKER_URL, NOTIFY_SECRET } from '../shared/constants.js'
import { upsertStats } from '../shared/supabase.js'

let activeTabId = null
let currentCycle = null
let collectedStats = { today: null, yday: null }
let hasError = null

function etDate(offsetDays = 0) {
  return new Date(Date.now() + offsetDays * 86400000)
    .toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
}

function scheduleAlarms() {
  const now = new Date()
  const currentMin = now.getUTCHours() * 60 + now.getUTCMinutes()
  const targets = [
    { name: 'dash-8h',  utcMin: 56 },
    { name: 'dash-13h', utcMin: 356 },
    { name: 'dash-17h', utcMin: 596 },
  ]
  for (const t of targets) {
    let delay = t.utcMin - currentMin
    if (delay <= 0) delay += 24 * 60
    chrome.alarms.create(t.name, { delayInMinutes: delay, periodInMinutes: 24 * 60 })
    console.log(`[DashSpy ${STORE_ID}] ${t.name} in ${delay}min`)
  }
}

chrome.runtime.onInstalled.addListener(() => {
  scheduleAlarms()
  chrome.storage.local.set({ autoEnabled: true })
  console.log(`[DashSpy ${STORE_ID}] Installed`)
})

chrome.runtime.onStartup.addListener(() => {
  scheduleAlarms()
})

const cycleMap = {
  'dash-8h':  '8h sáng',
  'dash-13h': '13h trưa',
  'dash-17h': '17h chiều',
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  const cycleLabel = cycleMap[alarm.name]
  if (!cycleLabel) return
  const { autoEnabled } = await chrome.storage.local.get('autoEnabled')
  if (!autoEnabled) return

  // Jitter 0-90s
  const jitter = Math.floor(Math.random() * 90)
  console.log(`[DashSpy ${STORE_ID}] ${cycleLabel} in ${jitter}s`)
  await new Promise(r => setTimeout(r, jitter * 1000))

  await runScrape(cycleLabel)
})

async function runScrape(cycleLabel) {
  if (activeTabId) {
    console.log(`[DashSpy ${STORE_ID}] Already running, skip`)
    return
  }

  currentCycle = cycleLabel
  collectedStats = { today: null, yday: null }
  hasError = null

  try {
    const tab = await chrome.tabs.create({ url: DASHBOARD_URL, active: false })
    activeTabId = tab.id

    // Wait for content script to load
    await new Promise(r => setTimeout(r, 5000))

    // Send message to trigger scrape
    chrome.tabs.sendMessage(tab.id, { type: 'SCRAPE_DASHBOARD' }, (response) => {
      if (chrome.runtime.lastError) {
        console.error('[DashSpy] sendMessage error:', chrome.runtime.lastError.message)
      }
    })

    // Safety timeout: 60s
    setTimeout(() => {
      if (activeTabId === tab.id) {
        console.log(`[DashSpy ${STORE_ID}] Timeout, closing tab`)
        finishScrape('timeout')
      }
    }, 60000)
  } catch (err) {
    console.error('[DashSpy] runScrape error:', err.message)
    activeTabId = null
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!sender.tab || sender.tab.id !== activeTabId) return

  if (msg.type === 'STATS_PARSED') {
    const { period } = msg.payload
    const today = etDate(0)
    const yday = etDate(-1)
    const snapshot_date = period === 'yday' ? yday : today

    collectedStats[period] = msg.payload

    upsertStats({
      store_id: STORE_ID,
      snapshot_date,
      period,
      source: 'dashboard_scrape',
      views: msg.payload.views,
      visits: msg.payload.visits,
      orders: msg.payload.orders,
      revenue: msg.payload.revenue,
      views_delta_pct: msg.payload.views_delta_pct,
      visits_delta_pct: msg.payload.visits_delta_pct,
      orders_delta_pct: msg.payload.orders_delta_pct,
      revenue_delta_pct: msg.payload.revenue_delta_pct,
    }).then(() => {
      console.log(`[DashSpy ${STORE_ID}] Upserted ${period}`)
    }).catch(err => {
      console.error(`[DashSpy ${STORE_ID}] Upsert failed:`, err.message)
      hasError = err.message
    })
  }

  if (msg.type === 'DONE') {
    finishScrape('ok')
  }

  if (msg.type === 'ERROR') {
    hasError = msg.error
    finishScrape('error')
  }
})

async function finishScrape(status) {
  const tabId = activeTabId
  activeTabId = null

  if (tabId) {
    try { await chrome.tabs.remove(tabId) } catch {}
  }

  // Checkin to Lark worker
  try {
    await fetch(`${LARK_WORKER_URL}/notify/dashboard-spy-checkin`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${NOTIFY_SECRET}`,
      },
      body: JSON.stringify({
        store_id: STORE_ID,
        cycle: currentCycle,
        today: collectedStats.today,
        yday: collectedStats.yday,
        error: hasError || (status === 'timeout' ? 'timeout' : null),
      }),
    })
    console.log(`[DashSpy ${STORE_ID}] Checkin sent: ${currentCycle}`)
  } catch (e) {
    console.log(`[DashSpy ${STORE_ID}] Checkin failed:`, e.message)
  }

  currentCycle = null
  collectedStats = { today: null, yday: null }
  hasError = null
}

// Manual trigger from popup
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'MANUAL_RUN' && !sender.tab) {
    runScrape('manual').then(() => sendResponse({ ok: true }))
    return true
  }
})
