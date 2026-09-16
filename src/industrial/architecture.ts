/**
 * WarehouseSim V0.4 Architecture — Industrial Connectivity & PLC Integration
 *
 * Goal: upgrade the External Control Layer into an Industrial Connectivity Layer
 * so WarehouseSim can act as a virtual commissioning target for PLC / WCS / ACS.
 *
 * =============================================================================
 * Data flow (mandatory — protocol fully decoupled from devices)
 * =============================================================================
 *
 *   External System (PLC / WCS / ACS)
 *     → Protocol Adapter   (OPC UA | Modbus | MQTT | TCP | HTTP | WS)
 *       → Signal Mapping
 *         → Command Bus
 *           → Virtual Device (FSM)     ← devices NEVER import protocols
 *             → Simulation Engine
 *               → Device State
 *                 → Feedback Bus
 *                   → Signal Mapping
 *                     → Protocol Adapter
 *                       → External System
 *
 * =============================================================================
 * Protocol Layer
 * =============================================================================
 *
 *   ProtocolAdapter (unified interface)
 *     connect / disconnect / read / write / subscribe / getStatus
 *
 *   ConnectionManager
 *     lifecycle, reconnect, heartbeat, health, environments
 *
 *   Adapters (V0.4):
 *     HTTP, WEBSOCKET, MQTT, OPC_UA, MODBUS_TCP, TCP_SOCKET
 *     (+ OpcUaServer mode: WarehouseSim exposes nodes)
 *
 *   Reserved (not in V0.4): S7, FINS, EtherNet/IP
 *
 * =============================================================================
 * Signal Layer
 * =============================================================================
 *
 *   SignalRegistry     — all internal signals registered
 *   SignalMappingEngine — address ↔ signal, scale/offset, direction
 *   SignalQuality      — GOOD | UNCERTAIN | BAD | TIMEOUT | DISCONNECTED
 *   SignalTrace        — value change history
 *   EdgeDetector       — rising / falling / change
 *   HandshakeManager   — Command / Ack / Complete templates
 *   PlcScanSimulator   — scan-cycle sync (10–100 ms)
 *
 * =============================================================================
 * Command / Feedback Flow
 * =============================================================================
 *
 *   External write → mapping → EdgeDetector → DeviceCommand → VirtualDevice
 *   Device state   → DeviceFeedback → mapping → Protocol write / publish
 *
 *   ControlAuthority: INTERNAL | EXTERNAL | MANUAL
 *   Conflict → CONTROL_AUTHORITY_CONFLICT (reject)
 *
 * =============================================================================
 * Connection Lifecycle
 * =============================================================================
 *
 *   DISCONNECTED → CONNECTING → CONNECTED
 *                ↘ ERROR
 *   CONNECTED → DEGRADED (heartbeat miss) → RECONNECTING → CONNECTED | ERROR
 *   Auto Connect default = false (never hit Production by accident)
 *
 * =============================================================================
 * New directories (V0.4)
 * =============================================================================
 *
 *   src/industrial/           core connectivity layer
 *     adapters/               protocol implementations
 *     demos/                  PLC / Modbus / MQTT / full integration demos
 *   src/components/connections/
 *   src/components/signals/
 *   src/components/protocol-monitor/
 *
 * =============================================================================
 * Reuse from V0.3
 * =============================================================================
 *
 *   virtual/*          VirtualDevice, DeviceCommand, DeviceFeedback, FaultManager
 *   gateway/*          HTTP/WS gateway — extended, not replaced
 *   signal/SignalMapper.ts  — kept; industrial SignalMappingEngine is the
 *                             authoritative V0.4 path (mapper remains for VC UI)
 *   twin/*, view3d/*, simulation/*, traffic/*, experiment/*, replay/*
 *
 * =============================================================================
 * Logging (separated)
 * =============================================================================
 *
 *   Simulation Log | Device Log | Protocol Log | Signal Trace | Audit Log
 */

export const V04_SCHEMA = '0.4' as const

export const INDUSTRIAL_NAV = [
  'Model',
  'Simulation',
  'Experiments',
  '3D Twin',
  'Commissioning',
  'Connections',
  'Signals',
  'Protocol Monitor',
  'Replay',
] as const
