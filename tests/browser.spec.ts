import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import fs from 'node:fs';
test('Resume PDF, download, contact focus and static reflow', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/resume-contact/');
    await expect(
      page.getByRole('heading', { level: 1, name: 'Resume & Contact' }),
    ).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    ).toBe(true);
    await page.getByRole('link', { name: 'View résumé (PDF)', exact: true }).focus();
    await expect(
      page.getByRole('link', { name: 'View résumé (PDF)', exact: true }),
    ).toBeFocused();
    expect(
      await page.locator(':focus').evaluate((e) => getComputedStyle(e).outlineWidth),
    ).toBe('3px');
    await page.evaluate(() => {
      const sizes = [...document.querySelectorAll('body *')].map(
        (e) => [e, getComputedStyle(e).fontSize] as const,
      );
      for (const [e, size] of sizes)
        (e as HTMLElement).style.fontSize = `${parseFloat(size) * 2}px`;
    });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    ).toBe(true);
  }
  await page.goto('/resume-contact/');

  const pdf = '/resume/Ariel_Christian_Felices_Resume.pdf';
  const response = await page.request.get(pdf);
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toContain('application/pdf');
  expect(await response.body()).toEqual(fs.readFileSync('public' + pdf));
  await expect(
    page.getByRole('link', { name: 'View résumé (PDF)', exact: true }),
  ).toHaveAttribute('href', pdf);
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Download résumé (PDF)' }).click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toBe('Ariel_Christian_Felices_Resume.pdf');
  expect(fs.readFileSync((await download.path())!)).toEqual(
    fs.readFileSync('public' + pdf),
  );
  await page.locator('a[href^="mailto:"]').focus();
  await expect(page.locator('a[href^="mailto:"]')).toBeFocused();
  expect(
    await page.locator(':focus').evaluate((e) => getComputedStyle(e).outlineWidth),
  ).toBe('3px');

  await page.goto('/resume/');
  await page.getByRole('link', { name: 'Continue to Resume & Contact' }).click();
  await expect(page).toHaveURL(/\/resume-contact\/$/);
  await context.close();
});
const routes = [
  '/',
  '/work/marketplace-reporting/',
  '/work/market-share-workflow/',
  '/work/data-quality-process/',
  '/work/competitive-intelligence/',
  '/work/financial-behavior/',
  '/work/aged-inventory/',
];
test('responsive, disclosures, keyboard and static evidence', async ({ page }) => {
  fs.mkdirSync('.local/screenshots', { recursive: true });
  for (const route of routes) {
    for (const width of [320, 390, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(route);
      await expect(page.locator('h1')).toBeVisible();
      // Readable MDX must not introduce empty or nested paragraphs.
      await expect(page.locator('.article p:empty, .article p p')).toHaveCount(0);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      ).toBe(true);
      expect(
        await page
          .locator('script:not([src^="http://me.kis.v2.scr.kaspersky-labs.com/"])')
          .count(),
      ).toBe(0);
      if (width === 390 || width === 1440)
        await page.screenshot({
          path:
            '.local/screenshots/' +
            (route === '/' ? 'home' : route.split('/')[2]) +
            '-' +
            width +
            '.png',
          fullPage: true,
        });
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(route);
    await page.keyboard.press('Tab');
    await expect(page.locator('.skip')).toBeFocused();
    expect(
      await page.locator('.skip').evaluate((e) => getComputedStyle(e).outlineWidth),
    ).toBe('3px');
    await page.locator('.mobile-nav summary').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('.mobile-nav')).toHaveAttribute('open', '');
    await page.keyboard.press('Tab');
    await expect(page.locator('.mobile-nav a').first()).toBeFocused();
    await page.locator('.mobile-nav summary').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('.mobile-nav')).not.toHaveAttribute('open', '');
    if (route !== '/') {
      await page.locator('.mobile-toc summary').focus();
      await page.keyboard.press('Enter');
      await expect(page.locator('.mobile-toc')).toHaveAttribute('open', '');
      await page.keyboard.press('Tab');
      await page.keyboard.press('Enter');
      await expect(page).toHaveURL(/#context$/);
      if (route === '/work/marketplace-reporting/') {
        await page.locator('.sql-disclosures details').first().locator('summary').click();
        await page.locator('.sql-disclosures pre').first().focus();
        await page.keyboard.press('ArrowRight');
        await page.waitForTimeout(250);
        expect(
          await page
            .locator('.sql-disclosures pre')
            .first()
            .evaluate((e) => (e.scrollWidth > e.clientWidth ? e.scrollLeft > 0 : true)),
        ).toBe(true);
        expect(
          await page
            .locator('.mobile-records')
            .first()
            .evaluate((e) => getComputedStyle(e).display),
        ).toBe('block');
      }
    }
    await page.goto(route);
    await page.evaluate(() => {
      const es = [...document.querySelectorAll<HTMLElement>('body *')];
      const sizes = es.map((e) => parseFloat(getComputedStyle(e).fontSize));
      es.forEach((e, i) => (e.style.fontSize = sizes[i] * 2 + 'px'));
    });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    ).toBe(true);
  }
});
test('automated accessibility on every route', async ({ browser }) => {
  // Accessibility instrumentation needs JS; the separate test above disables it.
  const context = await browser.newContext({ javaScriptEnabled: true });
  const page = await context.newPage();
  const results = [];
  for (const route of [
    '/',
    '/work/',
    '/experience/',
    '/learning/',
    '/resume-contact/',
    '/resume/',
    '/work/marketplace-reporting/',
    '/work/market-share-workflow/',
    '/work/aged-inventory/',
    '/work/data-quality-process/',
    '/work/competitive-intelligence/',
    '/work/financial-behavior/',
  ]) {
    await page.goto('http://127.0.0.1:4321' + route);
    const scan = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    results.push({ route, violations: scan.violations });
    expect(scan.violations, route).toEqual([]);
  }
  fs.writeFileSync('.local/accessibility.json', JSON.stringify(results, null, 2));
  await context.close();
});

