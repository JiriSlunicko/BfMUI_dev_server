/**
 * This module stores globals and implements navigation and global logic.
 * 
 * Each page needs to be registered under window.pages and implement the following
 * methods at least nominally:
 * - .init() runs once when the app loads
 * - .activate() runs when the page is navigated to
 * - .deactivate() runs when the page is navigated away from
 */
window.pages = {};


// global state variables and data storage
window.backend =
{
  baseurl: localStorage.getItem("serverBaseurl") || "http://localhost:8080",
  info: null,
  usingArduino: null,
  endpoints: {
    events: "/events/",
    configListGet: "/config/list/",
    configLoadPost: "/config/load/",
    configSavePost: "/config/save/",
    controlsGet: "/settings/control/",
    controlsPost: "/settings/control/",
    maxSurfaceAnglesGet: "/settings/maxsurfaceangles/",
    maxSurfaceAnglesPost: "/settings/maxsurfaceangles/",
    radioGet: "/settings/radio/",
    radioPost: "/settings/radio/",
    serialPortGet: "/settings/serialport/",
    serialPortPost: "/settings/serialport/",
    systemInfo: "/systeminfo/",
    telemetry: "/telemetry/",
    trimGet: "/settings/trim/",
    trimPost: "/settings/trim/",
  },
}


// module for navigating between pages etc
window.nav = (function()
{
  let _currentPage = localStorage.getItem("activeTab") || "home";

  /** Add navigation listeners & load the initial page. */
  function init() {
    utils.qs("header nav").addEventListener("click", function(e) {
      const btn = e.target.closest("button");
      if (!btn) return;

      if (btn.id === "reload-app") {
        nav.reloadApp();
      } else {
        const targetPage = btn.id.replace("goto-", "");
        nav.gotoPage(targetPage);
      }
    });

    nav.gotoPage(_currentPage);

    window.addEventListener("pagehide", () => events.closeStream());
    window.addEventListener("beforeunload", () => events.closeStream());
  }


  /** Reload the whole thing if the user consents. */
  async function reloadApp() {
    const consent = await ui.makePopup("confirm", "Reload the app?");
    if (consent) {
      events.closeStream();
      location.reload();
    }
  }


  /** Navigate to the desired page.
   * @param {string} targetPage "home", "status" etc.
   */
  function gotoPage(targetPage) {
    const targetContainerId = "view-"+targetPage;
    if (!utils.qs("#"+targetContainerId)) return;

    _currentPage = targetPage;

    // nav menu
    localStorage.setItem("activeTab", targetPage);
    utils.qsa("header nav button").forEach(el => {
      el.classList.remove("active");
      if (el.id === "goto-"+targetPage) {
        el.classList.add("active");
      }
    });

    // content
    utils.qsa(".main-content .view-tab").forEach(el => {
      el.style.display = el.id === targetContainerId ? "" : "none";
    });

    // page-specific logic
    for (const pageName of Object.keys(pages)) {
      if (pageName === targetPage) {
        pages[pageName].activate();
      } else {
        pages[pageName].deactivate();
      }
    }
  }

  
  // public API
  return {
    getCurrentPage: () => _currentPage,
    init,
    reloadApp,
    gotoPage
  }
})();


// this should be the ONLY DOMContentLoaded listener in the app
document.addEventListener("DOMContentLoaded", () => {
  // init UI
  ui.initToastContainer();
  ui.initRangeTextPairLinks();
  
  // init all page modules
  for (const pageName of Object.keys(pages)) {
    pages[pageName].init();
  }

  // init navigation
  nav.init();

  // init settings manager
  settingsManager.init();
});