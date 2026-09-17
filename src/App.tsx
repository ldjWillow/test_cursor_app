import { lazy, Suspense } from 'react'
import { ConfigProvider, theme } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import enUS from 'antd/locale/en_US'
import { useTranslation } from 'react-i18next'
import type { AppLocale } from './i18n/index.ts'

const WarehouseSimApp = lazy(() => import('./app/WarehouseSimApp.tsx'))

export default function App() {
  const { i18n, t } = useTranslation()
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
      <Suspense fallback={<div className="app-boot">{t('app.loading', { defaultValue: 'WarehouseSim 加载中…' })}</div>}>
        <WarehouseSimApp />
      </Suspense>
    </ConfigProvider>
  )
}
