import { DeviceType } from '../types/index.ts'
import type { ProjectDocument, SimulationSnapshot } from '../types/index.ts'
import type { SimulationWorld } from '../simulation/SimulationWorld.ts'
import { defaultCoordinateTransformer } from '../coords/CoordinateTransformer.ts'
import type { CoordinateTransformer } from '../coords/CoordinateTransformer.ts'
import type {
  AgvRuntimeState,
  ConveyorRuntimeState,
  DeviceRuntimeState,
  DigitalTwinState,
  MaterialRuntimeState,
  OperatingMode,
  RackRuntimeState,
  StackerRuntimeState,
  StationRuntimeState,
  TaskRuntimeState,
} from './types.ts'

function agvRotation(path: string[] | undefined, graphLookup: (id: string) => { x: number; y: number } | undefined): number {
  if (!path || path.length < 2) {
    return 0
  }
  const from = graphLookup(path[path.length - 2] ?? '')
  const to = graphLookup(path[path.length - 1] ?? '')
  if (!from || !to) {
    return 0
  }
  return Math.atan2(to.y - from.y, to.x - from.x)
}

/**
 * Build Digital Twin state purely from simulation snapshot + optional world details.
 * Renderers must not invent business state beyond interpolation of these values.
 */
export function buildDigitalTwinState(input: {
  snapshot: SimulationSnapshot
  project: ProjectDocument
  world?: SimulationWorld
  operatingMode?: OperatingMode
  selectedDeviceId?: string
  revision?: number
  coords?: CoordinateTransformer
}): DigitalTwinState {
  const coords = input.coords ?? defaultCoordinateTransformer
  const devices: Record<string, DeviceRuntimeState> = {}
  const materials: Record<string, MaterialRuntimeState> = {}
  const tasks: Record<string, TaskRuntimeState> = {}
  const world = input.world

  const graphLookup = (id: string) => world?.graph.getNode(id)

  for (const view of input.snapshot.devices) {
    const worldPos = coords.deviceCanvasToWorld(view.x, view.y, 0)
    const projectDevice = input.project.devices.find((device) => device.id === view.id)

    if (view.type === DeviceType.Agv) {
      const runtime = world?.agvs.get(view.id)
      const kpi = input.snapshot.statistics.agvKpis.find((item) => item.id === view.id)
      const state: AgvRuntimeState = {
        id: view.id,
        name: view.name,
        type: 'agv',
        x: worldPos.x,
        y: worldPos.y,
        z: 0.15,
        rotation: agvRotation(view.path, graphLookup),
        status: view.status as AgvRuntimeState['status'],
        battery: runtime?.currentBattery ?? 100,
        currentTaskId: runtime?.currentTaskId,
        path: view.path,
        moveStartTime: view.moveStartTime,
        moveEndTime: view.moveEndTime,
        nodeId: runtime?.nodeId,
        travelDistance: kpi?.travelDistance ?? runtime?.travelDistance ?? 0,
        loadedTravelDistance: kpi?.loadedTravelDistance ?? runtime?.loadedTravelDistance ?? 0,
        emptyTravelDistance: kpi?.emptyTravelDistance ?? runtime?.emptyTravelDistance ?? 0,
        routeWaitingTime: kpi?.routeWaitingTime ?? runtime?.routeWaitingTime ?? 0,
        speed: runtime?.speed ?? 1.5,
      }
      devices[view.id] = state
      continue
    }

    if (view.type === DeviceType.Conveyor) {
      const runtime = world?.conveyors.get(view.id)
      const state: ConveyorRuntimeState = {
        id: view.id,
        name: view.name,
        type: 'conveyor',
        x: worldPos.x,
        y: worldPos.y,
        z: 0.2,
        status: view.status,
        running: view.occupancy > 0 || (runtime?.occupancy.length ?? 0) > 0,
        blocked: (runtime?.waiting.length ?? 0) > 0 && (runtime?.occupancy.length ?? 0) >= (runtime?.capacity ?? 1),
        fault: false,
        materialIds: runtime?.occupancy.map((item) => item.materialId) ?? [],
        occupancy: view.occupancy,
        queueLength: view.queueLength,
        length: runtime?.length ?? 10,
        speed: runtime?.speed ?? 1,
      }
      devices[view.id] = state
      continue
    }

    if (view.type === DeviceType.Stacker) {
      const runtime = world?.stackers.get(view.id)
      const state: StackerRuntimeState = {
        id: view.id,
        name: view.name,
        type: 'stacker',
        x: worldPos.x,
        y: worldPos.y,
        z: 0,
        liftHeight: (runtime?.currentLevel ?? 0) * (runtime?.levelHeight ?? 1.5),
        forkPosition: runtime?.busy ? 0.6 : 0,
        horizontalOffset: (runtime?.currentColumn ?? 0) * (runtime?.bayWidth ?? 1.2),
        status: view.status,
        busy: Boolean(runtime?.busy),
        fault: false,
        queueLength: view.queueLength,
        currentColumn: runtime?.currentColumn ?? 0,
        currentLevel: runtime?.currentLevel ?? 0,
      }
      devices[view.id] = state
      continue
    }

    if (view.type === DeviceType.Rack) {
      const runtime = world?.racks.get(view.id)
      const params = projectDevice?.params as { rows?: number; columns?: number; levels?: number } | undefined
      const locations =
        runtime?.locations.map((location) => ({
          row: location.row,
          column: location.column,
          level: location.level,
          occupied: location.occupied,
        })) ?? []
      const state: RackRuntimeState = {
        id: view.id,
        name: view.name,
        type: 'rack',
        x: worldPos.x,
        y: worldPos.y,
        z: 0,
        rows: runtime?.rows ?? params?.rows ?? 1,
        columns: runtime?.columns ?? params?.columns ?? 1,
        levels: runtime?.levels ?? params?.levels ?? 1,
        occupiedCount: locations.filter((location) => location.occupied).length,
        totalLocations: locations.length || view.occupancy,
        locations,
      }
      devices[view.id] = state
      continue
    }

    const state: StationRuntimeState = {
      id: view.id,
      name: view.name,
      type: view.type as StationRuntimeState['type'],
      x: worldPos.x,
      y: worldPos.y,
      z: 0,
      status: view.status,
      occupancy: view.occupancy,
      queueLength: view.queueLength,
    }
    devices[view.id] = state
  }

  if (world) {
    for (const material of world.materials.values()) {
      const host = devices[material.locationId]
      materials[material.id] = {
        id: material.id,
        x: host && 'x' in host ? host.x : 0,
        y: host && 'y' in host ? host.y : 0,
        z: 0.35,
        locationId: material.locationId,
        createdTime: material.createdTime,
        enterTime: material.enterTime,
        completeTime: material.completeTime,
      }
    }
    for (const task of world.tasks.values()) {
      tasks[task.id] = {
        id: task.id,
        sourceId: task.sourceId,
        targetId: task.targetId,
        status: task.status,
        createTime: task.createTime,
        assignTime: task.assignTime,
        startTime: task.startTime,
        finishTime: task.finishTime,
        agvId: task.agvId,
        priority: task.priority,
      }
    }
  }

  return {
    simulationTime: input.snapshot.time,
    status: input.snapshot.status,
    operatingMode: input.operatingMode ?? 'simulation',
    devices,
    materials,
    tasks,
    selectedDeviceId: input.selectedDeviceId,
    revision: input.revision ?? Date.now(),
  }
}
