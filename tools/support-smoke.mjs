// The supported local smoke follows the native, single-consent session flow.
if(process.argv.includes('--production'))throw new Error('Este teste usa fixtures locais. Homologue a captura nativa entre dois computadores após uma publicação autorizada.');
await import('./desktop-session-smoke.mjs');
