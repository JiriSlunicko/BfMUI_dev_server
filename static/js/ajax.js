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
   * @returns {Promise}
   */
  async function fetchWithTimeout(url, timeout = 5000, opts = {}) {
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
   * @param {Number} [timeout=5000]
   * @returns {Promise}
   */
  async function postWithTimeout(url, payload, timeout = 5000) {
    return fetchWithTimeout(url, timeout, {
      method: "POST",
      body: JSON.stringify(payload),
      //headers: {"Content-Type": "application/json"}
    });
  }

  // public API
  return {
    fetchWithTimeout,
    postWithTimeout
  }
})();