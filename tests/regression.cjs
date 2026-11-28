const assert = require('node:assert/strict');
const { readFile } = require('node:fs/promises');
const { createServer } = require('node:http');
const { resolve } = require('node:path');
const { after, before, test } = require('node:test');
const { chromium } = require('playwright');

const root = resolve(__dirname, '..');
const contentTypes = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
};
let unavailableAsset;
const server = createServer(async (request, response) => {
  const url = new URL(request.url, 'http://localhost');
  const filename = url.pathname === '/' ? '/index.html' : url.pathname;
  if (filename === unavailableAsset || !/^\/(?:exercise-images\/)?[\w.-]+$/.test(filename)) {
    response.writeHead(404).end();
    return;
  }
  try {
    const data = await readFile(resolve(root, filename.slice(1)));
    response.setHeader('Content-Type', contentTypes[filename.slice(filename.lastIndexOf('.'))] || 'application/octet-stream');
    response.end(data);
  } catch {
    response.writeHead(404).end();
  }
});

let browser;
let origin;
before(async () => {
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_EXECUTABLE || undefined,
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  origin = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await browser?.close();
  if (server.listening) await new Promise(resolve => server.close(resolve));
});

async function withPage(callback, serviceWorkers = 'block') {
  const context = await browser.newContext({
    viewport: { width: 320, height: 740 },
    hasTouch: true,
    isMobile: true,
    reducedMotion: 'reduce',
    serviceWorkers,
  });
  try {
    const page = await context.newPage();
    page.setDefaultTimeout(5000);
    await page.goto(origin);
    await page.waitForFunction(() => writeAccess !== "pending");
    await callback(page, context);
  } finally {
    await context.close();
  }
}

test('Full Body logs a set, recovers its draft, and keeps a history correction', () => withPage(async page => {
  await page.getByRole('button', { name: /Full Body/ }).first().click();
  await page.evaluate(() => {
    db.settings.autoRest = false;
    saveDB();
  });
  const card = page.locator('[data-current-exercise="Leg Press"]');
  await card.locator('summary').first().click();
  const row = card.locator('.set').first();
  await row.locator('[data-field="weight"]').fill('185');
  await row.locator('[data-field="reps"]').fill('8');
  await row.locator('[data-adjust-field="weight"][data-direction="1"]').click();
  await row.locator('[data-confirm-exercise]').click();

  await page.reload();
  assert.equal(await page.evaluate(() => db.draftWorkout.exercises['Leg Press'].sets[0].confirmed), true);
  await page.getByRole('button', { name: /Continue workout/ }).click();
  await page.evaluate(() => saveWorkout());
  assert.equal(await page.locator('#workoutSummary').isVisible(), true);
  await page.reload();
  assert.deepEqual(await page.evaluate(() => db.sessions[0].exercises[0].sets[0]), { weight: 190, reps: 8 });

  await page.getByRole('button', { name: /Full Body/ }).first().click();
  await page.locator('nav').getByRole('button', { name: 'History' }).click();
  await page.locator('.history-summary').first().click();
  await page.getByRole('button', { name: 'Edit workout', exact: true }).click();
  await page.locator('.edit-reps').first().fill('9');
  await page.locator('#saveEdit').click();
  await page.reload();
  assert.equal(await page.evaluate(() => db.sessions[0].exercises[0].sets[0].reps), 9);
}));

test('split template preserves its weekday, exercise, set count, and finished session', () => withPage(async page => {
  const answers = ['Push sample', 'Monday'];
  page.on('dialog', dialog => dialog.accept(dialog.type() === 'prompt' ? answers.shift() : undefined));
  await page.evaluate(() => {
    enterWorkout('split');
    toggleSplitGroup('Chest');
    chooseForGroup('Chest', 'DB Bench Press');
    addDraftSet('DB Bench Press');
    saveWorkoutTemplate();
  });

  await page.reload();
  assert.deepEqual(await page.evaluate(() => db.templates[0]), {
    name: 'Push sample',
    day: 'Monday',
    mode: 'split',
    choices: [{ group: 'Chest', exercise: 'DB Bench Press', setCount: 4 }],
  });
  await page.evaluate(() => {
    enterWorkout('split');
    loadWorkoutTemplate(0);
    db.settings.autoRest = false;
    saveDraftField('DB Bench Press', 0, 'weight', '45');
    saveDraftField('DB Bench Press', 0, 'reps', '10');
    confirmDraftSet('DB Bench Press', 0);
    saveWorkout();
  });
  await page.reload();
  assert.deepEqual(await page.evaluate(() => db.sessions[0].exercises), [
    { name: 'DB Bench Press', sets: [{ weight: 45, reps: 10 }] },
  ]);
}));

