import * as THREE from 'three'
import type { Physics } from '../engine/physics'
import { RAPIER } from '../engine/physics'

// Legacy pure helpers remain for existing level tests and unused starter modules.
export type Island = { x: number; z: number; top: number; r: number; cores: number; decor?: boolean }
export type MovingPlatform = {
  mesh: THREE.Mesh; body: RAPIER.RigidBody; from: THREE.Vector3; to: THREE.Vector3; period: number; phase: number;
  delta: THREE.Vector3; half: THREE.Vector3
}
export type DroneRoute = { center: THREE.Vector3; radius: number; phase: number; dir: 1 | -1 }
export const ISLANDS: Island[] = [
  { x: 0, z: 0, top: 0, r: 7, cores: 2 }, { x: 15, z: 3, top: 1.5, r: 4, cores: 2 },
  { x: 24, z: -8, top: 3.2, r: 3.5, cores: 2 }, { x: 14, z: -19, top: 4.8, r: 4.5, cores: 2 },
  { x: 0, z: -27, top: 6.5, r: 5, cores: 2 }, { x: -15, z: -16, top: 4.5, r: 4, cores: 2 },
  { x: -23, z: 1, top: 2.8, r: 3.5, cores: 2 }, { x: -11, z: 17, top: 1.2, r: 4.5, cores: 2 },
  { x: 7, z: 17, top: 2.5, r: 3.5, cores: 2 }, { x: 0, z: -12, top: 10.5, r: 3, cores: 3 },
]
export const PALETTE = {
  skyTop: new THREE.Color('#708d91'), horizon: new THREE.Color('#e6d9b9'), grass: new THREE.Color('#70865e'),
  grassDark: new THREE.Color('#50694f'), rock: new THREE.Color('#857c68'), rockDark: new THREE.Color('#585b51'),
  stone: new THREE.Color('#c4b18b'), leaf: [new THREE.Color('#416c52'), new THREE.Color('#5c805b'), new THREE.Color('#a06b45')],
  trunk: new THREE.Color('#63452f'), crystal: new THREE.Color('#7ee8ff'),
}
export function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
export function planStones(a: Island, b: Island): { x: number; z: number; top: number }[] {
  const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz), gap = d - a.r - b.r, dy = b.top - a.top
  let n = 0
  while ((gap - n * 1.8) / (n + 1) > 2.3 || Math.abs(dy) / (n + 1) > 1.05) n += 1
  const g = (gap - n * 1.8) / (n + 1), out: { x: number; z: number; top: number }[] = []
  for (let i = 1; i <= n; i += 1) {
    const along = a.r + g * i + 1.8 * (i - 0.5)
    out.push({ x: a.x + (dx / d) * along, z: a.z + (dz / d) * along, top: a.top + (dy * i) / (n + 1) })
  }
  return out
}

const HALF = 32
const flat = (color: string, roughness = 0.92) => new THREE.MeshStandardMaterial({ color, roughness, flatShading: true })

/** One continuous, collision-safe mountain garden. It is scenery for free exploration, not a route objective. */
export class World {
  readonly scene = new THREE.Scene()
  readonly sun: THREE.DirectionalLight
  readonly spawn = new THREE.Vector3(0, 0.93, 15)
  readonly movers: MovingPlatform[] = []
  readonly coreSpots: THREE.Vector3[] = []
  readonly droneRoutes: DroneRoute[] = []

  constructor(private readonly physics: Physics, shadowMapSize: number, shrineAsset: THREE.Object3D, private readonly treeAsset: THREE.Object3D) {
    const random = rng(2036)
    this.scene.background = PALETTE.horizon.clone()
    this.scene.fog = new THREE.Fog(PALETTE.horizon, 42, 118)
    this.scene.add(this.makeSky())
    this.scene.add(new THREE.HemisphereLight('#e4eee5', '#665446', 1.35))
    this.sun = new THREE.DirectionalLight('#fff0cf', 2.25)
    this.sun.position.set(22, 34, 12)
    this.sun.castShadow = true
    this.sun.shadow.mapSize.set(shadowMapSize, shadowMapSize)
    this.sun.shadow.camera.left = this.sun.shadow.camera.bottom = -34
    this.sun.shadow.camera.right = this.sun.shadow.camera.top = 34
    this.sun.shadow.camera.near = 1
    this.sun.shadow.camera.far = 105
    this.sun.shadow.bias = -0.00035
    this.sun.shadow.normalBias = 0.035
    this.scene.add(this.sun, this.sun.target)
    this.addGround()
    this.addPath()
    this.addBoundary()
    this.addTrees(random)
    this.addRocks(random)
    this.addLanterns()
    this.addShrine(shrineAsset)
    this.addMountains(random)
  }

  update(_dt: number, focus: THREE.Vector3): void {
    this.sun.position.set(focus.x + 22, focus.y + 34, focus.z + 12)
    this.sun.target.position.copy(focus)
  }

  stepMovers(_elapsed: number): void {}

