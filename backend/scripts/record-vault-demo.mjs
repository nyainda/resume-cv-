/**
 * record-vault-demo.mjs
 * Records a walkthrough video of the ProCV Job Vault feature using Playwright.
 * Output: vault-demo.webm (in workspace root)
 */
import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR   = path.resolve(__dirname, '../../screenshots');
const BASE_URL  = 'http://localhost:5000';

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function main() {
  console.log('🎬  Launching browser…');
  const { execSync } = await import('child_process');
  let executablePath;
  try { executablePath = execSync('which chromium').toString().trim(); } catch { executablePath = undefined; }

  const browser = await chromium.launch({
    executablePath,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });

  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    recordVideo: { dir: OUT_DIR, size: { width: 1280, height: 720 } },
  });

  // ── Intercept CF-worker auth so the app boots authenticated ───────────────
  await ctx.route('**/api/auth/session**', route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        user: { id: 'demo-user', email: 'demo@procv.dev', name: 'Demo User', picture: '', plan: 'free' },
        slots: [],
      }),
    })
  );
  // Silence other CF-worker 401s so they don't trigger sign-out teardown
  await ctx.route('**/cv-engine-worker.dripstech.workers.dev/**', route => {
    const url = route.request().url();
    if (url.includes('/api/auth/')) {
      route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
    } else {
      route.continue();
    }
  });

  const page = await ctx.newPage();

  // ── Seed localStorage with a profile so showLanding = false ───────────────
  await page.goto(BASE_URL);
  await page.evaluate(() => {
    const userId = 'demo-user';
    const slot = {
      id: 'demo-slot-1',
      name: 'Software Engineer',
      color: 'indigo',
      createdAt: new Date().toISOString(),
      profile: {
        personalInfo: { name: 'Alex Johnson', email: 'demo@procv.dev', phone: '+44 7700 000000', location: 'London, UK', linkedin: '', website: '' },
        summary: 'Senior software engineer with 6 years building scalable web applications using Python, React, TypeScript, and AWS.',
        workExperience: [
          { id: 'we1', jobTitle: 'Senior Software Engineer', company: 'FinTech Startup', startDate: '2021-03', endDate: 'Present', description: ['Led backend services in Python/FastAPI', 'Built React dashboards'] },
          { id: 'we2', jobTitle: 'Software Engineer', company: 'Tech Agency', startDate: '2018-06', endDate: '2021-02', description: ['Developed Node.js APIs'] },
        ],
        education: [{ id: 'ed1', degree: 'BSc Computer Science', school: 'University of Manchester', graduationYear: '2018' }],
        skills: 'Python, React, TypeScript, PostgreSQL, AWS, Docker, CI/CD, Node.js, FastAPI, Redis',
        projects: [], certifications: [], languages: [],
      },
    };
    localStorage.setItem('procv:worker_user', JSON.stringify({ id: userId, email: 'demo@procv.dev', name: 'Demo User', picture: '', plan: 'free' }));
    localStorage.setItem('procv:storage_ns', userId);
    localStorage.setItem('cv_builder:profiles', JSON.stringify([slot]));
    localStorage.setItem(`u_${userId}:cv_builder:profiles`, JSON.stringify([slot]));
    localStorage.removeItem('procv:vault_jobs');
  });

  await page.reload({ waitUntil: 'domcontentloaded' });
  await sleep(3500);

  console.log('📸  Navigating to Career Rooms…');

  // ── Navigate to Rooms ─────────────────────────────────────────────────────
  // Try clicking any sidebar/nav "Rooms" link
  const roomsLink = page.locator('text=/rooms/i, [href*="rooms"], [data-view="rooms"]').first();
  if (await roomsLink.isVisible({ timeout: 3000 }).catch(() => false)) {
    await roomsLink.click();
  } else {
    // Try finding by emoji or sidebar icon
    const candidates = await page.locator('button, a, [role="button"]').all();
    for (const el of candidates) {
      const text = await el.textContent().catch(() => '');
      if (/room/i.test(text)) { await el.click(); break; }
    }
  }
  await sleep(1500);

  // ── Switch to Job Vault tab ───────────────────────────────────────────────
  console.log('📂  Switching to Job Vault…');
  const vaultTab = page.locator('text=/job vault/i, text=/vault/i').first();
  if (await vaultTab.isVisible({ timeout: 3000 }).catch(() => false)) {
    await vaultTab.click();
    await sleep(1500);
  }

  // ── Open capture panel ────────────────────────────────────────────────────
  console.log('➕  Opening capture panel…');
  const addBtn = page.locator('text=/add jd/i, text=/save your first job/i, text=/capture/i').first();
  if (await addBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await addBtn.click();
    await sleep(1200);
  }

  // ── Paste tab: type a JD ─────────────────────────────────────────────────
  console.log('📝  Filling in job description…');
  const textarea = page.locator('textarea').first();
  if (await textarea.isVisible({ timeout: 2000 }).catch(() => false)) {
    await textarea.click();
    await sleep(300);
    const jd = `Software Engineer at Acme Corp\n\nWe are looking for a skilled Software Engineer with 3+ years of Python, React, and PostgreSQL experience. You will design and build scalable APIs, work with AWS cloud infrastructure, and collaborate with our cross-functional team.\n\nRequirements:\n- Strong TypeScript and React skills\n- Experience with Docker and CI/CD pipelines\n- Bachelor's degree in Computer Science or equivalent`;
    // Type character by character for a natural feel
    for (const char of jd) {
      await textarea.type(char, { delay: 12 });
    }
    await sleep(800);
  }

  // Save it
  const saveBtn = page.locator('button:has-text("Save"), button:has-text("Analyse"), button:has-text("Save & Analyse")').first();
  if (await saveBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await saveBtn.click();
    await sleep(2000);
  }

  // ── Add a second job via URL tab ──────────────────────────────────────────
  console.log('🔗  Adding URL job…');
  const addBtn2 = page.locator('text=/add jd/i').first();
  if (await addBtn2.isVisible({ timeout: 3000 }).catch(() => false)) {
    await addBtn2.click();
    await sleep(1000);
    const urlTab = page.locator('text=/url/i').first();
    if (await urlTab.isVisible({ timeout: 2000 }).catch(() => false)) {
      await urlTab.click();
      await sleep(600);
      const urlInput = page.locator('input[type="url"], input[placeholder*="http"]').first();
      if (await urlInput.isVisible({ timeout: 2000 }).catch(() => false)) {
        await urlInput.fill('https://jobs.google.com/senior-engineer-role');
        await sleep(600);
        const saveBtn2 = page.locator('button:has-text("Save"), button:has-text("Analyse"), button:has-text("Save & Analyse")').first();
        await saveBtn2.click();
        await sleep(1500);
      }
    }
  }

  // ── Search demo ───────────────────────────────────────────────────────────
  console.log('🔍  Demonstrating search…');
  const searchInput = page.locator('input[placeholder*="search" i], input[placeholder*="filter" i], input[type="search"]').first();
  if (await searchInput.isVisible({ timeout: 3000 }).catch(() => false)) {
    await searchInput.click();
    await searchInput.type('Python', { delay: 80 });
    await sleep(1500);
    await searchInput.clear();
    await sleep(800);
  }

  // ── Quick Check ───────────────────────────────────────────────────────────
  console.log('⚡  Opening Quick Check…');
  const checkBtn = page.locator('button:has-text("Check")').first();
  if (await checkBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await checkBtn.click();
    await sleep(2500);
    // Close it
    await page.keyboard.press('Escape');
    await sleep(1000);
  }

  // ── Delete URL job ────────────────────────────────────────────────────────
  console.log('🗑️  Deleting URL job…');
  const menuBtns = page.locator('button[title*="menu" i], button:has(circle)').all();
  const allMenus = await menuBtns;
  if (allMenus.length > 1) {
    await allMenus[1].click();
    await sleep(600);
    const deleteItem = page.locator('text=/delete/i').first();
    if (await deleteItem.isVisible({ timeout: 1500 }).catch(() => false)) {
      await deleteItem.click();
      await sleep(1200);
    }
  }

  // ── PDF tab UI ────────────────────────────────────────────────────────────
  console.log('📄  Showing PDF tab…');
  const addBtn3 = page.locator('text=/add jd/i').first();
  if (await addBtn3.isVisible({ timeout: 3000 }).catch(() => false)) {
    await addBtn3.click();
    await sleep(800);
    const pdfTab = page.locator('text=/pdf/i').first();
    if (await pdfTab.isVisible({ timeout: 2000 }).catch(() => false)) {
      await pdfTab.click();
      await sleep(1200);
    }
    // Cancel
    const cancelBtn = page.locator('button:has-text("Cancel")').first();
    if (await cancelBtn.isVisible({ timeout: 1500 }).catch(() => false)) {
      await cancelBtn.click();
      await sleep(800);
    }
  }

  // ── Build CV ──────────────────────────────────────────────────────────────
  console.log('🏗️  Triggering Build CV…');
  const buildBtn = page.locator('button:has-text("Build CV")').first();
  if (await buildBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await buildBtn.click();
    await sleep(2500);
  }

  // Linger on the final state
  await sleep(2000);

  console.log('💾  Saving video…');
  const videoPath = await page.video()?.path();
  await ctx.close();
  await browser.close();

  if (videoPath) {
    const fs = await import('fs');
    const dest = path.resolve(__dirname, '../../vault-demo.webm');
    fs.renameSync(videoPath, dest);
    console.log('✅  Video saved to:', dest);
  } else {
    console.log('⚠️  No video path returned — check screenshots/ directory');
  }
}

main().catch(e => { console.error(e); process.exit(1); });
