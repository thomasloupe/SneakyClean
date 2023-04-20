let enabledWebsites = [];

function setBadge(tab) {
  let website = new URL(tab.url).hostname;
  if (!website || website.startsWith("chrome://")) {
    chrome.action.setBadgeText({ text: "" });
    return;
  }
  if (enabledWebsites.includes(website)) {
    chrome.action.setBadgeBackgroundColor({ color: "#008000" });
    chrome.action.setBadgeTextColor({ color: "#FFFFFF" });
    chrome.action.setBadgeText({ text: "ON" });
  } else {
    chrome.action.setBadgeText({ text: "" });
  }
}

function toggleWebsite(website) {
  if (!website || website.startsWith("chrome://")) {
    return;
  }
  if (enabledWebsites.includes(website)) {
    enabledWebsites = enabledWebsites.filter((item) => item !== website);
  } else {
    enabledWebsites.push(website);
  }
  saveToStorage();
}

function saveToStorage() {
  chrome.storage.sync.set({ enabledWebsites: enabledWebsites });
}

function deleteHistoryForWebsite(website) {
  chrome.history.search({ text: website }, function (results) {
    results.forEach((result) => {
      if (new URL(result.url).hostname === website) {
        chrome.history.deleteUrl({ url: result.url });
        chrome.browsingData.removeCache({ originTypes: { unprotectedWeb: true }, hostnames: [website] });
      }
    });
  });

  chrome.sessions.getRecentlyClosed(function (sessions) {
    if (sessions && sessions.length > 0) {
      sessions.forEach(function (session) {
        if (session.tab && session.tab.url && new URL(session.tab.url).hostname === website) {
          chrome.sessions.forgetClosedTab(session.windowId, session.tab.windowId, session.tab.sessionId);
        }
      });
    }
  });

  chrome.omnibox.deleteSuggestResults(website);
}

chrome.action.onClicked.addListener(function (tab) {
  let website = new URL(tab.url).hostname;
  if (!website || website.startsWith("chrome://")) {
    return;
  }
  toggleWebsite(website);
  setBadge(tab);
});

function handleNavigationChange(tabId, website) {
  if (enabledWebsites.includes(website)) {
    deleteHistoryForWebsite(website);
    setBadge({ id: tabId, url: 'http://' + website }); // Set badge for the new website
  }
}

let tabUrls = {};

chrome.tabs.onActivated.addListener(function (activeInfo) {
  chrome.tabs.get(activeInfo.tabId, function (tab) {
    let website = new URL(tab.url).hostname;
    setBadge(tab);
    tabUrls[tab.id] = tab.url;
    if (enabledWebsites.includes(website)) {
      deleteHistoryForWebsite(website);
    }
  });
});

chrome.tabs.onUpdated.addListener(function (tabId, changeInfo, tab) {
  if (changeInfo.url) {
    let oldWebsite = new URL(tabUrls[tabId]).hostname;
    tabUrls[tabId] = changeInfo.url;
    let newWebsite = new URL(changeInfo.url).hostname;
    handleNavigationChange(tabId, oldWebsite);
  }
  if (changeInfo.status === "complete") {
    setBadge(tab);
    let website = new URL(tab.url).hostname;
    if (enabledWebsites.includes(website)) {
      deleteHistoryForWebsite(website);
    }
  }
});

function handleTabClose(website) {
  if (enabledWebsites.includes(website)) {
    deleteHistoryForWebsite(website);
  }
}

chrome.tabs.onRemoved.addListener(function (tabId, removeInfo) {
  if (tabUrls[tabId]) {
    let website = new URL(tabUrls[tabId]).hostname;
    handleTabClose(website);
    delete tabUrls[tabId];
  }
});

chrome.windows.onRemoved.addListener(function (windowId) {
  chrome.windows.getAll({populate: true}, function (windows) {
    if (windows.length === 0) { // No more windows left
      chrome.tabs.query({}, function (tabs) {
        tabs.forEach(function (tab) {
          let website = new URL(tab.url).hostname;
          handleTabClose(website);
        });
        chrome.storage.sync.set({ enabledWebsites: enabledWebsites });
      });
    }
  });
});

chrome.storage.sync.get(["enabledWebsites"], function (result) {
  if (result.enabledWebsites != undefined) {
    enabledWebsites = result.enabledWebsites;
  }
});

chrome.runtime.onSuspend.addListener(function() {
  chrome.tabs.query({}, function(tabs) {
    tabs.forEach(function(tab) {
      let website = new URL(tab.url).hostname;
      handleTabClose(website);
    });
    chrome.storage.sync.set({ enabledWebsites: enabledWebsites });
  });
});

chrome.runtime.onStartup.addListener(function () {
  chrome.tabs.query({}, function (tabs) {
    tabs.forEach(function (tab) {
      let website = new URL(tab.url).hostname;
      if (enabledWebsites.includes(website)) {
        deleteHistoryForWebsite(website);
      }
    });
  });
});

chrome.runtime.onInstalled.addListener(function() {
  chrome.storage.sync.get(["enabledWebsites"], function (result) {
    if (result.enabledWebsites != undefined) {
      enabledWebsites = result.enabledWebsites;
    }
  });
});

chrome.runtime.onInstalled.addListener(function(details) {
  if (details.reason === 'install') {
    // Extension was just installed
    alert('Thanks for installing SneakyClean!\nIf you really enjoy the extension, you can donate at https://paypal.me/thomasloupe.');
  } else if (details.reason === 'update') {
    // Extension was just updated
    var currentVersion = chrome.runtime.getManifest().version;
    var prevVersion = details.previousVersion;
    var message = 'SneakyClean has been updated from ' + prevVersion + ' to ' + currentVersion + '.\n\n';
    message += 'Here are the changes:\n\n';
    message += 'Now also removes cache.\n';
    message += 'Now also removes history from recently visited tab.\n';
    message += 'Now removes websites from omnibox search.\n';
    alert(message);
  }
});
