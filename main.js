const { app, BrowserWindow } = require('electron');
const http = require('http');
const fs = require('fs');
const path = require('path');

// Tạo máy chủ nội bộ nhỏ để YouTube phát ổn định không bị lỗi bản quyền/chặn nhúng
const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8'
};

const server = http.createServer((req, res) => {
  const fileName = req.url === '/' ? 'index.html' : req.url.split('?')[0];
  const filePath = path.join(__dirname, fileName);
  const ext = path.extname(filePath);

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
    res.end(content);
  });
});

function createWindow() {
  server.listen(0, '127.0.0.1', () => {
    const port = server.address().port;

    const win = new BrowserWindow({
      width: 500,
      height: 540,
      icon: path.join(__dirname, 'icon.ico'),
      frame: false,       // Ẩn khung viền mặc định của Windows
      transparent: true,  // Làm trong suốt phần nền xung quanh
      resizable: false,
      webPreferences: {
        nodeIntegration: false
      }
    });

    win.loadURL(`http://127.0.0.1:${port}`);
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  server.close();
  if (process.platform !== 'darwin') app.quit();
});