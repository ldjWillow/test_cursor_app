import { useEffect } from 'react'
import Toolbar from '../components/toolbar/Toolbar.tsx'
import DeviceLibrary from '../components/device-library/DeviceLibrary.tsx'
import PropertyPanel from '../components/property-panel/PropertyPanel.tsx'
import SimulationPanel from '../components/simulation-panel/SimulationPanel.tsx'
import CommissioningPanel from '../components/commissioning/CommissioningPanel.tsx'
import WarehouseCanvas from '../canvas/WarehouseCanvas.tsx'
import WarehouseScene3D from '../view3d/WarehouseScene3D.tsx'
import { useProjectStore } from '../store/projectStore.ts'
import { useDigitalTwinStore } from '../store/digitalTwinStore.ts'
import { simulationRuntime } from '../simulation/SimulationRuntime.ts'
import { deviceRegistry } from '../virtual/DeviceRegistry.ts'
import { signalMapper, defaultSignalMappings } from '../signal/SignalMapper.ts'

export default function WarehouseSimApp() {
  const viewMode = useDigitalTwinStore((state) => state.viewMode)

  useEffect(() => {
    const { document, revision } = useProjectStore.getState()
    simulationRuntime.reset(document, revision)
    deviceRegistry.loadFromProject(document)
    signalMapper.setMappings(document.signalMappings?.length ? document.signalMappings : defaultSignalMappings)
  }, [])

  return (
    <div className={`app-shell view-${viewMode}`}>
      <Toolbar />
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
      <CommissioningPanel />
    </div>
  )
}
