import { SCHEMA_VERSION } from '../types/index.ts'
import type { ProjectDocument, ProjectEdge, SimulationConfig, TaskGeneratorConfig } from '../types/index.ts'

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function migrateEdge(edge: ProjectEdge): ProjectEdge {
  return {
    ...edge,
    capacity: edge.capacity ?? 1,
  }
}

function defaultTaskGenerator(config: SimulationConfig): TaskGeneratorConfig | undefined {
  if (config.taskGenerator) {
    return config.taskGenerator
  }
  if (config.taskInterval > 0 && config.taskSourceId && config.taskTargetId) {
    return {
      mode: 'fixed',
      interval: config.taskInterval,
      sourceId: config.taskSourceId,
      targetId: config.taskTargetId,
      startTime: 0,
      maxTasks: config.taskCount > 0 ? config.taskCount : undefined,
    }
  }
  return undefined
}

/**
 * Migrate older project JSON (0.1 / 0.2 / missing) to current schema.
 * Never throws away unrecognized fields.
 */
export function migrateProject(raw: unknown): ProjectDocument {
  if (!isObject(raw)) {
    throw new Error('Invalid project: expected object')
  }
  const project = raw as unknown as ProjectDocument
  const schemaVersion = typeof project.schemaVersion === 'string' ? project.schemaVersion : '0.1'

  const simulationConfig: SimulationConfig = {
    seed: project.simulationConfig?.seed ?? 1,
    taskCount: project.simulationConfig?.taskCount ?? project.tasks?.length ?? 0,
    taskSourceId: project.simulationConfig?.taskSourceId,
    taskTargetId: project.simulationConfig?.taskTargetId,
    taskInterval: project.simulationConfig?.taskInterval ?? 0,
    untilTime: project.simulationConfig?.untilTime,
    enableTraffic: project.simulationConfig?.enableTraffic ?? true,
    taskGenerator: defaultTaskGenerator(project.simulationConfig ?? {
      seed: 1,
      taskCount: 0,
      taskInterval: 0,
    }),
  }

  const versionBump =
    schemaVersion === '0.1'
      ? 4
      : schemaVersion === '0.2'
        ? Math.max(4, project.project?.version ?? 2)
        : schemaVersion === '0.3'
          ? Math.max(4, project.project?.version ?? 3)
          : project.project?.version ?? 4

  const migrated: ProjectDocument = {
    ...project,
    schemaVersion: SCHEMA_VERSION,
    project: {
      name: project.project?.name ?? 'Untitled warehouse',
      version: versionBump,
    },
    devices: project.devices ?? [],
    nodes: project.nodes ?? [],
    edges: (project.edges ?? []).map(migrateEdge),
    tasks: project.tasks ?? [],
    simulationConfig,
    scenarios: project.scenarios,
    experiment: project.experiment,
    assets: project.assets ?? {
      agvModel: '',
      rackModel: '',
      stackerModel: '',
      conveyorModel: '',
    },
    signalMappings: project.signalMappings ?? [],
    industrial: project.industrial ?? {
      connections: [],
      signalMappings: [],
      ioMappings: [],
    },
  }

  return migrated
}

export function ensureSchemaVersion(document: ProjectDocument): ProjectDocument {
  if (document.schemaVersion === SCHEMA_VERSION) {
    return {
      ...document,
      edges: document.edges.map(migrateEdge),
      simulationConfig: {
        ...document.simulationConfig,
        enableTraffic: document.simulationConfig.enableTraffic ?? true,
      },
      assets: document.assets ?? {
        agvModel: '',
        rackModel: '',
        stackerModel: '',
        conveyorModel: '',
      },
      industrial: document.industrial ?? {
        connections: [],
        signalMappings: [],
        ioMappings: [],
      },
    }
  }
  return migrateProject(document)
}
