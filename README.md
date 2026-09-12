# Ariel Christian Felices — Professional portfolio

A static Astro portfolio presenting professional analytical work, career experience,
selected personal project work and professional-development credentials.

## Site structure

The public routes are Home, Work and six detailed Work cases, Experience, Learning,
Resume & Contact, the résumé-route bridge and a useful 404 page. Professional case
narratives remain separate from clearly labeled independent and synthetic examples.
The site targets the GitHub user-site root at https://a-c-a-f.github.io/.

Source is in `src/`. Approved static assets are in `public/`. Astro generates `dist/`,
which is untracked and is the only directory eligible for the Pages artifact.

## Local prerequisites

- Node 24 and npm 11.12.1; dependencies are fixed by `package-lock.json`.
- Python with standard-library SQLite support for the synthetic SQL checks.
- Base R 4.6.1 for mandatory deterministic execution and JSON/table parity.
- Microsoft Edge for the configured Playwright browser tests.

Use `RSCRIPT_PATH` to select an absolute Rscript executable path. The tests preserve
the approved Windows installation fallback and discover a provisioned Rscript on
supported Linux/macOS runners. A missing runtime or a different R version fails;
R execution is never optional.

For an authorized clean setup, run `npm.cmd ci` on Windows. Use `npm.cmd` in
PowerShell when the `npm.ps1` wrapper is blocked; changing execution policy is not
required. On other systems use `npm` for the same commands.

## Preview and verification

```powershell
npm.cmd run dev
npm.cmd run format:check
npm.cmd run check
npm.cmd run build
npm.cmd run validate
npm.cmd run test:content
npm.cmd test
```

After building, `npm.cmd run preview -- --port 4321` serves the static site locally.
Stop the owned preview before the browser suite starts its own server. Astro checks
include TypeScript diagnostics. `npm.cmd run format` writes formatting changes;
review its diff. `npm.cmd run audit:dependencies` is available for an explicitly
reviewed dependency-maintenance task, without automatic upgrades.

## GitHub Actions and release control

The workflow verifies pull requests into main, main pushes and manual dispatches.
Pull requests cannot upload a production Pages artifact or deploy. Future publishing
requires trusted main, an approved event and the explicit repository variable
`PAGES_DEPLOYMENT_ENABLED` set to `true`. Manual deployment also requires the deploy
input. The initial launch branch leaves that switch unset; the current branch-based
README site and the separate legacy portfolio remain unchanged.

After separate launch approval, Pages can use GitHub Actions to publish only verified
`dist` output. The deploy job depends on successful checks and uses the github-pages
environment with limited permissions. Do not merge, enable publishing or change Pages
source merely to test a pull request.

## Content and maintenance boundaries

The stable public résumé filename is `Ariel_Christian_Felices_Resume.pdf`. A later
approved replacement keeps that filename and requires updating the validator's exact
PDF hash and rerunning the view/download and full regression checks.

Employer evidence, private records, credentials, résumé originals, specialized
résumés and private review packages are excluded. Repository files are public even
when not built into the site; an ignore rule is not permission to place confidential
material here. Preserve reviewed claims and unaffected protected-file hashes. Review
all source changes and tests before a commit or push; a publishing-enabled main push
can release the site. Failed checks must stop publication.
