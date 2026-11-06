// Bound work before parsing JSON; an absolute deadline also catches trickle uploads.
export class RequestError extends Error {
  constructor(status, code) { super(code); this.status = status; }
}

export function readJson(req, res, limit, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0, finished=false;
    const cleanup = () => {
      clearTimeout(timer);
      req.off('data', data); req.off('end', end); req.off('error', error); req.off('aborted', aborted);
    };
    const fail = failure => {
      if(finished)return;finished=true;
      cleanup();
      if (!res.headersSent) res.setHeader('Connection', 'close');
      if(req.destroyed||req.readableEnded){reject(failure);return;}
      // Complete a small in-flight chunked body before replying. Closing a Windows socket
      // with unread chunk framing can reset TCP before the caller receives the HTTP 413.
      // No more JSON is buffered or parsed: discard <=64 KiB for <=100 ms, then reject.
      let discarded=0,done=false;const finish=()=>{if(done)return;done=true;clearTimeout(drainTimer);req.off('data',discard);req.off('end',finish);req.off('close',finish);req.off('error',finish);req.off('aborted',finish);if(!req.readableEnded)req.pause();reject(failure);};
      const discard=chunk=>{discarded+=chunk.length;if(discarded>65536)finish();};
      const drainTimer=setTimeout(finish,100);drainTimer.unref();req.on('data',discard);req.once('end',finish);req.once('close',finish);req.once('error',finish);req.once('aborted',finish);req.resume();
    };
    const error = () => fail(new RequestError(400, 'INVALID_REQUEST'));
    const aborted = () => error();
    const data = chunk => {
      size += chunk.length;
      if (size > limit) return fail(new RequestError(413, 'BODY_TOO_LARGE'));
      chunks.push(chunk);
    };
    const end = () => {
      if(finished)return;finished=true;
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
