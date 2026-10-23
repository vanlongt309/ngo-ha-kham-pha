// @ts-expect-error Vite config runs in Node; this starter intentionally omits @types/node from its app typecheck.
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs'
// @ts-expect-error Vite config runs in Node; this starter intentionally omits @types/node from its app typecheck.
import { extname, resolve } from 'node:path'
import { manusGameTuning } from './scripts/manus-tuning/vite.mjs'
import { loadEnv, type Plugin } from 'vite'
import { defineConfig } from 'vitest/config'

declare const process: { cwd(): string; env: Record<string, string | undefined> }

type LocalAssets = Map<string, string>
function storageMiddleware(localByStoragePath: LocalAssets) {
  return (request: any, response: any, next: (error?: unknown) => void) => {
    const pathname = new URL(request.url ?? '/', 'http://vite.local').pathname
    if (!pathname.startsWith('/manus-storage/game/sha256/')) return next()
    const file = localByStoragePath.get(pathname)
    if (!file || !existsSync(file)) return next()
    response.statusCode = 200
    response.setHeader('Content-Type', extname(file) === '.glb' ? 'model/gltf-binary' : 'image/png')
    response.setHeader('Content-Length', String(statSync(file).size))
    response.setHeader('Cache-Control', 'no-store')
    if (request.method === 'HEAD') return response.end()
    createReadStream(file).pipe(response)
  }
}

/** Serve registered Storage URLs from restored working copies in local dev and Preview only. */
function localStoragePreviewBridge(): Plugin {
  const root = process.cwd()
  const localByStoragePath: LocalAssets = new Map()
  try {
    const manifest = JSON.parse(readFileSync(resolve(root, 'assets.lock.json'), 'utf8')) as {
      assets?: Record<string, { path?: string }>
    }
    for (const [localPath, asset] of Object.entries(manifest.assets ?? {})) {
      if (asset.path?.startsWith('/manus-storage/game/sha256/')) localByStoragePath.set(asset.path, resolve(root, localPath))
    }
  } catch {
    // A missing/corrupt manifest is handled by the standard Vite request path and loader Retry.
  }

  return {
    name: 'game-local-storage-preview-bridge',
    configureServer(server) { server.middlewares.use(storageMiddleware(localByStoragePath)) },
    configurePreviewServer(server) { server.middlewares.use(storageMiddleware(localByStoragePath)) },
  }
}

// Relative base keeps production output portable; the Session owns preview HOST/PORT.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', ['HOST', 'PORT'])
  const port = Number(env.PORT ?? 3000)
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT')
  return {
    base: process.env.VITE_GITHUB_PAGES === 'true' ? '/ngo-ha-kham-pha/' : './',
    plugins: [manusGameTuning(), localStoragePreviewBridge()],
    server: {
      host: env.HOST ?? '127.0.0.1', port, strictPort: true,
      allowedHosts: ['.manuspre.computer', '.manus.computer', '.manus-asia.computer', '.manuscomputer.ai', '.manusvm.computer', 'localhost', '127.0.0.1'],
    },
    build: { target: 'es2022', assetsInlineLimit: 0, chunkSizeWarningLimit: 4600, sourcemap: false },
    test: { environment: 'node', include: ['tests/**/*.test.{ts,mjs}'] },
  }
})
