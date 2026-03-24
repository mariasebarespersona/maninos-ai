/**
 * Playwright Global Setup — Auth via Supabase API + inject into localStorage.
 */
import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import https from 'https';

const STORAGE_STATE = path.join(__dirname, '.auth/user.json');

function supabaseAuth(email: string, password: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ email, password });
    const req = https.request({
      hostname: 'tpsszoxyqdutqlwfgrvm.supabase.co',
      path: '/auth/v1/token?grant_type=password',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRwc3N6b3h5cWR1dHFsd2ZncnZtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk1MTEwODcsImV4cCI6MjA4NTA4NzA4N30.NNaIewOfNdTP1qrciMaWq_ZPYv6Li4q0_g27nBD-2Dw',
        'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) resolve(JSON.parse(data));
        else reject(new Error(`Auth ${res.statusCode}: ${data}`));
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function globalSetup() {
  const baseURL = process.env.E2E_BASE_URL || 'https://maninos-ai.vercel.app';
  const email = process.env.E2E_TEST_EMAIL || 'e2e-test@maninos.com';
  const password = process.env.E2E_TEST_PASSWORD || 'E2eTest2026!Maninos';

  fs.mkdirSync(path.dirname(STORAGE_STATE), { recursive: true });
  console.log(`[E2E Setup] Authenticating ${email} (pwd len: ${password.length})...`);

  try {
    const authData = await supabaseAuth(email, password);
    console.log(`[E2E Setup] Auth OK — user: ${authData.user?.id}`);

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto(baseURL, { waitUntil: 'commit', timeout: 30000 });

    // Inject Supabase session into localStorage
    // Inject Supabase session into localStorage
    await page.evaluate(({ token }) => {
      localStorage.setItem('sb-tpsszoxyqdutqlwfgrvm-auth-token', JSON.stringify(token));
    }, {
      token: {
        access_token: authData.access_token,
        refresh_token: authData.refresh_token,
        expires_in: authData.expires_in,
        expires_at: authData.expires_at,
        token_type: authData.token_type,
        user: authData.user,
      }
    });

    // Navigate to /homes to trigger Supabase middleware to set session cookies
    await page.goto(`${baseURL}/homes`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);

    // If we're on /homes (not /login), cookies are set
    if (page.url().includes('/homes')) {
      console.log(`[E2E Setup] Authenticated — on ${page.url()}`);
    } else {
      // Fallback: try browser-based login
      console.log(`[E2E Setup] localStorage auth didn't work, trying browser login...`);
      await page.goto(`${baseURL}/login`, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForSelector('input[type="email"]', { timeout: 10000 });
      await page.fill('input[type="email"]', email);
      await page.fill('input[type="password"]', password);
      await page.click('button[type="submit"]');
      // Poll for redirect
      for (let i = 0; i < 10; i++) {
        await page.waitForTimeout(2000);
        if (!page.url().includes('/login')) break;
      }
    }

    await context.storageState({ path: STORAGE_STATE });
    await browser.close();
    console.log(`[E2E Setup] Auth state saved (URL: ${page.url()})`);
  } catch (error: any) {
    console.error(`[E2E Setup] Auth failed: ${error.message}`);
    fs.writeFileSync(STORAGE_STATE, JSON.stringify({ cookies: [], origins: [] }));
  }
}

export default globalSetup;
