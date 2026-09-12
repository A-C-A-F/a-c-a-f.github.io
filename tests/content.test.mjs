import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  inspectHTML,
  inspectText,
  safeFile,
  scanTree,
  validate,
  approvedResume,
} from '../scripts/validate.mjs';

test('only the exact approved resume paths and bytes pass binary validation', () => {
  const source = 'public/resume/Ariel_Christian_Felices_Resume.pdf';
  const generated = 'resume/Ariel_Christian_Felices_Resume.pdf';
  const bytes = fs.readFileSync(source);
  assert(approvedResume(source, bytes));
  assert(approvedResume(source.replaceAll('/', '\\'), bytes));
  assert(approvedResume(generated, bytes, { generated: true }));
  assert.deepEqual(fs.readFileSync('dist/' + generated), bytes);
  assert.deepEqual(scanTree(fixture({ [source]: bytes })).errors, []);
  assert.deepEqual(
    scanTree(fixture({ [generated]: bytes }), { generated: true }).errors,
    [],
  );
  const bad = Buffer.from(bytes);
  bad[0] ^= 1;
  for (const [name, value, options] of [
    [source, bad, {}],
    [generated, bad, { generated: true }],
    ['public/other/Ariel_Christian_Felices_Resume.pdf', bytes, {}],
    ['public/resume/different.pdf', bytes, {}],
    [source, bytes, { generated: true }],
    [generated, bytes, {}],
  ]) {
    assert(!approvedResume(name, value, options));
    assert(
      scanTree(fixture({ [name]: value }), options).errors.some((e) =>
        e.endsWith('unsafe-type'),
      ),
    );
  }
  for (const extension of ['pdf', 'docx', 'xlsx', 'csv', 'zip', 'exe', 'db', 'pem']) {
    const name = 'public/resume/other.' + extension;
    assert(!safeFile(name));
    assert(
      scanTree(fixture({ [name]: credential })).errors.includes(name + ': credential'),
    );
  }
});

test('Resume and Contact uses approved public identity and stable PDF actions', () => {
  const html = fs.readFileSync('dist/resume-contact/index.html', 'utf8');
  assert(html.includes('mailto:arielchristian.felices@gmail.com'));
  assert(html.includes('https://www.linkedin.com/in/ariel-christian-felices/'));
  assert(html.includes('rel="noopener noreferrer"'));
  assert(html.includes('download="Ariel_Christian_Felices_Resume.pdf"'));
  assert(html.includes('View résumé (PDF)'));
  assert(html.includes('Cavite, Philippines'));
  assert(!/tel:|github\.com|Ultimate_Default|\.docx|\+63|\b09\d{9}\b/i.test(html));
  assert.deepEqual(inspectText(html), []);
  const secondary = fs.readFileSync('dist/resume/index.html', 'utf8');
  assert(secondary.includes('Continue to Resume &amp; Contact'));
  assert(!secondary.includes('download='));
});

const valid =
  '<html lang="en"><head><title>Work</title><meta name="description" content="Public work"><link rel="canonical" href="https://a-c-a-f.github.io/"></head><body><main><h1>Work</h1></main></body></html>';
const tag = (name, attributes = '') =>
  '<' + name + (attributes ? ' ' + attributes : '') + '>';
const unfinished = ['To be', 'confirmed'].join(' ');
const machinePath = ['Z:', 'review', 'example'].join('\\');
// Deliberately synthetic values are assembled at runtime, never real credentials.
const credential = ['ghp', '_', 'A'.repeat(36)].join('');
function fixture(files) {
  fs.mkdirSync('.local/negative-tests', { recursive: true });
  const root = fs.mkdtempSync('.local/negative-tests/run-');
  for (const [name, text] of Object.entries(files)) {
    const target = path.join(root, name);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, text);
  }
  // Fixtures remain in the ignored QA directory; no source or external file is touched.
  return root;
}

test('valid page, required metadata, canonical and indexing', () => {
  assert.deepEqual(inspectHTML(valid), []);
  assert(inspectHTML(valid.replace('<title>Work</title>', '')).includes('metadata'));
  assert(
    inspectHTML(
      valid.replace('https://a-c-a-f.github.io/', 'https://example.org/'),
    ).includes('canonical'),
  );
  const meta = tag('meta', 'name="robots" content="' + ['no', 'index'].join('') + '"');
  assert(inspectHTML(valid.replace('</head>', meta + '</head>')).includes('noindex'));
});

test('unsafe paths across operating systems and serialized JSON', () => {
  const paths = [
    machinePath,
    ['Y:', 'data', 'sample'].join('/'),
    ['file:', '', '', 'private', 'example'].join('/'),
    ['', 'Users', 'person', 'file'].join('/'),
    ['', 'home', 'person', 'file'].join('/'),
    ['', 'root', 'file'].join('/'),
    ['~', 'file'].join('/'),
    '\\'.repeat(2) + ['server', 'share', 'file'].join('\\'),
  ];
  for (const value of paths) {
    assert(inspectText(value).includes('local-path'), value);
    assert(inspectText(JSON.stringify({ value })).includes('local-path'), value);
  }
});

test('credentials and private keys', () => {
  for (const value of [
    credential,
    ['-----BEGIN', 'PRIVATE KEY-----'].join(' '),
    ['api_key', '=', '"' + 'sample'.repeat(4) + '"'].join(''),
  ])
    assert(inspectText(value).includes('credential'));
});

test('unsafe artifacts cannot hide behind a permitted extension', () => {
  for (const name of [
    'records.xlsx',
    'original.docx',
    'database.sqlite',
    '.env',
    '.env.json',
    'app.exe',
    'cache.log',
    'review.zip',
    'browser.db',
    'key.pem',
    'notes.pdf',
  ])
    assert.equal(safeFile(name), false, name);
  assert.equal(safeFile('clean-room-example.R'), true);
});

for (const name of [
  'settings.json',
  'README.md',
  'scripts/nested/check.mjs',
  'tests/nested/check.ts',
  'src/nested/deeper/example.md',
  '.github/review.yml',
  'public/example.txt',
]) {
  test('repository scan detects unsafe material in ' + name, () => {
    const root = fixture({ [name]: [machinePath, credential, unfinished].join('\n') });
    const result = scanTree(root);
    for (const error of ['local-path', 'credential', 'unfinished-wording'])
      assert(result.errors.includes(name + ': ' + error));
  });
}

test('generated pages are checked separately from repository source', () => {
  const root = fixture({
    'README.md': 'Public project',
    'dist/index.html': valid.replace('Public work', machinePath + ' ' + unfinished),
  });
  assert.deepEqual(scanTree(root).errors, []);
  assert.throws(() => validate(root, { quiet: true }), /dist\/index.html: local-path/);
});

test('generated metadata, evidence labels, browser scripts and broken links', () => {
  const variants = [
    [valid.replace('<title>Work</title>', ''), 'metadata'],
    [valid.replace('https://a-c-a-f.github.io/', 'https://example.org/'), 'canonical'],
    [
      valid.replace(
        '</main>',
        '<span class="evidence-label">Unapproved label</span></main>',
      ),
      'evidence-classification',
    ],
    [
      valid.replace('</body>', tag('script', 'src="/app.js"') + '</' + 'script></body>'),
      'client-script',
    ],
    [
      valid.replace('</main>', '<a href="/missing/">Read another case →</a></main>'),
      'missing-target',
    ],
  ];
  for (const [html, error] of variants) {
    const root = fixture({ 'dist/index.html': html });
    assert.throws(() => validate(root, { quiet: true }), new RegExp(error));
  }
});

test('links and junctions are rejected without following their targets', () => {
  const root = fixture({ 'target/safe.md': 'Safe text' });
  fs.symlinkSync(
    path.resolve(root, 'target'),
    path.join(root, 'linked'),
    process.platform === 'win32' ? 'junction' : 'dir',
  );
  const result = scanTree(root);
  assert(result.errors.includes('linked: symbolic-link-or-junction'));
  assert(!result.files.some((name) => name.startsWith('linked/')));
});

test('ignored caches stay outside the source scan, unknown directories do not', () => {
  const root = fixture({
    '.local/cache.txt': machinePath,
    'new-directory/unsafe.txt': machinePath,
    'node_modules/sample/index.js': machinePath,
  });
  assert.deepEqual(scanTree(root).errors, ['new-directory/unsafe.txt: local-path']);
});

test('404 must not select any primary navigation item', () => {
  const html = valid
    .replace('https://a-c-a-f.github.io/', 'https://a-c-a-f.github.io/404/')
    .replace('</main>', '<nav><a href="/" aria-current="page">Home</a></nav></main>');
  assert(inspectHTML(html, '/404/').includes('404-current-navigation'));
});
import { parseHTML } from 'linkedom';

test('Marketplace public narrative preserves ownership, collaboration and Finance boundaries', () => {
  const { document } = parseHTML(
    fs.readFileSync('dist/work/marketplace-reporting/index.html', 'utf8'),
  );
  const article = document.querySelector('article');
  const text = article.textContent.replace(/\s+/g, ' ');
  assert(
    text.includes(
      'I built the core Amazon Athena reporting dataset, owned its validation and documentation, and personally published and maintained it in Amazon QuickSight.',
    ),
  );
  assert(text.includes('Particular relationship corrections were collaborative'));
  assert(
    text.includes('stakeholders retained authority over ambiguous business definitions'),
  );
  assert(
    text.includes(
      'I also compared the dataset with Finance reporting across several KPI families.',
    ),
  );
  assert(
    text.includes(
      'Possible explanations remained review items unless the responsible stakeholders confirmed them.',
    ),
  );
  assert(
    !/Finance (?:formally )?approved|all discrepancies (?:were )?(?:resolved|reconciled)|complete Finance reconciliation|I (?:solely built|owned every source)/i.test(
      text,
    ),
  );
  assert(
    !/(?:organization-wide adoption was achieved|the work improved decision quality|the work saved time|the work increased revenue|commercial impact was achieved)/i.test(
      text,
    ),
  );
  assert.equal(
    document.querySelector('#illustration-disclosure').textContent.trim(),
    'Created independently for this portfolio. It explains a general reporting and validation method and does not reproduce employer data, source names, architecture, rules, or dashboard design.',
  );
  assert.equal(
    document.querySelector('#example .evidence-label').textContent.trim(),
    'Independent illustration',
  );
  assert.equal(
    document.querySelector('#synthetic-demonstration .evidence-label').textContent.trim(),
    'Independent technical example · Synthetic data',
  );
  assert(
    document
      .querySelector('.demonstration-disclosure')
      .textContent.includes(
        'Independent technical demonstration using synthetic data. This does not reproduce an employer query, schema, dataset, or confidential business rule.',
      ),
  );
  assert.equal(
    (document.body.textContent.match(/AI-assisted development/g) || []).length,
    0,
  );
  assert.deepEqual(inspectText(text), []);
});

test('generated public pages exclude private review annotations and machine paths', () => {
  const forbidden = [
    ['Private review', 'candidate'].join(' '),
    ['Statements needing', 'my confirmation'].join(' '),
    ['retained technical', 'documentation names me'].join(' '),
    ['records do', 'not establish'].join(' '),
    ['private', 'traceability'].join(' '),
  ];
  function visit(directory) {
    for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, item.name);
      if (item.isDirectory()) visit(file);
      else if (file.endsWith('.html')) {
        const html = fs.readFileSync(file, 'utf8');
        assert(!/\[(?:MP|MS|AI|DQ|CI|FB|WEB|EXP)-\d+\]/.test(html), file);
        for (const phrase of forbidden)
          assert(
            !html.toLowerCase().includes(phrase.toLowerCase()),
            file + ': ' + phrase,
          );
        assert(!inspectText(html).includes('local-path'), file);
      }
    }
  }
  visit('dist');
});
import { caseSchema } from '../src/schemas/case.mjs';
import { createHash } from 'node:crypto';

