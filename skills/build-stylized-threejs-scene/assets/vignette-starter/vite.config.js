import { defineConfig } from 'vite';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Dev-only helper: lets the page POST a rendered frame to disk so the scene
 * can be reviewed while iterating (see `window.__shot` in src/main.js).
 * Not part of the build.
 */
function frameGrabber(outDir) {
  return {
    name: 'frame-grabber',
    apply: 'serve',
    configureServer(server) {
      fs.mkdirSync(outDir, { recursive: true });
      server.middlewares.use('/__shot', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          return res.end('POST only');
        }
        const chunks = [];
        req.on('data', (c) => chunks.push(c));
        req.on('end', () => {
          try {
            const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
            const name = (body.name || 'shot').replace(/[^\w.-]/g, '_');
            const data = String(body.data || '').replace(/^data:image\/\w+;base64,/, '');
            const file = path.join(outDir, name.endsWith('.jpg') ? name : name + '.jpg');
            fs.writeFileSync(file, Buffer.from(data, 'base64'));
            res.setHeader('content-type', 'application/json');
            res.end(JSON.stringify({ ok: true, file, bytes: data.length }));
          } catch (e) {
            res.statusCode = 500;
            res.end(String(e));
          }
        });
      });
    },
  };
}

const SHOT_DIR = path.resolve(process.cwd(), '.shots');

export default defineConfig({
  base: './',
  plugins: [frameGrabber(SHOT_DIR)],
  server: { host: '127.0.0.1', port: 5178 },
  preview: { host: '127.0.0.1', port: 5179 },
  build: { target: 'es2020', assetsInlineLimit: 0 },
});
