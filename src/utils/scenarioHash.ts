import type { ProjectDocument } from '../types/index.ts'

/** Stable short hash of model identity fields used by comparison/export. */
export function scenarioHash(project: ProjectDocument): string {
  const payload = JSON.stringify({
    seed: project.simulationConfig.seed,
    taskCount: project.simulationConfig.taskCount,
    taskSourceId: project.simulationConfig.taskSourceId,
    taskTargetId: project.simulationConfig.taskTargetId,
    taskInterval: project.simulationConfig.taskInterval,
    enableTraffic: project.simulationConfig.enableTraffic,
    devices: project.devices.map((device) => ({
      id: device.id,
      type: device.type,
      x: device.x,
      y: device.y,
      params: device.params,
    })),
    edges: project.edges.map((edge) => ({
      id: edge.id,
      from: edge.from,
      to: edge.to,
      kind: edge.kind,
      distance: edge.distance,
      enabled: edge.enabled,
    })),
    tasks: project.tasks.length,
  })
  let hash = 2166136261
  for (let i = 0; i < payload.length; i += 1) {
    hash ^= payload.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}