const caseFixture = {
  title: 'A distinct analytical case',
  description: 'An independently scoped analytical case description.',
  context: 'Professional analytics',
  order: 0,
  featured: true,
  tags: ['Validation'],
  detailed: true,
  opening: {
    subtitle: 'A case-specific subtitle without a shared fallback.',
    contribution: 'A case-specific contribution summary for review.',
    outcome: 'A case-specific outcome summary for review.',
    evidence: 'A case-specific independent evidence summary.',
  },
};

test('detailed-case schema requires every opening field without defaults', () => {
  assert(caseSchema.safeParse(caseFixture).success);
  const absent = structuredClone(caseFixture);
  delete absent.opening;
  assert(!caseSchema.safeParse(absent).success);
  for (const field of Object.keys(caseFixture.opening)) {
    for (const value of [undefined, '', '   ']) {
      const candidate = structuredClone(caseFixture);
      candidate.opening[field] = value;
      assert(!caseSchema.safeParse(candidate).success, field);
    }
  }
  assert(caseSchema.safeParse({ ...absent, detailed: false }).success);
});

function publicDocument(slug) {
  return parseHTML(fs.readFileSync(`dist/work/${slug}/index.html`, 'utf8')).document;
}

test('each detailed case renders its own opening and summary cases remain simple', () => {
  const expected = {
    'aged-inventory': [
      'An approved Excel decision model for recurring monthly reviews, combining source preparation, scenario economics, validation gates, and explainable recommendations.',
      'Designed and built the core analytical decision model within an existing workbook, including its principal calculation, validation, scenario-comparison, and explainable recommendation logic.',
      'Approved for use and incorporated into recurring monthly aged-inventory reviews; recommendations provided a structured financial basis while stakeholders retained final operational authority.',
      'Professional narrative; an independent process illustration; and a separate static technical example using fictional data and calculations.',
    ],
    'financial-behavior': [
      'Building fit-for-purpose analytical populations, comparing statistical methods and translating findings into recurring decision-support reporting.',
      'I built joined analytical populations and logistic-regression repayment analysis, and jointly developed OLS and quantile-regression savings analyses. I also handled data completeness and continuity, created visualizations, and wrote the final report and presentation for the advanced savings study.',
      'Reporting work accepted and approved; reports and recommendations used in stakeholder reviews and decisions, with recurring analysis continuing when I left LifeBank.',
      'Professional narrative; an independent data-free interpretation illustration and a separate synthetic R association example.',
    ],
    'competitive-intelligence': [
      'Designing a comprehensive, repeatable Power BI solution for product comparisons and contextual search-term investigation.',
      'I performed my own analysis and designed and built the Power BI solution, including its supporting SQL, DAX measures, reporting model and contextual search-term views. I used an earlier Excel analysis as a comparison reference, then validated, published and maintained the report for Ads Team use.',
      'Published in Power BI Service, approved for use and used by the Ads Team; maintained after publication.',
      'Professional narrative; an independent static example of comparison scope and summary/detail separation using synthetic data.',
    ],
    'data-quality-process': [
      'Turning table-specific quality rules into repeatable database checks, management-level monitoring, remediation-ready exceptions, and a governed operating process.',
      'I designed and implemented a reusable R/R Markdown validation framework with table-specific rule configurations, read-oriented PostgreSQL access, rule evaluation, health scorecards, visual diagnostics, record-level exception outputs, and recurring audit packages. I also authored and implemented the cross-functional operating protocol.',
      'Operating protocol formally approved and put into use; framework deployed across multiple core operational datasets and transitioned to Data Engineering for continued recurring execution.',
      'Professional narrative; an independent data-free lifecycle illustration; and a clean-room synthetic R example.',
    ],
    'marketplace-reporting': [
      'Building and maintaining a multi-source Athena dataset for QuickSight while making reporting grain, exceptions, and business definitions traceable.',
      'Built the core Athena dataset; owned validation and documentation; published and maintained it in QuickSight.',
      'Actively used QuickSight reporting dataset with maintained definitions, validation records, and an approved customer-behavior enhancement.',
      'Professional narrative; independent process illustration and clean-room SQL demonstration.',
    ],
    'market-share-workflow': [
      'Evolving a manually validated market-share method into a governed analytical product with reviewable evidence and controlled outcomes.',
      'Owned the methodology, Python and SQL implementation, validation design, Streamlit application, release testing, and handoff preparation.',
      'Approved Streamlit application awaiting planned deployment; transferred Codex Skill now used for stakeholder decision support.',
      'Professional narrative; independent governed-lifecycle illustration without employer data.',
    ],
  };
  for (const [slug, values] of Object.entries(expected)) {
    const document = publicDocument(slug);
    const actual = [
      document.querySelector('.case-subtitle'),
      ...document.querySelectorAll('.case-facts dd'),
    ].map((e) => e.textContent.trim());
    assert.deepEqual(actual, values);
    for (const other of Object.keys(expected).filter((key) => key !== slug)) {
      for (const value of expected[other]) assert(!actual.includes(value));
    }
  }
});

test('Marketplace homepage and Work cards use the approved summary and link', () => {
  const summary =
    'I built, published, and maintained the core Athena dataset behind Marketplace reporting in QuickSight, with validation controls for purchase, posting, customer, and engagement data drawn from different reporting grains.';
  for (const file of ['dist/index.html', 'dist/work/index.html']) {
    const { document } = parseHTML(fs.readFileSync(file, 'utf8'));
    const link = document.querySelector('a[href="/work/marketplace-reporting/"]');
    assert.equal(
      link.textContent.replace(/\s+/g, ' ').trim(),
      'Read the Marketplace reporting case →',
    );
    assert.equal(
      link.closest('article').querySelector('.summary').textContent.trim(),
      summary,
    );
  }
});

test('Marketplace delivery, use and One-and-Done claims remain evidence-bounded', () => {
  const document = publicDocument('marketplace-reporting');
  const text = document.querySelector('article').textContent.replace(/\s+/g, ' ');
  for (const claim of [
    'I owned validation for the rebuilt dataset.',
    'I published the dataset in Amazon QuickSight',
    'It remained in active use by senior data leadership and other stakeholders',
    'I later built a One-and-Done customer-behavior enhancement',
    'I demonstrated it to senior data leadership and other stakeholders',
    'published and maintained the approved QuickSight reporting feature',
    'The enhancement was actively used as part of Marketplace reporting.',
  ])
    assert(text.includes(claim), claim);
  for (const boundary of [
    'Particular relationship corrections were collaborative',
    'stakeholders retained authority over ambiguous business definitions',
    'Possible explanations remained review items',
    'Active internal use does not establish organization-wide adoption or quantified business impact.',
  ])
    assert(text.includes(boundary), boundary);
  assert(
    !/(?:improved decisions?|saved time|time savings of|increased revenue|commercial impact of|organization-wide adoption was achieved|Finance approved every|all discrepancies were resolved)/i.test(
      text,
    ),
  );
  for (const privateOnly of [
    ['exact published', 'no-limit'].join(' '),
    ['historical final unique', 'row grain is unknown'].join(' '),
    ['direct', 'confirmation'].join(' '),
    ['retained evidence', 'gap'].join(' '),
  ])
    assert(!text.toLowerCase().includes(privateOnly.toLowerCase()), privateOnly);
  assert(!/\b(?:Python|R)\b/.test(document.querySelector('#tools').textContent));
});

test('Marketplace process illustration explains six stages and an accompanying validation track', () => {
  const document = publicDocument('marketplace-reporting');
  const figure = document.querySelector('#reporting-flow figure');
  assert(figure);
  assert.equal(
    document.querySelector('#reporting-flow .evidence-label').textContent.trim(),
    'Independent illustration',
  );
  assert.deepEqual(
    [...figure.querySelectorAll('.flow-stages strong')].map((element) =>
      element.textContent.trim(),
    ),
    [
      'Purchase and line-item inputs',
      'Posting and customer context',
      'Separately aggregated engagement',
      'Grain and relationship controls',
      'Reconciled reporting dataset',
      'BI reporting and documented exceptions',
    ],
  );
  assert.deepEqual(
    [...figure.querySelectorAll('.validation-track li')].map((element) =>
      element.textContent.trim(),
    ),
    ['Keys', 'Totals', 'Exceptions'],
  );
  assert(
    figure
      .querySelector('.flow-text-alternative')
      .textContent.includes('Engagement is aggregated first'),
  );
  assert.equal(figure.querySelectorAll('img,svg,canvas,iframe,script').length, 0);
});

test('Marketplace synthetic evidence is static, consistent and independently scoped', () => {
  const document = publicDocument('marketplace-reporting');
  const panel = document.querySelector('#synthetic-demonstration');
  assert(panel);
  assert.equal(
    panel.querySelector('.evidence-label').textContent.trim(),
    'Independent technical example · Synthetic data',
  );
  assert(
    panel.textContent.includes(
      'Independent technical demonstration using synthetic data. This does not reproduce an employer query, schema, dataset, or confidential business rule.',
    ),
  );
  assert.equal(panel.querySelectorAll('#synthetic-inputs table').length, 3);
  assert.equal(panel.querySelectorAll('.sql-disclosures details').length, 3);
  assert.equal(panel.querySelectorAll('script,iframe,input,button,select').length, 0);
  const orderInputRows = [
    ...panel.querySelector('#synthetic-inputs table').querySelectorAll('tbody tr'),
  ].map((row) => [...row.querySelectorAll('td')].map((cell) => cell.textContent.trim()));
  assert.deepEqual(orderInputRows, [
    [
      'Line A1',
      'Order A',
      'Customer North',
      'Placement Pine',
      '2026-01-05 09:00',
      'Completed',
    ],
    [
      'Line B1',
      'Order B',
      'Customer North',
      'Placement Elm',
      '2026-01-05 09:00',
      'Completed',
    ],
    [
      'Line C1',
      'Order C',
      'Customer South',
      'Placement Reed',
      '2026-01-08 08:00',
      'Completed',
    ],
    ['Line D1', 'Order D', 'Customer South', 'Placement Birch', '—', 'Pending'],
    [
      'Line E1',
      'Order E',
      'Customer North',
      'Placement Pine',
      '2026-01-09 08:00',
      'Completed',
    ],
  ]);

  const outputRows = [
    ...panel.querySelectorAll('#synthetic-results table'),
  ][0].querySelectorAll('tbody tr');
  assert.equal(outputRows.length, 5);
  assert.deepEqual(
    [...outputRows].map((row) =>
      [...row.querySelectorAll('td')].map((cell) => cell.textContent.trim()),
    ),
    [
      ['Line A1', 'Customer North', 'Placement Pine', '1', '4 / 2', 'Mapped'],
      ['Line B1', 'Customer North', 'Placement Elm', '2', '3 / 0', 'Mapped'],
      ['Line C1', 'Customer South', 'Placement Reed', '1', '0 / 2', 'Review'],
      ['Line D1', 'Customer South', 'Placement Birch', '—', '0 / 0', 'Mapped'],
      ['Line E1', 'Customer North', 'Placement Pine', '3', '4 / 2', 'Mapped'],
    ],
  );
  const validationRows = [...panel.querySelectorAll('.validation-table tbody tr')].map(
    (row) => [...row.querySelectorAll('td')].map((cell) => cell.textContent.trim()),
  );
  assert.deepEqual(validationRows, [
    ['Mapping key uniqueness', 'No duplicate placement mappings', '0 duplicates', 'Pass'],
    ['Base-to-final rows', 'Equal row totals', '5 base / 5 final', 'Pass'],
    [
      'Click reconciliation',
      'Input equals placement output',
      '7 input / 7 output',
      'Pass',
    ],
    [
      'Application reconciliation',
      'Input equals placement output',
      '4 input / 4 output',
      'Pass',
    ],
    [
      'One-sided activity',
      'Source populations remain visible',
      '1 click-only / 1 application-only',
      'Pass',
    ],
    ['Unmatched mappings', 'Retained for review', '1 placement', 'Review'],
    [
      'Purchase sequence',
      'Completed orders follow deterministic chronological sequence',
      '4 completed orders checked',
      'Pass',
    ],
    [
      'Repeated placement measures',
      'Flag non-additive line detail',
      '1 repeated placement',
      'Review',
    ],
  ]);
  assert(
    panel.textContent.includes(
      'Separate placement totals remain 7 clicks and 4 applications.',
    ),
  );
  assert(panel.textContent.includes('This describes only the example below.'));
});

