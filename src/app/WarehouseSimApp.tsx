import Toolbar from '../components/toolbar/Toolbar.tsx'
import DeviceLibrary from '../components/device-library/DeviceLibrary.tsx'
import PropertyPanel from '../components/property-panel/PropertyPanel.tsx'
import SimulationPanel from '../components/simulation-panel/SimulationPanel.tsx'
import WarehouseCanvas from '../canvas/WarehouseCanvas.tsx'

export default function WarehouseSimApp() {
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
