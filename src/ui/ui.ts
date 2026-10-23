import type { I18n } from '../engine/i18n'
import type { Input } from '../engine/input'
import { type Quality, type SaveData, type SaveStore } from '../engine/save'
import { GAME_ASSETS } from '../game/assets'

const equipmentAsset = (file: string) => `${import.meta.env.BASE_URL}equipment/${file}`

export type Screen = 'boot' | 'title' | 'hud' | 'pause' | 'settings' | 'character'
export type UiActions = {
  play(): void
  resume(): void
  restart(): void
  quit(): void
  closeCharacter(): void
  settings(patch: Partial<SaveData>): void
}

/** Lightweight Vietnamese overlay for boot, title, exploration, pause and settings. */
export class Ui {
  screen: Screen = 'boot'
  private readonly root: HTMLElement
  private readonly stack: Screen[] = []
  private navRepeat = 0

  constructor(
    private readonly i18n: I18n,
    private readonly save: SaveStore,
    private readonly input: Input,
    private readonly actions: UiActions,
  ) {
    this.root = document.getElementById('ui')!
    this.root.innerHTML = this.template()
    this.root.addEventListener('click', event => this.onClick(event))
    this.root.addEventListener('input', event => this.onInput(event))
    window.addEventListener('keydown', event => this.onKey(event))
    this.translate()
    this.refreshSettings()
  }

  show(screen: Screen): void { this.stack.length = 0; this.setScreen(screen) }
  push(screen: Screen): void { this.stack.push(this.screen); this.setScreen(screen) }
  back(): void {
    const previous = this.stack.pop()
    if (previous) this.setScreen(previous)
    else if (this.screen === 'pause') this.actions.resume()
  }

  setBootProgress(progress: number): void {
    this.q<HTMLElement>('.boot-bar i').style.transform = `scaleX(${Math.max(0.04, Math.min(1, progress))})`
  }
  setBootStatus(text: string): void { this.q('.boot-label').textContent = text }
  failBoot(): void {
    this.q('.boot-error').classList.remove('is-hidden')
    this.q('.boot-label').textContent = this.i18n.t('boot.error')
    this.q<HTMLElement>('.boot-bar').classList.add('is-hidden')
    this.q<HTMLElement>('[data-action="retry"]').classList.remove('is-hidden')
  }
  updateHud(position: { x: number; z: number }): void {
    this.q('.hud-coordinate-value').textContent = `${Math.round(position.x)} · ${Math.round(position.z)}`
  }

  frame(frameSeconds: number): void {
    if (this.screen === 'hud' || this.screen === 'boot' || this.input.method !== 'gamepad') {
      if (this.screen !== 'hud') { this.input.consume('confirm'); this.input.consume('back') }
      return
    }
    const y = this.input.move.y, x = this.input.move.x
    this.navRepeat = Math.max(0, this.navRepeat - frameSeconds)
    const active = document.activeElement as HTMLElement | null
    if (Math.abs(y) > 0.6 && this.navRepeat <= 0) {
      this.moveFocus(y < 0 ? 1 : -1); this.navRepeat = 0.22
    } else if (Math.abs(x) > 0.6 && this.navRepeat <= 0 && active?.matches('input[type="range"]')) {
      const range = active as HTMLInputElement
      range.value = String(Number(range.value) + Math.sign(x) * Number(range.step || 0.1))
      range.dispatchEvent(new Event('input', { bubbles: true })); this.navRepeat = 0.12
    } else if (Math.abs(x) > 0.6 && this.navRepeat <= 0 && active?.parentElement?.matches('.seg')) {
      const sibling = (Math.sign(x) > 0 ? active.nextElementSibling : active.previousElementSibling) as HTMLElement | null
      sibling?.focus(); this.navRepeat = 0.22
    } else if (Math.abs(y) < 0.3 && Math.abs(x) < 0.3) this.navRepeat = 0
    if (this.input.consume('confirm')) active?.click()
    if (this.input.consume('back') && this.screen !== 'title') this.back()
  }