test('Marketplace clean-room SQL uses only approved generic relations and avoids private fingerprints', () => {
  const files = [
    'src/examples/code/marketplace-reporting-fixtures.sql',
    'src/examples/code/marketplace-reporting-build.sql',
    'src/examples/code/marketplace-reporting-validate.sql',
  ];
  const sql = files.map((file) => fs.readFileSync(file, 'utf8')).join('\n');
  const allowedRelations = new Set([
    'application_events',
    'application_reconciliation',
    'application_source',
    'applications_by_placement',
    'checks',
    'click_events',
    'click_reconciliation',
    'click_source',
    'clicks_by_placement',
    'completed_purchase_sequence',
    'customer_context',
    'duplicates',
    'engagement_by_placement',
    'engagement_keys',
    'expected_sequence',
    'mapping_profile',
    'one_sided_issues',
    'order_lines',
    'orders',
    'output_one_sided',
    'output_order_sequence',
    'output_placement',
    'placement_groups',
    'placements',
    'reporting_base',
    'repeated_measures',
    'sequence_issues',
    'source_engagement',
    'source_one_sided',
    'synthetic_reporting_output',
    'unmatched_mappings',
    'validated_groups',
  ]);
  const relations = [...sql.matchAll(/\b(?:FROM|JOIN)\s+([a-z_][a-z0-9_]*)/gi)].map(
    (match) => match[1].toLowerCase(),
  );
  for (const relation of relations)
    assert(allowedRelations.has(relation), 'unexpected SQL relation: ' + relation);
  for (const phrase of [
    ['advertised', 'status'].join(' '),
    ['customer retention', 'status'].join(' '),
    ['organic-only', 'after paid purchase'].join(' '),
    ['limit', '100'].join(' '),
    ['dense', 'rank'].join('_'),
  ])
    assert(!sql.toLowerCase().includes(phrase), phrase);
  assert(sql.includes('ROW_NUMBER() OVER'));
  assert(sql.includes('ORDER BY completed_at, order_id'));
  assert(sql.includes('UNION'));
  assert.deepEqual(inspectText(sql), []);
});

const marketplaceSqlHarness = String.raw`
import json
import sqlite3
import sys
from pathlib import Path

root = Path.cwd()
fixture_sql = (root / 'src/examples/code/marketplace-reporting-fixtures.sql').read_text(encoding='utf-8')
build_sql = (root / 'src/examples/code/marketplace-reporting-build.sql').read_text(encoding='utf-8')
validate_sql = (root / 'src/examples/code/marketplace-reporting-validate.sql').read_text(encoding='utf-8')
scenario = sys.argv[1]
connection = sqlite3.connect(':memory:')
connection.executescript(fixture_sql)

if scenario == 'no-unmatched':
    connection.execute("INSERT INTO placement_groups VALUES ('Placement Reed', 'Group Four')")
if scenario == 'no-repeated':
    connection.execute("UPDATE order_lines SET placement_id = 'Placement Birch' WHERE line_id = 'Line E1'")

connection.executescript(build_sql)

if scenario in {'click-mismatch', 'application-mismatch', 'one-sided-loss', 'bad-sequence'}:
    connection.executescript('''
        CREATE TABLE frozen_output AS SELECT * FROM synthetic_reporting_output;
        DROP VIEW synthetic_reporting_output;
        ALTER TABLE frozen_output RENAME TO synthetic_reporting_output;
    ''')
if scenario == 'click-mismatch':
    connection.execute("UPDATE click_events SET click_count = click_count + 1 WHERE placement_id = 'Placement Pine'")
if scenario == 'application-mismatch':
    connection.execute("UPDATE application_events SET application_count = application_count + 1 WHERE placement_id = 'Placement Reed'")
if scenario == 'one-sided-loss':
    connection.execute("UPDATE synthetic_reporting_output SET engagement_status = 'Clicks and applications' WHERE placement_id = 'Placement Elm'")
if scenario == 'bad-sequence':
    connection.execute("UPDATE synthetic_reporting_output SET purchase_sequence = 9 WHERE order_id = 'Order A'")

validation = connection.execute(validate_sql).fetchall()
output = connection.execute('''
    SELECT line_id, customer_label, placement_label, purchase_sequence,
      placement_clicks, placement_applications, mapping_status
    FROM synthetic_reporting_output
    ORDER BY line_id
''').fetchall()
print(json.dumps({'validation': validation, 'output': output}))
`;

function executeMarketplaceSql(scenario) {
  const run = spawnSync('python', ['-c', marketplaceSqlHarness, scenario], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });
  assert.equal(run.status, 0, run.stderr);
  return JSON.parse(run.stdout);
}

test('Marketplace fixture, build and validation SQL execute and match the displayed results', () => {
  const executed = executeMarketplaceSql('happy');
  const document = publicDocument('marketplace-reporting');
  const displayedValidation = [
    ...document.querySelectorAll('#synthetic-results .validation-table tbody tr'),
  ].map((row) => [...row.querySelectorAll('td')].map((cell) => cell.textContent.trim()));
  assert.deepEqual(executed.validation, displayedValidation);

  const displayedOutput = [
    ...document.querySelector('#synthetic-results table').querySelectorAll('tbody tr'),
  ].map((row) => [...row.querySelectorAll('td')].map((cell) => cell.textContent.trim()));
  const normalizedOutput = executed.output.map((row) => [
    row[0],
    row[1],
    row[2],
    row[3] === null ? '—' : String(row[3]),
    row[4] + ' / ' + row[5],
    row[6].startsWith('Review') ? 'Review' : 'Mapped',
  ]);
  assert.deepEqual(normalizedOutput, displayedOutput);
  assert.deepEqual(
    Object.fromEntries(executed.validation.map((row) => [row[0], row[3]])),
    {
      'Mapping key uniqueness': 'Pass',
      'Base-to-final rows': 'Pass',
      'Click reconciliation': 'Pass',
      'Application reconciliation': 'Pass',
      'One-sided activity': 'Pass',
      'Unmatched mappings': 'Review',
      'Purchase sequence': 'Pass',
      'Repeated placement measures': 'Review',
    },
  );
});

test('Marketplace validation SQL changes state for each controlled failure path', () => {
  const expected = {
    'click-mismatch': ['Click reconciliation', 'Review'],
    'application-mismatch': ['Application reconciliation', 'Review'],
    'one-sided-loss': ['One-sided activity', 'Review'],
    'bad-sequence': ['Purchase sequence', 'Review'],
    'no-unmatched': ['Unmatched mappings', 'Pass'],
    'no-repeated': ['Repeated placement measures', 'Pass'],
  };
  for (const [scenario, [check, state]] of Object.entries(expected)) {
    const result = executeMarketplaceSql(scenario);
    const row = result.validation.find((candidate) => candidate[0] === check);
    assert(row, scenario + ': missing check');
    assert.equal(row[3], state, scenario + ': ' + check);
  }
});

test('Market Share keeps ownership, transfer, application status and evidence boundaries distinct', () => {
  const document = publicDocument('market-share-workflow');
  const text = document.querySelector('article').textContent.replace(/\s+/g, ' ');
  assert.equal(
    document.querySelector('h1').textContent.trim(),
    'Building a Governed Market Share Intelligence Product',
  );
  assert.equal(
    document.querySelector('link[rel="canonical"]').getAttribute('href'),
    'https://a-c-a-f.github.io/work/market-share-workflow/',
  );
  assert(
    text.includes(
      'I owned the analytical methodology, Python and SQL implementation, validation design, Streamlit application, release testing, and handoff preparation.',
    ),
  );
  assert(
    text.includes(
      'stakeholders confirmed ambiguous product meanings and business-rule acceptance where judgment was required.',
    ),
  );
  assert(
    text.includes(
      'I packaged, release-tested, and transferred a standalone Codex Skill that stakeholders now use as part of their decision-support workflow.',
    ),
  );
  assert(
    text.includes(
      'The Streamlit application was completed, tested, reviewed, and approved, with deployment planned.',
    ),
  );
  assert(
    text.includes(
      'The Streamlit application was completed, tested, reviewed, and approved, with deployment planned; this case presents the tested local release rather than a live production system.',
    ),
  );
  assert(
    text.includes(
      'The standalone Codex Skill was transferred and is used by stakeholders for decision support. This does not imply that the application itself is already in use.',
    ),
  );
  assert.equal(document.querySelectorAll('#scope li').length, 4);
  assert(
    !/stakeholders? (?:now |currently )?(?:use|operate|adopted) (?:the )?(?:Streamlit )?(?:application|app)|(?:Streamlit )?(?:application|app) (?:is|was) (?:live|hosted|deployed|in production)|organization-wide adoption (?:occurred|was achieved)|(?:the|this) (?:work|workflow|skill|application) improved decisions?|(?:saved|saves) time|(?:increased|increases) revenue|(?:produced|achieved|delivered) commercial impact/i.test(
      text,
    ),
  );
  assert(
    !/five-stage|six-artifact|\b\d+\s+(?:products?|records?|tests?|rules?|packages?|artifacts?)\b/i.test(
      text,
    ),
  );
  for (const section of ['context', 'approach', 'validation', 'outcome']) {
    for (const paragraph of document.querySelectorAll(
      `#${section} p:not(.eyebrow), #${section} li`,
    )) {
      assert(!/[\d$€₱%]/.test(paragraph.textContent));
    }
  }
  const note = document.querySelector('#preparation-note');
  assert.equal(
    note.textContent.trim(),
    'Created for this portfolio with AI-assisted development. It does not reproduce employer workflows, rules, data, or system architecture.',
  );
  assert(note.closest('#example .example'));
  assert.equal(document.querySelectorAll('#preparation-note').length, 1);
  assert.equal(
    (document.body.textContent.match(/AI-assisted development/g) || []).length,
    1,
  );
  assert.equal(
    document.querySelector('#example .evidence-label').textContent.trim(),
    'Independent illustration',
  );
  assert.equal(
    document.querySelectorAll(
      '#example table, #example pre, #example iframe, #example img',
    ).length,
    0,
  );
  assert.equal(document.querySelectorAll('#example .lifecycle li').length, 6);
  assert.deepEqual(
    [...document.querySelectorAll('#example .lifecycle strong')].map((e) =>
      e.textContent.trim(),
    ),
    [
      'Validate sources and establish comparison grain',
      'Profile and normalize evidence',
      'Apply governed rules and readiness decisions',
      'Produce controlled analysis outputs',
      'Reconcile results and review exceptions',
      'Package results for stakeholder use',
    ],
  );
  assert.deepEqual(inspectText(text), []);
  const template = fs.readFileSync('src/pages/work/[slug].astro', 'utf8');
  assert(!template.includes('marketplace-reporting'));
  assert(!template.includes('Reconciling purchase'));
});

