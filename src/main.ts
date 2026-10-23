import './styles/main.css'
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { Assets } from './engine/assets'
import { I18n } from './engine/i18n'
import { Input } from './engine/input'
import { GameLoop } from './engine/loop'
import { SAVE_KEY, SaveStore, type SaveData } from './engine/save'
import { GAME_ASSETS } from './game/assets'
import type { Game } from './game/game'
import { TouchControls } from './ui/touch'
import { Ui } from './ui/ui'

let activeUi: Ui | undefined

async function boot(): Promise<void> {
  const canvas = document.querySelector<HTMLCanvasElement>('#game')!
  const firstRun = safeGet(SAVE_KEY) === null
  const save = new SaveStore()
  const i18n = new I18n('vi')
  const input = new Input(canvas)
  let game: Game | undefined
  let loop: GameLoop | undefined
  let lockLostAt = 0

  const applySettings = (data: SaveData) => {
    input.sensitivity = data.sensitivity
    input.invertY = data.invertY
    if (game) game.reducedMotion = data.reducedMotion
  }
  const start = () => {
    if (!game) return
    game.start()
    activeUi?.show('hud')
    loop?.resetAccumulator()
    input.lockPointer()
  }
  const pause = () => {
    if (game?.mode !== 'playing') return
    game.pause()
    activeUi?.show('pause')
    input.unlockPointer()
  }
  const resume = () => {
    if (game?.mode !== 'paused') return
    game.resume()
    activeUi?.show('hud')
    loop?.resetAccumulator()
    input.lockPointer()
  }

  const ui = new Ui(i18n, save, input, {
    play: start,
    resume,
    restart: start,
    quit: () => {
      game?.toTitle()
      ui.show('title')
      input.unlockPointer()
    },
    settings: patch => {
      const qualityChanged = patch.quality !== undefined && patch.quality !== save.data.quality
      save.update(patch)
      applySettings(save.data)
      if (qualityChanged) game?.setQuality(save.data.quality)
      ui.refreshSettings()
    },
  })
  activeUi = ui
  applySettings(save.data)
  ui.setBootStatus(i18n.t('boot.loading'))

  try {
    const [{ Game: GameClass }, { Renderer, suggestQuality }, physics] = await Promise.all([
      import('./game/game'), import('./engine/renderer'), import('./engine/physics'), document.fonts.ready,
    ])
    await physics.initPhysics()
    if (firstRun) {
      save.update({ quality: suggestQuality() })
      ui.refreshSettings()
    }

    const assets = new Assets()
    const offProgress = assets.onProgress(progress => ui.setBootProgress(0.08 + progress * 0.88))
    ui.setBootStatus(i18n.t('boot.models'))
    let character: GLTF, shrine: GLTF, tree: GLTF
    try {
      ;[character, shrine, tree] = await Promise.all([
        assets.gltf(GAME_ASSETS.title.character),
        assets.gltf(GAME_ASSETS.map.shrine),
        assets.gltf(GAME_ASSETS.map.tree),
      ])
    } finally {
      offProgress()
    }
    ui.setBootProgress(1)

    const renderer = new Renderer(canvas, save.data.quality)
    game = new GameClass(renderer, input, character, shrine, tree)
    game.reducedMotion = save.data.reducedMotion
    if (import.meta.env.DEV) {
      const [{ registerGameTuning }, { tuning }] = await Promise.all([
        import('../scripts/manus-tuning/adapter.js'), import('./game/tuning'),
      ])
      await registerGameTuning(tuning)
    }
    const g = game
    loop = new GameLoop({
      beforeFrame: () => input.update(),
      step: dt => g.step(dt),
      render: (alpha, frameSeconds) => {
        if (input.consume('pause') && performance.now() - lockLostAt > 300) {
          if (g.mode === 'playing') pause()
          else if (g.mode === 'paused' && ui.screen === 'pause') resume()
        }
        ui.frame(frameSeconds)
        if (loop) loop.paused = g.mode === 'paused'
        g.render(alpha, frameSeconds)
        if (g.mode === 'playing') ui.updateHud(g.position)
      },
    })
    loop.start()

    document.addEventListener('pointerlockchange', () => {
      if (!document.pointerLockElement && g.mode === 'playing' && input.method === 'keyboard') {
        lockLostAt = performance.now()
        pause()
      }
    })
    document.addEventListener('visibilitychange', () => { if (document.hidden) pause() })
    window.addEventListener('game:pause', pause)
    canvas.addEventListener('click', () => { if (g.mode === 'playing') input.lockPointer() })
    new TouchControls(document.getElementById('ui')!, input, () => g.mode === 'playing')
    window.setTimeout(() => ui.show('title'), 160)
    ;(window as unknown as { __game: unknown }).__game = { game: g, ui, input, save }
  } catch (error) {
    console.error('Game boot failed', error)
    ui.failBoot()
  }
}

function safeGet(key: string): string | null {
  try { return localStorage.getItem(key) } catch { return null }
}

void boot()
