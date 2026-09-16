/**
 * WarehouseSim V0.3 Architecture (Digital Twin & Virtual Commissioning)
 * Extended by V0.4 — see industrial/architecture.ts
 *
 * Data flow (mandatory):
 *   Project Model
 *     → Simulation Engine  (DES only — never Three.js)
 *       → Digital Twin State  (WorldState)
 *         → 2D Renderer (React Flow)
 *         → 3D Renderer (R3F / Three.js)
 *
 * External control (V0.3) → Industrial Connectivity (V0.4):
 *   WCS/ACS/PLC → ProtocolAdapter → Signal Mapping → VirtualDevice → Engine
 *     → Digital Twin State → Renderers
 */

export const V03_SCHEMA = '0.3' as const