  refreshSettings(): void {
    this.q<HTMLInputElement>('[name="sensitivity"]').value = String(this.save.data.sensitivity)
    for (const toggle of this.qa<HTMLButtonElement>('.toggle')) {
      const key = toggle.dataset.setting as 'invertY' | 'reducedMotion'
      const on = this.save.data[key] === true
      toggle.setAttribute('aria-pressed', String(on))
      toggle.querySelector('.toggle-label')!.textContent = this.i18n.t(on ? 'settings.on' : 'settings.off')
    }
    for (const button of this.qa<HTMLButtonElement>('.seg[data-setting="quality"] button')) {
      button.setAttribute('aria-pressed', String(button.dataset.value === this.save.data.quality))
    }
    for (const range of this.qa<HTMLInputElement>('input[type="range"]')) {
      const fill = (Number(range.value) - Number(range.min)) / (Number(range.max) - Number(range.min)) * 100
      range.style.setProperty('--fill', `${fill}%`)
    }
  }

  private setScreen(screen: Screen): void {
    this.screen = screen
    for (const element of this.root.querySelectorAll<HTMLElement>('[data-screen]')) {
      const active = element.dataset.screen === screen || (element.dataset.screen === 'hud' && (screen === 'pause' || (screen === 'settings' && this.stack.includes('pause'))))
      element.classList.toggle('is-active', active)
      element.setAttribute('aria-hidden', String(!active))
    }
    this.root.dataset.activeScreen = screen
    requestAnimationFrame(() => {
      const first = this.navItems()[0]
      if (first && this.input.method !== 'touch') first.focus({ preventScroll: true })
      else (document.activeElement as HTMLElement | null)?.blur?.()
    })
  }

  private onClick(event: MouseEvent): void {
    const target = (event.target as HTMLElement).closest<HTMLElement>('[data-action], .toggle, .seg button')
    if (!target) return
    if (target.matches('.toggle')) {
      const key = target.dataset.setting as 'invertY' | 'reducedMotion'
      this.actions.settings({ [key]: !this.save.data[key] })
      this.refreshSettings()
      return
    }
    if (target.matches('.seg button')) {
      this.actions.settings({ quality: target.dataset.value as Quality })
      this.refreshSettings()
      return
    }
    switch (target.dataset.action) {
      case 'play': this.actions.play(); break
      case 'resume': this.actions.resume(); break
      case 'restart': this.actions.restart(); break
      case 'quit': this.actions.quit(); break
      case 'character-close': this.actions.closeCharacter(); break
      case 'settings': this.push('settings'); break
      case 'back': this.back(); break
      case 'pause': window.dispatchEvent(new CustomEvent('game:pause')); break
      case 'retry': window.location.reload(); break
    }
  }

  private onInput(event: Event): void {
    const element = event.target as HTMLInputElement
    if (element.type !== 'range') return
    const fill = (Number(element.value) - Number(element.min)) / (Number(element.max) - Number(element.min)) * 100
    element.style.setProperty('--fill', `${fill}%`)
    this.actions.settings({ [element.name]: Number(element.value) } as Partial<SaveData>)
  }

  private onKey(event: KeyboardEvent): void {
    if (this.screen === 'hud' || this.screen === 'boot') return
    const typing = (event.target as HTMLElement).matches?.('input, textarea')
    if (event.code === 'Escape' && this.screen === 'settings') {
      event.preventDefault(); this.input.consume('pause'); this.back(); return
    }
    if (event.code === 'Escape' && this.screen === 'character') {
      event.preventDefault(); this.input.consume('pause'); this.actions.closeCharacter(); return
    }
    if (event.code === 'Backspace' && !typing && this.screen !== 'title') { event.preventDefault(); this.back(); return }
    if (event.code === 'ArrowDown' || event.code === 'ArrowUp') {
      event.preventDefault(); this.moveFocus(event.code === 'ArrowDown' ? 1 : -1)
    }
  }

