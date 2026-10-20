import type { ThirdPartyLicenses } from '@mdx/ui';

// The list is generated at build time and loads as its own chunk, only when About asks for it.
// A glob still compiles when a development checkout has not generated the file yet.
const generatedLicenses = import.meta.glob<ThirdPartyLicenses>('./generated/third-party-licenses.json', {
  import: 'default',
});

export async function loadThirdPartyLicenses(): Promise<ThirdPartyLicenses | undefined> {
  const [load] = Object.values(generatedLicenses);
  return load ? load() : undefined;
}
