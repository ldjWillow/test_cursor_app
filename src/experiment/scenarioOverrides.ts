import { DeviceType } from '../types/index.ts'
import type {
  AgvParams,
  PlacedDevice,
  ProjectDocument,
  ScenarioDefinition,
  ScenarioOverrides,
  StackerParams,
  TransportTask,
} from '../types/index.ts'
import { TaskStatus } from '../types/index.ts'
import { defaultParams } from '../domain/base/defaults.ts'
import { createUuid } from '../utils/id.ts'

function cloneProject(project: ProjectDocument): ProjectDocument {
  return structuredClone(project)
}

function asAgv(device: PlacedDevice): AgvParams {
  return device.params as AgvParams
}

function asStacker(device: PlacedDevice): StackerParams {
  return device.params as StackerParams
}

function rebuildTasks(
  project: ProjectDocument,
  count: number,
  interval?: number,
): TransportTask[] {
  const sourceId = project.simulationConfig.taskSourceId ?? project.tasks[0]?.sourceId
  const targetId = project.simulationConfig.taskTargetId ?? project.tasks[0]?.targetId
  if (!sourceId || !targetId || count <= 0) {
    return []
  }
  const step = interval ?? project.simulationConfig.taskInterval ?? 0
  return Array.from({ length: count }, (_, index) => ({
    id: `task-${index + 1}`,
    sourceId,
    targetId,
    createTime: step > 0 ? index * step : 0,
    priority: index + 1,
    status: TaskStatus.Waiting,
  }))
}

function setAgvCount(project: ProjectDocument, agvCount: number): ProjectDocument {
  const existing = project.devices.filter((device) => device.type === DeviceType.Agv)
  const others = project.devices.filter((device) => device.type !== DeviceType.Agv)
  const template = existing[0]
  const agvs: PlacedDevice[] = []
  for (let i = 0; i < agvCount; i += 1) {
    const previous = existing[i]
    if (previous) {
      agvs.push(previous)
      continue
    }
    const base = template ?? {
      id: createUuid('agv'),
      type: DeviceType.Agv,
      name: `AGV-${String(i + 1).padStart(2, '0')}`,
      x: 80,
      y: 80 + i * 36,
      params: defaultParams(DeviceType.Agv),
    }
    agvs.push({
      ...base,
      id: createUuid('agv'),
      name: `AGV-${String(i + 1).padStart(2, '0')}`,
      x: (template?.x ?? 80) + (i % 4) * 20,
      y: (template?.y ?? 80) + Math.floor(i / 4) * 36,
      params: { ...asAgv(base) },
    })
  }
  return { ...project, devices: [...others, ...agvs] }
}

/**
 * Apply scenario overrides onto a base project without mutating the original.
 */
export function applyScenarioOverrides(
  base: ProjectDocument,
  overrides: ScenarioOverrides,
): ProjectDocument {
  let project = cloneProject(base)

  if (overrides.agvCount !== undefined) {
    project = setAgvCount(project, Math.max(0, overrides.agvCount))
  }

  if (overrides.agvSpeed !== undefined) {
    project = {
      ...project,
      devices: project.devices.map((device) => {
        if (device.type !== DeviceType.Agv) {
          return device
        }
        return {
          ...device,
          params: { ...asAgv(device), speed: overrides.agvSpeed! },
        }
      }),
    }
  }

  if (overrides.stackerSpeed !== undefined) {
    project = {
      ...project,
      devices: project.devices.map((device) => {
        if (device.type !== DeviceType.Stacker) {
          return device
        }
        const params = asStacker(device)
        return {
          ...device,
          params: {
            ...params,
            horizontalSpeed: overrides.stackerSpeed!,
            verticalSpeed: overrides.stackerSpeed!,
          },
        }
      }),
    }
  }

  const taskCount = overrides.taskCount ?? project.simulationConfig.taskCount
  const taskInterval =
    overrides.taskInterval ??
    (overrides.taskGenerationRate !== undefined
      ? 3600 / Math.max(1e-6, overrides.taskGenerationRate)
      : project.simulationConfig.taskInterval)

  if (
    overrides.taskCount !== undefined ||
    overrides.taskInterval !== undefined ||
    overrides.taskGenerationRate !== undefined
  ) {
    project = {
      ...project,
      tasks: rebuildTasks(project, taskCount, taskInterval),
    }
  }

  project = {
    ...project,
    simulationConfig: {
      ...project.simulationConfig,
      seed: overrides.seed ?? project.simulationConfig.seed,
      taskCount,
      taskInterval,
      untilTime: overrides.untilTime ?? project.simulationConfig.untilTime,
      enableTraffic: overrides.enableTraffic ?? project.simulationConfig.enableTraffic,
      taskGenerator:
        overrides.taskGenerationRate !== undefined
          ? {
              mode: 'fixed',
              interval: taskInterval,
              sourceId: project.simulationConfig.taskSourceId,
              targetId: project.simulationConfig.taskTargetId,
              startTime: 0,
              maxTasks: taskCount > 0 ? taskCount : undefined,
            }
          : project.simulationConfig.taskGenerator,
    },
  }

  return project
}

export function defaultAgvScenarios(counts: number[] = [3, 4, 5, 6]): ScenarioDefinition[] {
  return counts.map((agvCount) => ({
    id: `scenario-agv-${agvCount}`,
    name: `${agvCount} AGVs`,
    overrides: { agvCount },
  }))
}