test('all route templates reflow at required widths', async ({ page }) => {
  const results = [];
  for (const route of [
    '/work/',
    '/experience/',
    '/learning/',
    '/resume-contact/',
    '/resume/',
    '/work/market-share-workflow/',
    '/work/aged-inventory/',
    '/work/data-quality-process/',
    '/work/competitive-intelligence/',
    '/work/financial-behavior/',
    '/404.html',
  ])
    for (const width of [320, 390, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(route);
      const size = await page.evaluate(() => ({
        width: innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
      }));
      results.push({ route, ...size });
      expect(size.scrollWidth, route + ' ' + width).toBeLessThanOrEqual(width);
    }
  fs.writeFileSync('.local/route-reflow.json', JSON.stringify(results, null, 2));
});
test('mobile evidence accessibility', async ({ browser }) => {
  const context = await browser.newContext({
    javaScriptEnabled: true,
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();
  for (const route of routes) {
    await page.goto('http://127.0.0.1:4321' + route);
    const result = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(result.violations).toEqual([]);
  }
  await context.close();
});

test('404 has no active primary navigation item', async ({ page }) => {
  await page.goto('/404.html');
  await expect(page.locator('nav [aria-current]')).toHaveCount(0);
});

test('mobile disclosure retains its box and does not overlap the brand', async ({
  browser,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: true });
  const page = await context.newPage();
  const results = [];
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('http://127.0.0.1:4321/work/marketplace-reporting/');
    const menu = page.locator('.mobile-nav');
    expect(await menu.evaluate((e) => getComputedStyle(e).display)).toBe('block');
    const brand = await page.locator('.brand').boundingBox();
    const summary = await menu.locator('summary').boundingBox();
    expect(brand!.x + brand!.width).toBeLessThanOrEqual(summary!.x);
    await menu.locator('summary').focus();
    await page.keyboard.press('Space');
    await expect(menu).toHaveAttribute('open', '');
    await page.locator('.mobile-toc summary').click();
    const scan = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(scan.violations).toEqual([]);
    results.push({
      width,
      menuDisplay: 'block',
      expandedDisclosures: true,
      violations: scan.violations,
    });
  }
  fs.writeFileSync(
    '.local/disclosure-accessibility.json',
    JSON.stringify(results, null, 2),
  );
  await context.close();
});

test('Marketplace independent evidence is labeled and readable without JavaScript', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/work/marketplace-reporting/');
  await expect(page.locator('#context')).toContainText(
    'I built the core Amazon Athena reporting dataset',
  );
  await expect(page.locator('#outcome')).toContainText(
    'It remained in active use by senior data leadership and other stakeholders',
  );
  await expect(page.locator('#example #illustration-disclosure')).toHaveCount(1);
  await expect(page.locator('#illustration-disclosure')).toContainText(
    'Created independently for this portfolio.',
  );
  await expect(page.locator('#example .evidence-label')).toHaveText(
    'Independent illustration',
  );
  await expect(page.locator('#synthetic-demonstration .evidence-label')).toHaveText(
    'Independent technical example · Synthetic data',
  );
  await expect(page.locator('#synthetic-inputs table')).toHaveCount(3);
  await expect(page.locator('#synthetic-results table')).toHaveCount(2);
  await expect(page.locator('.sql-disclosures details')).toHaveCount(3);
  await expect(
    page.locator('#synthetic-inputs table').first().locator('th'),
  ).toContainText(['Line', 'Order', 'Customer', 'Placement', 'Completed at', 'Status']);
  await page.locator('.sql-disclosures details').first().locator('summary').focus();
  expect(
    await page
      .locator('.sql-disclosures details')
      .first()
      .locator('summary')
      .evaluate((e) => getComputedStyle(e).outlineWidth),
  ).toBe('3px');
  await page.keyboard.press('Enter');
  await expect(page.locator('.sql-disclosures details').first()).toHaveAttribute(
    'open',
    '',
  );
  await page.locator('#illustration-disclosure').scrollIntoViewIfNeeded();
  await expect(page.locator('#illustration-disclosure')).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBe(true);
});

