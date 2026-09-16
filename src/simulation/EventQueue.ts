import type { SimulationEvent } from './SimulationEvent.ts'

interface RankedEvent {
  event: SimulationEvent
  seq: number
}

function compare(a: RankedEvent, b: RankedEvent): number {
  if (a.event.time !== b.event.time) {
    return a.event.time - b.event.time
  }
  const priorityA = a.event.priority ?? 0
  const priorityB = b.event.priority ?? 0
  if (priorityA !== priorityB) {
    return priorityA - priorityB
  }
  return a.seq - b.seq
}

export class EventQueue {
  private heap: RankedEvent[] = []
  private seq = 0

  get size(): number {
    return this.heap.length
  }

  get isEmpty(): boolean {
    return this.heap.length === 0
  }

  enqueue(event: SimulationEvent): void {
    this.seq += 1
    this.heap.push({ event, seq: this.seq })
    this.bubbleUp(this.heap.length - 1)
  }

  dequeue(): SimulationEvent | undefined {
    if (this.heap.length === 0) {
      return undefined
    }
    const head = this.heap[0]
    const last = this.heap.pop()
    if (!head || !last) {
      return undefined
    }
    if (this.heap.length > 0) {
      this.heap[0] = last
      this.sinkDown(0)
    }
    return head.event
  }

  peek(): SimulationEvent | undefined {
    return this.heap[0]?.event
  }

  clear(): void {
    this.heap = []
    this.seq = 0
  }

  toArray(): SimulationEvent[] {
    return [...this.heap]
      .sort(compare)
      .map((item) => item.event)
  }

  private bubbleUp(index: number): void {
    let current = index
    while (current > 0) {
      const parent = Math.floor((current - 1) / 2)
      const currentItem = this.heap[current]
      const parentItem = this.heap[parent]
      if (!currentItem || !parentItem || compare(currentItem, parentItem) >= 0) {
        break
      }
      this.heap[current] = parentItem
      this.heap[parent] = currentItem
      current = parent
    }
  }

  private sinkDown(index: number): void {
    const length = this.heap.length
    let current = index
    while (true) {
      const left = current * 2 + 1
      const right = current * 2 + 2
      let smallest = current
      const currentItem = this.heap[smallest]
      const leftItem = this.heap[left]
      if (left < length && leftItem && currentItem && compare(leftItem, currentItem) < 0) {
        smallest = left
      }
      const smallestItem = this.heap[smallest]
      const rightItem = this.heap[right]
      if (right < length && rightItem && smallestItem && compare(rightItem, smallestItem) < 0) {
        smallest = right
      }
      if (smallest === current) {
        break
      }
      const a = this.heap[current]
      const b = this.heap[smallest]
      if (!a || !b) {
        break
      }
      this.heap[current] = b
      this.heap[smallest] = a
      current = smallest
    }
  }
}
