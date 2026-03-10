export class ApiError extends Error {
  private constructor(
    readonly response: Response,
    readonly data: any,
    message: string,
  ) {
    super(message);
  }

  static async fromResponse(response: Response) {
    // Try our best to parse the result, but don't bother if we can't
    let data: string | object | undefined = undefined;
    try {
      data = await response.json();
    } catch {
      try {
        data = await response.text();
      } catch {}
    }
    let message = `Response status: ${response.status}`;
    const rateLimitLimit = response.headers.get('x-rate-limit-limit');
    let rateLimitResetMs = undefined;
    if (rateLimitLimit) {
      const rateLimitRemaining = response.headers.get('x-rate-limit-remaining');
      const rateLimitReset = response.headers.get('x-rate-limit-reset');

      message += ` (Rate Limit: ${rateLimitRemaining}/${rateLimitLimit}`;
      if (rateLimitReset) {
        const resetDate = new Date(parseInt(rateLimitReset) * 1000);
        rateLimitResetMs = resetDate.getTime() - Date.now();
        message += `, Resets at: ${resetDate.toISOString()})`;
      } else {
        message += `)`;
      }
    }

    const err = new ApiError(response, data, message);
    if (rateLimitResetMs !== undefined) {
      (err as any).rateLimitResetMs = rateLimitResetMs;
    }
    return err;
  }
}

interface Position {
  line: number;
  column: number;
}

interface TraceInfo {
  trace_id: string;
}

interface TwitterApiErrorExtensions {
  code?: number;
  kind?: string;
  name?: string;
  source?: string;
  tracing?: TraceInfo;
}

export interface TwitterApiErrorRaw extends TwitterApiErrorExtensions {
  message?: string;
  locations?: Position[];
  path?: string[];
  extensions?: TwitterApiErrorExtensions;
}
