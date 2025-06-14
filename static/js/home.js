window.pages.home = (function()
{
  /**
   * On DOM load, hide the intro text if desired & allow the user to hide it.
   */
  function init() {
    if (globals.userPreferences.hideIntro) {
      utils.qs("#home-intro").style.display = "none";
    }

    utils.qs("#home-hide-intro-btn").addEventListener("click", () => {
      localStorage.setItem("hideIntro", "1");
      globals.userPreferences.hideIntro = true;
      utils.qs("#home-intro").style.display = "none";
      ui.makeToast("success", "The intro text won't show again unless you reset the app settings.", 3000);
    })
  }


  /** Load basic server info for the homepage. */
  function initSysInfo() {
    if (!globals.server.info) {
      console.error("Tried to initSysInfo without any server info!");
      return;
    }

    utils.qs("#home-sysinfo-inner").innerHTML = "";
    for (const entry of globals.server.info) {
      entries.createOrUpdate(
        "#home-sysinfo-inner",
        entry.ComponentName,
        entry.ComponentName,
        entry.Properties
      );
    }
  }

  
  // public API
  return {
    init,
    activate: ()=>{},
    deactivate: ()=>{},
    initSysInfo
  }
})();