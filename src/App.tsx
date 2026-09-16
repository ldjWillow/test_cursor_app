import { ConfigProvider, theme } from 'antd'
import WarehouseSimApp from './app/WarehouseSimApp.tsx'

export default function App() {
  return (
    <ConfigProvider
      theme={{
        algorithm: theme.darkAlgorithm,
        token: {
          colorPrimary: '#3d8bfd',
          colorBgBase: '#10161f',
          borderRadius: 4,
          fontSize: 12,
        },
      }}
    >
      <WarehouseSimApp />
    </ConfigProvider>
  )
}
