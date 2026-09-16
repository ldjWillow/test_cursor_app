/**
 * Browser-side WCS demo helper for Emulation Mode.
 * External systems should use HTTP/WS; this helper exercises the same command path.
 */
import { deviceRegistry } from '../virtual/DeviceRegistry.ts'
import { nextId } from '../utils/id.ts'
import type { DeviceResponse } from '../virtual/types.ts'

export interface WcsTaskRequest {
  agvId: string
  sourceId: string
  targetId: string
}

export async function wcsAssignTransportTask(request: WcsTaskRequest): Promise<{
  taskId: string
  assign: DeviceResponse
  events: string[]
}> {
  const taskId = nextId('wcs-task')
  const events: string[] = []
  const assign = await deviceRegistry.sendCommand({
    deviceId: request.agvId,
    commandType: 'ASSIGN_TASK',
    parameters: {
      taskId,
      sourceId: request.sourceId,
      targetId: request.targetId,
    },
  })
  events.push(assign.message ?? assign.status)
  if (assign.status !== 'accepted') {
    return { taskId, assign, events }
  }

  const movePickup = await deviceRegistry.sendCommand({
    deviceId: request.agvId,
    commandType: 'MOVE',
    parameters: { target: request.sourceId },
  })
  events.push(movePickup.message ?? 'MOVING_TO_PICKUP')

  const agv = deviceRegistry.get(request.agvId) as {
    markArrivedPickup?: () => void
    markLoadComplete?: () => void
    markArrivedDropoff?: () => void
    markTaskComplete?: () => void
  }
  agv.markArrivedPickup?.()
  events.push('ARRIVED_PICKUP')
  agv.markLoadComplete?.()
  events.push('LOAD_COMPLETE')
  await deviceRegistry.sendCommand({
    deviceId: request.agvId,
    commandType: 'MOVE',
    parameters: { target: request.targetId },
  })
  agv.markArrivedDropoff?.()
  events.push('ARRIVED_DROPOFF')
  agv.markTaskComplete?.()
  events.push('TASK_COMPLETE')
  return { taskId, assign, events }
}

export async function wcsConveyorSensorDemo(conveyorId: string): Promise<string[]> {
  const events: string[] = []
  await deviceRegistry.sendCommand({ deviceId: conveyorId, commandType: 'START' })
  events.push('CONV_RUNNING')
  const conveyor = deviceRegistry.get(conveyorId) as { sensorFlags?: Record<string, boolean> }
  if (conveyor.sensorFlags) {
    conveyor.sensorFlags.sensor02 = true
  }
  events.push('SENSOR02=true')
  await deviceRegistry.sendCommand({ deviceId: conveyorId, commandType: 'STOP' })
  events.push('CONV_STOPPED')
  return events
}
