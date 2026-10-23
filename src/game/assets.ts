/** Asset paths for the Manus Storage build and the self-contained GitHub Pages build. */
const onGitHubPages = import.meta.env.VITE_GITHUB_PAGES === 'true'
const asset = (file: string, storagePath: string) =>
  onGitHubPages ? `${import.meta.env.BASE_URL}game-assets/${file}` : storagePath

export const GAME_ASSETS = {
  title: {
    character: asset('leo.glb', '/game-assets/leo.glb'),
    emblem: asset('favicon.png', '/manus-storage/game/sha256/4539cdce0c06b948e70947314824000e844940517ceb03e3d6512aeb387ea3d0.png'),
  },
  map: {
    shrine: asset('mountain-shrine-gate.glb', '/manus-storage/game/sha256/486b71e3c13e80789a46d1481f3738e6263f938c58059f7c8faccccfeb8d8bf7.glb'),
    tree: asset('ancient-tree.glb', '/game-assets/ancient-tree.glb'),
  },
} as const
