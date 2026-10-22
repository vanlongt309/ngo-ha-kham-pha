import type { Input } from '../engine/input'

/** Floating movement stick, drag-to-look and jump control for touch devices. */
export class TouchControls {
  private stickId: number | null = null
  private lookId: number | null = null
  private origin = { x: 0, y: 0 }
  private last = { x: 0, y: 0 }
  private readonly stick: HTMLElement
  private readonly knob: HTMLElement

  constructor(root: HTMLElement, private readonly input: Input, private readonly active: () => boolean) {
    const layer = root.querySelector<HTMLElement>('.touch')!
    this.stick = layer.querySelector('.touch-stick')!
    this.knob = this.stick.querySelector('i')!
    const radius = 56
    const enable = () => document.body.classList.add('has-touch')
    if (matchMedia('(pointer: coarse)').matches) enable()
    window.addEventListener('touchstart', enable, { once: true, passive: true })
    window.addEventListener('pointerdown', event => { if (event.pointerType === 'touch') this.input.method = 'touch' }, { capture: true })

    const canvas = document.querySelector<HTMLCanvasElement>('#game')!
    canvas.addEventListener('pointerdown', event => {
      if (event.pointerType !== 'touch' || !this.active()) return
      if (event.clientX < window.innerWidth * 0.45 && this.stickId === null) {
        this.stickId = event.pointerId
        this.origin = { x: event.clientX, y: event.clientY }
        this.stick.style.left = `${event.clientX}px`
        this.stick.style.top = `${event.clientY}px`
        this.stick.classList.add('is-active')
      } else if (this.lookId === null) {
        this.lookId = event.pointerId
        this.last = { x: event.clientX, y: event.clientY }
      }
    })
    window.addEventListener('pointermove', event => {
      if (event.pointerId === this.stickId) {
        let dx = event.clientX - this.origin.x, dy = event.clientY - this.origin.y
        const length = Math.hypot(dx, dy)
        if (length > radius) { dx = dx / length * radius; dy = dy / length * radius }
        this.knob.style.transform = `translate(${dx}px, ${dy}px)`
        this.input.setTouchMove(dx / radius, -dy / radius)
      } else if (event.pointerId === this.lookId) {
        this.input.addTouchLook(event.clientX - this.last.x, event.clientY - this.last.y)
        this.last = { x: event.clientX, y: event.clientY }
      }
    })
    const end = (event: PointerEvent) => {
      if (event.pointerId === this.stickId) {
        this.stickId = null; this.knob.style.transform = ''; this.stick.classList.remove('is-active'); this.input.setTouchMove(0, 0)
      }
      if (event.pointerId === this.lookId) this.lookId = null
    }
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)
    for (const button of layer.querySelectorAll<HTMLElement>('[data-touch]')) {
      const action = button.dataset.touch as 'jump'
      button.addEventListener('pointerdown', event => {
        event.preventDefault(); button.setPointerCapture(event.pointerId); button.classList.add('is-down'); this.input.setTouchButton(action, true)
      })
      const release = () => { button.classList.remove('is-down'); this.input.setTouchButton(action, false) }
      button.addEventListener('pointerup', release)
      button.addEventListener('pointercancel', release)
    }
  }
}