test('weight, body fat, theme and a legacy-shaped session survive JSON backup restore', () => withPage(async page => {
  page.on('dialog', dialog => dialog.accept());
  await page.evaluate(() => {
    enterWeightTracker();
    document.getElementById('weeklyWeight').value = '190';
    document.getElementById('weeklyBF').value = '25';
    saveWeeklyWeight({ preventDefault() {} });
    db.settings.theme = 'teal';
    db.sessions.push({
      date: '2026-01-01T12:00:00.000Z',
      exercises: [{ name: 'Leg Press', sets: [{ weight: 180, reps: 8 }] }],
    });
    saveDB();
  });
  const pendingDownload = page.waitForEvent('download');
  await page.evaluate(() => exportData());
  const download = await pendingDownload;
  const backup = await readFile(await download.path());
  const state = JSON.parse(backup);
  assert.equal(state.weightTracking.entries[0].bodyFat, 25);

  await page.evaluate(() => {
    db.settings.theme = 'rose';
    saveDB();
  });
  await page.locator('#backupFile').setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: backup });
  await page.waitForFunction(() => db.settings.theme === 'teal');
  await page.reload();
  assert.deepEqual(await page.evaluate(() => db.sessions[0]), state.sessions[0]);
  assert.deepEqual(await page.evaluate(() => db.weightTracking.entries), state.weightTracking.entries);
}));

test('progress photos survive reload and appear in comparison', () => withPage(async page => {
  await page.evaluate(() => enterWeightTracker());
  const buffer = await readFile(resolve(root, 'icon-180.png'));
  await page.locator('#rhPhotoInput').setInputFiles({ name: 'fixture.png', mimeType: 'image/png', buffer });
  await page.waitForFunction(() => document.getElementById('rhPhotoStatus').textContent.includes('Photo saved'));
  await page.reload();
  await page.evaluate(() => enterWeightTracker());
  await page.locator('#rhPhotoGallery img').waitFor();
  assert.equal(await page.locator('.rh-compare-images img').count(), 2);
}));

test('offline reload can open Full Body and Weight Tracker', () => withPage(async (page, context) => {
  await page.waitForFunction(() => navigator.serviceWorker.controller?.state === 'activated');
  await context.setOffline(true);
  await page.reload();
  await page.getByRole('button', { name: /Full Body/ }).first().click();
  assert.equal(await page.locator('[data-current-exercise="Leg Press"]').isVisible(), true);
  await page.evaluate(() => enterWeightTracker());
  assert.equal(await page.locator('#weeklyWeightForm').isVisible(), true);
  assert.equal(await page.evaluate(() => typeof renderWeightTracking), 'function');
}, 'allow'));

test('failed workout write retains the draft and does not show a success summary', () => withPage(async page => {
  const result = await page.evaluate(() => {
    enterWorkout('full');
    db.settings.autoRest = false;
    saveDraftField('Leg Press', 0, 'weight', '200');
    saveDraftField('Leg Press', 0, 'reps', '7');
    confirmDraftSet('Leg Press', 0);
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function () {
      throw new DOMException('Synthetic quota failure', 'QuotaExceededError');
    };
    try {
      saveWorkout();
      return {
        retained: db.draftWorkout?.exercises['Leg Press']?.sets[0].confirmed ?? false,
        reportedSuccess: document.getElementById('workoutSummary').classList.contains('active'),
      };
    } finally {
      Storage.prototype.setItem = setItem;
    }
  });
  assert.deepEqual(result, { retained: true, reportedSuccess: false });
}));

