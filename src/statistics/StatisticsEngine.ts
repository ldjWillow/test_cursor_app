import { AgvStatus } from '../types/index.ts'
import type {
  AgvKpi,
  Bottleneck,
  ResourceStats,
  StatisticsSnapshot,
  WaitingStatistics,
} from '../types/index.ts'
import type { SimulationWorld } from '../simulation/SimulationWorld.ts'
import type { AgvRuntime, ConveyorRuntime, StackerRuntime } from '../simulation/runtimeTypes.ts'
import type { TrafficManager } from '../traffic/TrafficManager.ts'
import { bottleneckAnalyzer } from './BottleneckAnalyzer.ts'

function utilization(busy: number, idle: number): number {
  const total = busy + idle
  if (total <= 0) {
    return 0
  }
  return busy / total
}

function closeAgv(agv: AgvRuntime, now: number): void {
  const dt = Math.max(0, now - agv.lastStatusChange)
  if (dt > 0 && agv.timeline.length > 0) {
    const last = agv.timeline[agv.timeline.length - 1]
    if (last) {
      last.endTime = now
    }
  }
  if (agv.status === AgvStatus.Idle || agv.status === AgvStatus.Charging) {
    agv.idleTime += dt
  } else if (agv.status === AgvStatus.Fault) {
    agv.faultTime += dt
  } else if (agv.status === AgvStatus.WaitingForRoute) {
    agv.waitingTime += dt
    agv.blockedTime += dt
  } else {
    agv.busyTime += dt
  }
  agv.lastStatusChange = now
}

function closeConveyor(conveyor: ConveyorRuntime, now: number): void {
  const dt = Math.max(0, now - conveyor.lastChangeTime)
  conveyor.occupancyIntegral += conveyor.occupancy.length * dt
  if (conveyor.occupancy.length > 0) {
    conveyor.busyTime += dt
  } else if (conveyor.waiting.length > 0) {
    conveyor.blockedTime += dt
  } else {
    conveyor.idleTime += dt
  }
  conveyor.lastChangeTime = now
}

function closeStacker(stacker: StackerRuntime, now: number): void {
  const dt = Math.max(0, now - stacker.lastStatusChange)
  if (stacker.busy) {
    stacker.busyTime += dt
  } else if (stacker.queue.length > 0) {
    stacker.blockedTime += dt
  } else {
    stacker.idleTime += dt
  }
  stacker.lastStatusChange = now
}

