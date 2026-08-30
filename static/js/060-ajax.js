/** General AJAX / fetch convenience wrappers. */

window.ajax = (function()
{
  const _m = "ajax";

  /**
   * @typedef {object} AjaxConfig Defines parameters for a fetchWithTimeout.
   * @property {number} [timeout] ms before the request is aborted, def 5000
   * @property {object} [options] passed to the fetch API directly, def {}
   * @property {function} [successHandler] called with the parsed response
   *  on success (request succeeds, is OK and parses fine), def N/A
   * @property {function} [failureHandler] called with the raw response
   *  and the error on any type of failure, def N/A
   * @property {boolean} [emitErrorToasts] whether the function should
   *  handle spawning error toasts, def false
   * @property {"json"|"text"} [responseType] how to process the response,
   *  def "json"
   * @property {boolean} [notOkMeansError] whether non-2xx status codes
   *  should qualify as errors, def true
   */

  
  /** Attempt an AJAX request, failing after a specified timeout.
   * 
   * @param {string} url
   * @param {AjaxConfig} config
   * @returns {Promise<boolean>}
   */
  async function fetchWithTimeout(url, config) {
    const abCtl = new AbortController();
    const signal = abCtl.signal;

    const abortTimeoutId = setTimeout(() => abCtl.abort(), config.timeout ?? 5000);

    let rawResp;
    try {
      // get a Response
      rawResp = await fetch(url, {...config.options, signal});
      clearTimeout(abortTimeoutId);
    } catch (err) {
      // connection errors
      clearTimeout(abortTimeoutId);
      logger.error(_m, config.options?.method ?? "GET", url, err);
      config.failureHandler?.(rawResp, err);
      if (config.emitErrorToasts) {
        ui.makeToast(
          "error",
          `${config.options?.method ?? "GET"} ${url} failed (connection error):\n\n`
          + (err.name === "AbortError"
              ? `Request timed out after ${config.timeout ?? 5000} ms`
              : err.toString()
          ),
          5000
        );
      }
      return false;
    }

    if (rawResp) {
      let parsed;
      let is512 = false;
      try {
        // promote non-2xx statuses to errors if we should
        notOkMeansError = config.notOkMeansError ?? true;
        is512 = rawResp.status === 512;
        if (!rawResp.ok && notOkMeansError) {
          throw new Error(`HTTP ${rawResp.status}`);
        }
        // attempt to parse as the requested data type
        switch (config.responseType ?? "json") {
          case "json":
            parsed = await rawResp.json();
            break;
          case "text":
            parsed = await rawResp.text();
            break;
          default:
            throw new Error(`Unexpected response type "${config.responseType}"`);
        }
      } catch (err) {
        // response status code & parse errors
        if (!is512) logger.error(_m, config.options?.method ?? "GET", url, err);
        config.failureHandler?.(rawResp, err);
        if (!is512 && config.emitErrorToasts) {
          ui.makeToast(
            "error",
            `${config.options?.method ?? "GET"} ${url} failed (bad response):\n\n${err.toString()}`,
            5000
          );
        }
        return false;
      }

      // wrap this up
      config.successHandler?.(parsed);
      return true;
    }
  }


  /** Provides a reasonable default for JSON ajax request errors.
   * 
   * @param {Response} rawResp
   * @param {Error} error
   */
  async function handleJsonAjaxFail(rawResp, error) {
    if (!rawResp) {
      ui.makeToast(
        "error",
        `AJAX fail - no response exists\n\n${error.toString()}`,
      );
      return;
    }
    try {
      const jsonResp = await rawResp.json();
      ui.makeToast(
        "error",
        `AJAX fail for ${rawResp.url}:\n\n${jsonResp.error ?? error.toString()}`,
        5000
      );
    } catch (jsonParseError) {
      ui.makeToast(
        "error",
        `AJAX fail for ${rawResp.url}:\n\n${error.toString()}`,
        5000
      );
    }
  }


  /** Simply re-throws any error it receives. Use as shorthand for making
   * AJAX errors the caller's problem.
   * 
   * @param {Response} rawResp
   * @param {Error} error
   */
  function propagateRespError(rawResp, error) {
    throw error;
  }

  
  // public API
  return {
    fetchWithTimeout,
    handleJsonAjaxFail,
    propagateRespError,
  };
})();
