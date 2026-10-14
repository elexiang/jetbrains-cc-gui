export type VersionAction = 'install' | 'update' | 'rollback' | 'current';

interface VersionActionInput {
  installed: boolean;
  installedVersion?: string;
  requestedVersion?: string;
}

interface BuildVersionOptionsInput {
  availableVersions?: string[];
  fallbackVersions?: string[];
  installedVersion?: string;
}

export const normalizeVersion = (version?: string | null): string | undefined => {
  const trimmed = version?.trim();
  if (!trimmed) {
    return undefined;
  }

  return trimmed.startsWith('v') || trimmed.startsWith('V')
    ? trimmed.slice(1)
    : trimmed;
};

export const getRequestedVersion = (
  selectedVersion?: string,
): string | undefined => {
  return normalizeVersion(selectedVersion);
};

export const compareVersions = (left?: string, right?: string): number => {
  const normalizedLeft = normalizeVersion(left);
  const normalizedRight = normalizeVersion(right);

  if (!normalizedLeft || !normalizedRight) {
    return 0;
  }

  const [leftCore, leftPre] = normalizedLeft.split('-', 2);
  const [rightCore, rightPre] = normalizedRight.split('-', 2);
  const leftParts = leftCore.split('.');
  const rightParts = rightCore.split('.');
  const maxLength = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < maxLength; index += 1) {
    const leftValue = Number.parseInt(leftParts[index] ?? '0', 10);
    const rightValue = Number.parseInt(rightParts[index] ?? '0', 10);

    if (leftValue !== rightValue) {
      return leftValue - rightValue;
    }
  }

  if (leftPre === rightPre) return 0;
  if (leftPre === undefined) return 1;
  if (rightPre === undefined) return -1;
  const leftIds = leftPre.split('.');
  const rightIds = rightPre.split('.');
  for (let index = 0; index < Math.max(leftIds.length, rightIds.length); index++) {
    const a = leftIds[index];
    const b = rightIds[index];
    if (a === undefined) return -1;
    if (b === undefined) return 1;
    if (a === b) continue;
    const aNumeric = /^\d+$/.test(a);
    const bNumeric = /^\d+$/.test(b);
    if (aNumeric && bNumeric) return Number(a) - Number(b);
    if (aNumeric !== bNumeric) return aNumeric ? -1 : 1;
    return a < b ? -1 : 1;
  }
  return 0;
};

export const getVersionAction = ({
  installed,
  installedVersion,
  requestedVersion,
}: VersionActionInput): VersionAction => {
  if (!installed) {
    return 'install';
  }

  const comparison = compareVersions(installedVersion, requestedVersion);
  if (comparison === 0) {
    return 'current';
  }

  return comparison < 0 ? 'update' : 'rollback';
};

export const buildVersionOptions = ({
  availableVersions = [],
  fallbackVersions = [],
  installedVersion,
}: BuildVersionOptionsInput): string[] => {
  const seen = new Set<string>();
  const merged = [...availableVersions, ...fallbackVersions, installedVersion];

  return merged.reduce<string[]>((result, version) => {
    const normalized = normalizeVersion(version);
    if (!normalized || seen.has(normalized)) {
      return result;
    }

    seen.add(normalized);
    result.push(normalized);
    return result;
  }, []);
};