test('malformed legacy backup leaves the current stored snapshot intact', () => withPage(async page => {
  page.on('dialog', dialog => dialog.accept());
  const key = 'ganiStrengthV2';
  const before = await page.evaluate(key => localStorage.getItem(key), key);
  const malformed = Buffer.from(JSON.stringify({
    selected: [],
    sessions: [],
    history: {},
    templates: [{ name: 'Invalid', mode: 'full', choices: [null] }],
  }));
  const originalURL = page.url();
  await page.locator('#backupFile').setInputFiles({
    name: 'malformed.json',
    mimeType: 'application/json',
    buffer: malformed,
  });
  await page.waitForFunction(() =>
    document.getElementById('toast').textContent.includes('Could not read this backup file') ||
    localStorage.getItem('ganiStrengthV2')?.includes('"Invalid"'));
  assert.equal(await page.evaluate(key => localStorage.getItem(key), key), before);
  assert.equal(page.url(), originalURL);
}));

test('stale tabs cannot overwrite a newer snapshot', () => withPage(async (page, context) => {
  const second = await context.newPage();
  await second.goto(origin);
  assert.equal(await page.evaluate(() => {
    db.settings.theme = 'teal';
    return saveDB();
  }), true);
  assert.equal(await second.evaluate(() => {
    db.settings.weightStep = 10;
    return saveDB();
  }), false);
  assert.match(await second.locator('#storageWarning').textContent(), /Another tab saved/);
  await second.reload();
  assert.deepEqual(await second.evaluate(() => [db.settings.theme, db.settings.weightStep]), ['teal', 5]);
}));

test('split days retain independent exercise selections across reloads', () => withPage(async page => {
  await page.evaluate(() => {
    enterWorkout('split');
    loadCycleDay(0);
    chooseForGroup('Chest', 'DB Bench Press');
    loadCycleDay(1);
    chooseForGroup('Back', 'Lat Pulldown');
  });
  await page.reload();
  assert.deepEqual(await page.evaluate(() => {
    enterWorkout('split');
    const tuesday = selectedForGroup('Back');
    loadCycleDay(0);
    return [tuesday, selectedForGroup('Chest')];
  }), ['Lat Pulldown', 'DB Bench Press']);
}));

test('plan setup preserves pre-plan weigh-ins and uses the same weekly bucketing', () => withPage(async page => {
  await page.evaluate(() => {
    enterWeightTracker();
    const submit = { preventDefault() {} };
    const set = (id, value) => { document.getElementById(id).value = value; };
    set('weeklyWeightDate', '2026-01-04');
    set('weeklyWeight', '190');
    set('weeklyBF', '25');
    saveWeeklyWeight(submit);
    set('weightStartDate', '2026-01-01');
    set('weightStart', '200');
    set('weightEndDate', '2026-03-26');
    saveWeightPlan(submit);
  });
  assert.match(await page.locator('#weightPlanRows tr').first().textContent(), /190\.0/);
  await page.evaluate(() => {
    document.getElementById('weeklyWeightDate').value = '2026-01-03';
    document.getElementById('weeklyWeight').value = '191';
    saveWeeklyWeight({ preventDefault() {} });
  });
  await page.reload();
  assert.deepEqual(await page.evaluate(() => db.weightTracking.entries.map(entry => [entry.weight, entry.bodyFat, entry.week])),
    [[191, null, 0], [190, 25, 0]]);
}));

