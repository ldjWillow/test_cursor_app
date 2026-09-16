export type SensorTriggerType = 'photoelectric' | 'presence' | 'position'

export interface VirtualSensor {
  id: string
  name: string
  deviceId?: string
  x: number
  y: number
  z: number
  triggerType: SensorTriggerType
  active: boolean
  radius: number
}

export class SensorManager {
  private readonly sensors = new Map<string, VirtualSensor>()

  clear(): void {
    this.sensors.clear()
  }

  register(sensor: VirtualSensor): void {
    this.sensors.set(sensor.id, sensor)
  }

  list(): VirtualSensor[] {
    return [...this.sensors.values()]
  }

  /**
   * Presence-style update: material within radius turns sensor ON.
   */
  updateFromMaterials(materials: Array<{ id: string; x: number; y: number }>): void {
    for (const sensor of this.sensors.values()) {
      const hit = materials.some((material) => {
        const dx = material.x - sensor.x
        const dy = material.y - sensor.y
        return Math.hypot(dx, dy) <= sensor.radius
      })
      sensor.active = hit
    }
  }

  setActive(id: string, active: boolean): void {
    const sensor = this.sensors.get(id)
    if (sensor) {
      sensor.active = active
    }
  }
}

export const sensorManager = new SensorManager()