test('Marketplace flow order and all three native SQL disclosures work across layouts', async ({
  page,
}) => {
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    await page.goto('/work/marketplace-reporting/');
    const connectors = await page
      .locator('#reporting-flow .flow-stages li')
      .evaluateAll((items) =>
        items.map((item) => getComputedStyle(item, '::after').content),
      );
    if (width === 390) {
      expect(connectors.slice(0, 5).every((value) => value.includes('↓'))).toBe(true);
    } else {
      expect(connectors[0]).toContain('→');
      expect(connectors[1]).toContain('→');
      expect(['none', 'normal', ''].includes(connectors[2])).toBe(true);
      expect(connectors[3]).toContain('→');
      expect(connectors[4]).toContain('→');
    }
    for (const details of await page.locator('.sql-disclosures details').all()) {
      const summary = details.locator('summary');
      await summary.focus();
      await page.keyboard.press('Enter');
      await expect(details).toHaveAttribute('open', '');
      await page.keyboard.press('Enter');
      await expect(details).not.toHaveAttribute('open', '');
    }
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    ).toBe(true);
  }
});

test('Market Share links, case navigation and independent illustration work without JavaScript', async ({
  page,
}) => {
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/');
    await page
      .getByRole('link', {
        name: 'Read the market share intelligence case →',
        exact: true,
      })
      .click();
    await expect(page).toHaveURL(/\/work\/market-share-workflow\/$/);
    await expect(page.locator('#context')).toContainText(
      'I owned the analytical methodology',
    );
    await expect(page.locator('#outcome')).toContainText(
      'stakeholders now use as part of their decision-support workflow',
    );
    await expect(page.locator('#outcome')).toContainText(
      'completed, tested, reviewed, and approved, with deployment planned',
    );
    await expect(page.locator('#scope')).toContainText(
      'rather than a live production system',
    );
    await expect(page.locator('#scope li')).toHaveCount(4);
    await expect(page.locator('#example .evidence-label')).toHaveText(
      'Independent illustration',
    );
    await expect(page.locator('#example .lifecycle li')).toHaveCount(6);
    const connectors = await page
      .locator('#example .lifecycle li')
      .evaluateAll((items) =>
        items.map((item) => getComputedStyle(item, '::after').content),
      );
    if (width <= 700) {
      expect(connectors.slice(0, 5).every((value) => value.includes('↓'))).toBe(true);
    } else {
      expect(connectors[1]).toContain('→');
      expect(['none', 'normal', ''].includes(connectors[2])).toBe(true);
      expect(connectors[3]).toContain('→');
    }
    if (width <= 700) {
      await page.locator('.mobile-toc summary').focus();
      await page.keyboard.press('Enter');
      await page.locator('.mobile-toc a[href="#example"]').focus();
      await page.keyboard.press('Enter');
    } else {
      await page.locator('.toc a[href="#example"]').click();
    }
    await expect(page).toHaveURL(/#example$/);
    await expect(page.locator('#preparation-note')).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    ).toBe(true);
  }
  await page.goto('/work/');
  await page
    .getByRole('link', {
      name: 'Read the market share intelligence case →',
      exact: true,
    })
    .click();
  await expect(page).toHaveURL(/\/work\/market-share-workflow\/$/);
});

