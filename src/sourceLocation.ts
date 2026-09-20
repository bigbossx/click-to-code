export function isAbsoluteFilePath(fileName: string): boolean {
  return fileName.startsWith('/') || /^[A-Za-z]:[\\/]/.test(fileName)
}

export function normalizePosition(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : 1
}
