import * as THREE from 'three'
import { RAPIER, type Physics } from '../engine/physics'
import { CONFIG } from './config'
import { tuning } from './tuning'
import type { MovingPlatform } from './world'

export type PlayerIntent = { moveX: number; moveY: number; sprint: boolean; jumpPressed: boolean; jumpHeld: boolean; touch?: boolean }
export type PlayerEvent = { type: 'jump' } | { type: 'land'; impact: number }

const P = CONFIG.player
const UP = new THREE.Vector3(0, 1, 0)
const MODEL_SCALE = 1.82
// The Tripo GLB faces local +X; rotate it so its forward matches the game's -Z direction.
const MODEL_FORWARD_OFFSET = Math.PI / 2

/** Third-person free-movement controller backed by Rapier and the approved rigged Wukong GLB. */
export class Player {
  readonly root = new THREE.Group()
  readonly body: RAPIER.RigidBody
  readonly collider: RAPIER.Collider
  readonly velocity = new THREE.Vector3()
  readonly shadowMesh: THREE.Mesh
  grounded = false
  facing = 0
  private readonly controller: RAPIER.KinematicCharacterController
  private readonly character: THREE.Object3D
  private readonly mixer?: THREE.AnimationMixer
  private readonly idleAction?: THREE.AnimationAction
  private readonly walkAction?: THREE.AnimationAction
  private currentAction?: THREE.AnimationAction
  private coyote = 0
  private jumpBuffer = 0
  private jumping = false
  private platform?: MovingPlatform