test('Data Quality links, disclosures and expanded accessibility', async ({
  page,
  browser,
}) => {
  await page.goto('/');
  await page
    .getByRole('link', {
      name: 'Read the data-quality framework case →',
      exact: true,
    })
    .click();
  await expect(page).toHaveURL(/\/work\/data-quality-process\/$/);
  await expect(page.locator('#context')).toContainText(
    'I designed and implemented the reusable R/R Markdown framework',
  );
  await page.goto('/work/');
  await page
    .getByRole('link', {
      name: 'Read the data-quality framework case →',
      exact: true,
    })
    .click();
  await expect(page).toHaveURL(/\/work\/data-quality-process\/$/);
  const context = await browser.newContext({
    javaScriptEnabled: true,
    viewport: { width: 390, height: 844 },
  });
  const expanded = await context.newPage();
  await expanded.goto('http://127.0.0.1:4321/work/data-quality-process/');
  await expanded.locator('.mobile-nav summary').focus();
  await expanded.keyboard.press('Enter');
  await expect(expanded.locator('.mobile-nav')).toHaveAttribute('open', '');
  await expanded.locator('.mobile-toc summary').focus();
  await expanded.keyboard.press('Enter');
  await expect(expanded.locator('.mobile-toc')).toHaveAttribute('open', '');
  const scan = await new AxeBuilder({ page: expanded })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(scan.violations).toEqual([]);
  await expanded.locator('.mobile-toc a[href="#example"]').focus();
  expect(
    await expanded
      .locator('.mobile-toc a[href="#example"]')
      .evaluate((e) => getComputedStyle(e).outlineWidth),
  ).toBe('3px');
  await expanded.keyboard.press('Enter');
  await expect(expanded).toHaveURL(/#example$/);
  await expect(expanded.locator('#preparation-note')).toBeVisible();
  await expect(expanded.locator('.quality-process li')).toHaveCount(7);
  await expect(expanded.locator('.sequence-cue')).toHaveText('Follow stages 01–07.');
  for (let index = 0; index < 7; index++) {
    const expectedContent = index < 6 ? '"↓"' : 'none';
    expect(
      await expanded
        .locator('.quality-process li')
        .nth(index)
        .evaluate((element) => getComputedStyle(element, '::after').content),
    ).toBe(expectedContent);
  }
  expect(
    await expanded.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBe(true);
  await expect(expanded.locator('#quality-synthetic-example .evidence-label')).toHaveText(
    'Independent technical example · Synthetic data',
  );
  await expect(expanded.locator('.quality-code-disclosures details')).toHaveCount(2);
  await expect(expanded.locator('#quality-synthetic-example table')).toHaveCount(4);
  const firstRDisclosure = expanded.locator('.quality-code-disclosures details').first();
  await firstRDisclosure.locator('summary').focus();
  expect(
    await firstRDisclosure
      .locator('summary')
      .evaluate((element) => getComputedStyle(element).outlineWidth),
  ).toBe('3px');
  await expanded.keyboard.press('Enter');
  await expect(firstRDisclosure).toHaveAttribute('open', '');
  await firstRDisclosure.locator('pre').focus();
  expect(
    await firstRDisclosure
      .locator('pre')
      .evaluate((element) => element.scrollWidth >= element.clientWidth),
  ).toBe(true);
  expect(
    await expanded
      .locator('#quality-synthetic-input .mobile-records')
      .evaluate((element) => getComputedStyle(element).display),
  ).toBe('block');
  await context.close();

  for (const width of [768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/work/data-quality-process/');
    for (let index = 0; index < 7; index++) {
      expect(
        await page
          .locator('.quality-process li')
          .nth(index)
          .evaluate((element) => getComputedStyle(element, '::after').content),
      ).toBe('none');
    }
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    ).toBe(true);
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/work/data-quality-process/');
  const staticDisclosure = page.locator('.quality-code-disclosures details').first();
  await staticDisclosure.locator('summary').focus();
  await page.keyboard.press('Enter');
  await expect(staticDisclosure).toHaveAttribute('open', '');
  await expect(staticDisclosure.locator('pre')).toBeVisible();
});

test('Competitive Intelligence cards and static example are accessible', async ({
  page,
  browser,
}) => {
  for (const route of ['/', '/work/']) {
    await page.goto(route);
    await page
      .getByRole('link', {
        name: 'Read the competitive-intelligence case →',
        exact: true,
      })
      .click();
    await expect(page).toHaveURL(/\/work\/competitive-intelligence\/$/);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('#synthetic-summary tbody tr')).toHaveCount(2);
  expect(
    await page
      .locator('#synthetic-summary table')
      .evaluate((e) => getComputedStyle(e).display),
  ).toBe('block');
  expect(
    await page
      .locator('#synthetic-detail table')
      .evaluate((e) => getComputedStyle(e).display),
  ).toBe('table');
  await page.locator('#synthetic-detail .table-wrap').focus();
  expect(
    await page
      .locator('#synthetic-detail .table-wrap')
      .evaluate((e) => getComputedStyle(e).outlineWidth),
  ).toBe('3px');
  const context = await browser.newContext({
    javaScriptEnabled: true,
    viewport: { width: 390, height: 844 },
  });
  const expanded = await context.newPage();
  await expanded.goto('http://127.0.0.1:4321/work/competitive-intelligence/');
  await expanded.locator('.mobile-nav summary').click();
  await expanded.locator('.mobile-toc summary').click();
  const scan = await new AxeBuilder({ page: expanded })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(scan.violations).toEqual([]);
  await context.close();
});

test('Financial Behavior links and expanded disclosures remain accessible', async ({
  page,
  browser,
}) => {
  for (const route of ['/', '/work/']) {
    await page.goto(route);
    await page
      .getByRole('link', { name: 'Read the financial-behavior case →', exact: true })
      .click();
    await expect(page).toHaveURL(/\/work\/financial-behavior\/$/);
  }
  await expect(page.locator('#approach')).toContainText(
    'We jointly examined influence, residual and error diagnostics and compared the methods when interpreting the findings.',
  );
  const context = await browser.newContext({
    javaScriptEnabled: true,
    viewport: { width: 390, height: 844 },
  });
  const expanded = await context.newPage();
  await expanded.goto('http://127.0.0.1:4321/work/financial-behavior/');
  await expanded.locator('.mobile-nav summary').focus();
  await expanded.keyboard.press('Enter');
  await expanded.locator('.mobile-toc summary').focus();
  await expanded.keyboard.press('Enter');
  await expect(expanded.locator('.mobile-nav')).toHaveAttribute('open', '');
  await expect(expanded.locator('.mobile-toc')).toHaveAttribute('open', '');
  const scan = await new AxeBuilder({ page: expanded })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(scan.violations).toEqual([]);
  await expanded.locator('.mobile-toc a[href="#example"]').focus();
  expect(
    await expanded
      .locator('.mobile-toc a[href="#example"]')
      .evaluate((e) => getComputedStyle(e).outlineWidth),
  ).toBe('3px');
  await expanded.keyboard.press('Enter');
  await expect(expanded).toHaveURL(/#example$/);
  await expect(expanded.locator('#preparation-note')).toBeVisible();
  await context.close();
});

test('Aged Inventory static scenario tables and links remain accessible', async ({
  page,
  browser,
}) => {
  for (const route of ['/', '/work/']) {
    await page.goto(route);
    await page
      .getByRole('link', { name: 'Read the aged-inventory case →', exact: true })
      .click();
    await expect(page).toHaveURL(/\/work\/aged-inventory\/$/);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('#inventory-scenarios .inventory-scenario')).toHaveCount(2);
  expect(
    await page
      .locator('#inventory-scenarios .mobile-records')
      .first()
      .evaluate((e) => getComputedStyle(e).display),
  ).toBe('block');
  await expect(
    page.locator('#inventory-scenarios input, #inventory-scenarios button'),
  ).toHaveCount(0);

  const lifecyclePanel = page.locator('#inventory-lifecycle');
  const lifecycle = lifecyclePanel.locator('.inventory-lifecycle');
  await expect(lifecycle.locator('.lifecycle-steps > li')).toHaveCount(7);
  await expect(lifecyclePanel).toContainText('Independent illustration');
  await expect(lifecyclePanel).toContainText(
    'does not reproduce employer data, formulas, workbook design, rules, or system architecture',
  );
  await expect(lifecycle).toContainText('Source domains');
  await expect(lifecycle).toContainText('Business review');
  await expect(lifecycle.getByText('Follow stages 01–07.')).toBeVisible();

  const stageNames = [
    'Source domains',
    'Matching and normalization',
    'Velocity and inventory coverage',
    'Three financial paths',
    'Validation gates',
    'Explainable recommendation',
    'Business review',
  ];

  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/work/aged-inventory/');
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    ).toBe(true);
    await expect(page.locator('.inventory-lifecycle')).toBeVisible();
    expect(
      await page
        .locator('.inventory-lifecycle .lifecycle-steps > li strong')
        .allTextContents(),
    ).toEqual(stageNames);

    const connectors = await page
      .locator('.inventory-lifecycle .lifecycle-steps > li')
      .evaluateAll((items) =>
        items.map((item) => getComputedStyle(item, '::after').content),
      );
    if (width <= 700) {
      expect(connectors.slice(0, 6).every((value) => value.includes('↓'))).toBe(true);
      expect(connectors[6]).toBe('none');
    } else {
      expect(connectors.every((value) => value === 'none')).toBe(true);
    }
  }

  const context = await browser.newContext({
    javaScriptEnabled: true,
    viewport: { width: 390, height: 844 },
  });
  const expanded = await context.newPage();
  await expanded.goto('http://127.0.0.1:4321/work/aged-inventory/');
  for (const selector of ['.mobile-nav summary', '.mobile-toc summary']) {
    await expanded.locator(selector).focus();
    await expanded.keyboard.press('Enter');
  }
  expect(
    (
      await new AxeBuilder({ page: expanded })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze()
    ).violations,
  ).toEqual([]);
  await context.close();
});

test('Financial synthetic R output and disclosure work without JavaScript', async ({
  page,
  browser,
}) => {
  await page.goto('/work/financial-behavior/');
  const code = page.locator('#trial-code');
  const summary = code.locator('summary');
  await expect(code).not.toHaveAttribute('open', '');
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await summary.focus();
    expect(await summary.evaluate((e) => getComputedStyle(e).outlineWidth)).toBe('3px');
    await page.keyboard.press('Enter');
    await expect(code).toHaveAttribute('open', '');
    await expect(code.locator('pre')).toBeVisible();
    const box = await code.locator('pre').evaluate((e) => ({
      width: e.clientWidth,
      scroll: e.scrollWidth,
      overflow: getComputedStyle(e).overflowX,
    }));
    expect(box.overflow).toBe('auto');
    expect(box.scroll).toBeGreaterThanOrEqual(box.width);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    ).toBe(true);
    await page.keyboard.press('Enter');
    await expect(code).not.toHaveAttribute('open', '');
    await expect(page.locator('#trial-populations')).toContainText('Modeling');
    await expect(page.locator('#trial-model')).toContainText('1.637');
  }
  await page.locator('#evidence-index a[href="#practice-trial-example"]').click();
  await expect(page).toHaveURL(/#practice-trial-example$/);
  const context = await browser.newContext({
    javaScriptEnabled: true,
    viewport: { width: 390, height: 900 },
  });
  const enlarged = await context.newPage();
  await enlarged.goto('http://127.0.0.1:4321/work/financial-behavior/');
  await enlarged.evaluate(() => {
    const elements = [
      ...document.querySelectorAll('p, td, th, summary, h1, h2, h3, code, caption'),
    ];
    const sizes = elements.map((e) => parseFloat(getComputedStyle(e).fontSize));
    elements.forEach((e, i) => {
      (e as HTMLElement).style.fontSize = `${sizes[i] * 2}px`;
    });
  });
  await enlarged.locator('#trial-code summary').focus();
  await enlarged.keyboard.press('Enter');
  expect(
    await enlarged.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBe(true);
  const scan = await new AxeBuilder({ page: enlarged })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(scan.violations).toEqual([]);
  await context.close();
});

test('Experience role reading order, links, focus and enlarged static layout', async ({
  page,
}) => {
  const ids = ['sunco', 'lifebank', 'theoria', 'talleco', 'ul'];
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/experience/');
    await expect(page.locator('h1')).toHaveText('Experience');
    await expect(page.locator('#lifebank .role-title')).toHaveText(
      'Data Analyst (Consultant)',
    );
    expect(
      await page.locator('.experience-role').evaluateAll((es) => es.map((e) => e.id)),
    ).toEqual(ids);
    const boxes = await page.locator('.experience-role').evaluateAll((es) =>
      es.map((e) => {
        const r = e.getBoundingClientRect();
        return { top: r.top, bottom: r.bottom };
      }),
    );
    for (let i = 1; i < boxes.length; i++)
      expect(boxes[i].top).toBeGreaterThanOrEqual(boxes[i - 1].bottom);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    ).toBe(true);
    await page.locator('#sunco .related-work a').first().focus();
    expect(
      await page
        .locator('#sunco .related-work a')
        .first()
        .evaluate((e) => getComputedStyle(e).outlineWidth),
    ).toBe('3px');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/work\/market-share-workflow\/$/);
    await page.goto('/experience/');
    await page.evaluate(() => {
      const es = [...document.querySelectorAll<HTMLElement>('body *')];
      const sizes = es.map((e) => parseFloat(getComputedStyle(e).fontSize));
      es.forEach((e, i) => (e.style.fontSize = sizes[i] * 2 + 'px'));
    });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    ).toBe(true);
  }
  await page.goto('/experience/');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.keyboard.press('Tab');
  await expect(page.locator('.skip')).toBeFocused();
  await page.locator('.mobile-nav summary').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.mobile-nav')).toHaveAttribute('open', '');
  await page.keyboard.press('Enter');
  await page.locator('.experience-close a').focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/resume-contact\/$/);
});

