let isExtensionOn = false;
let enabledWebsites = [];

function setExtensionStatus(status) {
  isExtensionOn = status;
  chrome.action.setIcon({ path: isExtensionOn ? "img/icon_16.png" : "img/icon_16_disabled.png" });
  chrome.action.setBadgeText({ text: isExtensionOn ? "ON" : "" });
  saveToStorage();
}

function toggleWebsite(website) {
  if (enabledWebsites.includes(website)) {
    enabledWebsites = enabledWebsites.filter((item) => item !== website);
  } else {
    enabledWebsites.push(website);
  }
  saveToStorage();
}

function updateExtensionStatus(tab) {
  let website = new URL(tab.url).hostname;
  let isEnabled = enabledWebsites.includes(website);
  if (isEnabled) {
    setExtensionStatus(true);
  } else {
    setExtensionStatus(false);
  }
}

function saveToStorage() {
  chrome.storage.sync.set({ isExtensionOn: isExtensionOn, enabledWebsites: enabledWebsites });
}

function deleteHistoryForEnabledWebsites() {
  chrome.history.search({text: '', maxResults: 0}, function(results) {
    for (let i = 0; i < results.length; i++) {
      let website = new URL(results[i].url).hostname;
      if (enabledWebsites.includes(website)) {
        chrome.history.deleteUrl({url: results[i].url});
      }
    }
  });
}

chrome.action.onClicked.addListener(function (tab) {
  toggleWebsite(new URL(tab.url).hostname);
  updateExtensionStatus(tab);
});

chrome.tabs.onActivated.addListener(function(activeInfo) {
  chrome.tabs.get(activeInfo.tabId, function(tab) {
    updateExtensionStatus(tab);
  });
});

chrome.tabs.onUpdated.addListener(function (tabId, changeInfo, tab) {
  updateExtensionStatus(tab);
});

chrome.windows.onRemoved.addListener(function (windowId) {
  if (isExtensionOn) {
    deleteHistoryForEnabledWebsites();
    chrome.storage.sync.set({ enabledWebsites: enabledWebsites });
  }
});

chrome.tabs.onRemoved.addListener(function (tabId, removeInfo) {
  if (isExtensionOn) {
    chrome.tabs.get(tabId, function(tab) {
      let website = new URL(tab.url).hostname;
      if (enabledWebsites.includes(website)) {
        deleteHistoryForEnabledWebsites();
      }
    });
  }
});

chrome.tabs.onUpdated.addListener(function (tabId, changeInfo, tab) {
  if (isExtensionOn && changeInfo.url) {
    let website = new URL(changeInfo.url).hostname;
    if (enabledWebsites.includes(website)) {
      deleteHistoryForEnabledWebsites();
    }
  }
});

chrome.runtime.onSuspend.addListener(function() {
  if (isExtensionOn) {
    deleteHistoryForEnabledWebsites();
    chrome.storage.sync.set({ enabledWebsites: enabledWebsites });
  }
});

chrome.storage.sync.get(["isExtensionOn", "enabledWebsites"], function (result) {
  if (result.isExtensionOn != undefined) {
    isExtensionOn = result.isExtensionOn;
    chrome.action.setIcon({ path: isExtensionOn ? "img/icon_16.png" : "img/icon_16_disabled.png" });
    chrome.action.setBadgeText({ text: isExtensionOn ? "ON" : "" });
  }
  if (result.enabledWebsites != undefined) {
    enabledWebsites = result.enabledWebsites;
  }
});