  private addGround(): void {
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(HALF * 2, HALF * 2), flat('#748460'))
    ground.rotation.x = -Math.PI / 2
    ground.receiveShadow = true
    this.scene.add(ground)
    this.physics.addStaticBox(new THREE.Vector3(0, -0.19, 0), new THREE.Vector3(HALF * 2, 0.38, HALF * 2))
    const clearing = new THREE.Mesh(new THREE.CircleGeometry(27.2, 72), flat('#80906b'))
    clearing.rotation.x = -Math.PI / 2
    clearing.position.y = 0.008
    clearing.receiveShadow = true
    this.scene.add(clearing)
  }

  private addPath(): void {
    const points = [
      new THREE.Vector3(0, 0.035, 17), new THREE.Vector3(0.4, 0.035, 12), new THREE.Vector3(2.2, 0.035, 7),
      new THREE.Vector3(1.1, 0.035, 2), new THREE.Vector3(-1.8, 0.035, -3), new THREE.Vector3(-0.8, 0.035, -8),
      new THREE.Vector3(0.7, 0.035, -13), new THREE.Vector3(0, 0.035, -19),
    ]
    const curve = new THREE.CatmullRomCurve3(points)
    const segments = 120, halfWidth = 1.35
    const positions: number[] = [], indices: number[] = []
    for (let i = 0; i <= segments; i += 1) {
      const point = curve.getPointAt(i / segments)
      const tangent = curve.getTangentAt(i / segments).normalize()
      const side = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize()
      const left = point.clone().addScaledVector(side, -halfWidth)
      const right = point.clone().addScaledVector(side, halfWidth)
      positions.push(left.x, 0.052, left.z, right.x, 0.052, right.z)
      if (i < segments) {
        const a = i * 2, b = a + 1, c = a + 2, d = a + 3
        indices.push(a, b, c, b, d, c)
      }
    }
    const road = new THREE.BufferGeometry()
    road.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    road.setIndex(indices)
    road.computeVertexNormals()
    const path = new THREE.Mesh(road, flat('#c5ae7d'))
    path.receiveShadow = true
    this.scene.add(path)
    // Scattered paving stones soften the road edge without restricting movement.
    const stoneMat = flat('#ad9c77')
    for (let i = 0; i < 42; i += 1) {
      const t = (i + 0.5) / 42
      const p = curve.getPointAt(t)
      const tangent = curve.getTangentAt(t)
      const side = i % 2 ? 1 : -1
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.24, 0.055, 6), stoneMat)
      mesh.position.set(p.x + tangent.z * side * (1.25 + (i % 3) * 0.3), 0.035, p.z - tangent.x * side * (1.25 + (i % 3) * 0.3))
      mesh.rotation.y = i * 0.37
      mesh.receiveShadow = true
      this.scene.add(mesh)
    }
  }

  private addBoundary(): void {
    const wallMat = flat('#6d7263')
    const addWall = (x: number, z: number, sx: number, sz: number) => {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(sx, 5.2, sz), wallMat)
      wall.position.set(x, 2.35, z)
      wall.castShadow = true
      wall.receiveShadow = true
      this.scene.add(wall)
      this.physics.addStaticBox(wall.position, new THREE.Vector3(sx, 5.2, sz))
    }
    addWall(0, -31.5, 64, 1)
    addWall(0, 31.5, 64, 1)
    addWall(-31.5, 0, 1, 64)
    addWall(31.5, 0, 1, 64)
  }

  private addTrees(random: () => number): void {
    const coordinates = [-24, -18, -12, -7, 7, 12, 18, 24]
    for (const x of coordinates) {
      for (const z of [-24, -18, -12, -6, 0, 6, 12, 18, 24]) {
        if (Math.abs(x) < 8 && z > -22 && z < 20) continue
        if (random() < 0.12 || Math.hypot(x, z) > 29) continue
        this.addTree(x + (random() - 0.5) * 2.2, z + (random() - 0.5) * 2.2, 0.72 + random() * 0.48, random)
      }
    }
  }

  private addTree(x: number, z: number, scale: number, random: () => number): void {
    const group = new THREE.Group()
    group.position.set(x, 0, z)
    const tree = this.treeAsset.clone(true)
    const sourceBox = new THREE.Box3().setFromObject(tree)
    const sourceHeight = Math.max(sourceBox.getSize(new THREE.Vector3()).y, 0.01)
    const targetHeight = 5.6 * scale
    tree.scale.setScalar(targetHeight / sourceHeight)
    tree.rotation.y = random() * Math.PI * 2
    tree.updateWorldMatrix(true, true)
    const scaledBox = new THREE.Box3().setFromObject(tree)
    tree.position.y = -scaledBox.min.y
    tree.traverse(obj => {
      const mesh = obj as THREE.Mesh
      if (mesh.isMesh) { mesh.castShadow = true; mesh.receiveShadow = true }
    })
    group.add(tree)
    this.scene.add(group)
    this.physics.addStaticCylinder(new THREE.Vector3(x, 0.92 * scale, z), 0.38 * scale, 1.84 * scale)
  }

  private addRocks(random: () => number): void {
    const rockMat = flat('#85816d')
    for (let i = 0; i < 32; i += 1) {
      const side = i % 4
      const along = -26 + random() * 52
      const x = side < 2 ? along : (side === 2 ? -27 : 27)
      const z = side < 2 ? (side === 0 ? -27 : 27) : along
      const rock = new THREE.Mesh(new THREE.IcosahedronGeometry(0.6 + random() * 0.85, 0), rockMat)
      rock.position.set(x, 0.24, z)
      rock.scale.set(1.25, 0.72 + random() * 0.5, 1)
      rock.rotation.set(random() * 0.35, random() * Math.PI, random() * 0.25)
      rock.castShadow = true
      rock.receiveShadow = true
      this.scene.add(rock)
    }
  }

  private addLanterns(): void {
    for (const [x, z] of [[-3.8, 4], [4.2, -5], [-3.5, -13]] as const) {
      const group = new THREE.Group()
      group.position.set(x, 0, z)
      const stone = flat('#645c4d')
      const red = flat('#743f32')
      const glow = new THREE.MeshStandardMaterial({ color: '#f4c66a', emissive: '#e8a847', emissiveIntensity: 0.65, roughness: 0.4 })
      const base = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.22, 0.65), stone)
      base.position.y = 0.11
      const stem = new THREE.Mesh(new THREE.BoxGeometry(0.22, 1.05, 0.22), stone)
      stem.position.y = 0.72
      const housing = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.66, 0.45), glow)
      housing.position.y = 1.55
      const roof = new THREE.Mesh(new THREE.ConeGeometry(0.48, 0.32, 4), red)
      roof.position.y = 2.04
      roof.rotation.y = Math.PI / 4
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), flat('#b89554'))
      cap.position.y = 2.26
      group.add(base, stem, housing, roof, cap)
      group.traverse(obj => { if ((obj as THREE.Mesh).isMesh) { (obj as THREE.Mesh).castShadow = true; (obj as THREE.Mesh).receiveShadow = true } })
      this.scene.add(group)
    }
  }

  private addShrine(source: THREE.Object3D): void {
    const shrine = source.clone(true)
    shrine.position.set(0, 0, 0)
    shrine.scale.setScalar(1)
    shrine.updateWorldMatrix(true, true)
    const box = new THREE.Box3().setFromObject(shrine)
    const size = box.getSize(new THREE.Vector3())
    const factor = 5.2 / Math.max(size.y, 0.01)
    shrine.scale.setScalar(factor)
    shrine.position.set(0, -box.min.y * factor, -20.5)
    shrine.traverse(obj => {
      const mesh = obj as THREE.Mesh
      if (mesh.isMesh) { mesh.castShadow = true; mesh.receiveShadow = true }
    })
    this.scene.add(shrine)
    // Low stone approach pad is decorative and also keeps the gate visually grounded.
    const pad = new THREE.Mesh(new THREE.BoxGeometry(8.2, 0.18, 3.4), flat('#8a806c'))
    pad.position.set(0, 0.03, -20.2)
    pad.receiveShadow = true
    this.scene.add(pad)
  }

  private addMountains(random: () => number): void {
    const palette = ['#727f78', '#818579', '#687b78', '#8f8875']
    for (let i = 0; i < 18; i += 1) {
      const angle = (i / 18) * Math.PI * 2 + (random() - 0.5) * 0.16
      const radius = 50 + random() * 14
      const height = 13 + random() * 25
      const mountain = new THREE.Mesh(new THREE.ConeGeometry(6 + random() * 7, height, 7 + Math.floor(random() * 4), 2), flat(palette[i % palette.length]))
      mountain.position.set(Math.cos(angle) * radius, height / 2 - 2, Math.sin(angle) * radius)
      mountain.rotation.y = random() * Math.PI
      mountain.castShadow = false
      mountain.receiveShadow = false
      this.scene.add(mountain)
    }
  }

  private makeSky(): THREE.Mesh {
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { top: { value: PALETTE.skyTop }, horizon: { value: PALETTE.horizon }, sunDir: { value: new THREE.Vector3(18, 34, 12).normalize() } },
      vertexShader: `varying vec3 vDir; void main(){ vDir=normalize(position); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: `
uniform vec3 top;
uniform vec3 horizon;
uniform vec3 sunDir;
varying vec3 vDir;
void main() {
  float h = clamp(vDir.y, -1.0, 1.0);
  vec3 col = mix(horizon, top, pow(max(h, 0.0), 0.55));
  col = mix(col, horizon * 0.92, smoothstep(0.0, -0.4, h));
  float s = max(dot(normalize(vDir), sunDir), 0.0);
  col += vec3(1.0, 0.85, 0.6) * (pow(s, 600.0) * 2.2 + pow(s, 12.0) * 0.2);
  gl_FragColor = vec4(col, 1.0);
#include <colorspace_fragment>
}
`,
    })
    const sky = new THREE.Mesh(new THREE.SphereGeometry(400, 32, 16), mat)
    sky.renderOrder = -1
    return sky
  }
}
