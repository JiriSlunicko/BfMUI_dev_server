window.pages.home = (function()
{
  let _userPreferences = {
    hideIntro: Boolean(localStorage.getItem("hideIntro")),
  }

  /**
   * On DOM load, hide the intro text if desired & allow the user to hide it.
   */
  function init() {
    if (_userPreferences.hideIntro) {
      utils.qs("#home-intro").style.display = "none";
    }

    utils.qs("#home-hide-intro-btn").addEventListener("click", () => {
      localStorage.setItem("hideIntro", "1");
      _userPreferences.hideIntro = true;
      utils.qs("#home-intro").style.display = "none";
      ui.makeToast("success", "The intro text won't show again unless you reset the app settings.", 3000);
    })
  }


  /** Load basic server info for the homepage. */
  function initSysInfo() {
    if (!backend.info) {
      console.error("Tried to initSysInfo without any server info!");
      return;
    }

    // new mechanism
    utils.qs("#home-sysinfo-inner > p")?.remove();
    const sysInfo = backend.info;
    for (let i = 0; i < sysInfo.length; i++) {
      const dataEntry = sysInfo[i];
      entries.reuseOrCreate("#home-sysinfo-inner", i, dataEntry.ComponentName, dataEntry.Properties);
    };
    entries.trimList("#home-sysinfo-inner", sysInfo.length);
  }

  
  // public API
  return {
    init,
    activate: ()=>{},
    deactivate: ()=>{},
    initSysInfo
  }
})();