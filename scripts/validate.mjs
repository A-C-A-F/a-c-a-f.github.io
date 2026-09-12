import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { parseHTML } from 'linkedom';

export const rootURL = 'https://a-c-a-f.github.io';
export const evidenceLabels = [
  'Professional case',
  'Independent illustration',
  'Independent technical example · Synthetic data',
  'Independent demonstration · Synthetic data',
];
// Only generated directory boundaries are excluded, never authored source directories.
const generatedDirectories = new Set(['node_modules', '.astro', '.local', 'dist']);
const textExtensions =
  /\.(astro|css|md|mdx|json|ts|js|mjs|cjs|sql|r|txt|svg|html|ya?ml)$/i;
const binaryExtensions = /\.(png|webp|jpe?g|ico)$/i;
const configurationNames = new Set(['.gitignore', '.npmrc', '.prettierignore']);
// Assemble forbidden wording so the checker can inspect itself without exceptions.
const unfinished = new RegExp(
  [
    ['to be', 'confirmed'].join(' '),
    ['place', 'holder'].join(''),
    ['case.page', 'planned'].join(' '),
    ['layout', 'reserved'].join(' '),
    ['preview', '\\s*\\/\\s*', 'pdf planned'].join(''),
    ['local design', 'exploration'].join(' '),
    ['not a', 'published website'].join(' '),
    ['mock', 'up'].join(''),
  ].join('|'),
  'i',
);

