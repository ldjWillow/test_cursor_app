/**
 * Unified warehouse coordinate system.
 * World units = meters. Canvas uses pixels; Three.js uses meters (Y-up).
 */
export interface CanvasPoint {
  x: number
  y: number
}

export interface WorldPoint {
  x: number
  y: number
  z: number
}

export class CoordinateTransformer {
  /** Pixels per meter on the 2D canvas. */
  readonly pixelsPerMeter: number
  /** Optional origin offset in canvas pixels. */
  readonly originX: number
  readonly originY: number

  constructor(pixelsPerMeter = 20, originX = 0, originY = 0) {
    this.pixelsPerMeter = pixelsPerMeter
    this.originX = originX
    this.originY = originY
  }

  worldToCanvas(world: WorldPoint): CanvasPoint {
    return {
      x: this.originX + world.x * this.pixelsPerMeter,
      y: this.originY + world.y * this.pixelsPerMeter,
    }
  }

  canvasToWorld(canvas: CanvasPoint, z = 0): WorldPoint {
    return {
      x: (canvas.x - this.originX) / this.pixelsPerMeter,
      y: (canvas.y - this.originY) / this.pixelsPerMeter,
      z,
    }
  }

  /** Project document device x/y are stored in canvas pixels historically. */
  deviceCanvasToWorld(canvasX: number, canvasY: number, z = 0): WorldPoint {
    return this.canvasToWorld({ x: canvasX, y: canvasY }, z)
  }

  /**
   * Three.js scene uses Y-up: warehouse (x,y) → (x, 0, y) with optional floor height.
   */
  worldToThree(world: WorldPoint): { x: number; y: number; z: number } {
    return { x: world.x, y: world.z, z: world.y }
  }

  threeToWorld(three: { x: number; y: number; z: number }): WorldPoint {
    return { x: three.x, y: three.z, z: three.y }
  }
}

export const defaultCoordinateTransformer = new CoordinateTransformer(20)
