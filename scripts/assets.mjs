import { cp, mkdir } from 'node:fs/promises';
await mkdir('dist/web', { recursive: true });
await cp('public', 'dist/public', { recursive: true });
await cp('src/web/styles.css', 'dist/web/styles.css');
// Hosting can publish this directory without leaking server modules or credentials.
await cp('dist/web', 'dist/public/web', { recursive: true, filter: source => !source.endsWith('.map') });
await cp('dist/shared', 'dist/public/shared', { recursive: true, filter: source => !source.endsWith('.map') });
console.log('Built TypeScript application and static assets.');