  constructor(
    private readonly physics: Physics,
    spawn: THREE.Vector3,
    private readonly movers: MovingPlatform[],
    model?: THREE.Object3D,
    idleClip?: THREE.AnimationClip,
    walkClip?: THREE.AnimationClip,
  ) {
    const world = physics.world
    this.body = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(spawn.x, spawn.y, spawn.z))
    this.collider = world.createCollider(RAPIER.ColliderDesc.capsule(P.halfHeight, P.radius).setFriction(0), this.body)
    this.controller = world.createCharacterController(0.02)
    this.controller.enableAutostep(0.4, 0.25, false)
    this.controller.enableSnapToGround(0.35)
    this.controller.setMaxSlopeClimbAngle(THREE.MathUtils.degToRad(50))
    this.controller.setMinSlopeSlideAngle(THREE.MathUtils.degToRad(35))
    this.controller.setApplyImpulsesToDynamicBodies(true)
    this.root.position.copy(spawn)
    this.character = model ?? new THREE.Group()
    this.character.position.set(0, -(P.halfHeight + P.radius), 0)
    this.character.scale.setScalar(MODEL_SCALE)
    this.character.rotation.y = MODEL_FORWARD_OFFSET
    this.character.traverse(obj => {
      const mesh = obj as THREE.Mesh
      if (mesh.isMesh) { mesh.castShadow = true; mesh.receiveShadow = true }
    })
    this.root.add(this.character)
    if (idleClip && walkClip) {
      this.mixer = new THREE.AnimationMixer(this.character)
      this.idleAction = this.mixer.clipAction(idleClip).setLoop(THREE.LoopRepeat, Infinity)
      this.walkAction = this.mixer.clipAction(walkClip).setLoop(THREE.LoopRepeat, Infinity)
      this.idleAction.play()
      this.currentAction = this.idleAction
    }
    physics.bind(this.body, this.root)
    this.shadowMesh = new THREE.Mesh(
      new THREE.CircleGeometry(P.radius * 1.55, 28),
      new THREE.MeshBasicMaterial({ color: '#27332b', transparent: true, opacity: 0.25, depthWrite: false }),
    )
    this.shadowMesh.rotation.x = -Math.PI / 2
    this.shadowMesh.renderOrder = 1
  }

  get position(): THREE.Vector3 {
    const t = this.body.translation()
    return new THREE.Vector3(t.x, t.y, t.z)
  }

  step(dt: number, intent: PlayerIntent, cameraYaw: number, events: PlayerEvent[]): void {
    const forward = new THREE.Vector3(-Math.sin(cameraYaw), 0, -Math.cos(cameraYaw))
    const right = new THREE.Vector3().crossVectors(forward, UP)
    const wish = new THREE.Vector3().addScaledVector(right, intent.moveX).addScaledVector(forward, intent.moveY)
    const wishLen = Math.min(1, wish.length())
    if (wishLen > 0.01) wish.normalize()

    this.coyote = this.grounded ? P.coyoteTime : Math.max(0, this.coyote - dt)
    this.jumpBuffer = intent.jumpPressed ? P.jumpBuffer : Math.max(0, this.jumpBuffer - dt)
    const speed = (intent.sprint ? P.sprintSpeed : P.walkSpeed) * wishLen
    const control = this.grounded ? 1 : P.airControl
    const target = wish.clone().multiplyScalar(speed)
    const horizontal = new THREE.Vector3(this.velocity.x, 0, this.velocity.z)
    const response = (P.acceleration / (intent.touch ? 3 : 6)) * control
    horizontal.lerp(target, 1 - Math.exp(-response * dt))
    this.velocity.x = horizontal.x
    this.velocity.z = horizontal.z

    if (this.jumpBuffer > 0 && this.coyote > 0) {
      tuning.activate('jump')
      this.velocity.y = P.jumpSpeed
      this.jumping = true
      this.jumpBuffer = 0
      this.coyote = 0
      this.grounded = false
      this.platform = undefined
      events.push({ type: 'jump' })
    }
    const rising = this.velocity.y > 0
    const gravity = rising && this.jumping && !intent.jumpHeld ? P.lowJumpGravity : P.gravity
    this.velocity.y = Math.max(P.maxFall, this.velocity.y + gravity * dt)

    if (wishLen > 0.1) this.facing = dampAngle(this.facing, Math.atan2(-wish.x, -wish.z), P.turnSpeed, dt)

    const desired = this.velocity.clone().multiplyScalar(dt)
    if (this.platform) desired.add(this.platform.delta)
    this.controller.computeColliderMovement(this.collider, desired)
    const moved = this.controller.computedMovement()
    const wasGrounded = this.grounded
    this.grounded = this.controller.computedGrounded()
    if (this.velocity.y > 0 && moved.y < desired.y - 1e-3) this.velocity.y = 0
    if (this.grounded) {
      if (!wasGrounded && this.velocity.y < -6) events.push({ type: 'land', impact: Math.min(1, -this.velocity.y / 30) })
      if (this.velocity.y < 0) this.velocity.y = -1
      this.jumping = false
    }
    const cur = this.body.translation()
    const next = { x: cur.x + moved.x, y: cur.y + moved.y, z: cur.z + moved.z }
    this.body.setNextKinematicTranslation(next)
    this.platform = this.grounded ? this.findPlatform(next) : undefined
  }

  stop(): void {
    this.velocity.x = 0
    this.velocity.z = 0
  }

  teleport(to: THREE.Vector3): void {
    this.body.setTranslation(to, true)
    this.body.setNextKinematicTranslation(to)
    this.velocity.set(0, 0, 0)
    this.platform = undefined
    this.grounded = false
    this.jumping = false
    this.root.position.copy(to)
    this.physics.snap(this.body)
  }

  animate(frameSeconds: number, ground: number | null): void {
    const speed = Math.hypot(this.velocity.x, this.velocity.z)
    this.character.rotation.y = this.facing + MODEL_FORWARD_OFFSET
    const next = speed > 0.55 && this.grounded ? this.walkAction : this.idleAction
    if (next && next !== this.currentAction) {
      next.reset().play()
      if (this.currentAction) next.crossFadeFrom(this.currentAction, 0.2, false)
      this.currentAction = next
    }
    if (this.walkAction) this.walkAction.setEffectiveTimeScale(THREE.MathUtils.clamp(speed / P.walkSpeed, 0.72, 1.55))
    this.mixer?.update(frameSeconds)

    if (ground === null) {
      this.shadowMesh.visible = false
      return
    }
    const feet = this.root.position.y - P.halfHeight - P.radius
    const height = Math.max(0, feet - ground)
    this.shadowMesh.visible = height < 8
    this.shadowMesh.position.set(this.root.position.x, ground + 0.035, this.root.position.z)
    const scale = THREE.MathUtils.clamp(1 - height / 8, 0.25, 1)
    this.shadowMesh.scale.setScalar(scale)
    ;(this.shadowMesh.material as THREE.MeshBasicMaterial).opacity = 0.25 * scale
  }

  private findPlatform(pos: { x: number; y: number; z: number }): MovingPlatform | undefined {
    const feet = pos.y - P.halfHeight - P.radius
    return this.movers.find(m => {
      const c = m.body.translation(), top = c.y + m.half.y
      return Math.abs(feet - top) < 0.2 && Math.abs(pos.x - c.x) < m.half.x + P.radius * 0.6 && Math.abs(pos.z - c.z) < m.half.z + P.radius * 0.6
    })
  }
}

function dampAngle(from: number, to: number, lambda: number, dt: number): number {
  let delta = (to - from) % (Math.PI * 2)
  if (delta > Math.PI) delta -= Math.PI * 2
  if (delta < -Math.PI) delta += Math.PI * 2
  return from + delta * (1 - Math.exp(-lambda * dt))
}
