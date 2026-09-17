import { ConfigProvider, theme } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import enUS from 'antd/locale/en_US'
import { useTranslation } from 'react-i18next'
import WarehouseSimApp from './app/WarehouseSimApp.tsx'
import type { AppLocale } from './i18n/index.ts'

export default function App() {
  const { i18n } = useTranslation()
  const locale = (i18n.language as AppLocale) === 'en-US' ? enUS : zhCN

  return (
    <ConfigProvider
      locale={locale}
      autoInsertSpaceInButton={false}
      theme={{
        algorithm: theme.darkAlgorithm,
        token: {
          colorPrimary: '#3d8bfd',
          colorBgBase: '#10161f',
          borderRadius: 2,
          fontSize: 12,
          fontFamily: "'Noto Sans SC', 'IBM Plex Sans', 'Segoe UI', sans-serif",
        },
      }}
    >
      <WarehouseSimApp />
    </ConfigProvider>
  )
}
