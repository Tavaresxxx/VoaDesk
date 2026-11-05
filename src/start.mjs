// Same package entry supports Windows desktop and a server configured explicitly.
const mode = process.env.VOADESK_MODE ?? 'desktop';
if (mode === 'pairing') {
  const { runPairingServiceFromEnvironment } = await import('./pairing/service.mjs');
  await runPairingServiceFromEnvironment();
} else if (mode === 'desktop') {
  const { runDesktopApp } = await import('./host/server.mjs');
  await runDesktopApp();
} else {
  throw new Error('VOADESK_MODE deve ser desktop ou pairing.');
}
