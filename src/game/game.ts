import * as THREE from 'three'
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'
import type { Input } from '../engine/input'
import { Physics, RAPIER } from '../engine/physics'
import type { Renderer } from '../engine/renderer'
import type { Quality } from '../engine/save'
import { FollowCamera } from './camera'
import { CONFIG } from './config'
import { tuning } from './tuning'
import { Player, type PlayerEvent } from './player'
import { World } from './world'

export type Mode = 'attract' | 'playing' | 'paused'

/** A single walkable scene: move around, turn the camera, sprint and jump. No score or objective loop. */
export class Game {
  mode: Mode = 'attract'
  reducedMotion = false
  private readonly physics: Physics
  private readonly world: World
  private readonly player: Player
  private readonly cam: FollowCamera
  private time = 0
  private readonly down = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 })

  constructor(
    private readonly renderer: Renderer,
    private readonly input: Input,
    character: GLTF,
    shrine: GLTF,
  ) {
    this.physics = new Physics(CONFIG.player.gravity)
    this.world = new World(this.physics, renderer.shadowMapSize, shrine.scene)
    const idle = character.animations.find(clip => clip.name.toLowerCase().includes('idle')) ?? character.animations[0]
    const walk = character.animations.find(clip => clip.name.toLowerCase().includes('walk')) ?? character.animations[1]
    this.player = new Player(this.physics, this.world.spawn, this.world.movers, character.scene, idle, walk)
    this.cam = new FollowCamera(this.physics, this.player.collider)
    this.world.scene.add(this.player.root, this.player.shadowMesh)
    this.cam.reset(this.world.spawn, 0)
  }

  get camera(): THREE.PerspectiveCamera { return this.cam.camera }
  get position(): THREE.Vector3 { return this.player.position }

  start(): void {
    tuning.activate('run')
    this.player.teleport(this.world.spawn)
    this.player.facing = 0
    this.cam.pitch = 0.28
    this.cam.reset(this.world.spawn, 0)
    this.mode = 'playing'
    this.input.endFrame()
    this.input.takeLook()
  }

  pause(): void {
    if (this.mode !== 'playing') return
    this.player.stop()
    this.mode = 'paused'
  }

  resume(): void {
    if (this.mode !== 'paused') return
    this.mode = 'playing'
    this.input.endFrame()
    this.input.takeLook()
  }

  toTitle(): void {
    this.player.stop()
    this.player.teleport(this.world.spawn)
    this.mode = 'attract'
  }

  setQuality(quality: Quality): void {
    this.renderer.applyQuality(quality)
    const size = this.renderer.shadowMapSize
    const shadow = this.world.sun.shadow
    shadow.map?.dispose()
    shadow.map = null
    shadow.mapSize.set(size, size)
    this.world.scene.traverse(obj => {
      const material = (obj as THREE.Mesh).material
      for (const m of Array.isArray(material) ? material : material ? [material] : []) m.needsUpdate = true
    })
  }

  step(dt: number): void {
    this.time += dt
    const jumpPressed = this.input.consume('jump')
    this.world.stepMovers(this.time)
    if (this.mode === 'playing') {
      const events: PlayerEvent[] = []
      this.player.step(dt, {
        moveX: this.input.move.x,
        moveY: this.input.move.y,
        sprint: this.input.held('sprint'),
        jumpPressed,
        jumpHeld: this.input.held('jump'),
        touch: this.input.method === 'touch',
      }, this.cam.yaw, events)
      if (events.some(event => event.type === 'jump')) this.input.consume('jump')
    }
    this.physics.step(dt)
  }

  render(alpha: number, frameSeconds: number): void {
    this.physics.sync(alpha)
    const target = this.player.root.position
    if (this.mode === 'attract') {
      const angle = this.time * 0.055
      const cam = this.cam.camera
      cam.position.set(target.x + Math.sin(angle) * 13, target.y + 4.4, target.z + Math.cos(angle) * 13)
      cam.lookAt(target.x, target.y + 0.08, target.z)
    } else {
      const look = this.mode === 'playing' ? this.input.takeLook() : { x: 0, y: 0 }
      this.cam.update(target, look, frameSeconds, false, this.reducedMotion)
    }
    this.player.animate(frameSeconds, this.groundBelow(target))
    this.world.update(frameSeconds, target)
    this.renderer.render(this.world.scene, this.cam.camera)
  }

  private groundBelow(position: THREE.Vector3): number | null {
    this.down.origin = { x: position.x, y: position.y, z: position.z }
    const hit = this.physics.world.castRay(this.down, 12, true, undefined, undefined, this.player.collider)
    return hit ? position.y - hit.timeOfImpact : null
  }
}