test('Learning navigation, safe credentials and static mobile readability', async ({
  page,
  browser,
}) => {
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    const nav = width <= 700 ? page.locator('.mobile-nav') : page.locator('.desktop-nav');
    if (width <= 700) {
      await page.locator('.mobile-nav summary').focus();
      await page.keyboard.press('Enter');
    }
    await nav.getByRole('link', { name: 'Learning', exact: true }).click();
    await expect(page).toHaveURL(/\/learning\/$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Learning and Professional Development',
    );
    await expect(page.locator('.eyebrow')).toHaveText('Personal analytics project');
    for (const [url, label] of [
      ['https://github.com/A-C-A-F/Multiple-Linear-Regression', 'View project on GitHub'],
      [
        'https://www.kaggle.com/code/arielfelices/multiple-linear-regression',
        'View notebook on Kaggle',
      ],
    ]) {
      const link = page.getByRole('link', { name: label, exact: true });
      await expect(link).toHaveCount(1);
      await expect(link).toHaveAttribute('href', url);
      await expect(link).toHaveAttribute('target', '_blank');
      await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
      await link.focus();
      await expect(link).toBeFocused();
    }
    expect(
      await page.locator('.link-tail').evaluateAll((elements) =>
        elements.every((e) => {
          const range = document.createRange();
          range.selectNodeContents(e);
          const tops = [...range.getClientRects()]
            .filter((r) => r.width > 0)
            .map((r) => Math.round(r.top));
          return Math.max(...tops) - Math.min(...tops) <= 2;
        }),
      ),
    ).toBe(true);
    await expect(page.locator('.credentials a')).toHaveCount(7);
    await expect(page.locator('main h2')).toHaveCount(2);
    for (const a of await page.locator('main a[target="_blank"]').all()) {
      await expect(a).toHaveAttribute('rel', 'noopener noreferrer');
      await a.focus();
      await expect(a).toBeFocused();
      expect(await a.evaluate((e) => getComputedStyle(e).outlineWidth)).toBe('3px');
    }
    const first = page.locator('.credentials a').first();
    await first.focus();
    await page.keyboard.press('Tab');
    await expect(page.locator('.credentials a').nth(1)).toBeFocused();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    ).toBe(true);
    await page.evaluate(() => {
      const es = [...document.querySelectorAll<HTMLElement>('body *')];
      const sizes = es.map((e) => parseFloat(getComputedStyle(e).fontSize));
      es.forEach((e, i) => (e.style.fontSize = `${sizes[i] * 2}px`));
    });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    ).toBe(true);
  }
  const context = await browser.newContext({
    javaScriptEnabled: true,
    viewport: { width: 390, height: 844 },
  });
  const mobile = await context.newPage();
  await mobile.goto('/learning/');
  expect(
    (
      await new AxeBuilder({ page: mobile })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze()
    ).violations,
  ).toEqual([]);
  await context.close();
});