test('Market Share refined visible wording has no regression', () => {
  const text = parseHTML(
    withoutLearningNavigation(
      fs.readFileSync('dist/work/market-share-workflow/index.html', 'utf8'),
    ),
  )
    .document.body.textContent.replace(/\s+/g, ' ')
    .trim();
  assert.equal(
    createHash('sha256').update(text).digest('hex'),
    '383f1cb6d73c38b058d6d10eb1f8f05626e12b61a2885583491618c83f8adec4',
  );
});

test('Data Quality presents framework ownership, approved protocol and correction boundaries', () => {
  const document = publicDocument('data-quality-process');
  const text = document.querySelector('article').textContent.replace(/\s+/g, ' ');
  assert(
    text.includes(
      'I designed and implemented the reusable R/R Markdown framework and its table-specific validation implementations.',
    ),
  );
  assert(
    text.includes(
      'The operating protocol was formally approved and put into use. The framework was deployed across multiple core operational datasets, incorporated into recurring audits, and transitioned to Data Engineering for continued execution.',
    ),
  );
  assert(
    text.includes(
      'When I left LifeBank, the recurring framework and operating process remained active. They gave the Data Science team documented visibility into data-quality status, exceptions, cycle changes, remediation progress, and whether data was suitable for analysis, while source owners retained responsibility for correction.',
    ),
  );
  assert(
    text.includes(
      'The framework used read-oriented access and did not write corrections back to PostgreSQL.',
    ),
  );
  assert(
    text.includes(
      'The handoff transferred recurring execution, not authorship of the framework.',
    ),
  );
  assert(
    !/the framework was formally approved|guaranteed (?:accurate|clean)|all exceptions were corrected|automatically (?:fixed|corrected|repaired)|operated as (?:a )?real-time|was (?:an? )?(?:centralized software package|enterprise platform)|achieved organization-wide adoption|delivered quantified (?:benefit|impact)|wrote corrections back/i.test(
      text,
    ),
  );
  const labels = [...document.querySelectorAll('.quality-process strong')].map((e) =>
    e.textContent.trim(),
  );
  assert.deepEqual(labels, [
    'Confirm rule meaning and responsible owner',
    'Run reusable validation checks',
    'Produce a health summary and exception package',
    'Classify and route findings',
    'Correct the source outside the audit framework',
    'Re-run and compare audit cycles',
    'Retain unresolved issues and newly detected regressions',
  ]);
  const note = document.querySelector('#preparation-note');
  assert.equal(
    note.textContent.trim(),
    'Created independently for this portfolio. It explains a general audit and remediation lifecycle and does not reproduce employer code, data, fields, rules, thresholds, reports, screens, or system architecture.',
  );
  assert(note.closest('#example .example'));
  assert.equal(document.querySelectorAll('#preparation-note').length, 1);
  assert.equal(
    document.querySelector('#example .evidence-label').textContent.trim(),
    'Independent illustration',
  );
  assert.equal(
    document.querySelectorAll(
      '#quality-illustration table, #quality-illustration pre, #quality-illustration iframe, #quality-illustration img',
    ).length,
    0,
  );
  assert.equal(document.querySelectorAll('.quality-process li').length, 7);
  assert.equal(document.querySelectorAll('.quality-process .audit-stage').length, 3);
  assert.equal(document.querySelectorAll('.quality-process .owner-stage').length, 1);
  assert.equal(document.querySelectorAll('.quality-process .shared-stage').length, 3);
  assert.equal(
    document.querySelector('.sequence-cue').textContent.trim(),
    'Follow stages 01–07.',
  );
  assert.equal(document.querySelectorAll('#example script').length, 0);
  assert.deepEqual(inspectText(text), []);
  const summary =
    'I designed and implemented a reusable R and PostgreSQL data-quality framework that supported recurring audits, standardized reporting, cycle comparisons, and owner-routed correction follow-up.';
  for (const file of ['dist/index.html', 'dist/work/index.html']) {
    const { document: d } = parseHTML(fs.readFileSync(file, 'utf8'));
    const link = d.querySelector('a[href="/work/data-quality-process/"]');
    assert.equal(
      link.textContent.replace(/\s+/g, ' ').trim(),
      'Read the data-quality framework case →',
    );
    assert.equal(
      link.closest('article').querySelector('.summary').textContent.trim(),
      summary,
    );
  }
});

