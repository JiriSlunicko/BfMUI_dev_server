/**
 * General AJAX / fetch convenience wrappers.
 */

window.ajax = (function()
{
  /**
   * Attempt to fetch a resource, failing after a specified timeout.
   * @param {string} url 
   * @param {Number} [timeout=5000] time limit in ms, default 5000
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
      throw (err.name === "AbortError"
        ? new Error(`Request timed out after ${timeout} ms.`)
        : err);
    }
  }


  /**
   * Attempt to make a POST request, failing after a specified timeout.
   * @param {string} url 
   * @param {object|Array|null} payload 
   * @param {function|null} [successHandler=null]
   * function called when a JSON response is successfully retrieved, with the JSON data as an argument
   * @param {function|null} [failureHandler=null]
   * function called when anything fails, with Response|null and TypeError (network error) as arguments
   * @param {Number} [timeout=5000]
   * @returns {Promise<Boolean>}
   */
  async function postWithTimeout(url, payload, successHandler=null, failureHandler=null, timeout=5000) {
    let raw = null;
    try {
      raw = await fetchWithTimeout(url, timeout, {
        method: "POST",
        body: JSON.stringify(payload),
      });
    } catch (err) {
      ui.makeToast("error", `POST ${url} failed - network error\n\n${err.toString()}`, 5000);
      if (failureHandler) {
        failureHandler(raw, err);
      }
      return false;
    }

    if (raw) {
      try {
        const resp = await raw.json();
        if (successHandler) {
          successHandler(resp);
        }
        return true;
      } catch (err) {
        if (failureHandler) {
          failureHandler(raw, err);
        }
        if (raw.ok) {
          ui.makeToast("error", `POST ${url} succeeded, but can't process response\n\n${err.toString()}`, 7500);
        } else {
          ui.makeToast("error", `POST ${url} failed utterly - ${raw.status}:\n\n${raw.statusText}`, 7500);
        }
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