// Preserve the TypeError transport contract used by upload retry logic while
// distinguishing connection failures from unexpected application TypeErrors.
export class NetworkError extends TypeError {
  constructor(cause: TypeError) {
    super(cause.message, { cause });
    this.name = "NetworkError";
  }
}
export async function transport<T>(request: () => Promise<T>): Promise<T> {
  try {
    return await request();
  } catch (error) {
    if (error instanceof TypeError) throw new NetworkError(error);
    throw error;
  }
}
