/**
 * 文献管理工作台 - Electron 主进程
 *
 * 工作方式：
 *  - 用子进程启动 Next.js standalone server（或开发期 next dev），监听本机端口
 *  - BrowserWindow 加载 http://127.0.0.1:PORT，即原生窗口，无需打开浏览器
 *  - 开机自启使用 Electron 原生 app.setLoginItemSettings（无需额外依赖）
 *  - SQLite 数据库放到用户数据目录（app.getPath('userData')），首次启动从打包副本初始化
 */
const { app, BrowserWindow, shell } = require('electron');
const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const fs = require('fs');

const PORT = 4317;
const isDev = !app.isPackaged;
let serverProc = null;

function getNodePath() {
  // 打包时若把 node 放进 resources/node 则优先使用，否则回退系统 PATH 中的 node
  const bundled =
    process.platform === 'win32'
      ? path.join(process.resourcesPath, 'node', 'node.exe')
      : path.join(process.resourcesPath, 'node', 'node');
  if (fs.existsSync(bundled)) return bundled;
  return process.platform === 'win32' ? 'node.exe' : 'node';
}

function startServer() {
  const env = {
    ...process.env,
    PORT: String(PORT),
    HOSTNAME: '127.0.0.1',
    NODE_ENV: isDev ? 'development' : 'production',
  };

  if (isDev) {
    const projectRoot = path.join(__dirname, '..');
    env.DATABASE_URL = `file:${path.join(projectRoot, 'prisma', 'dev.db')}`;
    // 优先使用已构建的 standalone，否则退回 next dev
    const serverJs = path.join(projectRoot, '.next', 'standalone', 'server.js');
    if (fs.existsSync(serverJs)) {
      const uploadsDir = path.join(projectRoot, '.next', 'standalone', 'public', 'uploads');
      fs.mkdirSync(uploadsDir, { recursive: true });
      serverProc = spawn(getNodePath(), [serverJs], {
        cwd: path.join(projectRoot, '.next', 'standalone'),
        env,
        stdio: 'inherit',
      });
    } else {
      serverProc = spawn(
        getNodePath(),
        [path.join(projectRoot, 'node_modules', 'next', 'dist', 'bin', 'next'), 'dev'],
        { cwd: projectRoot, env, stdio: 'inherit' },
      );
    }
    return;
  }

  // 生产：standalone server（已随安装包发布到 resources/app/.next/standalone）
  const dir = path.join(process.resourcesPath, 'app', '.next', 'standalone');
  const serverJs = path.join(dir, 'server.js');
  if (!fs.existsSync(serverJs)) {
    console.error('未找到 standalone server.js，请先执行 next build');
    app.quit();
    return;
  }
  fs.mkdirSync(path.join(dir, 'public', 'uploads'), { recursive: true });

  const dbPath = path.join(app.getPath('userData'), 'dev.db');
  const bundledDb = path.join(process.resourcesPath, 'app', 'prisma', 'dev.db');
  if (!fs.existsSync(dbPath) && fs.existsSync(bundledDb)) {
    fs.copyFileSync(bundledDb, dbPath);
  }
  env.DATABASE_URL = `file:${dbPath}`;

  serverProc = spawn(getNodePath(), [serverJs], { cwd: dir, env, stdio: 'inherit' });
}

function waitForServer(retries, cb) {
  const tryOnce = (n) => {
    const req = http.get({ host: '127.0.0.1', port: PORT, path: '/' }, (res) => {
      res.destroy();
      cb();
    });
    req.on('error', () => {
      if (n <= 0) {
        console.error('服务端启动超时');
        app.quit();
      } else {
        setTimeout(() => tryOnce(n - 1), 500);
      }
    });
  };
  tryOnce(retries);
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 720,
    show: false,
    autoHideMenuBar: true,
    title: '文献管理工作台',
    backgroundColor: '#0a0a0a',
  });

  win.loadURL(`http://127.0.0.1:${PORT}`);
  win.once('ready-to-show', () => win.show());

  // 外部链接用系统默认浏览器打开，避免在原窗口内跳转
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

app.whenReady().then(() => {
  // 开机自启（个人版无需代码签名）
  app.setLoginItemSettings({ openAtLogin: true, path: app.getPath('exe') });

  startServer();
  waitForServer(60, () => createWindow());
});

app.on('window-all-closed', () => {
  if (serverProc) serverProc.kill();
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  if (serverProc) serverProc.kill();
});
