import { AgvStatus } from '../types/index.ts'
import type { Bottleneck, ResourceStats, StatisticsSnapshot } from '../types/index.ts'
import type { SimulationWorld } from '../simulation/SimulationWorld.ts'
import type { AgvRuntime, ConveyorRuntime, StackerRuntime } from '../simulation/runtimeTypes.ts'

const UTILIZATION_THRESHOLD = 0.9
const QUEUE_THRESHOLD = 8

function utilization(busy: number, idle: number): number {
  const total = busy + idle
  if (total <= 0) {
    return 0
  }
  return busy / total
}

function closeAgv(agv: AgvRuntime, now: number): void {
  const dt = Math.max(0, now - agv.lastStatusChange)
  if (agv.status === AgvStatus.Idle || agv.status === AgvStatus.Charging || agv.status === AgvStatus.Fault) {
    agv.idleTime += dt
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
  }
  conveyor.lastChangeTime = now
}

function closeStacker(stacker: StackerRuntime, now: number): void {
  const dt = Math.max(0, now - stacker.lastStatusChange)
  if (stacker.busy) {
    stacker.busyTime += dt
  } else {
    stacker.idleTime += dt
  }
  stacker.lastStatusChange = now
}

export class StatisticsEngine {
  snapshot(world: SimulationWorld, now: number): StatisticsSnapshot {
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
    const bottlenecks: Bottleneck[] = []

    let agvBusy = 0
    let agvIdle = 0
    for (const agv of world.agvs.values()) {
      agvBusy += agv.busyTime
      agvIdle += agv.idleTime
      const util = utilization(agv.busyTime, agv.idleTime)
      resources.push({
        id: agv.id,
        name: agv.name,
        type: 'agv',
        busyTime: agv.busyTime,
        idleTime: agv.idleTime,
        utilization: util,
        averageQueueLength: 0,
      })
      if (util > UTILIZATION_THRESHOLD) {
        bottlenecks.push({
          id: agv.id,
          name: agv.name,
          reason: `Utilization: ${(util * 100).toFixed(1)}%`,
          utilization: util,
        })
      }
    }

    let conveyorBusy = 0
    let conveyorIdle = 0
    for (const conveyor of world.conveyors.values()) {
      const idleTime = Math.max(0, now - conveyor.busyTime)
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
        utilization: util,
        averageQueueLength: avgQueue,
      })
      if (util > UTILIZATION_THRESHOLD) {
        bottlenecks.push({
          id: conveyor.id,
          name: conveyor.name,
          reason: `Utilization: ${(util * 100).toFixed(1)}%`,
          utilization: util,
          averageQueueLength: avgQueue,
        })
      }
      if (avgQueue > QUEUE_THRESHOLD) {
        bottlenecks.push({
          id: conveyor.id,
          name: conveyor.name,
          reason: `Average Queue: ${avgQueue.toFixed(1)}`,
          utilization: util,
          averageQueueLength: avgQueue,
        })
      }
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
        utilization: util,
        averageQueueLength: avgQueue,
      })
      if (util > UTILIZATION_THRESHOLD || avgQueue > QUEUE_THRESHOLD) {
        bottlenecks.push({
          id: stacker.id,
          name: stacker.name,
          reason:
            util > UTILIZATION_THRESHOLD
              ? `Utilization: ${(util * 100).toFixed(1)}%`
              : `Average Queue: ${avgQueue.toFixed(1)}`,
          utilization: util,
          averageQueueLength: avgQueue,
        })
      }
    }

    const hours = now / 3600
    const completedMaterialOrTasks = Math.max(world.completedCount, world.completedTasks)
    const throughput = hours > 0 ? completedMaterialOrTasks / hours : 0
    const averageWaitingTime =
      world.completedWaitSamples > 0 ? world.waitingTimeTotal / world.completedWaitSamples : 0
    const averageCycleTime =
      world.completedTasks > 0 ? world.cycleTimeTotal / world.completedTasks : 0
    const agvUtilization = utilization(agvBusy, agvIdle)
    const conveyorUtilization = conveyorBusy + conveyorIdle > 0 ? conveyorBusy / (conveyorBusy + conveyorIdle) : 0
    const stackerUtilization = utilization(stackerBusy, stackerIdle)
    const resourceList = [agvUtilization, conveyorUtilization, stackerUtilization].filter((value) => value > 0)
    const resourceUtilization =
      resourceList.length > 0 ? resourceList.reduce((sum, value) => sum + value, 0) / resourceList.length : 0

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
      resources,
      bottlenecks,
    }
  }
}

export function markAgvStatus(agv: AgvRuntime, now: number, status: AgvStatus): void {
  closeAgv(agv, now)
  agv.status = status
}

export function markConveyorOccupancy(conveyor: ConveyorRuntime, now: number): void {
  closeConveyor(conveyor, now)
}

export function markStackerBusy(stacker: StackerRuntime, now: number, busy: boolean): void {
  closeStacker(stacker, now)
  stacker.busy = busy
}
