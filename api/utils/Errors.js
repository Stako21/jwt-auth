class WebError {
  constructor(status, error) {
    this.status = status;
    this.error = error;
  }
}

function getDefaultMessage(status) {
  switch (status) {
    case 400:
      return "Bad Request";
    case 401:
      return "Unauthorized";
    case 403:
      return "Forbidden";
    case 404:
      return "Not Found";
    case 409:
      return "Conflict";
    case 422:
      return "Unprocessable Entity";
    default:
      return "Internal Server Error";
  }
}

export class Unprocessable extends WebError {
  constructor(error) {
    super(422, error);
  }
}

export class Conflict extends WebError {
  constructor(error) {
    super(409, error);
  }
}

export class NotFound extends WebError {
  constructor(error) {
    super(404, error);
  }
}

export class Forbidden extends WebError {
  constructor(error) {
    super(403, error);
  }
}

export class Unauthorized extends WebError {
  constructor(error) {
    super(401, error);
  }
}

export class BadRequest extends WebError {
  constructor(error) {
    super(400, error);
  }
}

class ErrorUtils {
  static catchError(res, error) {
    console.error(error);
    const status = error?.status || 500;
    const message = error?.error || getDefaultMessage(status);
    return res.status(status).json({ error: message });
  }
}

export function catchError(fn) {
  return function (req, res, next) {
    fn(req, res, next).catch(next);
  };
}

export default ErrorUtils;
