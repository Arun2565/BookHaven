#!/usr/bin/env node

import { createServer } from 'node:http';
import { existsSync, createReadStream } from 'node:fs';
import { dirname, extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const siteRoot = join(packageRoot, 'dist');
const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  console.log(`Usage: bookhaven [options]

Start BookHaven in your default browser.

Options:
  --port <number>  Port to use (default: 4173)
  --no-open        Do not open a browser automatically
  --help, -h       Show this help message`);
  process.exit(0);
}

const portIndex = args.indexOf('--port');
const suppliedPort = portIndex >= 0 ? Number(args[portIndex + 1]) : 4173;
if (!Number.isInteger(suppliedPort) || suppliedPort < 1 || suppliedPort > 65535) {
  console.error('Error: --port must be a number from 1 to 65535.');
  process.exit(1);
}

if (!existsSync(siteRoot)) {
  console.error('Error: BookHaven files are missing. Reinstall the package.');
  process.exit(1);
}

const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2'
};

function assetPath(urlPath) {
  const decodedPath = decodeURIComponent(urlPath).replace(/^[/\\]+/, '');
  const candidate = normalize(join(siteRoot, decodedPath));
  return candidate === siteRoot || candidate.startsWith(`${siteRoot}${sep}`) ? candidate : null;
}

function openBrowser(url) {
  if (args.includes('--no-open')) return;
  const command = process.platform === 'win32' ? 'cmd' : process.platform === 'darwin' ? 'open' : 'xdg-open';
  const commandArgs = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
  execFile(command, commandArgs, () => {});
}

const server = createServer((request, response) => {
  const requestUrl = new URL(request.url || '/', 'http://localhost');
  const requestedFile = requestUrl.pathname === '/' ? join(siteRoot, 'index.html') : assetPath(requestUrl.pathname);
  const file = requestedFile && existsSync(requestedFile) ? requestedFile : join(siteRoot, 'index.html');
  const extension = extname(file).toLowerCase();

  response.writeHead(200, {
    'Content-Type': mimeTypes[extension] || 'application/octet-stream',
    'Cache-Control': extension === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable'
  });
  createReadStream(file).pipe(response);
});

server.listen(suppliedPort, '127.0.0.1', () => {
  const url = `http://127.0.0.1:${suppliedPort}`;
  console.log(`BookHaven is running at ${url}`);
  console.log('Press Ctrl+C to stop the server.');
  openBrowser(url);
});

server.on('error', (error) => {
  console.error(`Error: ${error.message}`);
  process.exit(1);
});
