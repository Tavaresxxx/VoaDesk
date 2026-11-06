// Bound work before parsing JSON; an absolute deadline also catches trickle uploads.
export class RequestError extends Error {
  constructor(status, code) { super(code); this.status = status; }
}

export function readJson(req, res, limit, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    const cleanup = () => {
      clearTimeout(timer);
      req.off('data', data); req.off('end', end); req.off('error', error); req.off('aborted', aborted);
    };
    const fail = failure => {
      cleanup();
      req.pause();
      if (!res.headersSent) res.setHeader('Connection', 'close');
      reject(failure);
    };
    const error = () => fail(new RequestError(400, 'INVALID_REQUEST'));
    const aborted = () => error();
    const data = chunk => {
      size += chunk.length;
      if (size > limit) return fail(new RequestError(413, 'BODY_TOO_LARGE'));
      chunks.push(chunk);
    };
    const end = () => {
      cleanup();
      try {
        const value = size ? JSON.parse(Buffer.concat(chunks, size).toString('utf8')) : {};
        if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
        resolve(value);
      } catch { reject(new RequestError(400, 'INVALID_REQUEST')); }
    };
    const timer = setTimeout(() => fail(new RequestError(408, 'REQUEST_TIMEOUT')), timeoutMs);
    timer.unref();
    const length = req.headers['content-length'];
    if (length && Number(length) > limit) return fail(new RequestError(413, 'BODY_TOO_LARGE'));
    req.on('data', data); req.once('end', end); req.once('error', error); req.once('aborted', aborted);
  });
}
