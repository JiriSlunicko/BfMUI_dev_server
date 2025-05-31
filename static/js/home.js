document.addEventListener("DOMContentLoaded", () => {
  if (g.userPreferences.hideIntro) {
    qs("#home-intro").style.display = "none";
  }

  qs("#home-hide-intro-btn").addEventListener("click", () => {
    localStorage.setItem("hideIntro", "1");
    g.userPreferences.hideIntro = true;
    qs("#home-intro").style.display = "none";
    makeToast("success", "The intro text won't show again unless you reset the app settings.", 3000);
  })
});


function initSysInfo() {
  if (!g.server.info) {
    console.error("Tried to initSysInfo with no g.server.info!");
    return;
  }

  qs("#home-sysinfo-inner").innerHTML = "";
  for (const entry of g.server.info) {
    createOrUpdateEntry("#home-sysinfo-inner", entry.ComponentName, entry.ComponentName, entry.Properties);
  }
}