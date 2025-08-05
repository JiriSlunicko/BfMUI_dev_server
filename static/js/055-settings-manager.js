/**
 * This module handles different configuration domains in the ecosystem.
 * 
 * Each configuration domain needs to be registered under window.settings
 * and implement the following methods:
 * - async .init() runs once when the app loads, does not load data yet
 * - async .load() should refresh data from the server and update the UI
 * - async .save() should push app data to the server
 * - .hasPendingChanges() should synchronously report whether the current
 *    app state differs from the last known server-side state
 * 
 * All of these methods must take no parameters and return boolean,
 * or Promise<boolean> for the async ones.
 * 
 * All UI management and AJAX logic is owned by the configuration domains.
 */
window.settings = {};


/** Thrown if an interface fails to implement the required methods. */
class InvalidDomainInterfaceError extends Error {
  constructor(domainName, domainContent) {
    super(`Invalid configuration domain interface '${domainName}'`);
    this.name = "InvalidDomainInterfaceError";
    this.domainName = domainName;
    this.domainContent = domainContent;
  }
}


window.settingsManager = (function()
{
  let _validated = null;

  /** Ask the specified domains to run their app load setup.
   * Also checks that all registered domains implement the required interface.
   * @param {string[]|null} [configDomains=null] null = all
   * @returns {Promise<object>|null} dictionary of domain->success, or null if validation fails
   */
  async function init(configDomains = null) {
    try {
      _validateDomains();
      _validated = true;
    } catch (err) {
      _validated = false;
      console.error(`Config domain interface validation failed for '${err?.domainName}'.`,
        err?.domainContent);
      ui.makeToast("error", "CRITICAL ERROR:\n\nConfiguration domain interface validation failed.");
      return null;
    }
    return _batchDelegate(async (domainObj) => domainObj.init(), configDomains);
  }

  /** Ask the specified domains to load data from the server.
   * @param {string[]|null} [configDomains=null] null = all
   * @returns {Promise<object>} dictionary of domain->success
   */
  async function load(configDomains = null) {
    return _batchDelegate(async (domainObj) => domainObj.load(), configDomains);
  }

  /** Ask the specified domains to push data to the server.
   * @param {string[]|null} [configDomains=null] null = all
   * @returns {Promise<object>} dictionary of domain->success
   */
  async function save(configDomains = null) {
    return _batchDelegate(async (domainObj) => domainObj.save(), configDomains);
  }

  /** Ask whether any of the specified domains have pending changes.
   * @param {string[]|null} [configDomains=null] null = all
   * @returns {boolean}
   */
  function pendingChangesExist(configDomains = null) {
    if (!configDomains) configDomains = Object.keys(settings);

    for (const configDomain of configDomains)
      if (settings?.[configDomain].hasPendingChanges() === true)
        return true;

    return false;
  }


  /** Call asyncCallback on each specified domain.
   * @param {async function} asyncCallback takes the domain object as an argument
   * @param {string[]|null} domains null = all
   * @returns {Promise<object>} dictionary of domain->success
   */
  async function _batchDelegate(asyncCallback, domains = null) {
    if (!domains) domains = Object.keys(settings);

    const response = {};

    for (const domain of domains) {
      if (!_validated) {
        response[domain] = false;
      }

      const domainObj = settings?.[domain];

      if (domainObj) {
        const success = await asyncCallback(domainObj);
        response[domain] = success;
      } else {
        response[domain] = false;
      }
    }

    return response;
  }


  /** Check if all registered configuration domains have the required interface.
   * @throws {InvalidDomainInterfaceError} if an interface fails
   */
  function _validateDomains() {
    for (const [name, domain] of Object.entries(settings)) {
      if (
        !domain ||
        typeof domain.init !== "function" ||
        typeof domain.load !== "function" ||
        typeof domain.save !== "function" ||
        typeof domain.hasPendingChanges !== "function"
      ) {
        throw new InvalidDomainInterfaceError(name, domain);
      }
    }
  }


  // public API
  return {
    init,
    load,
    save,
    pendingChangesExist
  }
})();