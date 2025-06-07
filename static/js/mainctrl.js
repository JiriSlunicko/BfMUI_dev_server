// convenience aliases
const qs = sel => document.querySelector(sel);
const qsa = sel => document.querySelectorAll(sel);

// global state
const g = {
  currentPage: localStorage.getItem("activeTab") || "home",
  server: {
    baseurl: localStorage.getItem("serverBaseurl") || "http://localhost:8080",
    pollDelay: Number(localStorage.getItem("pollDelay")) || 1000,
    info: null,
    usingArduino: null,
  },
  polling: {
    interval: null,
    active: false,
  },
  data: {
    serialTimers: Array(25).fill([]),
    controllers: {},
  },
  controls: {
    buttons: [],
    inAxes: [],
    actions: [],
    outAxes: [],
    restrictions: {},
    actionMappings: {},
    axisMappings: {},
  },
  arduinoConfig: {
    port: null,
    baudRate: null,
    availablePorts: [],
  },
  util: {
    toastFadeTimeout: null,
    toastDieTimeout: null,
  },
  userPreferences: {
    hideIntro: Boolean(localStorage.getItem("hideIntro")),
  },
}

// initialise navigation
document.addEventListener("DOMContentLoaded", () => {
  qs("header nav").addEventListener("click", function (e) {
    const btn = e.target.closest("button");
    if (!btn) return;

    if (btn.id === "reload-app") {
      reloadApp();
    } else {
      const targetPage = btn.id.replace("goto-", "");
      loadPage(targetPage);
    }
  });

  loadPage(g.currentPage);
});


async function reloadApp() {
  const consent = await makePopup("confirm", "Reload the app?");
  if (consent) {
    location.reload();
  }
}


/**
 * Navigate to the desired page.
 * @param {string} targetPage 'home', 'status' etc.
 */
function loadPage(targetPage) {
  const targetContainerId = "view-"+targetPage;
  if (!qs("#"+targetContainerId)) return;

  g.currentPage = targetPage;

  // nav menu
  localStorage.setItem("activeTab", targetPage);
  qsa("header nav button").forEach(el => {
    el.classList.remove("active");
    if (el.id === "goto-"+targetPage) {
      el.classList.add("active");
    }
  });

  // content
  qsa(".main-content .view-tab").forEach(el => {
    el.style.display = el.id === targetContainerId ? "" : "none";
  });

  // finer logic
  switch (targetPage) {
    case "status":
      renderTelemetry();
      renderControllers();
      break;
    case "controls":
      if (!g.controls.actions.length && g.server.info) {
        renderControlsInterface();
      }
      break;
  }
}