import type { ThemeConfig } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import enUS from 'antd/locale/en_US'
import type { Locale } from 'antd/lib/locale'

export const themeTokens: NonNullable<ThemeConfig['token']> = {
  colorBgContainer: 'var(--color-paper)',
  colorBgLayout: 'var(--color-paper-2)',
  colorBorder: 'var(--color-line)',
  colorText: 'var(--color-ink)',
  colorTextSecondary: 'var(--color-ink-3)',
  fontFamily: '"Source Han Serif SC", serif',
  borderRadius: 6,
}

export function pickAntdLocale(lng: string): Locale {
  return lng.toLowerCase().startsWith('zh') ? zhCN : enUS
}
