import { useEffect } from 'react'
import type { CSSProperties } from 'react'
import Toolbar from '../components/toolbar/Toolbar.tsx'
import ModuleNav from '../components/nav/ModuleNav.tsx'
import DeviceLibrary from '../components/device-library/DeviceLibrary.tsx'
import PropertyPanel from '../components/property-panel/PropertyPanel.tsx'
import SimulationPanel from '../components/simulation-panel/SimulationPanel.tsx'
import CommissioningPanel from '../components/commissioning/CommissioningPanel.tsx'
import ConnectionsPanel from '../components/connections/ConnectionsPanel.tsx'
import ProtocolMonitorPanel from '../components/protocol/ProtocolMonitorPanel.tsx'
import SignalsPanel from '../components/signals/SignalsPanel.tsx'
import ReplayPanel from '../components/replay/ReplayPanel.tsx'
import OverviewPanel from '../components/overview/OverviewPanel.tsx'
import WarehouseCanvas from '../canvas/WarehouseCanvas.tsx'
import WarehouseScene3D from '../view3d/WarehouseScene3D.tsx'
import { useProjectStore } from '../store/projectStore.ts'
import { useDigitalTwinStore } from '../store/digitalTwinStore.ts'
import { useUiStore } from '../store/uiStore.ts'
import type { AppModule } from '../store/uiStore.ts'
import { simulationRuntime } from '../simulation/SimulationRuntime.ts'
import { deviceRegistry } from '../virtual/DeviceRegistry.ts'
import { signalMapper, defaultSignalMappings } from '../signal/SignalMapper.ts'
import { refreshCommissioning } from '../store/commissioningStore.ts'
import { replayController } from '../replay/ReplayController.ts'

const CENTER_PANEL_MODULES = new Set<AppModule>([
  'overview',
  'connections',
  'signals',
  'protocol',
  'replay',
  'eventLog',
  'experiment',
])

function ModulePanel({ module }: { module: AppModule }) {
  switch (module) {
    case 'overview':
      return <OverviewPanel />
    case 'connections':
      return <ConnectionsPanel />
    case 'signals':
      return <SignalsPanel />
    case 'protocol':
      return <ProtocolMonitorPanel />
    case 'replay':
      return <ReplayPanel />
    case 'commissioning':
      return <CommissioningPanel />
    case 'eventLog':
    case 'experiment':
    case 'simulation':
    case 'model':
    default:
      return <SimulationPanel />
  }
}

export default function WarehouseSimApp() {
  const viewMode = useDigitalTwinStore((state) => state.viewMode)
  const operatingMode = useDigitalTwinStore((state) => state.operatingMode)
  const activeModule = useUiStore((state) => state.activeModule)
  const leftCollapsed = useUiStore((state) => state.leftCollapsed)
  const rightCollapsed = useUiStore((state) => state.rightCollapsed)
  const bottomCollapsed = useUiStore((state) => state.bottomCollapsed)
  const leftWidth = useUiStore((state) => state.leftWidth)
  const rightWidth = useUiStore((state) => state.rightWidth)
  const bottomHeight = useUiStore((state) => state.bottomHeight)

  useEffect(() => {
    const { document, revision } = useProjectStore.getState()
    simulationRuntime.reset(document, revision)
    deviceRegistry.loadFromProject(document)
    signalMapper.setMappings(document.signalMappings?.length ? document.signalMappings : defaultSignalMappings)
    refreshCommissioning()
  }, [])

  useEffect(() => {
    if (operatingMode !== 'replay') {
      return
    }
    return () => {
      replayController.dispose()
    }
  }, [operatingMode])

  const showCenterPanel = CENTER_PANEL_MODULES.has(activeModule)
  const bottomModule: AppModule =
    activeModule === 'model' || activeModule === 'twin3d' ? 'simulation' : activeModule

  return (
    <div
      className={`app-shell view-${viewMode}${leftCollapsed ? ' left-collapsed' : ''}${rightCollapsed ? ' right-collapsed' : ''}${bottomCollapsed ? ' bottom-collapsed' : ''}`}
      style={
        {
          '--left-width': `${leftWidth}px`,
          '--right-width': `${rightWidth}px`,
          '--bottom-height': `${bottomHeight}px`,
        } as CSSProperties
      }
    >
      <div className="app-top">
        <ModuleNav />
        <Toolbar />
      </div>
      {!leftCollapsed && <DeviceLibrary />}
      <div className="viewport-area">
        {showCenterPanel ? (
          <div className="module-overlay">
            <ModulePanel module={activeModule} />
          </div>
        ) : (
          <>
            {(viewMode === '2d' || viewMode === 'split') && (
              <div className="viewport-2d">
                <WarehouseCanvas />
              </div>
            )}
            {(viewMode === '3d' || viewMode === 'split') && (
              <div className="viewport-3d">
                <WarehouseScene3D />
              </div>
            )}
          </>
        )}
      </div>
      {!rightCollapsed && <PropertyPanel />}
      {!bottomCollapsed && (
        <div className="bottom-area">
          {showCenterPanel ? <SimulationPanel /> : <ModulePanel module={bottomModule} />}
        </div>
      )}
    </div>
  )
}