  private translate(): void {
    for (const element of this.root.querySelectorAll<HTMLElement>('[data-i18n]')) element.textContent = this.i18n.t(element.dataset.i18n!)
    for (const element of this.root.querySelectorAll<HTMLElement>('[data-i18n-label]')) element.setAttribute('aria-label', this.i18n.t(element.dataset.i18nLabel!))
    document.title = this.i18n.t('game.title')
  }
  private navItems(): HTMLElement[] {
    return [...this.root.querySelectorAll<HTMLElement>(`[data-screen="${this.screen}"] [data-nav]`)].filter(element => element.offsetParent !== null)
  }
  private moveFocus(direction: 1 | -1): void {
    const items = this.navItems()
    if (!items.length) return
    const current = items.indexOf(document.activeElement as HTMLElement)
    items[(current + direction + items.length) % items.length].focus()
  }
  private q<T extends HTMLElement = HTMLElement>(selector: string): T { return this.root.querySelector<T>(selector)! }
  private qa<T extends HTMLElement = HTMLElement>(selector: string): T[] { return [...this.root.querySelectorAll<T>(selector)] }

  private template(): string {
    const range = (name: string, key: string, min: number, max: number, step: number) => `<label class="setting-row"><span data-i18n="${key}"></span><input data-nav type="range" name="${name}" min="${min}" max="${max}" step="${step}"></label>`
    const toggle = (setting: string, key: string) => `<div class="setting-row"><span data-i18n="${key}"></span><button data-nav class="toggle" data-setting="${setting}" aria-pressed="false"><i></i><span class="toggle-label"></span></button></div>`
    return /* html */ `
<section class="screen screen-boot is-active" data-screen="boot" aria-live="polite">
  <div class="boot-card"><img class="boot-mark" src="${GAME_ASSETS.title.emblem}" alt=""><h1 class="boot-logo" data-i18n="game.title"></h1>
    <div class="boot-bar"><i></i></div><p class="boot-label" data-i18n="boot.loading"></p><p class="boot-error is-hidden" data-i18n="boot.error"></p>
    <button class="btn btn-primary is-hidden" data-action="retry"><span data-i18n="boot.retry"></span></button></div>
</section>
<section class="screen screen-title" data-screen="title"><div class="title-vignette"></div><div class="title-block">
  <p class="title-kicker" data-i18n="title.kicker"></p><div class="title-lockup"><img class="title-mark" src="${GAME_ASSETS.title.emblem}" alt=""><h1 class="logo-text" data-i18n="game.title"></h1></div>
  <p class="tagline" data-i18n="game.tagline"></p><nav class="menu"><button data-nav class="btn btn-primary" data-action="play"><span data-i18n="menu.play"></span><i aria-hidden="true">↗</i></button><button data-nav class="btn btn-quiet" data-action="settings"><span data-i18n="menu.settings"></span></button></nav>
  <div class="title-controls"><span class="eyebrow" data-i18n="title.controls"></span><div><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd><em data-i18n="controls.move"></em><kbd class="wide">Shift</kbd><em data-i18n="controls.run"></em><kbd class="wide">Space</kbd><em data-i18n="controls.jump"></em></div></div>
</div><footer class="title-footer"><span data-i18n="hud.location"></span><small>·</small><span data-i18n="hud.subtitle"></span></footer></section>
<section class="screen screen-hud" data-screen="hud">
  <header class="hud-place"><span class="place-seal">雲</span><div><b data-i18n="hud.location"></b><small data-i18n="hud.subtitle"></small></div></header>
  <button class="hud-pause" data-action="pause" data-i18n-label="touch.pause"><span aria-hidden="true">Ⅱ</span></button>
  <div class="hud-coordinate"><span data-i18n="hud.coordinates"></span><b class="hud-coordinate-value">0 · 0</b></div>
  <div class="hud-bottom"><span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd><i data-i18n="controls.move"></i></span><span><kbd>Shift</kbd><i data-i18n="controls.run"></i></span><span><kbd>Space</kbd><i data-i18n="controls.jump"></i></span><span><kbd>Esc</kbd><i data-i18n="controls.pause"></i></span></div>
  <div class="touch"><div class="touch-stick"><i></i></div><button class="touch-btn touch-jump" data-touch="jump"><span data-i18n="touch.jump"></span></button></div>
</section>
<section class="screen screen-modal" data-screen="pause"><div class="modal-card"><p class="title-kicker" data-i18n="hud.location"></p><h2 class="modal-title" data-i18n="pause.title"></h2><p class="modal-copy" data-i18n="pause.copy"></p>
  <nav class="menu"><button data-nav class="btn btn-primary" data-action="resume"><span data-i18n="menu.continue"></span></button><button data-nav class="btn" data-action="restart"><span data-i18n="menu.restart"></span></button><button data-nav class="btn btn-quiet" data-action="settings"><span data-i18n="menu.settings"></span></button><button data-nav class="btn btn-quiet" data-action="quit"><span data-i18n="menu.quit"></span></button></nav></div></section>
<section class="screen screen-modal" data-screen="settings"><div class="modal-card settings-card"><p class="title-kicker" data-i18n="settings.controls"></p><h2 class="modal-title" data-i18n="settings.title"></h2>
  <div class="settings-grid"><fieldset><legend data-i18n="settings.controls"></legend>${range('sensitivity','settings.sensitivity',0.2,3,0.1)}${toggle('invertY','settings.invertY')}</fieldset>
  <fieldset><legend data-i18n="settings.display"></legend><div class="setting-row"><span data-i18n="settings.quality"></span><div class="seg" data-setting="quality"><button data-nav data-value="low" data-i18n="settings.quality.low"></button><button data-nav data-value="medium" data-i18n="settings.quality.medium"></button><button data-nav data-value="high" data-i18n="settings.quality.high"></button></div></div>${toggle('reducedMotion','settings.reducedMotion')}</fieldset></div>
  <nav class="menu menu-row"><button data-nav class="btn btn-quiet" data-action="back"><span data-i18n="menu.back"></span></button></nav></div></section>
<section class="screen screen-modal character-screen" data-screen="character"><div class="modal-card character-card"><p class="title-kicker">HỒ SƠ NHÂN VẬT</p><h2 class="modal-title">LEO</h2><p class="character-subtitle">Nhà thám hiểm · Sơn Môn Vân Sơn</p>
  <div class="character-profile"><div><span>Tuổi</span><b>20</b></div><div><span>Chiều cao</span><b>1,78 m</b></div><div><span>Thể trạng</span><b>Gọn & khỏe</b></div></div>
  <h3 class="equipment-heading">TRANG BỊ ĐANG MANG</h3><div class="equipment-list">
    <div class="equipment-item"><div class="equipment-image"><img src="${equipmentAsset('jacket.png')}" alt="Áo khoác dã ngoại"></div><div class="equipment-copy"><i>01</i><b>Áo khoác dã ngoại</b><span>Áo khoác xanh navy / olive, có túi tiện dụng</span></div></div>
    <div class="equipment-item"><div class="equipment-image"><img src="${equipmentAsset('henley.png')}" alt="Áo henley"></div><div class="equipment-copy"><i>02</i><b>Áo henley</b><span>Áo henley màu be mặc bên trong</span></div></div>
    <div class="equipment-item"><div class="equipment-image"><img src="${equipmentAsset('cargo-pants.png')}" alt="Quần cargo"></div><div class="equipment-copy"><i>03</i><b>Quần cargo</b><span>Quần cargo olive với túi bên hông</span></div></div>
    <div class="equipment-item"><div class="equipment-image"><img src="${equipmentAsset('boots.png')}" alt="Boots leo núi"></div><div class="equipment-copy"><i>04</i><b>Boots leo núi</b><span>Boots da nâu, đế bám địa hình</span></div></div>
    <div class="equipment-item"><div class="equipment-image"><img src="${equipmentAsset('backpack.png')}" alt="Ba lô thám hiểm"></div><div class="equipment-copy"><i>05</i><b>Ba lô thám hiểm</b><span>Ba lô màu nâu, đựng vật dụng hành trình</span></div></div>
    <div class="equipment-item"><div class="equipment-image"><img src="${equipmentAsset('watch.png')}" alt="Đồng hồ dã ngoại"></div><div class="equipment-copy"><i>06</i><b>Đồng hồ dã ngoại</b><span>Đồng hồ đeo tay bên trái</span></div></div>
  </div><nav class="menu menu-row"><button data-nav class="btn btn-primary" data-action="character-close"><span>QUAY LẠI KHÁM PHÁ</span></button></nav></div></section>`
  }
}
