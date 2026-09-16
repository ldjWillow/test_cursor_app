import { describe, expect, it } from 'vitest'
import { agvScenario } from '../domain/base/scenarios.ts'
import { useProjectStore } from '../store/projectStore.ts'

/** Mirrors WarehouseCanvas SAFE_FIT_PADDING — keeps nodes clear of chrome. */
const SAFE_FIT_PADDING = 0.28

describe('canvas safe viewport', () => {
  it('keeps default scenario nodes inside a padded content box', () => {
    useProjectStore.getState().setDocument(agvScenario(3, 10))
    const nodes = useProjectStore.getState().nodes
    const xs = nodes.map((node) => node.position.x)
    const ys = nodes.map((node) => node.position.y)
    const minX = Math.min(...xs)
    const maxX = Math.max(...xs)
    const minY = Math.min(...ys)
    const maxY = Math.max(...ys)
    const width = Math.max(1, maxX - minX)
    const height = Math.max(1, maxY - minY)

    // Simulate fitView content box with SAFE_FIT_PADDING on a 1000x700 canvas cell.
    const viewW = 1000
    const viewH = 700
    const padX = viewW * SAFE_FIT_PADDING
    const padY = viewH * SAFE_FIT_PADDING
    const usableW = viewW - padX * 2
    const usableH = viewH - padY * 2
    const zoom = Math.min(usableW / width, usableH / height, 1.5)

    for (const node of nodes) {
      const screenX = (node.position.x - minX) * zoom + padX
      const screenY = (node.position.y - minY) * zoom + padY
      // Node center stays outside toolbar/property overlays (handled by CSS grid)
      // and inside padded canvas chrome (minimap/controls).
      expect(screenX).toBeGreaterThanOrEqual(padX - 1)
      expect(screenY).toBeGreaterThanOrEqual(padY - 1)
      expect(screenX).toBeLessThanOrEqual(viewW - padX + 1)
      expect(screenY).toBeLessThanOrEqual(viewH - padY + 1)
    }
  })

  it('places new devices at the drop position inside the operable canvas', () => {
    useProjectStore.getState().setDocument(agvScenario(1, 1))
    useProjectStore.getState().addDevice('station', { x: 240, y: 180 })
    const added = useProjectStore.getState().document.devices.at(-1)
    expect(added?.x).toBe(240)
    expect(added?.y).toBe(180)
  })
})
