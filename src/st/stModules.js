let moduleCache = null;

export async function getSTModules() {
  if (moduleCache) return moduleCache;

  const scriptPath = '/script.js';
  const extensionsPath = '/scripts/extensions.js';
  const [script, extensions] = await Promise.all([
    import(/* @vite-ignore */ scriptPath),
    import(/* @vite-ignore */ extensionsPath),
  ]);

  moduleCache = { script, extensions };
  return moduleCache;
}
