/**
 * Unified HTTPS proxy for local development.
 * 
 * All traffic goes through ONE HTTPS port (3443):
 *   /api/*  → backend (http://localhost:8000)
 *   /*      → Next.js (http://localhost:3000)
 * 
 * This avoids Safari's self-signed cert issues with cross-origin fetch.
 */
const https = require('https');
const http = require('http');
const fs = require('fs');

const HTTPS_PORT = 3443;
const NEXTJS_PORT = 3000;
const BACKEND_PORT = 8000;

const options = {
  key: fs.readFileSync('key.pem'),
  cert: fs.readFileSync('cert.pem'),
};

function proxyRequest(clientReq, clientRes, targetPort) {
  const proxyHeaders = { ...clientReq.headers };
  proxyHeaders.host = `127.0.0.1:${targetPort}`;
  proxyHeaders['x-forwarded-host'] = clientReq.headers.host;
  proxyHeaders['x-forwarded-proto'] = 'https';

  const proxyOptions = {
    hostname: '127.0.0.1',
    port: targetPort,
    path: clientReq.url,
    method: clientReq.method,
    headers: proxyHeaders,
    timeout: 120000, // 2 minutes for AI endpoints
  };

  const proxyReq = http.request(proxyOptions, (proxyRes) => {
    // Remove problematic headers for Safari
    const headers = { ...proxyRes.headers };
    delete headers['transfer-encoding'];
    
    clientRes.writeHead(proxyRes.statusCode, headers);
    proxyRes.pipe(clientRes, { end: true });
  });

  proxyReq.on('error', (err) => {
    console.error(`  ✗ Proxy error → :${targetPort}${clientReq.url} — ${err.message}`);
    if (!clientRes.headersSent) {
      clientRes.writeHead(502, { 'Content-Type': 'application/json' });
      clientRes.end(JSON.stringify({ error: `Proxy error: ${err.message}` }));
    }
  });

  proxyReq.on('timeout', () => {
    console.error(`  ✗ Timeout → :${targetPort}${clientReq.url}`);
    proxyReq.destroy(new Error('Proxy timeout'));
  });

  clientReq.pipe(proxyReq, { end: true });
}

const proxy = https.createServer(options, (req, res) => {
  const target = (req.url.startsWith('/api/') || req.url === '/health') ? 'BACKEND' : 'NEXT';
  const port = target === 'BACKEND' ? BACKEND_PORT : NEXTJS_PORT;
  
  // Log API calls for debugging
  if (target === 'BACKEND') {
    console.log(`  → ${req.method} ${req.url} (${req.headers['content-type'] || 'no body'})`);
  }

  proxyRequest(req, res, port);
});

// Increase server timeouts for large uploads & slow AI responses
proxy.timeout = 120000;        // 2 min
proxy.keepAliveTimeout = 120000;
proxy.headersTimeout = 120000;

proxy.listen(HTTPS_PORT, '0.0.0.0', () => {
  // Get local IP
  const nets = require('os').networkInterfaces();
  let localIP = '0.0.0.0';
  for (const iface of Object.values(nets)) {
    for (const cfg of iface) {
      if (cfg.family === 'IPv4' && !cfg.internal) {
        localIP = cfg.address;
        break;
      }
    }
    if (localIP !== '0.0.0.0') break;
  }

  console.log('');
  console.log('🔒 Maninos AI — HTTPS Dev Proxy');
  console.log('─────────────────────────────────────');
  console.log(`   https://0.0.0.0:${HTTPS_PORT}`);
  console.log(`   /api/*  → backend :${BACKEND_PORT}`);
  console.log(`   /*      → Next.js :${NEXTJS_PORT}`);
  console.log('');
  console.log('📱 En tu teléfono abre:');
  console.log(`   https://${localIP}:${HTTPS_PORT}/mobile`);
  console.log('');
});
