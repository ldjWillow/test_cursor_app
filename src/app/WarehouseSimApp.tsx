import { useEffect } from 'react'
import Toolbar from '../components/toolbar/Toolbar.tsx'
import DeviceLibrary from '../components/device-library/DeviceLibrary.tsx'
import PropertyPanel from '../components/property-panel/PropertyPanel.tsx'
import SimulationPanel from '../components/simulation-panel/SimulationPanel.tsx'
import CommissioningPanel from '../components/commissioning/CommissioningPanel.tsx'
import ConnectionsPanel from '../components/connections/ConnectionsPanel.tsx'
import SignalsPanel from '../components/signals/SignalsPanel.tsx'
import ProtocolMonitorPanel from '../components/protocol-monitor/ProtocolMonitorPanel.tsx'
import WarehouseCanvas from '../canvas/WarehouseCanvas.tsx'
import WarehouseScene3D from '../view3d/WarehouseScene3D.tsx'
import { useProjectStore } from '../store/projectStore.ts'
import { useDigitalTwinStore } from '../store/digitalTwinStore.ts'
import { useNavStore } from '../store/navStore.ts'
import { simulationRuntime } from '../simulation/SimulationRuntime.ts'
import { deviceRegistry } from '../virtual/DeviceRegistry.ts'
import { signalMapper, defaultSignalMappings } from '../signal/SignalMapper.ts'
import { industrialRuntime } from '../industrial/IndustrialRuntime.ts'

export default function WarehouseSimApp() {
  const viewMode = useDigitalTwinStore((state) => state.viewMode)
  const primaryNav = useNavStore((state) => state.primaryNav)
  const setViewMode = useDigitalTwinStore((state) => state.setViewMode)

  useEffect(() => {
    const { document, revision } = useProjectStore.getState()
    simulationRuntime.reset(document, revision)
    deviceRegistry.loadFromProject(document)
    signalMapper.setMappings(document.signalMappings?.length ? document.signalMappings : defaultSignalMappings)
    industrialRuntime.bootstrapFromProject(document)
  }, [])

  useEffect(() => {
    if (primaryNav === 'twin3d' && viewMode === '2d') {
      setViewMode('3d')
    }
    if (primaryNav === 'model' && viewMode === '3d') {
      setViewMode('2d')
    }
  }, [primaryNav, viewMode, setViewMode])

  const showModelShell = primaryNav === 'model' || primaryNav === 'simulation' || primaryNav === 'experiments' || primaryNav === 'twin3d' || primaryNav === 'replay'
  const showCommissioning = primaryNav === 'commissioning'
  const showConnections = primaryNav === 'connections'
  const showSignals = primaryNav === 'signals'
  const showProtocol = primaryNav === 'protocol'

  return (
    <div className={`app-shell view-${viewMode} nav-${primaryNav}`}>
      <Toolbar />
      {showModelShell && (
        <>
          <DeviceLibrary />
          <div className="viewport-area">
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
          </div>
          <PropertyPanel />
          <SimulationPanel />
          {(showCommissioning || primaryNav === 'model') && <CommissioningPanel />}
        </>
      )}
      {showCommissioning && !showModelShell && (
        <div className="industrial-full">
          <CommissioningPanel />
        </div>
      )}
      {showConnections && (
        <div className="industrial-full">
          <ConnectionsPanel />
        </div>
      )}
      {showSignals && (
        <div className="industrial-full">
          <SignalsPanel />
        </div>
      )}
      {showProtocol && (
        <div className="industrial-full">
          <ProtocolMonitorPanel />
        </div>
      )}
    </div>
  )
}
