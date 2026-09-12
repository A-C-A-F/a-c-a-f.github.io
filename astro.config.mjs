import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
export default defineConfig({
  site: 'https://a-c-a-f.github.io',
  output: 'static',
  trailingSlash: 'always',
  integrations: [mdx()],
  build: { format: 'directory' },
});
