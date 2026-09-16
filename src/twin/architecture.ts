/**
 * WarehouseSim V0.3 Architecture (Digital Twin & Virtual Commissioning)
 *
 * Data flow (mandatory):
 *   Project Model
 *     → Simulation Engine  (DES only — never Three.js)
 *       → Digital Twin State  (WorldState)
 *         → 2D Renderer (React Flow)
 *         → 3D Renderer (R3F / Three.js)
 *
 * External control:
 *   WCS/ACS → ProtocolAdapter (HTTP/WS) → VirtualDevice → Engine/StateMachine
 *     → Digital Twin State → Renderers
 *
 * Reuse from V0.2:
 *   simulation/*, traffic/*, experiment/*, statistics/*, routing/*,
 *   store/projectStore, SimulationRuntime, ModelValidator
 *
 * New modules:
 *   twin/          DigitalTwinState + mapper + store
 *   coords/        CoordinateTransformer (meters ↔ canvas)
 *   view3d/        R3F scene, device meshes, cameras
 *   virtual/       VirtualDevice, commands, feedback, FSM, FaultManager
 *   gateway/       ProtocolAdapter + HTTP/WS server
 *   replay/        ReplayEngine
 *   signal/        Signal Mapping
 */

export const V03_SCHEMA = '0.3' as const
