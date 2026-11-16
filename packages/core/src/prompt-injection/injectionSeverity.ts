export type InjectionSeverity = 'info' | 'low' | 'medium' | 'high';

export const SEVERITIES_FROM_LOWEST: readonly InjectionSeverity[] = ['info', 'low', 'medium', 'high'];
export const SEVERITIES_FROM_HIGHEST: readonly InjectionSeverity[] = [...SEVERITIES_FROM_LOWEST].reverse();

export function isInjectionSeverity(value: unknown): value is InjectionSeverity {
  return typeof value === 'string' && (SEVERITIES_FROM_LOWEST as readonly string[]).includes(value);
}

export function severityRank(severity: InjectionSeverity): number {
  return SEVERITIES_FROM_LOWEST.indexOf(severity);
}

/** Moves the severity up (positive steps) or down, stopping at High and at Info. */
export function shiftSeverity(severity: InjectionSeverity, steps: number): InjectionSeverity {
  const highestRank = SEVERITIES_FROM_LOWEST.length - 1;
  const rank = Math.min(highestRank, Math.max(0, severityRank(severity) + steps));
  return SEVERITIES_FROM_LOWEST[rank] ?? severity;
}

export function isAtLeast(severity: InjectionSeverity, threshold: InjectionSeverity): boolean {
  return severityRank(severity) >= severityRank(threshold);
}

export function highestSeverityOf(severities: readonly InjectionSeverity[]): InjectionSeverity | undefined {
  return severities.reduce<InjectionSeverity | undefined>(
    (highest, severity) => (highest === undefined || isAtLeast(severity, highest) ? severity : highest),
    undefined,
  );
}