test('Data Quality synthetic R example is fictional, reproducible and internally consistent', () => {
  const document = publicDocument('data-quality-process');
  const panel = document.querySelector('#quality-synthetic-example');
  assert(panel);
  assert.equal(
    panel.querySelector('.evidence-label').textContent.trim(),
    'Independent technical example · Synthetic data',
  );
  const disclosure = panel
    .querySelector('.demonstration-disclosure')
    .textContent.replace(/\s+/g, ' ')
    .trim();
  assert.equal(
    disclosure,
    'Clean-room demonstration created independently for this portfolio with fictional records, fields, rules, thresholds, owner labels, and outputs. It does not reproduce employer code, data, fields, rules, thresholds, reports, credentials, database structure, schedules, or system architecture.',
  );
  assert.equal(panel.querySelectorAll('details').length, 2);
  assert.equal(
    panel.querySelectorAll('script, iframe, form, input, select, button').length,
    0,
  );
  assert.equal(panel.querySelectorAll('table').length, 4);

  const rowsFromTable = (table) =>
    [...table.querySelectorAll('tbody tr')].map((row) =>
      [...row.querySelectorAll('td')].map((cell) => cell.textContent.trim()),
    );
  const records = rowsFromTable(panel.querySelector('#quality-synthetic-input table'));
  assert.deepEqual(records, [
    ['Record 101', 'Service team', 'Group A', 'Active', '84', '2026-09-01'],
    ['Record 102', 'Service team', 'Group B', 'Active', '72', '2026-09-02'],
    ['Record 103', 'Support team', 'Group B', 'Paused', '108', '2026-09-03'],
    ['Record 104', 'Support team', 'Group C', 'Pending', '65', '2026-09-04'],
    ['Record 105', 'Service team', 'Group D', 'Active', '91', 'not-a-date'],
  ]);

  const rules = [
    [
      'Record identifier is unique',
      (row, rows) => rows.filter((r) => r[0] === row[0]).length === 1,
    ],
    ['Category is present', (row) => row[2].trim().length > 0],
    ['Status uses the configured set', (row) => ['Active', 'Paused'].includes(row[3])],
    [
      'Quality score is within 0–100',
      (row) => Number(row[4]) >= 0 && Number(row[4]) <= 100,
    ],
    ['Review date is valid', (row) => /^\d{4}-\d{2}-\d{2}$/.test(row[5])],
  ];
  const calculatedSummary = rules.map(([label, evaluate]) => {
    const failed = records.filter((row) => !evaluate(row, records)).length;
    return [
      label,
      failed === 0 ? 'PASS' : 'FAIL',
      `${failed} of ${records.length}`,
      `${Math.round(((records.length - failed) / records.length) * 100)}%`,
    ];
  });
  const outputTables = [...panel.querySelectorAll('#quality-synthetic-outputs table')];
  assert.deepEqual(rowsFromTable(outputTables[0]), calculatedSummary);

  const calculatedExceptions = [
    [
      'Record 103',
      'Quality score is within 0–100',
      'Quality score is outside the configured range',
      'Data stewardship',
    ],
    [
      'Record 104',
      'Status uses the configured set',
      'Status is outside the configured set',
      'Process owner',
    ],
    [
      'Record 105',
      'Review date is valid',
      'Review date is not a valid date',
      'Data stewardship',
    ],
  ];
  assert.deepEqual(rowsFromTable(outputTables[1]), calculatedExceptions);

  const comparisonRows = rowsFromTable(outputTables[2]);
  for (const row of comparisonRows) {
    const expected =
      row[2] === 'Present' && row[3] === 'Present'
        ? 'Unresolved'
        : row[2] === 'Present'
          ? 'Corrected'
          : 'Newly detected';
    assert.equal(row[4], expected, row[0]);
  }
  assert.deepEqual(
    comparisonRows.map((row) => row[4]),
    ['Corrected', 'Unresolved', 'Newly detected', 'Newly detected'],
  );

  const panelText = panel.textContent.replace(/\s+/g, ' ');
  assert(
    panelText.includes(
      'it does not prove that the entire fictional dataset is perfectly correct',
    ),
  );
  assert(panelText.includes('It does not modify either source dataset.'));
  assert.equal(document.querySelectorAll('#evidence-index li').length, 2);

  const rSource = fs.readFileSync(
    'src/examples/code/data-quality-synthetic-audit.R',
    'utf8',
  );
  for (const required of [
    'previous_cycle',
    'current_cycle',
    'rules <- list(',
    'evaluate_rule <- function',
    'run_audit <- function',
    'compare_cycles <- function',
    'owner_route',
    'Corrected',
    'Unresolved',
    'Newly detected',
  ])
    assert(rSource.includes(required), required);
  assert(
    !/dbConnect|RPostgres|PostgreSQL|LifeBank|DQDL|password\s*<-|credential|write\s*\(/i.test(
      rSource,
    ),
  );
  assert.deepEqual(inspectText(rSource), []);
});

test('Data Quality R presentation views and self-checks match every approved output cell', () => {
  const source = fs.readFileSync(
    'src/examples/code/data-quality-synthetic-audit.R',
    'utf8',
  );
  const document = publicDocument('data-quality-process');
  const tables = [...document.querySelectorAll('#quality-synthetic-outputs table')];
  const objects = [
    ['rule_summary_view', 'expected_rule_summary'],
    ['current_exceptions_view', 'expected_current_exceptions'],
    ['cycle_comparison_view', 'expected_cycle_comparison'],
  ];

  // Parse literal expected frames from the R source; this is not R execution.
  for (const [index, [view, expected]] of objects.entries()) {
    const start = source.indexOf(expected + ' <- data.frame(');
    assert(start >= 0, expected);
    const end = source.indexOf('\n)', start);
    assert(end > start, expected);
    const block = source.slice(start, end);
    const columns = [...block.matchAll(/"([^"]+)"\s*=\s*c\(([\s\S]*?)\)/g)];
    const headers = columns.map((column) => column[1]);
    const values = columns.map((column) =>
      [...column[2].matchAll(/"([^"]*)"/g)].map((value) => value[1]),
    );
    assert.deepEqual(
      headers,
      [...tables[index].querySelectorAll('th')].map((cell) => cell.textContent.trim()),
    );
    const displayed = [...tables[index].querySelectorAll('tbody tr')].map((row) =>
      [...row.querySelectorAll('td')].map((cell) => cell.textContent.trim()),
    );
    assert(values.every((column) => column.length === displayed.length));
    assert.deepEqual(
      displayed,
      values[0].map((_, row) => values.map((column) => column[row])),
    );
    assert(source.includes('identical(' + view + ', ' + expected + ')'));
    assert(source.includes('print(' + view + ', row.names = FALSE)'));
  }
  assert.equal((source.match(/^print\(/gm) || []).length, 3);
  assert(source.includes('stopifnot('));
  assert(source.indexOf('stopifnot(') < source.indexOf('print(rule_summary_view'));
  for (const expression of [
    'order(current_audit$exceptions$record_id, current_audit$exceptions$rule_id)',
    '"Rule" = ordered_exceptions$rule',
    '"Fictional owner route" = ordered_exceptions$owner_route',
    'paste(current_audit$summary$failed_records, "of", nrow(current_cycle))',
    '"Pass rate" = current_audit$summary$pass_rate',
    'rule_id = rep(rule$id, sum(!passed))',
    'rule = rep(rule$label, sum(!passed))',
    'finding = rep(rule$failure_message, sum(!passed))',
    'owner_route = rep(rule$owner_route, sum(!passed))',
    'paste(data$record_id, data$rule_id, sep = "::")',
    'all_keys <- sort(unique(c(previous_keys, current_keys)))',
    'exceptions <- do.call(rbind, exception_sets)',
  ])
    assert(source.includes(expression), expression);
  assert.equal((source.match(/check.names = FALSE/g) || []).length, 6);
  assert(!/\t| +$/m.test(source), 'R source uses spaces and no trailing whitespace');
});

test('Data Quality refined visible wording has no regression', () => {
  const text = parseHTML(
    withoutLearningNavigation(
      fs.readFileSync('dist/work/data-quality-process/index.html', 'utf8'),
    ),
  )
    .document.body.textContent.replace(/\s+/g, ' ')
    .trim();
  assert.equal(
    createHash('sha256').update(text).digest('hex'),
    'aeb5fbd86dfff936e93ff031bd8241894c54d7e7f6707ff4de5845cae6bdf107',
  );
});

test('Competitive Intelligence preserves professional boundaries and labels its example', () => {
  const document = publicDocument('competitive-intelligence');
  const text = document.querySelector('article').textContent.replace(/\s+/g, ' ');
  assert(
    text.includes(
      'I designed and built the Power BI report and developed its supporting SQL, DAX measures, reporting model and contextual search-term views.',
    ),
  );
  assert(
    text.includes(
      'The report was approved for use and used by the Ads Team to investigate competitor and search-term context.',
    ),
  );
  assert(
    text.includes(
      'Later advertising-source reconciliation, other advertising reports and recurring uploads were separate work.',
    ),
  );
  assert(
    text.includes(
      'Future recommendation features are not presented as delivered capabilities.',
    ),
  );
  assert(
    !/I deployed|we deployed|was deployed|was adopted|increased revenue|improved ROI|optimized bids|automatically (?:bid|optimized)|saved money|scheduled refresh|until I left|when I left|fully automated|end-to-end automation|organization-wide adoption|saved hours|improved decision quality/i.test(
      text,
    ),
  );
  for (const section of ['context', 'approach', 'outcome'])
    for (const item of document.querySelectorAll(
      `#${section} p:not(.eyebrow), #${section} li`,
    ))
      assert(!/[\d$€₱%]/.test(item.textContent));
  const note = document.querySelector('#preparation-note');
  assert.equal(
    note.textContent.trim(),
    'Created for this portfolio with AI-assisted development using synthetic data. It does not reproduce employer code, data, dashboard design, business rules, or system architecture.',
  );
  assert(note.closest('#example .example'));
  assert.equal(
    (document.body.textContent.match(/AI-assisted development/g) || []).length,
    1,
  );
  assert.equal(document.querySelectorAll('#preparation-note').length, 1);
  assert.equal(
    document.querySelector('#example .evidence-label').textContent.trim(),
    'Independent technical example · Synthetic data',
  );
  assert.equal(
    document.querySelectorAll('#example iframe, #example img, #example pre').length,
    0,
  );
  assert.deepEqual(inspectText(text), []);
  const summary =
    'I designed and built a Power BI competitive-intelligence report with SQL, DAX and contextual search-term analysis, then published and maintained it for Ads Team use.';
  for (const file of ['dist/index.html', 'dist/work/index.html']) {
    const { document: d } = parseHTML(fs.readFileSync(file, 'utf8'));
    const link = d.querySelector('a[href="/work/competitive-intelligence/"]');
    assert.equal(
      link.textContent.replace(/\s+/g, ' ').trim(),
      'Read the competitive-intelligence case →',
    );
    assert.equal(
      link.closest('article').querySelector('.summary').textContent.trim(),
      summary,
    );
  }
});

test('synthetic BI example has complete periods, scoped ranks and consistent grains', () => {
  const data = JSON.parse(fs.readFileSync('src/data/competitive-example.json', 'utf8'));
  assert.deepEqual(data.periods, [
    { label: 'Period 1', days: 28, complete: true },
    { label: 'Period 2', days: 28, complete: true },
  ]);
  assert.deepEqual(data.scope, ['Product Alpha', 'Product Beta']);
  assert.deepEqual(data.products, [
    { label: 'Product Alpha', period1: 12, period2: 15 },
    { label: 'Product Beta', period1: 8, period2: 10 },
    { label: 'Product Gamma', period1: 20, period2: 30 },
  ]);
  assert.deepEqual(data.detail, [
    { product: 'Product Alpha', query: 'Query A' },
    { product: 'Product Alpha', query: 'Query B' },
    { product: 'Product Beta', query: 'Query A' },
  ]);
  assert.equal(new Set(data.products.map((p) => p.label)).size, 3);
  assert.equal(new Set(data.detail.map((r) => r.product + r.query)).size, 3);
  const selected = data.products.filter((p) => data.scope.includes(p.label));
  assert.equal(
    selected.reduce((n, p) => n + p.period1, 0),
    20,
  );
  assert.equal(
    selected.reduce((n, p) => n + p.period2, 0),
    25,
  );
  assert.equal(
    data.detail.reduce(
      (n, r) => n + selected.find((p) => p.label === r.product).period2,
      0,
    ),
    40,
  );
  const document = publicDocument('competitive-intelligence');
  const rows = [...document.querySelectorAll('#synthetic-summary tbody tr')].map((r) =>
    [...r.querySelectorAll('td')].map((c) => c.textContent.trim()),
  );
  assert.deepEqual(rows, [
    ['Product Alpha', '12', '15', '1'],
    ['Product Beta', '8', '10', '2'],
  ]);
  const detail = [...document.querySelectorAll('#synthetic-detail tbody tr')].map((r) =>
    [...r.querySelectorAll('td')].map((c) => c.textContent.trim()),
  );
  assert.deepEqual(detail, [
    ['Product Alpha', 'Query A'],
    ['Product Alpha', 'Query B'],
    ['Product Beta', 'Query A'],
  ]);
  assert(
    document
      .querySelector('#synthetic-summary')
      .textContent.includes('one row per product'),
  );
  assert(
    document
      .querySelector('#synthetic-detail')
      .textContent.includes('one row per product and query'),
  );
  assert(
    document
      .querySelector('#synthetic-grain-check')
      .textContent.includes('15 + 15 + 10 = 40'),
  );
  assert(
    document.querySelector('#synthetic-grain-check').textContent.includes('15 + 10 = 25'),
  );
});

test('Competitive Intelligence approved visible wording has no regression', () => {
  const text = parseHTML(
    withoutLearningNavigation(
      fs.readFileSync('dist/work/competitive-intelligence/index.html', 'utf8'),
    ),
  )
    .document.body.textContent.replace(/\s+/g, ' ')
    .trim();
  assert.equal(
    createHash('sha256').update(text).digest('hex'),
    'd23fa715a0a164eaf1fab3adf19152916f6dfaa1c8eb6787d9259d9987f04a97',
  );
});

test('Financial Behavior preserves attribution and interpretation boundaries', () => {
  const document = publicDocument('financial-behavior');
  const text = document.querySelector('article').textContent.replace(/\s+/g, ' ');
  for (const required of [
    'I prepared and personally presented a portfolio review of lending, savings and regional risk patterns. In a subsequent jointly credited study, I built joined analytical populations, performed logistic-regression repayment analysis and compared savings patterns across selected groups.',
    'For the advanced savings study, I jointly prepared the population and built and ran OLS and quantile-regression analyses with another analyst. I personally handled completeness, missingness and continuity, developed the visualizations, wrote the final report and created the presentation. We jointly performed diagnostic and method-comparison work, interpreted the findings and presented them.',
    'For the repayment study, I checked joins for duplicate or repeated observations and confirmed that each row represented the intended analytical observation. I built separate populations for modeling and descriptive comparison because the two tasks required different information and inclusion conditions.',
    'I handled the completeness, missingness and continuity of the data used in that study. We jointly examined influence, residual and error diagnostics and compared the methods when interpreting the findings. I turned that work into visualizations, the final report and presentation materials.',
    'The financial-behavior reporting work was accepted and approved, and its reports and recommendations supported real stakeholder reviews and decisions. Stakeholder feedback led to separate follow-up analyses by the team. The reporting work remained a recurring analytical activity when I left LifeBank.',
    'This outcome describes the reporting series. It does not mean that every report or recommendation was individually approved or implemented, or that a recommendation produced a measured business or client result.',
    'My responsibilities ranged from direct population preparation and repayment analysis to joint advanced modeling and diagnostics. I wrote the advanced savings report and created its visualizations and presentation; that does not imply sole authorship of every underlying model or study.',
    'The repayment study’s checks concerned duplicate or repeated observations and the intended unit of analysis. I do not present that work as population-total reconciliation, held-out testing or validated production prediction.',
    'Findings describe associations. Business decisions remained with stakeholders; separate feedback-led analyses were not maintenance or reruns of the same model. No automated lending decisions, causal impact, quantified improvement or organization-wide adoption is claimed.',
    'Employer records, original model outputs, coefficients, rules, code, charts and internal identifiers remain private. The independent illustration explains a general method and is not a historical employer artifact.',
  ])
    assert(text.includes(required), required);
  assert(
    !/I (?:solely authored|owned every|deployed)|was deployed|caused improvements|increased savings|improved repayment|automatically approved|every recommendation was implemented|I reconciled population totals|I used held-out|March report|\b[SU][0-9]{1,2}\b/i.test(
      text,
    ),
  );
  for (const section of ['context', 'approach', 'validation', 'outcome'])
    for (const item of document.querySelectorAll(
      `#${section} p:not(.eyebrow), #${section} li`,
    ))
      assert(!/[\d$€₱%]/.test(item.textContent));
  const illustration = document.querySelector('#interpretation-illustration');
  assert(!/\d/.test(illustration.textContent));
  assert.equal(
    illustration.querySelectorAll('table,pre,code,img,svg,canvas,iframe,input,script')
      .length,
    0,
  );
  assert.equal(
    illustration.querySelector('.evidence-label').textContent.trim(),
    'Independent illustration',
  );
  const note = document.querySelector('#preparation-note');
  assert(note.closest('#example #interpretation-illustration'));
  assert.equal(
    note.textContent.trim(),
    'Created for this portfolio with AI-assisted development. It does not reproduce employer data, models, code, analytical results, or system architecture.',
  );
  assert.equal(document.querySelectorAll('#preparation-note').length, 1);
  assert.equal(
    (document.body.textContent.match(/AI-assisted development/g) || []).length,
    1,
  );
  assert.deepEqual(
    [...illustration.querySelectorAll('.interpretation-boundaries li')].map((e) =>
      e.textContent.trim(),
    ),
    [
      'Association does not establish causation.',
      'An analytical result is not a production prediction system.',
      'A recommendation does not prove adoption or impact.',
    ],
  );
  assert.deepEqual(
    [...illustration.querySelectorAll('.interpretation-sequence strong')].map((e) =>
      e.textContent.trim(),
    ),
    [
      'Define the question',
      'Prepare the analysis population',
      'Distinguish descriptive and modeling samples',
      'Estimate or compare associations',
      'Compare groups and analytical approaches',
      'Translate findings into qualified recommendations for review',
    ],
  );
  assert.deepEqual(inspectText(text), []);
  const summary =
    'I built repayment-association analysis and jointly developed advanced savings models, translating findings into reports and recommendations used in stakeholder reviews and decisions.';
  for (const file of ['dist/index.html', 'dist/work/index.html']) {
    const { document: d } = parseHTML(fs.readFileSync(file, 'utf8'));
    const link = d.querySelector('a[href="/work/financial-behavior/"]');
    assert.equal(
      link.textContent.replace(/\s+/g, ' ').trim(),
      'Read the financial-behavior case →',
    );
    assert.equal(
      link.closest('article').querySelector('.summary').textContent.trim(),
      summary,
    );
  }
});

test('Aged Inventory presents approved recurring use, qualified ownership and independent evidence', () => {
  const doc = publicDocument('aged-inventory');
  const text = doc.querySelector('article').textContent.replace(/\s+/g, ' ');
  assert(
    text.includes(
      'designed and built the core analytical decision model within an existing workbook',
    ),
  );
  assert(
    text.includes(
      'The original workbook shell and upstream source systems were not mine',
    ),
  );
  assert(
    text.includes(
      'Selected assumptions and formula corrections were reviewed collaboratively',
    ),
  );
  assert(
    text.includes(
      'The completed Excel decision model was approved for use and incorporated into recurring monthly aged-inventory reviews. Its recommendations provided a structured financial basis for decisions, while stakeholders retained authority to apply additional operational context.',
    ),
  );
  assert(text.includes('not an automatic business decision'));
  assert(text.includes('No quantified financial or operational impact is claimed'));
  assert(text.includes('does not mean every individual recommendation was approved'));
  const lifecycle = doc.querySelector('#inventory-lifecycle');
  assert.equal(
    lifecycle.querySelector('.evidence-label').textContent.trim(),
    'Independent illustration',
  );
  assert.equal(doc.querySelectorAll('#inventory-lifecycle-disclosure').length, 1);
  assert.equal(lifecycle.querySelectorAll('ol.lifecycle-steps > li').length, 7);
  assert.deepEqual(
    [...lifecycle.querySelectorAll('ol.lifecycle-steps strong')].map((node) =>
      node.textContent.trim(),
    ),
    [
      'Source domains',
      'Matching and normalization',
      'Velocity and inventory coverage',
      'Three financial paths',
      'Validation gates',
      'Explainable recommendation',
      'Business review',
    ],
  );
  assert(lifecycle.querySelector('figure[aria-labelledby][aria-describedby]'));
  assert(lifecycle.querySelector('figcaption'));
  assert.equal(
    lifecycle.querySelectorAll('img, svg, canvas, script, input, button').length,
    0,
  );
  const panel = doc.querySelector('#inventory-scenarios');
  assert.equal(
    panel.querySelector('.evidence-label').textContent.trim(),
    'Independent technical example · Synthetic data',
  );
  assert.equal(doc.querySelectorAll('#preparation-note').length, 1);
  assert(
    panel
      .querySelector('#preparation-note')
      .textContent.startsWith(
        'Created for this portfolio with AI-assisted development using synthetic data.',
      ),
  );
  assert.equal(doc.querySelectorAll('.article p:empty, .article p p').length, 0);
  assert.equal(panel.querySelectorAll('input, select, button, iframe, script').length, 0);
  const data = JSON.parse(fs.readFileSync('src/data/inventory-example.json', 'utf8'));
  assert.deepEqual(data, {
    units: 10,
    saleReceiptPerUnit: 8,
    saleCostPerUnit: 1,
    disposalCostPerUnit: 2,
    liquidationReceiptPerUnit: 3,
    liquidationCostPerUnit: 1,
    scenarios: [
      { label: 'Scenario Alpha', soldUnits: 8 },
      { label: 'Scenario Beta', soldUnits: 3 },
    ],
  });
  const outcomes = data.scenarios.map(
    (s) =>
      s.soldUnits * (data.saleReceiptPerUnit - data.saleCostPerUnit) -
      (data.units - s.soldUnits) * data.disposalCostPerUnit,
  );
  assert.deepEqual(outcomes, [52, 7]);
  const rows = [...panel.querySelectorAll('.mobile-records tbody tr')].map((r) =>
    r.lastElementChild.textContent.trim(),
  );
  assert.deepEqual(rows, ['-20', '52', '20', '-20', '7', '20']);
  assert.deepEqual(
    [...panel.querySelectorAll('.scenario-result strong')].map((e) =>
      e.textContent.trim(),
    ),
    ['Calculated preference: discounted sale.', 'Calculated preference: liquidation.'],
  );
  assert(panel.textContent.includes('All figures and assumptions are fictional.'));
  assert(panel.textContent.includes('Actual decisions require operational eligibility'));
  assert.deepEqual(inspectText(text), []);
  for (const route of ['dist/index.html', 'dist/work/index.html']) {
    const d = parseHTML(fs.readFileSync(route, 'utf8')).document;
    const link = [...d.querySelectorAll('a')].find(
      (a) => a.textContent.trim() === 'Read the aged-inventory case →',
    );
    assert(link);
    assert.equal(link.getAttribute('href'), '/work/aged-inventory/');
    assert(
      d.body.textContent.includes(
        'I built an approved Excel decision model used in recurring monthly aged-inventory reviews, connecting sales, inventory, cost, fee, and product inputs to compare removal, discounted sell-through, and liquidation with validation-gated recommendations.',
      ),
    );
  }
});

test('Four completed case HTML baselines preserve authorized Learning navigation and accessible grouping', () => {
  const expected = {
    'competitive-intelligence':
      '5b5416c86b21d5e3c301f64653b7de590a820047e053744a5460a3bf88e70e57',
    'data-quality-process':
      'cb074355f8924bc9d504d4ceacd790e5196c6d71e0e30184ac7c4f8881494479',
    'financial-behavior':
      '0c7a4de067e79c29b11d19a1d381514853f2f84e732bd6ab9416a4478406661f',
    'market-share-workflow':
      '30aa66c330937d25a1530b0d6636c9dedef9137e2c429c3b8b366b0f36c37cfc',
  };
  for (const [slug, hash] of Object.entries(expected))
    assert.equal(
      createHash('sha256')
        .update(
          withoutLearningNavigation(
            fs.readFileSync('dist/work/' + slug + '/index.html', 'utf8'),
          ),
        )
        .digest('hex'),
      hash,
      slug,
    );
});

test('All four other completed case sources retain their recorded baselines', () => {
  const expected = {
    'competitive-intelligence':
      'f1ab5e1ebc8af638adfe74dd1a313c575319063cb83dbb00ecb2710b94d55803',
    'data-quality-process':
      'e7ad1a05c289c784a13066e1c53f21062a139288cb4507fa4e2023ffd246b9fb',
    'financial-behavior':
      '0a8190a58ce837b760fcc280aa34b9d802705b116915fe9268bda8863139e272',
    'market-share-workflow':
      '8d1dc6d631ff4ea5478bc7d371d4cb3a62730d27e09c851854ffe8c86b2e72c7',
  };
  for (const [slug, hash] of Object.entries(expected))
    assert.equal(
      createHash('sha256')
        .update(fs.readFileSync('src/content/cases/' + slug + '.mdx'))
        .digest('hex'),
      hash,
      slug,
    );
});

test('Inventory refinement communicates model depth without leaking private implementation', () => {
  const d = publicDocument('aged-inventory');
  const t = d.querySelector('article').textContent.replace(/\s+/g, ' ');
  for (const phrase of [
    'Identifier-based matching',
    'upstream source systems',
    'measurement units',
    'sales velocity and inventory coverage',
    'inventory runoff',
    'possible future aged-inventory fee exposure',
    'assumption-based scenario analysis',
    'discount assumption changed price-dependent economics',
    'separate movement assumption estimated sell-through',
    'least-negative modeled result',
    'held for review instead of receiving an unexplained action',
    'unresolved interpretations',
  ])
    assert(t.includes(phrase), phrase);
  for (const prohibited of [
    'forecasting accuracy was',
    'discounting caused',
    'price elasticity proved',
    'automatically made decisions',
    'every recommendation was approved',
    'organization-wide adoption',
    'guaranteed savings',
    '2,604',
    '9,390',
  ])
    assert(!t.toLowerCase().includes(prohibited.toLowerCase()), prohibited);
  const h = parseHTML(fs.readFileSync('dist/index.html', 'utf8')).document;
  const card = [...h.querySelectorAll('.featured-case')].find(
    (c) => c.querySelector('a').getAttribute('href') === '/work/aged-inventory/',
  );
  assert.equal(
    card.querySelector('.evidence-label').textContent.trim(),
    'Independent illustration',
  );
  const figure = card.querySelector('figure');
  assert(!/\d/.test(figure.textContent));
  assert.equal(figure.querySelectorAll('li').length, 6);
  assert(!figure.querySelector('input, button, svg, canvas'));
  const detail = d.querySelector('#inventory-lifecycle');
  assert.equal(
    detail.querySelector('#inventory-lifecycle-disclosure').textContent.trim(),
    'Created independently for this portfolio. It explains a general decision-model lifecycle and does not reproduce employer data, formulas, workbook design, rules, or system architecture.',
  );
  assert.equal(d.querySelectorAll('#inventory-lifecycle-disclosure').length, 1);
  assert(t.indexOf('Amazon FBA') < t.indexOf('FBA aged-inventory review'));
});

test('Independent inventory asset remains unchanged: src/components/InventoryExample.astro', () =>
  assert.equal(
    createHash('sha256')
      .update(fs.readFileSync('src/components/InventoryExample.astro'))
      .digest('hex'),
    '38b4848b60649875d0c6508dcba4ba1df3bf2d9b33bfa19bf5ee680482542f02',
  ));

test('Independent inventory asset remains unchanged: src/data/inventory-example.json', () =>
  assert.equal(
    createHash('sha256')
      .update(fs.readFileSync('src/data/inventory-example.json'))
      .digest('hex'),
    '901cfe72066fb82d519f73108f2799b3a00060299dc60cc191782b06e233e172',
  ));

test('Competitive Intelligence 5C preserves design ownership and bounded delivery', () => {
  const text = publicDocument('competitive-intelligence')
    .querySelector('main')
    .textContent.replace(/\s+/g, ' ');
  for (const required of [
    'I performed my own analysis and designed and built the Power BI solution',
    'I performed my own analysis, compared my results with the earlier spreadsheet',
    'Both final checks passed before publication.',
    'I published the report in Power BI Service.',
    'The report was approved for use and used by the Ads Team',
    'I continued to maintain the report after publication.',
    'The earlier spreadsheet and any supplied query inputs served as references for my work.',
    'it is not the historical search-term ranking algorithm.',
  ])
    assert(text.includes(required), required);
  assert(
    !/\bAJ\b|private records|U[1-6]\b|I rebuilt|I migrated|finished design|until departure|at departure|maintenance schedule|fully automated|guaranteed accuracy|every discrepancy was corrected/i.test(
      text,
    ),
  );
});
const expectedRVersion = '4.6.1';
function selectRscript({
  explicit = process.env.RSCRIPT_PATH,
  platform = process.platform,
  searchPath = process.env.PATH || '',
} = {}) {
  let candidate;
  if (explicit !== undefined && explicit !== null) {
    assert(
      explicit && path.isAbsolute(explicit),
      'RSCRIPT_PATH must be an absolute executable path',
    );
    candidate = explicit;
  } else if (platform === 'win32') {
    candidate = path.join(
      'C:',
      'Program Files',
      'R',
      'R-' + expectedRVersion,
      'bin',
      'Rscript.exe',
    );
  } else if (platform === 'linux' || platform === 'darwin') {
    candidate = searchPath
      .split(path.delimiter)
      .filter((directory) => directory && path.isAbsolute(directory))
      .map((directory) => path.join(directory, 'Rscript'))
      .find((file) => fs.existsSync(file) && fs.statSync(file).isFile());
  }
  assert(
    candidate && fs.existsSync(candidate) && fs.statSync(candidate).isFile(),
    'The required Rscript executable is missing; runtime parity cannot be skipped',
  );
  return candidate;
}
function requireRVersion(value) {
  assert.equal(
    value.trim(),
    expectedRVersion,
    'R runtime version must match the approved exact version',
  );
}
function verifiedRscript() {
  const executable = selectRscript();
  const version = spawnSync(
    executable,
    ['--vanilla', '-e', 'cat(as.character(getRversion()))'],
    { encoding: 'utf8' },
  );
  assert.equal(version.status, 0, 'Rscript version check must execute successfully');
  requireRVersion(version.stdout);
  return executable;
}

test('Financial practice trials execute reproducibly and match every public table', () => {
  const r = verifiedRscript();
  const sourcePath = 'src/examples/code/financial-practice-trials.R';
  const run = () => {
    const result = spawnSync(r, ['--vanilla', sourcePath], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(result.stdout);
  };
  const actual = run();
  assert.deepEqual(run(), actual, 'Deterministic fixture and model output');
  assert.deepEqual(
    actual,
    JSON.parse(fs.readFileSync('src/data/financial-practice-trials.json', 'utf8')),
  );
  const document = publicDocument('financial-behavior');
  for (const table of actual.tables) {
    const visible = document.querySelector('#' + table.id + ' table');
    assert.equal(visible.querySelector('caption').textContent.trim(), table.caption);
    assert.deepEqual(
      [...visible.querySelectorAll('thead th')].map((e) => e.textContent.trim()),
      table.headers,
    );
    assert.deepEqual(
      [...visible.querySelectorAll('tbody tr')].map((row) =>
        [...row.querySelectorAll('td')].map((e) => e.textContent.trim()),
      ),
      table.rows,
    );
  }
  assert.deepEqual(
    actual.tables[1].rows.map((row) => row[1]),
    ['9', '8', '7'],
  );
  assert.deepEqual(actual.tables[2].rows, [
    ['Circle', '5', '3', '60.0%'],
    ['Square', '3', '2', '66.7%'],
  ]);
  assert.deepEqual(actual.tables[3].rows, [['Preparation units', '0.493', '1.637', '7']]);
  assert.equal(actual.tables[0].rows[7][4], 'Descriptive only: missing predictor');
  assert.equal(actual.tables[0].rows[8][4], 'Neither: missing outcome');
  const checks = actual.tables[4].rows;
  assert.equal(checks.filter((row) => row[1] === 'PASS').length, 5);
  assert.deepEqual(
    checks.filter((row) => row[1].startsWith('Rejected:')).map((row) => row[0]),
    [
      'Duplicate lookup fixture',
      'Invalid outcome fixture',
      'Unusable population fixture',
      'Constant predictor fixture',
    ],
  );
  const code = fs.readFileSync(sourcePath, 'utf8');
  assert.equal(document.querySelector('#trial-code pre code').textContent, code);
  assert(!document.querySelector('#trial-code').hasAttribute('open'));
  for (const field of ['trial_key', 'preparation_units', 'completed', 'practice_group'])
    assert(code.includes(field));
  for (const safeguard of [
    'Required fields are missing',
    'Join changed trial cardinality',
    'Outcome must be binary or missing',
    'Model matrix must have full rank',
    'Model did not converge',
    'Model outputs must be finite',
    'Source objects were modified',
  ])
    assert(code.includes(safeguard));
  assert(/identical\(trials, original_trials\)/.test(code));
  assert(/identical\(groups, original_groups\)/.test(code));
  assert(
    !/set\.seed|sample\(|rnorm\(|runif\(|install\.packages|library\(|require\(|Sys\.getenv|download\.file|https?:|DBI|dbConnect|loan|borrower|repayment|balance|branch|region|LifeBank/i.test(
      code,
    ),
  );
  assert.deepEqual(inspectText(code), []);
});

test('Financial synthetic evidence is separate, bounded and keyboard-native', () => {
  const d = publicDocument('financial-behavior');
  const example = d.querySelector('#practice-trial-example');
  assert.equal(
    example.querySelector('.evidence-label').textContent.trim(),
    'Independent technical example · Synthetic data',
  );
  const text = example.textContent.replace(/\s+/g, ' ');
  const disclosure =
    'Created independently for this portfolio using fictional data. It does not reproduce employer code, data, fields, rules, coefficients, model results, reports or system architecture. It demonstrates population preparation and association analysis, not a historical employer model or its performance.';
  assert(text.includes(disclosure));
  assert(
    text.includes(
      'An association in this fictional observational example does not establish causation or production predictive performance.',
    ),
  );
  assert(text.includes('without modifying its source records'));
  assert(
    text.includes(
      'Its checks are not claims about checks performed in the historical professional studies.',
    ),
  );
  assert(
    !/accuracy score|confusion matrix|automated decision|holdout accuracy|predictive improvement/i.test(
      text,
    ),
  );
  assert.equal(example.querySelectorAll('table caption').length, 5);
  assert.equal(example.querySelectorAll('details summary').length, 1);
  assert.equal(example.querySelector('pre').getAttribute('tabindex'), '0');
  assert.deepEqual(
    [...d.querySelectorAll('#evidence-index a')].map((a) => a.getAttribute('href')),
    ['#interpretation-illustration', '#practice-trial-example'],
  );
  assert.deepEqual(inspectText(text), []);
});

test('Financial 6C professional narrative and conceptual illustration stay approved', () => {
  const document = publicDocument('financial-behavior');
  const expected = {
    '#context': 'b0f951bccf228702790595b34ce0bdd554b99f6250321e56b3018d20798d5f70',
    '#approach': 'a681bbfd497dd237ace938c45089492e18da8d26abc409f460daf2d0949525c5',
    '#validation': 'ed1a2e239c82f3befd6438686f7624d65ca2c45fd04be10a8fabe90b91956fee',
    '#outcome': '4da2e02fe7f2319ea7438bf2630f5bdd373b32d78cee5aa6faf6eb1d0d57aeaf',
    '#scope': '9651fdb4c6146192d0d3f02ecf51fd99c4ff1087a5f4cac8213af5f2474f0ab7',
    '#tools': '63dbab8c3b1a5348caef52cfd4024972249234507462dc134089f414a6ee071a',
    '#interpretation-illustration':
      '7125feb95db186c3e0ea160b1e7c35f0951e816ff2cf624d6f007da954bd7f99',
  };
  for (const [selector, hash] of Object.entries(expected)) {
    const text = document.querySelector(selector).textContent.replace(/\s+/g, ' ').trim();
    assert.equal(createHash('sha256').update(text).digest('hex'), hash, selector);
  }
});

test('Experience preserves approved chronology, consultancy and related Work links', () => {
  const d = parseHTML(fs.readFileSync('dist/experience/index.html', 'utf8')).document;
  const roles = [...d.querySelectorAll('.experience-role')];
  assert.equal(d.querySelectorAll('h1').length, 1);
  assert.deepEqual(
    roles.map((e) => e.querySelector('h2').textContent),
    [
      'Sunco Lighting, Inc.',
      'LifeBank Foundation',
      'Theoria Medical',
      'Talleco.com, Inc. / JobTarget',
      'UL Solutions',
    ],
  );
  assert.deepEqual(
    roles.map((e) => e.querySelector('.role-title').textContent),
    [
      'Senior Data Analyst',
      'Data Analyst (Consultant)',
      'Lead Data Analyst',
      'Data Scientist',
      'Research Lead',
    ],
  );
  assert.deepEqual(
    roles.map((e) =>
      e.querySelector('.role-dates').textContent.replace(/\s+/g, ' ').trim(),
    ),
    [
      'Feb 2026 – Aug 2026',
      'Apr 2024 – Apr 2026',
      'Sep 2025 – Dec 2025',
      'May 2023 – Sep 2025',
      'Jul 2017 – Apr 2023',
    ],
  );
  assert.deepEqual(
    [...d.querySelectorAll('time')].map((e) => e.getAttribute('datetime')),
    [
      '2026-02',
      '2026-08',
      '2024-04',
      '2026-04',
      '2025-09',
      '2025-12',
      '2023-05',
      '2025-09',
      '2017-07',
      '2023-04',
    ],
  );
  assert.equal(
    d.querySelector('#ul .role-context').textContent,
    'Data Management Team, Research Division',
  );
  assert(
    d
      .querySelector('.consultancy-note')
      .textContent.includes('consultancy engagement and overlapped'),
  );
  for (const role of roles) {
    assert.equal(role.getAttribute('aria-labelledby'), role.querySelector('h2').id);
    assert(role.querySelectorAll('.accomplishments li').length >= 2);
    assert(role.querySelectorAll('.accomplishments li').length <= 5);
  }
  assert.deepEqual(
    [...d.querySelectorAll('.related-work a')].map((e) => e.getAttribute('href')),
    [
      '/work/market-share-workflow/',
      '/work/aged-inventory/',
      '/work/competitive-intelligence/',
      '/work/data-quality-process/',
      '/work/financial-behavior/',
      '/work/marketplace-reporting/',
    ],
  );
  assert.equal(d.querySelectorAll('#theoria .related-work, #ul .related-work').length, 0);
  assert.equal(
    d.querySelector('.experience-close a').getAttribute('href'),
    '/resume-contact/',
  );
  assert.equal(
    d.querySelectorAll(
      'a[download], a[href$=".pdf"], a[href^="mailto:"], a[href^="tel:"]',
    ).length,
    0,
  );
  assert.deepEqual(inspectText(d.body.textContent), []);
});

test('Experience keeps approval, ownership, quantitative scope and joint-work boundaries', () => {
  const d = parseHTML(fs.readFileSync('dist/experience/index.html', 'utf8')).document;
  const text = (id) => d.querySelector(id).textContent.replace(/\s+/g, ' ');
  assert(
    text('#sunco').includes(
      'completed, tested, reviewed and approved, with deployment planned',
    ),
  );
  assert(
    text('#sunco').includes(
      'separately packaged and transferred a release-tested Codex Skill adopted by stakeholders',
    ),
  );
  assert(text('#sunco').includes('within an existing workbook'));
  assert(
    text('#sunco').includes(
      'recurring monthly reviews, with stakeholders retaining final decisions',
    ),
  );
  assert(
    text('#lifebank').includes(
      'Authored and implemented the formally approved operating protocol',
    ),
  );
  assert(
    text('#lifebank').includes(
      'Data Engineering owned ingestion and later recurring execution; source owners retained correction responsibility',
    ),
  );
  assert(
    text('#lifebank').includes(
      'Led and delivered the approved Financial Behavior reporting program',
    ),
  );
  assert(
    text('#lifebank').includes(
      'Completed OLS and quantile-regression modeling, diagnostics and interpretation with collaborators',
    ),
  );
  assert(text('#theoria').includes('approximately 30% fewer working days than planned'));
  assert(!/30% (?:faster|more efficient|productivity)/i.test(text('#theoria')));
  assert(text('#theoria').includes('initial RDCO dashboard source validation'));
  assert(
    text('#talleco').includes(
      '97% record-level match in the reviewed 2024 YTD scope, particularly for revenue values',
    ),
  );
  assert(
    text('#talleco').includes(
      'Business-definition differences remained documented for Finance review',
    ),
  );
  assert(text('#talleco').includes('Employee of the Year recognition in 2023'));
  assert(
    !/co-authored|framework was formally approved|organization-wide adoption|guaranteed (?:clean|accurate)|complete Finance reconciliation|97% (?:forecast|universal)|fully automated|automated bidding/i.test(
      d.body.textContent,
    ),
  );
});

test('Learning keeps one personal analytics project separate from seven approved course credentials', () => {
  const html = fs.readFileSync('dist/learning/index.html', 'utf8');
  const d = parseHTML(html).document;
  const main = d.querySelector('main');
  const text = main.textContent.replace(/\s+/g, ' ');
  assert.equal(
    d.querySelector('h1').textContent,
    'Learning and Professional Development',
  );
  assert.equal(d.querySelectorAll('.learning-section').length, 2);
  for (const phrase of [
    'Personal analytics project',
    'Comparing Linear Regression Models in Python',
    'I implemented and compared several linear-regression specifications in Python using different feature sets and an interaction term, then examined how those choices affected model fit and prediction error.',
    'Using pandas and scikit-learn, I explored relationships in the Advertising dataset, prepared model inputs, fitted alternative specifications, and interpreted R-squared and root mean squared error. The project strengthened my practical understanding of feature selection, interaction effects and model evaluation.',
    'I used a consistent train/test split to compare the alternative specifications. Because the same held-out partition informed model selection, the results are presented as exploratory model comparison rather than an untouched final performance benchmark.',
    'I completed this as a personal portfolio project to deepen my applied regression skills and demonstrate how different model specifications can be evaluated and interpreted in Python.',
    'This project is not presented as causal analysis, a production forecasting system or evidence of commercial advertising impact.',
  ])
    assert(text.includes(phrase), phrase);
  const expected = [
    'https://www.coursera.org/account/accomplishments/certificate/ANSQTHKMBECG',
    'https://www.udemy.com/certificate/UC-77d3b4da-2c6f-47ef-997b-eb5bee4d67c4/',
    'https://www.coursera.org/account/accomplishments/specialization/certificate/AH4F36QGH3GL',
    'https://www.coursera.org/account/accomplishments/specialization/certificate/5M72EGYCFSB7',
    'https://www.coursera.org/account/accomplishments/specialization/certificate/JSV6LSAU89K3',
    'https://www.coursera.org/account/accomplishments/specialization/certificate/5R334T7V388H',
    'https://www.coursera.org/account/accomplishments/specialization/certificate/WML58DRDMX8N',
  ];
  assert.deepEqual(
    [...d.querySelectorAll('.credentials a')].map((a) => a.getAttribute('href')),
    expected,
  );
  for (const url of expected)
    assert.equal(d.querySelectorAll(`a[href="${url}"]`).length, 1);
  assert.equal(d.querySelectorAll('.provider').length, 7);
  assert.equal(d.querySelectorAll('.methods li').length, 8);
  for (const a of main.querySelectorAll('a[href^="https:"]')) {
    assert.equal(a.getAttribute('target'), '_blank');
    assert.equal(a.getAttribute('rel'), 'noopener noreferrer');
  }
  assert.equal(main.querySelectorAll('img,iframe,pre,table,[download]').length, 0);
  assert(
    !/geospatial|segmentation|citibike|\.ipynb|\.csv|\.geojson|professional licen[cs]e|Microsoft certification|\bROI\b|cross-validation|residual diagnostics|formal assumption testing|\d+%/i.test(
      main.innerHTML,
    ),
  );
  const project = d.querySelector('[aria-labelledby="project-heading"]');
  assert(
    !/Coursera|Snehan Kekre|Multiple Linear Regression with scikit-learn|guided|educational|course exercise|learning exercise|method-focused educational account|independently originated methodology/i.test(
      project.textContent,
    ),
  );
  assert(
    !/guided|educational|Coursera|Snehan/i.test(
      d.querySelector('meta[name="description"]').getAttribute('content'),
    ),
  );
  assert(!html.includes('https://www.statlearning.com/resources-second-edition'));
  const projectLinks = [
    ['https://github.com/A-C-A-F/Multiple-Linear-Regression', 'View project on GitHub'],
    [
      'https://www.kaggle.com/code/arielfelices/multiple-linear-regression',
      'View notebook on Kaggle',
    ],
  ];
  for (const [url, label] of projectLinks) {
    const anchors = d.querySelectorAll(`a[href="${url}"]`);
    assert.equal(anchors.length, 1);
    assert.equal(
      anchors[0].textContent.replace('↗', '').replace(/\s+/g, ' ').trim(),
      label,
    );
    assert.equal(anchors[0].getAttribute('target'), '_blank');
    assert.equal(anchors[0].getAttribute('rel'), 'noopener noreferrer');
  }
  assert.equal(project.querySelectorAll('a').length, 2);
  assert(project.textContent.includes('External project links open in a new tab.'));
  assert.equal(d.querySelectorAll('.link-tail').length, 9);
  assert.deepEqual(
    [...d.querySelectorAll('.credentials li')].map((e) => [
      e.querySelector('a').textContent.replace('↗', '').replace(/\s+/g, ' ').trim(),
      e.querySelector('.provider').textContent.trim(),
    ]),
    [
      ['Data-Driven Decisions with Power BI', 'Coursera · Course'],
      ['Advanced DAX for Microsoft Power BI Desktop', 'Udemy · Course'],
      ['Modern Big Data Analysis with SQL Specialization', 'Coursera · Specialization'],
      ['Applied Data Science with Python Specialization', 'Coursera · Specialization'],
      ['Statistics with Python Specialization', 'Coursera · Specialization'],
      [
        'Excel Skills for Data Analytics and Visualization Specialization',
        'Coursera · Specialization',
      ],
      ['Data Visualization with Tableau Specialization', 'Coursera · Specialization'],
    ],
  );
  assert.deepEqual(inspectText(html), []);
  for (const nav of d.querySelectorAll('header nav')) {
    assert.equal(
      nav.querySelector('[aria-current="page"]').getAttribute('href'),
      '/learning/',
    );
  }
});

// Preserve the historical whole-page hashes while allowing only the two new
// Phase 5E navigation anchors. Learning itself is asserted independently.
function withoutLearningNavigation(html) {
  const links = html.match(/<a href="\/learning\/">\s*Learning\s*<\/a>\s*/g) || [];
  assert.equal(links.length, 2);
  return html.replace(/<a href="\/learning\/">\s*Learning\s*<\/a>\s*/g, '');
}

test('Phase 6B diagram groups retain visible context and valid accessible naming', () => {
  for (const file of ['dist/index.html', 'dist/work/index.html']) {
    const d = parseHTML(fs.readFileSync(file, 'utf8')).document;
    const flow = d.querySelector('.flow');
    assert(flow);
    assert.equal(flow.hasAttribute('aria-label'), false);
    assert(flow.parentElement.textContent.includes('Governed analytical lifecycle'));
    assert(
      flow.parentElement.textContent.includes(
        'Reconcile, review exceptions, and package results.',
      ),
    );
  }
  const quality = parseHTML(
    fs.readFileSync('dist/work/data-quality-process/index.html', 'utf8'),
  ).document;
  const key = quality.querySelector('.track-key');
  assert.equal(key.getAttribute('role'), 'group');
  assert.equal(key.getAttribute('aria-label'), 'Lifecycle responsibility key');
  assert.equal(key.querySelectorAll('span').length, 3);
  const marketplace = parseHTML(
    fs.readFileSync('dist/work/marketplace-reporting/index.html', 'utf8'),
  ).document;
  const validation = marketplace.querySelector('.validation-track');
  assert.equal(validation.hasAttribute('aria-label'), false);
  assert(validation.textContent.includes('Validation travels with the output'));
  assert.deepEqual(
    [...validation.querySelectorAll('li')].map((el) => el.textContent.trim()),
    ['Keys', 'Totals', 'Exceptions'],
  );
});

test('legitimate checkout root Git metadata is excluded without being traversed', () => {
  const result = scanTree('.');
  assert(!result.errors.some((e) => e.startsWith('.git:')));
  assert(!result.files.some((name) => name === '.git' || name.startsWith('.git/')));
  assert(fs.lstatSync('.git').isDirectory());
});

test('nested, generated and invalid copied Git metadata remain rejected', () => {
  const root = fixture({
    '.git/HEAD': 'invalid copied metadata',
    'nested/.git/HEAD': 'invalid copied metadata',
  });
  const scanned = scanTree(root);
  assert(scanned.errors.includes('.git: unexpected-repository'));
  assert(scanned.errors.includes('nested/.git: unexpected-repository'));
  const generated = scanTree(fixture({ '.git/HEAD': 'copied metadata' }), {
    generated: true,
  });
  assert(generated.errors.includes('.git: unexpected-repository'));
  assert(
    scanTree(fixture({ '.git': 'gitdir: copied-metadata' })).errors.includes(
      '.git: unsafe-type',
    ),
  );
});

test('Git metadata symlinks or junctions never bypass source or generated scanning', () => {
  const root = fixture({ 'safe/file.md': 'Safe synthetic fixture' });
  fs.symlinkSync(
    path.resolve('.git'),
    path.join(root, '.git'),
    process.platform === 'win32' ? 'junction' : 'dir',
  );
  for (const generated of [false, true]) {
    const result = scanTree(root, { generated });
    assert(result.errors.includes('.git: symbolic-link-or-junction'));
    assert(!result.files.some((name) => name.startsWith('.git/')));
  }
});

test('R selection honors explicit paths and supported provisioned discovery', () => {
  const directory = fixture({
    Rscript: 'Selection-only synthetic file; never executed.',
  });
  const executable = path.resolve(directory, 'Rscript');
  assert.equal(selectRscript({ explicit: executable, searchPath: '' }), executable);
  for (const platform of ['linux', 'darwin']) {
    assert.equal(
      selectRscript({ explicit: null, platform, searchPath: path.resolve(directory) }),
      executable,
    );
  }
});

test('R selection and version guards fail closed rather than skip parity', () => {
  const missing = path.resolve(fixture({}), 'absent-Rscript');
  assert.throws(() => selectRscript({ explicit: missing }), /executable is missing/);
  assert.throws(() => selectRscript({ explicit: '' }), /absolute executable path/);
  assert.throws(
    () => selectRscript({ explicit: null, platform: 'linux', searchPath: '' }),
    /executable is missing/,
  );
  assert.throws(() => requireRVersion('4.6.0'), /approved exact version/);
  assert.throws(() => requireRVersion('unrecognized'), /approved exact version/);
  requireRVersion('4.6.1');
});
