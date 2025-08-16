/**
 * General AJAX / fetch convenience wrappers.
 */

window.ajax = (function()
{
  /** Attempt to fetch a resource, failing after a specified timeout.
   * @param {string} url 
   * @param {number} [timeout=5000] time limit in ms, default 5000
   * @param {object} [opts={}] standard fetch API options object
   * @returns {Promise<Response>}
   */
  async function fetchWithTimeout(url, timeout=5000, opts={}) {
    const ctrl = new AbortController();
    const signal = ctrl.signal;

    const timeoutId = setTimeout(() => ctrl.abort(), timeout);

    try {
      const raw = await fetch(url, { ...opts, signal });
      clearTimeout(timeoutId);
      return raw;
    } catch (err) {
      clearTimeout(timeoutId);
      throw (err.name === "AbortError"
        ? new Error(`Request timed out after ${timeout} ms.`)
        : err);
    }
  }


  /** Attempt to make a POST request, failing after a specified timeout.
   * @param {string} url 
   * @param {object|array|null} payload 
   * @param {function|null} [successHandler=null]
   * function called when a JSON response is successfully retrieved, with the JSON data as an argument
   * @param {function|null} [failureHandler=null]
   * function called when anything fails, with Response|null and the error as arguments
   * @param {number} [timeout=5000]
   * @returns {Promise<boolean>}
   */
  async function postWithTimeout(url, payload, successHandler=null, failureHandler=null, timeout=5000) {
    let raw = null;
    try {
      raw = await fetchWithTimeout(url, timeout, {
        method: "POST",
        body: JSON.stringify(payload),
        // content-type deliberately not specified (weird backend compat issue)
      });
    } catch (err) {
      console.error(url, err);
      failureHandler?.(raw, err);
      ui.makeToast("error", `POST ${url} failed - network error\n\n${err.toString()}`, 5000);
      return false;
    }

    if (raw) {
      try {
        if (raw.status !== 200)
          throw new Error("HTTP status code "+raw.status);
        const resp = await raw.json();
        successHandler?.(resp);
        return true;
      } catch (err) {
        console.error(url, err, payload);
        failureHandler?.(raw, err);
        ui.makeToast("error", raw.ok
          ? `POST ${url} succeeded, but can't process response\n\n${err.toString()}`
          : `POST ${url} failed utterly - ${raw.status}:\n\n${raw.statusText}`,
          7500
        );
        return false;
      }
    }
  }

  
  // public API
  return {
    fetchWithTimeout,
    postWithTimeout
  }
})();