test('exercise image crop, rotation, replacement, deletion and offline restore', () => withPage(async (page, context) => {
  await page.waitForFunction(() => navigator.serviceWorker.controller?.state === 'activated');
  await page.getByRole('button', { name: /Full Body/ }).first().click();
  const thumbnail = page.getByRole('button', { name: 'View or manage image for Leg Press' });
  await thumbnail.click();
  await page.waitForFunction(() => document.getElementById('exerciseImageStatus').textContent.startsWith('Demonstration'));
  const buffer = await readFile(resolve(root, 'icon-180.png'));
  const input = page.locator('#exerciseImageFile');
  await input.setInputFiles({ name: 'sample.png', mimeType: 'image/png', buffer });
  await page.locator('#exerciseImageEditor').waitFor();
  await page.getByRole('button', { name: 'Rotate 90°' }).click();
  await page.locator('#exerciseImageZoom').fill('1.5');
  await page.locator('#exerciseImageX').fill('50');
  await page.getByRole('button', { name: 'Save crop' }).click();
  await page.waitForFunction(() => document.getElementById('exerciseImageStatus').textContent === 'Your saved image.');

  await context.setOffline(true);
  await page.reload();
  await page.getByRole('button', { name: /Full Body/ }).first().click();
  await thumbnail.click();
  await page.getByRole('button', { name: 'Edit saved crop' }).click();
  await page.waitForFunction(() => document.getElementById('exerciseImageZoom').value === '1.5');
  assert.equal(await page.locator('#exerciseImageX').inputValue(), '50');
  await input.setInputFiles({ name: 'replacement.png', mimeType: 'image/png', buffer });
  await page.waitForFunction(() => document.getElementById('exerciseImageZoom').value === '1');
  await page.getByRole('button', { name: 'Save crop' }).click();

  page.on('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Delete image' }).click();
  await page.waitForFunction(() => document.getElementById('exerciseImageStatus').textContent.startsWith('No demonstration'));
  await page.getByRole('button', { name: 'Restore default' }).click();
  await page.waitForFunction(() => {
    const image = document.getElementById('exerciseImagePreview');
    return image.src.endsWith('leg-press.webp') && image.complete && image.naturalWidth > 0;
  });
}, 'allow'));

test('custom exercises can store their own image independently of built-in defaults', () => withPage(async page => {
  page.on('dialog', dialog => dialog.accept(dialog.type() === 'prompt' ? 'My chest drill' : undefined));
  await page.evaluate(() => {
    enterWorkout('split');
    toggleSplitGroup('Chest');
    addCustomExercise('Chest');
  });
  const thumbnail = page.getByRole('button', { name: 'View or manage image for My chest drill' });
  await thumbnail.click();
  await page.waitForFunction(() => document.getElementById('exerciseImageStatus').textContent.startsWith('No demonstration'));
  const buffer = await readFile(resolve(root, 'icon-180.png'));
  await page.locator('#exerciseImageFile').setInputFiles({ name: 'custom.png', mimeType: 'image/png', buffer });
  await page.getByRole('button', { name: 'Save crop' }).click();
  await page.waitForFunction(() => document.getElementById('exerciseImageStatus').textContent === 'Your saved image.');
  await page.reload();
  await page.evaluate(() => enterWorkout('split'));
  await thumbnail.click();
  await page.waitForFunction(() => document.getElementById('exerciseImageStatus').textContent === 'Your saved image.');
}));


test('worker activation preserves unrelated caches and refuses incomplete asset sets', async () => {
  unavailableAsset = '/weight.js';
  try {
    await withPage(async page => {
      await page.evaluate(() => caches.open('unrelated-cache'));
      const registered = await page.evaluate(async () => {
        try {
          const registration = await navigator.serviceWorker.register('./sw.js');
          const worker = registration.installing || registration.waiting;
          if (!worker) return Boolean(registration.active);
          return await new Promise(resolve => {
            function stateChanged() {
              if (worker.state === 'redundant') resolve(false);
              if (worker.state === 'activated') resolve(true);
            }
            worker.addEventListener('statechange', stateChanged);
            stateChanged();
          });
        } catch {
          return false;
        }
      });
      assert.equal(registered, false);
      assert.equal(await page.evaluate(() => Boolean(navigator.serviceWorker.controller)), false);
      assert.equal(await page.evaluate(() => caches.has('unrelated-cache')), true);

      unavailableAsset = undefined;
      await page.evaluate(async () => {
        const registration = await navigator.serviceWorker.getRegistration();
        if (registration) await registration.unregister();
      });
      await page.reload();
      await page.waitForFunction(() => navigator.serviceWorker.controller?.state === 'activated');
      assert.equal(await page.evaluate(() => caches.has('unrelated-cache')), true);
    }, 'allow');
  } finally {
    unavailableAsset = undefined;
  }
});