export class StatisticsEngine {
  snapshot(world: SimulationWorld, now: number, traffic?: TrafficManager): StatisticsSnapshot {
    for (const agv of world.agvs.values()) {
      closeAgv(agv, now)
    }
    for (const conveyor of world.conveyors.values()) {
      closeConveyor(conveyor, now)
    }
    for (const stacker of world.stackers.values()) {
      closeStacker(stacker, now)
    }

    const resources: ResourceStats[] = []
    let agvBusy = 0
    let agvIdle = 0
    let totalTravel = 0
    let totalEmpty = 0
    let totalRouteWait = 0
    const agvKpis: AgvKpi[] = []

    for (const agv of world.agvs.values()) {
      agvBusy += agv.busyTime
      agvIdle += agv.idleTime
      totalTravel += agv.travelDistance
      totalEmpty += agv.emptyTravelDistance
      totalRouteWait += agv.routeWaitingTime
      const util = utilization(agv.busyTime, agv.idleTime)
      const emptyRatio = agv.travelDistance > 0 ? agv.emptyTravelDistance / agv.travelDistance : 0
      resources.push({
        id: agv.id,
        name: agv.name,
        type: 'agv',
        busyTime: agv.busyTime,
        idleTime: agv.idleTime,
        blockedTime: agv.blockedTime,
        waitingTime: agv.waitingTime,
        faultTime: agv.faultTime,
        utilization: util,
        averageQueueLength: 0,
        completedCount: agv.completedCount,
      })
      agvKpis.push({
        id: agv.id,
        name: agv.name,
        travelDistance: agv.travelDistance,
        loadedTravelDistance: agv.loadedTravelDistance,
        emptyTravelDistance: agv.emptyTravelDistance,
        emptyTravelRatio: emptyRatio,
        taskCount: agv.taskCount,
        routeWaitingTime: agv.routeWaitingTime,
        utilization: util,
      })
    }

    let conveyorBusy = 0
    let conveyorIdle = 0
    for (const conveyor of world.conveyors.values()) {
      const idleTime = conveyor.idleTime > 0 ? conveyor.idleTime : Math.max(0, now - conveyor.busyTime)
      conveyorBusy += conveyor.busyTime
      conveyorIdle += idleTime
      const util = now > 0 ? conveyor.busyTime / now : 0
      const avgQueue = now > 0 ? conveyor.occupancyIntegral / now : conveyor.occupancy.length
      resources.push({
        id: conveyor.id,
        name: conveyor.name,
        type: 'conveyor',
        busyTime: conveyor.busyTime,
        idleTime,
        blockedTime: conveyor.blockedTime,
        waitingTime: conveyor.waitingTime,
        faultTime: conveyor.faultTime,
        utilization: util,
        averageQueueLength: avgQueue,
        completedCount: conveyor.completedCount,
      })
    }

    let stackerBusy = 0
    let stackerIdle = 0
    for (const stacker of world.stackers.values()) {
      stackerBusy += stacker.busyTime
      stackerIdle += stacker.idleTime
      const util = utilization(stacker.busyTime, stacker.idleTime)
      const avgQueue = stacker.queue.length
      resources.push({
        id: stacker.id,
        name: stacker.name,
        type: 'stacker',
        busyTime: stacker.busyTime,
        idleTime: stacker.idleTime,
        blockedTime: stacker.blockedTime,
        waitingTime: stacker.waitingTime,
        faultTime: stacker.faultTime,
        utilization: util,
        averageQueueLength: avgQueue,
        completedCount: stacker.completedCount,
      })
    }

    const hours = now / 3600
    const completedMaterialOrTasks = Math.max(world.completedCount, world.completedTasks)
    const throughput = hours > 0 ? completedMaterialOrTasks / hours : 0
    const averageWaitingTime =
      world.completedWaitSamples > 0 ? world.waitingTimeTotal / world.completedWaitSamples : 0
    const averageCycleTime =
      world.completedTasks > 0 ? world.cycleTimeTotal / world.completedTasks : 0
    const agvUtilization = utilization(agvBusy, agvIdle)
    const conveyorUtilization =
      conveyorBusy + conveyorIdle > 0 ? conveyorBusy / (conveyorBusy + conveyorIdle) : 0
    const stackerUtilization = utilization(stackerBusy, stackerIdle)
    const resourceList = [agvUtilization, conveyorUtilization, stackerUtilization].filter((value) => value > 0)
    const resourceUtilization =
      resourceList.length > 0 ? resourceList.reduce((sum, value) => sum + value, 0) / resourceList.length : 0

    const waiting: WaitingStatistics = {
      taskWaitingTime: world.taskWaitingTotal,
      routeWaitingTime: world.routeWaitingTotal,
      resourceWaitingTime: world.resourceWaitingTotal,
      loadingWaitingTime: world.loadingWaitingTotal,
    }

    const emptyTravelRatio = totalTravel > 0 ? totalEmpty / totalTravel : 0
    const noopTraffic = {
      allRouteWaiting: () => [] as Array<{ id: string; waitingTime: number }>,
    }
    const bottlenecks: Bottleneck[] = bottleneckAnalyzer.analyze({
      world,
      traffic: (traffic ?? noopTraffic) as unknown as TrafficManager,
      now,
      resources,
    })

    return {
      throughput,
      completedTasks: world.completedTasks,
      failedTasks: world.failedTasks,
      generatedCount: world.generatedCount,
      completedCount: world.completedCount,
      averageWaitingTime,
      averageCycleTime,
      resourceUtilization,
      agvUtilization,
      conveyorUtilization,
      stackerUtilization,
      idleTime: agvIdle + conveyorIdle + stackerIdle,
      busyTime: agvBusy + conveyorBusy + stackerBusy,
      averageQueueLength: world.averageQueueLength(now),
      waiting,
      emptyTravelRatio,
      routeWaitingTime: totalRouteWait,
      agvKpis,
      resources,
      bottlenecks,
    }
  }
}

export function markAgvStatus(agv: AgvRuntime, now: number, status: AgvStatus): void {
  closeAgv(agv, now)
  if (agv.timeline.length > 0) {
    const last = agv.timeline[agv.timeline.length - 1]
    if (last && last.status === status) {
      agv.status = status
      return
    }
  }
  agv.timeline.push({ status, startTime: now, endTime: now })
  agv.status = status
}

export function markConveyorOccupancy(conveyor: ConveyorRuntime, now: number): void {
  closeConveyor(conveyor, now)
}

export function markStackerBusy(stacker: StackerRuntime, now: number, busy: boolean): void {
  closeStacker(stacker, now)
  stacker.busy = busy
}
