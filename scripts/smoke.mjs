// End-to-end smoke test for the Vietnamese Three.js exploration prototype.
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { chromium } from 'playwright'

const port = 4300 + Math.floor(Math.random() * 500)
const url = `http://127.0.0.1:${port}/`
const out = process.env.SHOTS_DIR ?? 'shots'
mkdirSync(out, { recursive: true })
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--port', String(port), '--strictPort', '--host', '127.0.0.1'], { stdio: 'ignore', detached: false })
let browser
const guard = setTimeout(() => fail('timed out'), 120_000)
function cleanup() { clearTimeout(guard); try { server.kill('SIGTERM') } catch {} }
async function fail(message) {
  console.error(`smoke: FAIL — ${message}`)
  await browser?.close().catch(() => {})
  cleanup()
  process.exit(1)
}
async function waitForServer() {
  for (let i = 0; i < 60; i += 1) {
    try { if ((await fetch(url)).ok) return } catch {}
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  throw new Error('preview server did not start')
}
async function openGame(context, errors) {
  const page = await context.newPage()
  page.on('console', message => message.type() === 'error' && errors.push(message.text()))
  page.on('pageerror', error => errors.push(String(error)))
  page.on('response', response => response.status() >= 400 && errors.push(`HTTP ${response.status()} ${response.url()}`))
  await page.goto(url)
  await page.waitForSelector('[data-screen="title"].is-active', { timeout: 45_000 })
  await page.evaluate(async () => {
    await document.fonts.ready
    if (document.documentElement.lang !== 'vi') throw new Error(`Expected vi locale, got ${document.documentElement.lang}`)
    if (document.title !== 'Ngộ Không') throw new Error(`Unexpected title: ${document.title}`)
    if (!document.querySelector('.title-mark')?.getAttribute('src')?.includes('/manus-storage/')) throw new Error('Game favicon/brand asset was not configured')
  })
  await page.waitForTimeout(450)
  return page
}
const state = page => page.evaluate(() => {
  const { game } = window.__game
  const p = game.position
  return { mode: game.mode, ui: window.__game.ui.screen, pos: { x: p.x, y: p.y, z: p.z } }
})

try {
  await waitForServer()
  const args = ['--ignore-gpu-blocklist', '--no-sandbox', '--disable-dev-shm-usage']
  const executablePath = process.env.CHROMIUM_BIN ?? (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined)
  const launchOptions = { args, ...(executablePath ? { executablePath } : {}) }
  browser = await chromium.launch(launchOptions).catch(() => chromium.launch({ args, channel: 'chrome' }))
  const errors = []
  const desktop = await browser.newContext({ viewport: { width: 1365, height: 850 }, locale: 'en-US' })
  const page = await openGame(desktop, errors)
  await page.screenshot({ path: `${out}/01-title.png` })

  await page.click('[data-action="play"]')
  await page.waitForSelector('[data-screen="hud"].is-active')
  const before = await state(page)
  await page.keyboard.down('KeyW')
  await page.waitForTimeout(850)
  await page.keyboard.up('KeyW')
  const afterWalk = await state(page)
  const moved = Math.hypot(afterWalk.pos.x - before.pos.x, afterWalk.pos.z - before.pos.z)
  if (afterWalk.mode !== 'playing') throw new Error(`expected playing, got ${afterWalk.mode}`)
  if (moved < 0.35) throw new Error(`player did not move enough (${moved.toFixed(2)} m)`)
  const beforeJump = afterWalk.pos.y
  await page.keyboard.down('Space')
  await page.waitForTimeout(180)
  const afterJump = await state(page)
  await page.keyboard.up('Space')
  if (afterJump.pos.y < beforeJump + 0.35) throw new Error('jump did not lift the character')
  await page.screenshot({ path: `${out}/02-gameplay.png` })
  console.log(`smoke: moved ${moved.toFixed(1)} m and jumped ${ (afterJump.pos.y - beforeJump).toFixed(1)} m`)

  await page.keyboard.press('Escape')
  await page.waitForSelector('[data-screen="pause"].is-active')
  await page.screenshot({ path: `${out}/03-pause.png` })
  await page.click('[data-screen="pause"] [data-action="settings"]')
  await page.waitForSelector('[data-screen="settings"].is-active')
  await page.click('[data-setting="quality"] [data-value="medium"]')
  await page.screenshot({ path: `${out}/04-settings.png` })
  await page.keyboard.press('Escape')
  await page.waitForSelector('[data-screen="pause"].is-active')
  if ((await state(page)).mode !== 'paused') throw new Error('leaving Settings with Escape resumed the session')
  await page.click('[data-action="resume"]')
  await page.waitForSelector('[data-screen="hud"].is-active')
  if ((await state(page)).mode !== 'playing') throw new Error('resume did not return to the exploration')
  await page.keyboard.press('Escape')
  await page.waitForSelector('[data-screen="pause"].is-active')
  await page.click('[data-action="quit"]')
  await page.waitForSelector('[data-screen="title"].is-active')
  await desktop.close()

  const phone = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'vi-VN' })
  const phonePage = await openGame(phone, errors)
  await phonePage.tap('[data-action="play"]')
  await phonePage.waitForSelector('[data-screen="hud"].is-active')
  const touchReady = await phonePage.evaluate(() => ({ touch: document.body.classList.contains('has-touch'), stick: getComputedStyle(document.querySelector('.touch-stick')).display, jump: getComputedStyle(document.querySelector('.touch-jump')).display }))
  if (!touchReady.touch || touchReady.stick === 'none' || touchReady.jump === 'none') throw new Error(`touch controls did not show: ${JSON.stringify(touchReady)}`)
  await phonePage.screenshot({ path: `${out}/05-phone-hud.png` })
  await phone.close()

  if (errors.length) throw new Error(`console/network errors:\n  ${errors.join('\n  ')}`)
  await browser.close()
  cleanup()
  console.log(`smoke: OK — screenshots in ${out}/`)
} catch (error) {
  await fail(error?.message ?? String(error))
}
