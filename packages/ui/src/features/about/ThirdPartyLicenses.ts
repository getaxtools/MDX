export interface ThirdPartyPackage {
  readonly ecosystem: 'npm' | 'cargo';
  readonly name: string;
  readonly version: string;
  /** The SPDX expression the package declares, such as `MIT OR Apache-2.0`. */
  readonly license: string;
  /** Which of the shared texts is this package's license file; null when it ships none. */
  readonly textIndex: number | null;
}

/** The packages built into the app and their license texts, generated at build time. */
export interface ThirdPartyLicenses {
  readonly packages: readonly ThirdPartyPackage[];
  readonly texts: readonly string[];
}

export type ThirdPartyLicensesLoader = () => Promise<ThirdPartyLicenses | undefined>;

/** The packages whose name contains the filter, ignoring case. */
export function filterPackages(packages: readonly ThirdPartyPackage[], filter: string): ThirdPartyPackage[] {
  const wanted = filter.trim().toLocaleLowerCase();
  return packages.filter((thirdPartyPackage) => thirdPartyPackage.name.toLocaleLowerCase().includes(wanted));
}
