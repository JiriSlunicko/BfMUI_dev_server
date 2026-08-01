window.pages.home = (function()
{
  let _userPreferences = {
    hideIntro: Boolean(localStorage.getItem("hideIntro")),
  }

  /** On DOM load:
   * - hide the intro text if desired & allow the user to hide it.
   * */
  function init() {
    if (_userPreferences.hideIntro) {
      utils.qs("#home-intro").style.display = "none";
    }

    utils.qs("#home-hide-intro-btn").addEventListener("click", () => {
      localStorage.setItem("hideIntro", "1");
      _userPreferences.hideIntro = true;
      utils.qs("#home-intro").style.display = "none";
      ui.makeToast(
        "success",
        "The intro text won't show again unless you reset the app settings.",
        3000
      );
    });
  }


  async function _get_BfMUI_version() {
    await ajax.fetchWithTimeout(
      "/v",
      {
        responseType: "text",
        successHandler: (resp) => {
          backend.bfmui = {Version: resp};
        },
        failureHandler: ajax.propagateRespError,
      }
    );

    return backend.bfmui?.Version ?? "error";
  }


  /** Load basic server info for the homepage. */
  async function initSysInfo() {
    if (!backend.bfcontrol) {
      console.error("Tried to initSysInfo without any server info!");
      return;
    }

    // Bloodfly MUI
    utils.qs("#home-sysinfo-inner > p")?.remove();
    await _get_BfMUI_version();
    entries.reuseOrCreate(
      "#home-sysinfo-inner", 0,
      "BfMUI",
      backend.bfmui
    );

    // Bloodfly Control
    const sysInfo = backend.bfcontrol;
    for (let i = 0; i < sysInfo.length; i++) {
      const dataEntry = sysInfo[i];
      entries.reuseOrCreate(
        "#home-sysinfo-inner", i+1,
        dataEntry.ComponentName,
        dataEntry.Properties
      );
    };
    entries.trimList("#home-sysinfo-inner", sysInfo.length+1);
  }


  /** Render the current status of the flight checklist, both on the home page
   * and in the status bar at the bottom of the screen.
   * 
   * @param {object} checklistData flat object, components -> "Ok" | "NotOk"
   */
  function updateChecklist(checklistData) {
    utils.qs("#home-checklist-inner > p")?.remove();
    entries.reuseOrCreate(
      "#home-checklist-inner", 0,
      "System status",
      checklistData
    );
    entries.trimList("#home-checklist-inner", 1);

    const notOkCount = _.countBy(Object.values(checklistData))["NotOk"] || 0;

    const statusBar = utils.qs("#status-can-fly");
    if (notOkCount > 0) {
      const notOkText = (
        notOkCount === 1
        ? `${notOkCount} system not ready`
        : `${notOkCount} systems not ready`
      );
      statusBar.innerText = notOkText;
      statusBar.classList.remove("all-ok");
      statusBar.classList.add("not-ok");
    } else {
      statusBar.innerText = "all systems ready";
      statusBar.classList.remove("not-ok");
      statusBar.classList.add("all-ok");
    }
  }

  
  // public API
  return {
    init,
    activate: ()=>{},
    deactivate: ()=>{},
    initSysInfo,
    updateChecklist,
  };
})();
