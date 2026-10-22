import type { Input } from '../engine/input'

const STICK_DEAD_ZONE = 0.1
const STICK_CURVE = 1.08

/** Fixed MOBA-style movement stick, drag-to-look and jump control for touch devices. */
export class TouchControls {
  private stickId: number | null = null
  private lookId: number | null = null
  private origin = { x: 0, y: 0 }
  private last = { x: 0, y: 0 }
  private stickRadius = 38
  private floatingStick = false
  private readonly stick: HTMLElement
  private readonly knob: HTMLElement

  constructor(root: HTMLElement, private readonly input: Input, private readonly active: () => boolean) {
    const layer = root.querySelector<HTMLElement>('.touch')!
    this.stick = layer.querySelector('.touch-stick')!
    this.knob = this.stick.querySelector('i')!
    const enable = () => document.body.classList.add('has-touch')
    if (matchMedia('(pointer: coarse)').matches) enable()
    window.addEventListener('touchstart', enable, { once: true, passive: true })

    const canvas = document.querySelector<HTMLCanvasElement>('#game')!
    window.addEventListener('pointerdown', event => {
      if (event.pointerType !== 'touch') return
      this.input.method = 'touch'
      if (!this.active()) return

      const target = event.target instanceof Element ? event.target : null
      if (target?.closest('[data-touch]')) return
      const onStick = target ? this.stick.contains(target) : false
      const onCanvas = target === canvas
      if (!onStick && !onCanvas) return

      const inMovementArea = onStick || event.clientX < window.innerWidth * 0.45
      if (inMovementArea && this.stickId === null) {
        this.stickId = event.pointerId
        this.floatingStick = !onStick
        if (onStick) {
          const rect = this.stick.getBoundingClientRect()
          this.origin = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
        } else {
          this.origin = { x: event.clientX, y: event.clientY }
          this.stick.style.left = `${event.clientX - this.stick.offsetWidth / 2}px`
          this.stick.style.top = `${event.clientY - this.stick.offsetHeight / 2}px`
        }
        const rect = this.stick.getBoundingClientRect()
        this.stickRadius = Math.max(1, Math.min(rect.width, rect.height) / 2 - this.knob.offsetWidth / 2)
        this.stick.classList.add('is-active')
        this.updateStick(event.clientX, event.clientY)
        try { (onStick ? this.stick : canvas).setPointerCapture(event.pointerId) } catch { /* Synthetic pointer in smoke tests. */ }
        event.preventDefault()
        return
      }

      if (onCanvas && event.clientX >= window.innerWidth * 0.45 && this.lookId === null) {
        this.lookId = event.pointerId
        this.last = { x: event.clientX, y: event.clientY }
        try { canvas.setPointerCapture(event.pointerId) } catch { /* Synthetic pointer in smoke tests. */ }
        event.preventDefault()
      }
    }, { capture: true })

    window.addEventListener('pointermove', event => {
      if (event.pointerId === this.stickId) {
        this.updateStick(event.clientX, event.clientY)
      } else if (event.pointerId === this.lookId) {
        this.input.addTouchLook(event.clientX - this.last.x, event.clientY - this.last.y)
        this.last = { x: event.clientX, y: event.clientY }
      }
    })

    const end = (event: PointerEvent) => {
      if (event.pointerId === this.stickId) {
        this.stickId = null
        this.knob.style.transform = ''
        this.stick.classList.remove('is-active')
        this.input.setTouchMove(0, 0)
        if (this.floatingStick) {
          this.stick.style.left = ''
          this.stick.style.top = ''
        }
        this.floatingStick = false
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

  private updateStick(clientX: number, clientY: number): void {
    const dx = clientX - this.origin.x, dy = clientY - this.origin.y
    const length = Math.hypot(dx, dy)
    const amount = Math.min(1, length / this.stickRadius)
    const unitX = length > 0 ? dx / length : 0
    const unitY = length > 0 ? dy / length : 0
    const response = amount <= STICK_DEAD_ZONE
      ? 0
      : Math.pow((amount - STICK_DEAD_ZONE) / (1 - STICK_DEAD_ZONE), STICK_CURVE)
    const visual = Math.min(length, this.stickRadius)

    this.knob.style.transform = `translate(${unitX * visual}px, ${unitY * visual}px)`
    this.input.setTouchMove(unitX * response, -unitY * response)
  }
}
