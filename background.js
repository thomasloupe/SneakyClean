const BADGE_BACKGROUND_COLOR = "#008000";
const BADGE_TEXT_COLOR = "#FFFFFF";

// Store tab URLs to track navigation
let tabUrls = new Map();

// Deletes cookies for the given website
function deleteCookiesForWebsite(website) {
    chrome.cookies.getAll({ domain: website }, function(cookies) {
        for (let cookie of cookies) {
            let url = "http" + (cookie.secure ? "s" : "") + "://" + cookie.domain + cookie.path;
            chrome.cookies.remove({ url: url, name: cookie.name });
        }
    });

    // Also clear cookies for subdomains
    chrome.cookies.getAll({ domain: '.' + website }, function(cookies) {
        for (let cookie of cookies) {
            let url = "http" + (cookie.secure ? "s" : "") + "://" + cookie.domain + cookie.path;
            chrome.cookies.remove({ url: url, name: cookie.name });
        }
    });
}

// Deletes browsing history for the given website
function deleteHistoryForWebsite(website) {
    chrome.history.search({ text: website, maxResults: 1000 }, function (results) {
        results.forEach((result) => {
            if (new URL(result.url).hostname === website) {
                chrome.history.deleteUrl({ url: result.url });
            }
        });
    });

    // Also search for the domain without subdomain
    const baseDomain = website.replace(/^www\./, '');
    if (baseDomain !== website) {
        chrome.history.search({ text: baseDomain, maxResults: 1000 }, function (results) {
            results.forEach((result) => {
                const resultHostname = new URL(result.url).hostname;
                if (resultHostname === website || resultHostname === baseDomain) {
                    chrome.history.deleteUrl({ url: result.url });
                }
            });
        });
    }
}

// Deletes cache for the given website
function deleteCacheForWebsite(website) {
    // Clear cache for the specific origin
    const origins = [
        `https://${website}`,
        `http://${website}`
    ];

    // Also include www variant if not already present
    if (!website.startsWith('www.')) {
        origins.push(`https://www.${website}`);
        origins.push(`http://www.${website}`);
    }

    origins.forEach(origin => {
        chrome.browsingData.removeCache({
            origins: [origin]
        }, function() {
            if (chrome.runtime.lastError) {
                console.log('Cache clearing error:', chrome.runtime.lastError);
            }
        });
    });
}

// Sets the badge for the given tab
function setBadge(tab) {
    if (!tab.url || tab.url === 'chrome://newtab/' || tab.url.startsWith('chrome://')) {
        chrome.action.setBadgeText({ text: "" });
        return;
    }

    let website = new URL(tab.url).hostname;
    if (!website) {
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
    if (settings.cache) {
        deleteCacheForWebsite(website);
    }
}

// Check if any settings are enabled for the website
function hasEnabledSettings(website, callback) {
    chrome.storage.sync.get('siteSettings', function(data) {
        const allSiteSettings = data.siteSettings || {};
        const settings = allSiteSettings[website] || { history: false, cache: false, cookies: false };
        const hasEnabled = settings.history || settings.cache || settings.cookies;
        callback(hasEnabled, settings);
    });
}

// Listener for tab updates (includes page navigation and refresh)
chrome.tabs.onUpdated.addListener(function (tabId, changeInfo, tab) {
    if (changeInfo.status === "loading" && changeInfo.url) {
        // Page is starting to load - this catches navigation and refresh
        const newWebsite = new URL(changeInfo.url).hostname;
        const oldUrl = tabUrls.get(tabId);

        if (oldUrl && oldUrl !== changeInfo.url) {
            // Navigation detected - clean up the old website
            const oldWebsite = new URL(oldUrl).hostname;
            hasEnabledSettings(oldWebsite, function(hasEnabled, settings) {
                if (hasEnabled) {
                    handleCleanup(oldWebsite, settings);
                }
            });
        }

        // Update stored URL
        tabUrls.set(tabId, changeInfo.url);
    }

    if (changeInfo.status === "complete") {
        setBadge(tab);
    }
});

// Listener for tab closure
chrome.tabs.onRemoved.addListener(function (tabId, removeInfo) {
    const url = tabUrls.get(tabId);
    if (url) {
        const website = new URL(url).hostname;
        hasEnabledSettings(website, function(hasEnabled, settings) {
            if (hasEnabled) {
                handleCleanup(website, settings);
            }
        });
        tabUrls.delete(tabId);
    }
});

// Listener for tab activation
chrome.tabs.onActivated.addListener(function (activeInfo) {
    chrome.tabs.get(activeInfo.tabId, function (tab) {
        setBadge(tab);
        // Store the URL for tracking
        if (tab.url) {
            tabUrls.set(activeInfo.tabId, tab.url);
        }
    });
});

// Listener for messages from popup.js
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    if (request.action === 'updateSettings') {
        // Immediately clean up when settings are changed and enabled
        const hasEnabled = request.settings.history || request.settings.cache || request.settings.cookies;
        if (hasEnabled) {
            handleCleanup(request.hostname, request.settings);
        }

        chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
            setBadge(tabs[0]);
        });
    }
});

// Listener for when a window is closed
chrome.windows.onRemoved.addListener(function (windowId) {
    chrome.tabs.query({windowId: windowId}, function (tabs) {
        tabs.forEach(function (tab) {
            if (tab.url) {
                const website = new URL(tab.url).hostname;
                hasEnabledSettings(website, function(hasEnabled, settings) {
                    if (hasEnabled) {
                        handleCleanup(website, settings);
                    }
                });
                tabUrls.delete(tab.id);
            }
        });
    });
});

// Listener for when the browser is about to close
chrome.runtime.onSuspend.addListener(function() {
    chrome.tabs.query({}, function(tabs) {
        tabs.forEach(function(tab) {
            if (tab.url) {
                const website = new URL(tab.url).hostname;
                hasEnabledSettings(website, function(hasEnabled, settings) {
                    if (hasEnabled) {
                        handleCleanup(website, settings);
                    }
                });
            }
        });
    });

    // Clear the URL tracking map
    tabUrls.clear();
});

// Initialize tab URL tracking for existing tabs when extension starts
chrome.tabs.query({}, function(tabs) {
    tabs.forEach(function(tab) {
        if (tab.url) {
            tabUrls.set(tab.id, tab.url);
        }
    });
});