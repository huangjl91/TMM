import { app, BrowserWindow, session, shell } from 'electron'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { initDb } from './db'
import { registerIpc } from './ipc'
import { detectToolchain } from './runtime'
import { IPC } from '../shared/types'

/**
 * 开发时图标在仓库 resources/ 下；打包后 Windows 的窗口图标由 exe 自带，
 * 所以这里只需保证存在的路径被用上，找不到就不传（Electron 会退回默认图标）。
 */
function windowIcon(): string | undefined {
  const file = process.platform === 'win32' ? 'icon.ico' : 'icon.png'
  return [join(process.resourcesPath ?? '', 'icon', file), join(__dirname, '../../resources/icon', file)].find(
    (p) => existsSync(p)
  )
}

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 640,
    show: false,
    title: '数学建模教练',
    icon: windowIcon(),
    backgroundColor: '#f4f8f7',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      plugins: true
    }
  })

  win.on('ready-to-show', () => win.show())

  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl) {
    void win.loadURL(devUrl)
    win.webContents.openDevTools({ mode: 'detach' })
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }
  return win
}

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const win = BrowserWindow.getAllWindows().find((w) => !w.isDestroyed())
    if (win) win.focus()
  })

  void app.whenReady().then(() => {
    initDb(app.getPath('userData'))
    registerIpc()
    if (!process.env['ELECTRON_RENDERER_URL']) {
      // 开发模式要留给 Vite 注入 HMR 脚本，严格 CSP 只在打包后生效
      session.defaultSession.webRequest.onHeadersReceived((details, cb) => {
        cb({
          responseHeaders: {
            ...details.responseHeaders,
            'Content-Security-Policy': [
              // frame-src 必须放行 blob：PDF 预览用的是 createObjectURL 出来的 blob:，
              // 只写 default-src 会让安装包里的预览框被整块拦掉（开发态没有这条 CSP，测不出来）
              "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: file:; font-src 'self' data:; connect-src 'self'; frame-src 'self' blob:"
            ]
          }
        })
      })
    }
    createWindow()
    // 窗口先出来，解释器在后台探；探完推一次，右栏的 Python 行才不会一直显示"未探测到"
    void detectToolchain().then(() => {
      for (const w of BrowserWindow.getAllWindows()) {
        if (!w.isDestroyed()) w.webContents.send(IPC.RuntimeUpdated)
      }
    })
    app.on('browser-window-created', (_e, win) => {
      // 渲染层一旦拿到任意 URL 就能带 API Key 发请求，只允许加载本地与 dev 地址
      win.webContents.on('will-navigate', (ev, url) => {
        const allowed = url.startsWith('devtools://') || url.startsWith('file://') ||
          (process.env['ELECTRON_RENDERER_URL'] && url.startsWith(process.env['ELECTRON_RENDERER_URL']))
        if (!allowed) ev.preventDefault()
      })
    })
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
