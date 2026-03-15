export class BridgeError extends Error {
  code: string;
  details?: unknown;
  statusCode: number;

  constructor(code: string, message: string, statusCode = 400, details?: unknown) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}
