import { describe, expect, it } from 'vitest'
import { useProjectStore } from '../store/projectStore.ts'
import { stackerSinkScenario } from '../domain/base/scenarios.ts'

describe('scenario switch', () => {
  it('loads stacker sink via setDocument', () => {
    useProjectStore.getState().setDocument(stackerSinkScenario())
    expect(useProjectStore.getState().document.project.name).toBe('Source-Stacker-Sink')
    expect(useProjectStore.getState().document.devices.map((device) => device.type)).toEqual([
      'source',
      'stacker',
      'sink',
    ])
  })
})
