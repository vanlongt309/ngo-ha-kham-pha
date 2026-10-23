import { afterEach, describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { CONFIG, DEFAULT_CONFIG } from '../src/game/config'
import { tuning } from '../src/game/tuning'
import { initPhysics, Physics } from '../src/engine/physics'
import { Player, locomotionBlend, walkAnimationRate, type PlayerIntent } from '../src/game/player'
import { FollowCamera } from '../src/game/camera'

const defaults = Object.fromEntries(tuning.controls.map(control => [control.id, control.default]))
afterEach(() => {
  tuning.apply(defaults)
  tuning.activate('jump')
  tuning.activate('run')
})

const idleIntent: PlayerIntent = { moveX: 0, moveY: 0, sprint: false, jumpPressed: false, jumpHeld: false }

describe('Three.js exploration tuning', () => {
  it('validates a whole patch before committing and preserves immutable defaults', () => {
    const before = tuning.read()
    for (const patch of [
      { 'player.walkSpeed': 8, 'camera.fov': 999 },
      { 'player.walkSpeed': 9 },
      { 'player.walkSpeed': 5.3 },
      { 'player.walkSpeed': '5.2' },
      { 'camera.fov': Infinity },
      { unknown: 4 },
    ]) {
      expect(() => tuning.apply(patch)).toThrow()
      expect(tuning.read()).toEqual(before)
    }
    tuning.apply({ 'player.walkSpeed': 6, 'player.sprintSpeed': 9 })
    expect(CONFIG.player.walkSpeed).toBe(6)
    expect(CONFIG.player.sprintSpeed).toBe(9)
    expect(DEFAULT_CONFIG.player.walkSpeed).toBe(2.6)
  })

  it('uses speed tuning in movement and activates jump tuning only at the jump boundary', async () => {
    await initPhysics()
    const physics = new Physics(CONFIG.player.gravity)
    const player = new Player(physics, new THREE.Vector3(0, 1, 0), [])
    try {
      player.grounded = true
      player.step(1 / 60, { ...idleIntent, moveX: 1 }, 0, [])
      const originalSpeed = player.velocity.x
      player.teleport(new THREE.Vector3(0, 1, 0))
      player.grounded = true
      tuning.apply({ 'player.walkSpeed': 5 })
      player.step(1 / 60, { ...idleIntent, moveX: 1 }, 0, [])
      expect(player.velocity.x).toBeGreaterThan(originalSpeed)

      tuning.apply({ 'player.jumpSpeed': 10 })
      expect(CONFIG.player.jumpSpeed).toBe(DEFAULT_CONFIG.player.jumpSpeed)
      const events: Array<{ type: 'jump' } | { type: 'land'; impact: number }> = []
      player.grounded = true
      player.step(1 / 60, { ...idleIntent, jumpPressed: true, jumpHeld: true }, 0, events)
      expect(CONFIG.player.jumpSpeed).toBe(10)
      expect(player.velocity.y).toBeCloseTo(10 + CONFIG.player.gravity / 60)
      expect(events.some(event => event.type === 'jump')).toBe(true)
    } finally { physics.dispose() }
  })

  it('makes touch-stick acceleration responsive while retaining a smooth ramp', async () => {
    await initPhysics()
    const physics = new Physics(CONFIG.player.gravity)
    const player = new Player(physics, new THREE.Vector3(0, 1, 0), [])
    try {
      player.grounded = true
      player.step(1 / 60, { ...idleIntent, moveY: 1 }, 0, [])
      const keyboardSpeed = player.velocity.length()
      player.teleport(new THREE.Vector3(0, 1, 0))
      player.grounded = true
      player.step(1 / 60, { ...idleIntent, moveY: 1, touch: true }, 0, [])
      const touchSpeed = player.velocity.length()
      expect(touchSpeed).toBeGreaterThan(keyboardSpeed)
      expect(touchSpeed).toBeLessThan(CONFIG.player.walkSpeed)
    } finally { physics.dispose() }
  })

  it('blends gait continuously and scales the walk cycle with real movement speed', () => {
    const walkSpeed = CONFIG.player.walkSpeed
    expect(locomotionBlend(0, true, walkSpeed)).toBe(0)
    expect(locomotionBlend(0.55, true, walkSpeed)).toBeGreaterThan(0)
    expect(locomotionBlend(0.55, true, walkSpeed)).toBeLessThan(1)
    expect(locomotionBlend(walkSpeed, true, walkSpeed)).toBe(1)
    expect(locomotionBlend(walkSpeed, false, walkSpeed)).toBe(0)
    expect(walkAnimationRate(0, walkSpeed)).toBe(0)
    expect(walkAnimationRate(walkSpeed, walkSpeed)).toBeGreaterThan(1.4)
    expect(walkAnimationRate(CONFIG.player.sprintSpeed, walkSpeed)).toBeGreaterThan(walkAnimationRate(walkSpeed, walkSpeed))
    expect(walkAnimationRate(CONFIG.player.sprintSpeed, walkSpeed)).toBeLessThanOrEqual(2.5)
  })

  it('eases acceleration and braking, and turns with momentum during a direction change', async () => {
    await initPhysics()
    const physics = new Physics(CONFIG.player.gravity)
    const player = new Player(physics, new THREE.Vector3(0, 1, 0), [])
    try {
      for (let i = 0; i < 24; i += 1) {
        player.grounded = true
        player.step(1 / 60, { ...idleIntent, moveY: 1 }, 0, [])
      }
      const cruising = Math.hypot(player.velocity.x, player.velocity.z)
      expect(cruising).toBeGreaterThan(CONFIG.player.walkSpeed * 0.55)
      expect(cruising).toBeLessThan(CONFIG.player.walkSpeed)

      player.grounded = true
      player.step(1 / 60, { ...idleIntent, moveX: 1 }, 0, [])
      expect(Math.abs(player.facing)).toBeLessThan(0.12)

      player.grounded = true
      player.step(1 / 60, idleIntent, 0, [])
      const immediatelyAfterRelease = Math.hypot(player.velocity.x, player.velocity.z)
      expect(immediatelyAfterRelease).toBeGreaterThan(0)
      expect(immediatelyAfterRelease).toBeLessThan(cruising)
      for (let i = 0; i < 60; i += 1) {
        player.grounded = true
        player.step(1 / 60, idleIntent, 0, [])
      }
      expect(Math.hypot(player.velocity.x, player.velocity.z)).toBeLessThan(0.2)
    } finally { physics.dispose() }
  })

  it('keeps forward and strafe on separate axes and faces the direction of travel', async () => {
    await initPhysics()
    const physics = new Physics(CONFIG.player.gravity)
    const model = new THREE.Group()
    const player = new Player(physics, new THREE.Vector3(0, 1, 0), [], model)
    try {
      player.grounded = true
      player.step(1 / 60, { ...idleIntent, moveY: 1 }, 0, [])
      expect(player.velocity.x).toBeCloseTo(0, 5)
      expect(player.velocity.z).toBeLessThan(0)
      player.animate(0, null)
      const forward = new THREE.Vector3(1, 0, 0).applyEuler(model.rotation)
      expect(forward.x).toBeCloseTo(0, 5)
      expect(forward.z).toBeCloseTo(-1, 5)

      player.teleport(new THREE.Vector3(0, 1, 0))
      player.grounded = true
      player.step(1 / 60, { ...idleIntent, moveX: 1 }, 0, [])
      expect(player.velocity.x).toBeGreaterThan(0)
      expect(player.velocity.z).toBeCloseTo(0, 5)
      for (let i = 0; i < 75; i += 1) player.step(1 / 60, { ...idleIntent, moveX: 1 }, 0, [])
      player.animate(0, null)
      const strafe = new THREE.Vector3(1, 0, 0).applyEuler(model.rotation)
      expect(strafe.x).toBeCloseTo(1, 5)
      expect(strafe.z).toBeCloseTo(0, 4)
    } finally { physics.dispose() }
  })

  it('updates the actual camera projection and follow distance', async () => {
    await initPhysics()
    const physics = new Physics()
    const player = new Player(physics, new THREE.Vector3(0, 1, 0), [])
    const camera = new FollowCamera(physics, player.collider)
    try {
      const before = camera.camera.projectionMatrix.clone()
      tuning.apply({ 'camera.fov': 72, 'camera.distance': 9 })
      camera.update(new THREE.Vector3(0, 1, 0), { x: 0, y: 0 }, 1, true)
      expect(camera.camera.fov).toBe(72)
      expect(camera.camera.projectionMatrix.equals(before)).toBe(false)
      expect(camera.camera.position.distanceTo(new THREE.Vector3(0, 1 + CONFIG.camera.height * 0.45, 0))).toBeCloseTo(9)
    } finally { physics.dispose() }
  })
})
