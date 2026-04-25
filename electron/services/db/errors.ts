export class MigrationError extends Error {
  public readonly version: number
  public override readonly cause: unknown
  constructor(version: number, message: string, cause: unknown) {
    super(message)
    this.name = 'MigrationError'
    this.version = version
    this.cause = cause
  }
}
