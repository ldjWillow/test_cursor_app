export interface SimulationEvent {
  id: string
  time: number
  type: string
  targetId?: string
  priority?: number
  payload?: unknown
}

export const EventType = {
  MaterialGenerate: 'MATERIAL_GENERATE',
  ConveyorEnter: 'CONVEYOR_ENTER',
  ConveyorExit: 'CONVEYOR_EXIT',
  SinkReceive: 'SINK_RECEIVE',
  TaskCreated: 'TASK_CREATED',
  TaskAssigned: 'TASK_ASSIGNED',
  TaskGenerate: 'TASK_GENERATE',
  AgvMoveToPickup: 'AGV_MOVE_TO_PICKUP',
  AgvLoad: 'AGV_LOAD',
  AgvMoveToDropoff: 'AGV_MOVE_TO_DROPOFF',
  AgvUnload: 'AGV_UNLOAD',
  AgvAdvanceHop: 'AGV_ADVANCE_HOP',
  AgvArriveHop: 'AGV_ARRIVE_HOP',
  AgvRouteAvailable: 'AGV_ROUTE_AVAILABLE',
  TaskCompleted: 'TASK_COMPLETED',
  AgvIdle: 'AGV_IDLE',
  StackerEnqueue: 'STACKER_ENQUEUE',
  StackerMoveX: 'STACKER_MOVE_X',
  StackerMoveY: 'STACKER_MOVE_Y',
  StackerPick: 'STACKER_PICK',
  StackerDrop: 'STACKER_DROP',
  StackerComplete: 'STACKER_COMPLETE',
  /** @deprecated kept for migration compatibility; routed to MOVE_X/MOVE_Y handlers */
  StackerMove: 'STACKER_MOVE',
  /** @deprecated kept for migration compatibility; routed to DROP handler */
  StackerFork: 'STACKER_FORK',
  Dispatch: 'DISPATCH',
} as const

export type EventType = (typeof EventType)[keyof typeof EventType]
