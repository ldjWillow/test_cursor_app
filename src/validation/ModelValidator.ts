import { DeviceType } from '../types/index.ts'
import type { AgvParams, ConveyorParams, ProjectDocument, StackerParams } from '../types/index.ts'
import { Graph, astar } from '../routing/Graph.ts'

export interface ValidationIssue {
  code: string
  message: string
  entityId?: string
}

export class ModelValidator {
  validate(project: ProjectDocument): ValidationIssue[] {
    const issues: ValidationIssue[] = []
    const deviceIds = new Set(project.devices.map((device) => device.id))
    const nodeIds = new Set([
      ...project.nodes.map((node) => node.id),
      ...project.devices
        .filter((device) =>
          device.type === DeviceType.Station ||
          device.type === DeviceType.PathNode ||
          device.type === DeviceType.Charger ||
          device.type === DeviceType.Rack ||
          device.type === DeviceType.Stacker,
        )
        .map((device) => device.id),
    ])

    const sources = project.devices.filter((device) => device.type === DeviceType.Source)
    const sinks = project.devices.filter((device) => device.type === DeviceType.Sink)
    const agvs = project.devices.filter((device) => device.type === DeviceType.Agv)
    const pathEdges = project.edges.filter((edge) => edge.kind === 'path' && edge.enabled)
    const flowEdges = project.edges.filter((edge) => edge.kind === 'flow' && edge.enabled)

    const hasTransportTasks =
      project.tasks.length > 0 ||
      (project.simulationConfig.taskCount > 0 &&
        Boolean(project.simulationConfig.taskSourceId) &&
        Boolean(project.simulationConfig.taskTargetId)) ||
      Boolean(project.simulationConfig.taskGenerator)

    const hasMaterialFlow = sources.length > 0 && (flowEdges.length > 0 || sinks.length > 0)

    if (!hasTransportTasks && !hasMaterialFlow) {
      issues.push({
        code: 'NO_WORKLOAD',
        message: 'Model has neither transport tasks nor a Source→flow material pipeline',
      })
    }

    if (hasMaterialFlow && sources.length === 0) {
      issues.push({ code: 'NO_SOURCE', message: 'Material flow requires at least one Source' })
    }
    if (hasMaterialFlow && sinks.length === 0 && project.devices.every((d) => d.type !== DeviceType.Stacker)) {
      issues.push({ code: 'NO_SINK', message: 'Material flow requires a Sink or Stacker destination' })
    }

    // Isolated path nodes (degree 0) among path graph.
    const degree = new Map<string, number>()
    for (const id of nodeIds) {
      degree.set(id, 0)
    }
    for (const edge of pathEdges) {
      degree.set(edge.from, (degree.get(edge.from) ?? 0) + 1)
      degree.set(edge.to, (degree.get(edge.to) ?? 0) + 1)
    }
    for (const [id, value] of degree) {
      if (value === 0 && nodeIds.has(id)) {
        const device = project.devices.find((item) => item.id === id)
        if (device?.type === DeviceType.PathNode) {
          issues.push({
            code: 'ISOLATED_NODE',
            message: `Isolated path node: ${device.name}`,
            entityId: id,
          })
        }
      }
    }

    for (const edge of project.edges) {
      if (!deviceIds.has(edge.from) && !nodeIds.has(edge.from)) {
        issues.push({
          code: 'EDGE_FROM_MISSING',
          message: `Edge ${edge.id} from missing node ${edge.from}`,
          entityId: edge.id,
        })
      }
      if (!deviceIds.has(edge.to) && !nodeIds.has(edge.to)) {
        issues.push({
          code: 'EDGE_TO_MISSING',
          message: `Edge ${edge.id} to missing node ${edge.to}`,
          entityId: edge.id,
        })
      }
    }

    for (const device of project.devices) {
      if (device.type === DeviceType.Agv) {
        const params = device.params as AgvParams
        if (params.speed <= 0) {
          issues.push({
            code: 'INVALID_SPEED',
            message: `${device.name} speed must be > 0`,
            entityId: device.id,
          })
        }
        if (params.capacity <= 0) {
          issues.push({
            code: 'INVALID_CAPACITY',
            message: `${device.name} capacity must be > 0`,
            entityId: device.id,
          })
        }
      }
      if (device.type === DeviceType.Conveyor) {
        const params = device.params as ConveyorParams
        if (params.speed <= 0) {
          issues.push({
            code: 'INVALID_SPEED',
            message: `${device.name} speed must be > 0`,
            entityId: device.id,
          })
        }
        if (params.capacity <= 0) {
          issues.push({
            code: 'INVALID_CAPACITY',
            message: `${device.name} capacity must be > 0`,
            entityId: device.id,
          })
        }
      }
      if (device.type === DeviceType.Stacker) {
        const params = device.params as StackerParams
        if (params.horizontalSpeed <= 0 || params.verticalSpeed <= 0) {
          issues.push({
            code: 'INVALID_SPEED',
            message: `${device.name} speeds must be > 0`,
            entityId: device.id,
          })
        }
        const outEdges = flowEdges.filter((edge) => edge.from === device.id)
        const inEdges = flowEdges.filter((edge) => edge.to === device.id)
        // Path-only stackers (AGV waypoints) may have zero flow edges.
        // Partial material-flow wiring must be complete and supported.
        if (inEdges.length + outEdges.length > 0) {
          if (inEdges.length === 0) {
            issues.push({
              code: 'STACKER_NO_IN',
              message: `${device.name} has no inbound flow edge`,
              entityId: device.id,
            })
          }
          if (outEdges.length === 0) {
            issues.push({
              code: 'STACKER_NO_OUT',
              message: `${device.name} has no outbound flow edge (requires Rack, Sink, or Conveyor)`,
              entityId: device.id,
            })
          }
          for (const edge of outEdges) {
            const target = project.devices.find((item) => item.id === edge.to)
            if (
              target &&
              target.type !== DeviceType.Rack &&
              target.type !== DeviceType.Sink &&
              target.type !== DeviceType.Conveyor
            ) {
              issues.push({
                code: 'STACKER_UNSUPPORTED_OUT',
                message: `${device.name} outbound to unsupported device type ${target.type}`,
                entityId: device.id,
              })
            }
          }
        }
      }
    }

    if (hasTransportTasks) {
      if (agvs.length === 0) {
        issues.push({ code: 'NO_AGV', message: 'Transport tasks require at least one AGV' })
      }
      if (pathEdges.length === 0) {
        issues.push({ code: 'NO_PATH', message: 'AGV transport requires path edges' })
      }

      const sourceId = project.simulationConfig.taskSourceId ?? project.tasks[0]?.sourceId
      const targetId = project.simulationConfig.taskTargetId ?? project.tasks[0]?.targetId
      if (sourceId && !deviceIds.has(sourceId) && !nodeIds.has(sourceId)) {
        issues.push({
          code: 'TASK_SOURCE_MISSING',
          message: `Task source ${sourceId} does not exist`,
          entityId: sourceId,
        })
      }
      if (targetId && !deviceIds.has(targetId) && !nodeIds.has(targetId)) {
        issues.push({
          code: 'TASK_TARGET_MISSING',
          message: `Task target ${targetId} does not exist`,
          entityId: targetId,
        })
      }

      if (sourceId && targetId && pathEdges.length > 0) {
        const graph = Graph.fromProject(
          [
            ...project.nodes,
            ...project.devices
              .filter((device) =>
                device.type === DeviceType.Station ||
                device.type === DeviceType.PathNode ||
                device.type === DeviceType.Charger ||
                device.type === DeviceType.Rack ||
                device.type === DeviceType.Stacker,
              )
              .map((device) => ({ id: device.id, x: device.x, y: device.y, label: device.name })),
          ],
          project.edges,
        )
        const route = astar(graph, sourceId, targetId)
        if (!route) {
          issues.push({
            code: 'UNREACHABLE_PATH',
            message: `No path from ${sourceId} to ${targetId}`,
          })
        }
      }
    }

    return issues
  }
}

export const modelValidator = new ModelValidator()
