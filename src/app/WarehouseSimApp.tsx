import { useEffect } from 'react'
import Toolbar from '../components/toolbar/Toolbar.tsx'
import DeviceLibrary from '../components/device-library/DeviceLibrary.tsx'
import PropertyPanel from '../components/property-panel/PropertyPanel.tsx'
import SimulationPanel from '../components/simulation-panel/SimulationPanel.tsx'
import WarehouseCanvas from '../canvas/WarehouseCanvas.tsx'
import { useProjectStore } from '../store/projectStore.ts'
import { simulationRuntime } from '../simulation/SimulationRuntime.ts'

export default function WarehouseSimApp() {
  useEffect(() => {
    const { document, revision } = useProjectStore.getState()
    simulationRuntime.reset(document, revision)
  }, [])

  return (
    <div className="app-shell">
      <Toolbar />
      <DeviceLibrary />
      <WarehouseCanvas />
      <PropertyPanel />
      <SimulationPanel />
    </div>
  )
}
