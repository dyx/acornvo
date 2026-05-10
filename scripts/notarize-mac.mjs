import { execSync } from 'node:child_process'
const required = ['APPLE_ID', 'APPLE_APP_SPECIFIC_PASSWORD', 'APPLE_TEAM_ID']
for (const k of required) {
  if (!process.env[k]) { console.error(`notarize:mac requires env var ${k}`); process.exit(1) }
}
execSync('electron-builder --mac --x64 --arm64 --publish=never', {
  stdio: 'inherit',
  env: { ...process.env, CSC_IDENTITY_AUTO_DISCOVERY: 'true' }
})