export function inspectText(text) {
  const errors = [];
  // Normalize JSON-escaped separators before checking all drive and UNC paths.
  const normalized = text.replaceAll('\\\\', '\\');
  if (
    /(?:\b[a-z]:[\\/]|\\\\[a-z0-9_.-]+\\[a-z0-9_$.-]+|file:\/\/|\/(?:Users|home)\/[^\s/]+|\/root\/|~\/)/i.test(
      normalized,
    ) ||
    /\\\\[a-z0-9_.-]+\\[a-z0-9_$.-]+/i.test(text)
  )
    errors.push('local-path');
  if (
    /(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[A-Z0-9]{16}|-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----|(?:api[_-]?key|access[_-]?token|_authToken|password|client[_-]?secret)\s*["']?\s*[:=]\s*["']?[A-Za-z0-9_+\/-]{8,}|https?:\/\/[^\s/:]+:[^\s/@]+@)/i.test(
      text,
    )
  )
    errors.push('credential');
  if (unfinished.test(text)) errors.push('unfinished-wording');
  if (
    /<meta\b[^>]*(?:noindex)[^>]*>|(?:robots|indexing)\s*[:=]\s*["']?noindex/i.test(text)
  )
    errors.push('noindex');
  if (
    new RegExp(
      [
        ['Recreated', 'technical example'].join(' '),
        ['Public learning', 'project'].join(' '),
      ].join('|'),
    ).test(text)
  )
    errors.push('evidence-classification');
  return errors;
}

export function inspectHTML(text, route = '/') {
  const errors = inspectText(text);
  const { document: d } = parseHTML(text);
  if (
    !d.querySelector('title')?.textContent.trim() ||
    !d.querySelector('meta[name="description"]')?.getAttribute('content')?.trim()
  )
    errors.push('metadata');
  if (
    d.querySelector('link[rel="canonical"]')?.getAttribute('href') !==
    new URL(route, rootURL).href
  )
    errors.push('canonical');
  if (
    [...d.querySelectorAll('meta[name="robots"],meta[name="googlebot"]')].some((e) =>
      /noindex/i.test(e.getAttribute('content') || ''),
    )
  )
    errors.push('noindex');
  if (
    d.querySelectorAll('h1').length !== 1 ||
    !d.querySelector('main') ||
    d.documentElement.lang !== 'en'
  )
    errors.push('structure');
  if (
    [...d.querySelectorAll('.evidence-label')].some(
      (e) => !evidenceLabels.includes(e.textContent.trim()),
    )
  )
    errors.push('evidence-classification');
  if (d.querySelector('script:not([type="application/ld+json"])'))
    errors.push('client-script');
  if (route === '/404/' && d.querySelector('nav [aria-current]'))
    errors.push('404-current-navigation');
  return [...new Set(errors)];
}

export function safeFile(name) {
  const base = path.basename(name);
  if (
    /^\.env(?:\.|$)|(?:^|\.)(?:log|sqlite|db|zip|pdf|docx?|xlsx?|csv|exe|dll|pem|key)$/i.test(
      base,
    )
  )
    return false;
  return (
    textExtensions.test(base) ||
    binaryExtensions.test(base) ||
    configurationNames.has(base)
  );
}

export function approvedResume(name, bytes, { generated = false } = {}) {
  const normalized = path.posix.normalize(name.replaceAll('\\', '/'));
  const expected = generated
    ? 'resume/Ariel_Christian_Felices_Resume.pdf'
    : 'public/resume/Ariel_Christian_Felices_Resume.pdf';
  return (
    normalized === expected &&
    createHash('sha256').update(bytes).digest('hex') ===
      '2e72a8f59702b5d8e9de9d19186727098a867f6c15179523c2aba85b31ca69ce'
  );
}

// Recognize the current checkout without opening or scanning Git metadata contents.
function isRootGitDirectory(root) {
  const result = spawnSync(
    'git',
    [
      '--no-optional-locks',
      '-C',
      path.resolve(root),
      'rev-parse',
      '--show-toplevel',
      '--absolute-git-dir',
    ],
    { encoding: 'utf8', timeout: 10000 },
  );
  if (result.status !== 0) return false;
  const [top, metadata] = result.stdout.trim().split(/\r?\n/);
  if (!top || !metadata) return false;
  return (
    fs.realpathSync(top) === fs.realpathSync(root) &&
    fs.realpathSync(metadata) === fs.realpathSync(path.join(root, '.git'))
  );
}

export function scanTree(root, { generated = false } = {}) {
  const errors = [];
  const files = [];
  function visit(relative = '') {
    for (const entry of fs.readdirSync(path.join(root, relative), {
      withFileTypes: true,
    })) {
      const name = relative ? relative + '/' + entry.name : entry.name;
      const absolute = path.join(root, name);
      const stat = fs.lstatSync(absolute);
      // lstat detects Windows junctions as well as symbolic links. Never follow one.
      if (stat.isSymbolicLink()) {
        errors.push(name + ': symbolic-link-or-junction');
        continue;
      }
      if (stat.isDirectory()) {
        if (!generated && !relative && generatedDirectories.has(entry.name)) continue;
        if (entry.name === '.git') {
          if (!generated && !relative && isRootGitDirectory(root)) continue;
          errors.push(name + ': unexpected-repository');
          continue;
        }
        visit(name);
        continue;
      }
      if (!stat.isFile()) {
        errors.push(name + ': unsupported-file');
        continue;
      }
      files.push(name);
      const bytes = fs.readFileSync(absolute);
      // Only this verified public binary bypasses the text scan. All other files
      // retain both type rejection and generic privacy scanning.
      if (approvedResume(name, bytes, { generated })) continue;
      if (!safeFile(name)) errors.push(name + ': unsafe-type');
      // Scan bytes of every file, including unapproved types and image metadata.
      const text = bytes.toString('utf8');
      for (const error of inspectText(text)) errors.push(name + ': ' + error);
      if (
        /\.(astro|mdx?|html|svg)$/i.test(name) &&
        /<script\b(?![^>]*type=["']application\/ld\+json["'])/i.test(text)
      )
        errors.push(name + ': client-script');
      if (name.startsWith('public/') && /\.(?:[cm]?js|ts)$/i.test(name))
        errors.push(name + ': client-script');
      if (generated && /\.(?:[cm]?js|ts)$/i.test(name))
        errors.push(name + ': client-script');
    }
  }
  if (fs.existsSync(root)) visit();
  return { files, errors };
}

function inspectLinks(text, route, file, outputRoot) {
  const errors = [];
  const { document: d } = parseHTML(text);
  const ids = [...d.querySelectorAll('[id]')].map((e) => e.id);
  if (new Set(ids).size !== ids.length) errors.push('duplicate-id');
  for (const element of d.querySelectorAll(
    'a[href],img[src],link[rel="stylesheet"][href]',
  )) {
    const href = element.getAttribute('href') ?? element.getAttribute('src');
    let url;
    try {
      url = new URL(href, new URL(route, rootURL));
    } catch {
      errors.push('invalid-link');
      continue;
    }
    if (url.origin !== rootURL) {
      if (href === 'mailto:arielchristian.felices@gmail.com' && element.localName === 'a')
        continue;
      if (!/^https?:$/.test(url.protocol)) errors.push('unexpected-link-protocol');
      if (element.localName === 'a' && !element.textContent.includes('↗'))
        errors.push('external-indicator');
      continue;
    }
    const target = href.startsWith('#')
      ? file
      : path.join(
          outputRoot,
          decodeURIComponent(url.pathname),
          url.pathname.endsWith('/') ? 'index.html' : '',
        );
    if (!fs.existsSync(target) || !fs.statSync(target).isFile()) {
      errors.push('missing-target: ' + href);
      continue;
    }
    if (url.hash) {
      const other = parseHTML(fs.readFileSync(target, 'utf8')).document;
      if (!other.getElementById(decodeURIComponent(url.hash.slice(1))))
        errors.push('missing-fragment: ' + href);
    }
  }
  for (const nav of d.querySelectorAll('.desktop-nav,.mobile-nav nav'))
    if (/[←→↗↓]/.test(nav.textContent)) errors.push('primary-navigation-arrow');
  return errors;
}

export function validate(repository = '.', { quiet = false } = {}) {
  const source = scanTree(repository);
  const outputRoot = path.join(repository, 'dist');
  const output = scanTree(outputRoot, { generated: true });
  const errors = [...source.errors, ...output.errors.map((e) => 'dist/' + e)];
  const pages = output.files.filter((f) => f.endsWith('.html'));
  if (!pages.length) errors.push('missing-build-output');
  for (const relative of pages) {
    const route =
      relative === 'index.html'
        ? '/'
        : relative === '404.html'
          ? '/404/'
          : '/' + relative.replace(/index\.html$/, '');
    const file = path.join(outputRoot, relative);
    const text = fs.readFileSync(file, 'utf8');
    for (const error of [
      ...inspectHTML(text, route),
      ...inspectLinks(text, route, file, outputRoot),
    ])
      errors.push('dist/' + relative + ': ' + error);
  }
  if (errors.length) throw Error([...new Set(errors)].join('\n'));
  const result = {
    sourceFiles: source.files.length,
    generatedFiles: output.files.length,
    routes: pages.length,
    errors: [],
  };
  if (!quiet)
    console.log(
      'PASS: repository and generated-output validation',
      JSON.stringify(result),
    );
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  validate();
