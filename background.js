const BADGE_BACKGROUND_COLOR = "#008000";
const BADGE_TEXT_COLOR = "#FFFFFF";

// Deletes cookies for the given website
function deleteCookiesForWebsite(website) {
    chrome.cookies.getAll({ domain: website }, function(cookies) {
        for (let cookie of cookies) {
            let url = "http" + (cookie.secure ? "s" : "") + "://" + cookie.domain + cookie.path;
            chrome.cookies.remove({ url: url, name: cookie.name });
        }
    });
}

// Deletes browsing history for the given website
function deleteHistoryForWebsite(website) {
    chrome.history.search({ text: website }, function (results) {
        results.forEach((result) => {
            if (new URL(result.url).hostname === website) {
                chrome.history.deleteUrl({ url: result.url });
            }
        });
    });
}

// Sets the badge for the given tab
function setBadge(tab) {
    if (!tab.url || tab.url === 'chrome://newtab/') {
        return;
    }
    let website = new URL(tab.url).hostname;
    if (!website || website.startsWith("chrome://")) {
        chrome.action.setBadgeText({ text: "" });
        return;
    }
    chrome.storage.sync.get('siteSettings', function(data) {
        const allSiteSettings = data.siteSettings || {};
        const settings = allSiteSettings[website] || { history: false, cache: false, cookies: false };
        if (settings.history || settings.cache || settings.cookies) {
            chrome.action.setBadgeBackgroundColor({ color: BADGE_BACKGROUND_COLOR });
            chrome.action.setBadgeTextColor({ color: BADGE_TEXT_COLOR });
            chrome.action.setBadgeText({ text: "ON" });
        } else {
            chrome.action.setBadgeText({ text: "" });
        }
    });
}

// Handles the cleanup for a website
function handleCleanup(website, settings) {
    if (settings.history) {
        deleteHistoryForWebsite(website);
    }
    if (settings.cookies) {
        deleteCookiesForWebsite(website);
    }
    // Cache is handled in content.js
}

// Listener for tab updates
chrome.tabs.onUpdated.addListener(function (tabId, changeInfo, tab) {
    if (changeInfo.status === "complete") {
        setBadge(tab);
        if (tab.url) {
            let website = new URL(tab.url).hostname;
            chrome.storage.sync.get('siteSettings', function(data) {
                const allSiteSettings = data.siteSettings || {};
                const settings = allSiteSettings[website] || { history: false, cache: false, cookies: false };
                handleCleanup(website, settings);
            });
        }
    }
});

// Listener for tab activation
chrome.tabs.onActivated.addListener(function (activeInfo) {
    chrome.tabs.get(activeInfo.tabId, function (tab) {
        setBadge(tab);
    });
});

// Listener for messages from popup.js
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    if (request.action === 'updateSettings') {
        handleCleanup(request.hostname, request.settings);
        chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
            setBadge(tabs[0]);
        });
    }
});

// Listener for when a window is closed
chrome.windows.onRemoved.addListener(function (windowId) {
    chrome.tabs.query({}, function (tabs) {
        tabs.forEach(function (tab) {
            if (tab.url) {
                let website = new URL(tab.url).hostname;
                chrome.storage.sync.get('siteSettings', function(data) {
                    const allSiteSettings = data.siteSettings || {};
                    const settings = allSiteSettings[website] || { history: false, cache: false, cookies: false };
                    handleCleanup(website, settings);
                });
            }
        });
    });
});

// Listener for when the browser is about to close
chrome.runtime.onSuspend.addListener(function() {
    chrome.tabs.query({}, function(tabs) {
        tabs.forEach(function(tab) {
            if (tab.url) {
                let website = new URL(tab.url).hostname;
                chrome.storage.sync.get('siteSettings', function(data) {
                    const allSiteSettings = data.siteSettings || {};
                    const settings = allSiteSettings[website] || { history: false, cache: false, cookies: false };
                    handleCleanup(website, settings);
                });
            }
        });
    });
});