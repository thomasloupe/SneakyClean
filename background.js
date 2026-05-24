const BADGE_BACKGROUND_COLOR = "#008000";
const BADGE_TEXT_COLOR = "#FFFFFF";
const DEFAULT_SETTINGS = { history: false, cache: false, cookies: false };

function safeGetHostname(url) {
    if (!url) return null;
    try {
        return new URL(url).hostname;
    } catch (e) {
        return null;
    }
}

function checkLastError(context) {
    if (chrome.runtime.lastError) {
        console.debug(`SneakyClean [${context}]:`, chrome.runtime.lastError.message);
        return true;
    }
    return false;
}

async function getTabUrls() {
    try {
        const result = await chrome.storage.session.get('tabUrls');
        return new Map(Object.entries(result.tabUrls || {}));
    } catch (e) {
        return new Map();
    }
}

async function setTabUrl(tabId, url) {
    try {
        const tabUrls = await getTabUrls();
        tabUrls.set(String(tabId), url);
        await chrome.storage.session.set({ tabUrls: Object.fromEntries(tabUrls) });
    } catch (e) {
        console.debug('SneakyClean: Could not persist tab URL:', e.message);
    }
}

async function getTabUrl(tabId) {
    const tabUrls = await getTabUrls();
    return tabUrls.get(String(tabId));
}

async function deleteTabUrl(tabId) {
    try {
        const tabUrls = await getTabUrls();
        tabUrls.delete(String(tabId));
        await chrome.storage.session.set({ tabUrls: Object.fromEntries(tabUrls) });
    } catch (e) {
        console.debug('SneakyClean: Could not delete tab URL:', e.message);
    }
}

function deleteCookiesForWebsite(website) {
    // chrome.cookies.getAll({ domain }) returns cookies for the domain and its subdomains.
    chrome.cookies.getAll({ domain: website }, function(cookies) {
        if (checkLastError('cookies.getAll')) return;
        if (!cookies) return;

        for (const cookie of cookies) {
            const host = cookie.domain.replace(/^\./, '');
            const url = `http${cookie.secure ? 's' : ''}://${host}${cookie.path}`;
            chrome.cookies.remove({ url: url, name: cookie.name, storeId: cookie.storeId }, function() {
                checkLastError('cookies.remove');
            });
        }
    });
}

function hostnameMatches(hostname, target) {
    if (!hostname || !target) return false;
    if (hostname === target) return true;

    const cleanHostname = hostname.replace(/^www\./, '');
    const cleanTarget = target.replace(/^www\./, '');

    if (cleanHostname === cleanTarget) return true;
    if (cleanHostname.endsWith('.' + cleanTarget)) return true;

    return false;
}

function deleteHistoryForWebsite(website) {
    const baseDomain = website.replace(/^www\./, '');
    const queries = new Set([website, baseDomain]);
    if (!website.startsWith('www.')) {
        queries.add('www.' + website);
    }

    queries.forEach(query => searchAndDelete(query, website));
}

function searchAndDelete(query, website) {
    chrome.history.search({ text: query, maxResults: 10000, startTime: 0 }, function(results) {
        if (checkLastError('history.search')) return;
        if (!results || results.length === 0) return;

        let matched = 0;
        results.forEach(result => {
            const hostname = safeGetHostname(result.url);
            if (hostnameMatches(hostname, website)) {
                matched++;
                chrome.history.deleteUrl({ url: result.url }, function() {
                    checkLastError('history.deleteUrl');
                });
            }
        });

        // If the result set was capped and we deleted some, run again to drain the rest.
        if (results.length === 10000 && matched > 0) {
            searchAndDelete(query, website);
        }
    });
}

function deleteCacheForWebsite(website) {
    const origins = [
        `https://${website}`,
        `http://${website}`
    ];

    if (!website.startsWith('www.')) {
        origins.push(`https://www.${website}`);
        origins.push(`http://www.${website}`);
    }

    origins.forEach(origin => {
        chrome.browsingData.removeCache({
            origins: [origin]
        }, function() {
            checkLastError('browsingData.removeCache');
        });
    });
}

function setBadge(tab) {
    if (!tab || !tab.url) {
        chrome.action.setBadgeText({ text: "" });
        return;
    }

    try {
        const url = new URL(tab.url);
        if (url.protocol === 'chrome:' || url.protocol === 'chrome-extension:' ||
            url.protocol === 'about:' || url.protocol === 'edge:') {
            chrome.action.setBadgeText({ text: "" });
            return;
        }
    } catch (e) {
        chrome.action.setBadgeText({ text: "" });
        return;
    }

    const website = safeGetHostname(tab.url);
    if (!website) {
        chrome.action.setBadgeText({ text: "" });
        return;
    }

    chrome.storage.sync.get('siteSettings', function(data) {
        if (checkLastError('storage.sync.get')) return;

        const allSiteSettings = data.siteSettings || {};
        const settings = allSiteSettings[website] || DEFAULT_SETTINGS;
        if (settings.history || settings.cache || settings.cookies) {
            chrome.action.setBadgeBackgroundColor({ color: BADGE_BACKGROUND_COLOR });
            if (chrome.action.setBadgeTextColor) {
                chrome.action.setBadgeTextColor({ color: BADGE_TEXT_COLOR });
            }
            chrome.action.setBadgeText({ text: "ON" });
        } else {
            chrome.action.setBadgeText({ text: "" });
        }
    });
}

function handleCleanup(website, settings) {
    if (!website || !settings) return;

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

function hasEnabledSettings(website, callback) {
    if (!website) {
        callback(false, null);
        return;
    }

    chrome.storage.sync.get('siteSettings', function(data) {
        if (checkLastError('storage.sync.get hasEnabledSettings')) {
            callback(false, null);
            return;
        }

        const allSiteSettings = data.siteSettings || {};
        const settings = allSiteSettings[website] || DEFAULT_SETTINGS;
        const hasEnabled = settings.history || settings.cache || settings.cookies;
        callback(hasEnabled, settings);
    });
}

chrome.tabs.onUpdated.addListener(async function(tabId, changeInfo, tab) {
    if (changeInfo.status === "loading" && changeInfo.url) {
        const oldUrl = await getTabUrl(tabId);

        if (oldUrl && oldUrl !== changeInfo.url) {
            const oldWebsite = safeGetHostname(oldUrl);
            if (oldWebsite) {
                hasEnabledSettings(oldWebsite, function(hasEnabled, settings) {
                    if (hasEnabled) {
                        handleCleanup(oldWebsite, settings);
                    }
                });
            }
        }

        await setTabUrl(tabId, changeInfo.url);
    }

    if (changeInfo.status === "complete") {
        setBadge(tab);
    }
});

chrome.tabs.onRemoved.addListener(async function(tabId) {
    const url = await getTabUrl(tabId);
    if (url) {
        const website = safeGetHostname(url);
        if (website) {
            hasEnabledSettings(website, function(hasEnabled, settings) {
                if (hasEnabled) {
                    handleCleanup(website, settings);
                }
            });
        }
        await deleteTabUrl(tabId);
    }
});

chrome.tabs.onActivated.addListener(function(activeInfo) {
    chrome.tabs.get(activeInfo.tabId, async function(tab) {
        if (checkLastError('tabs.get')) return;
        if (!tab) return;

        setBadge(tab);
        if (tab.url) {
            await setTabUrl(activeInfo.tabId, tab.url);
        }
    });
});

// Catches history entries Chrome records after navigation begins. If the visited
// hostname isn't open in any tab and has history clearing enabled, delete it.
chrome.history.onVisited.addListener(async function(historyItem) {
    const hostname = safeGetHostname(historyItem.url);
    if (!hostname) return;

    const tabUrls = await getTabUrls();
    for (const url of tabUrls.values()) {
        const tabHost = safeGetHostname(url);
        if (hostnameMatches(tabHost, hostname) || hostnameMatches(hostname, tabHost)) {
            return;
        }
    }

    hasEnabledSettings(hostname, function(hasEnabled, settings) {
        if (hasEnabled && settings.history) {
            chrome.history.deleteUrl({ url: historyItem.url }, function() {
                checkLastError('history.deleteUrl onVisited');
            });
        }
    });
});

chrome.runtime.onMessage.addListener(function(request) {
    if (request.action === 'updateSettings') {
        const hasEnabled = request.settings.history || request.settings.cache || request.settings.cookies;
        if (hasEnabled) {
            handleCleanup(request.hostname, request.settings);
        }

        chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
            if (checkLastError('tabs.query')) return;
            if (tabs && tabs[0]) {
                setBadge(tabs[0]);
            }
        });
    }
});

chrome.tabs.query({}, async function(tabs) {
    if (checkLastError('tabs.query init')) return;
    if (!tabs) return;

    for (const tab of tabs) {
        if (tab.url && tab.id) {
            await setTabUrl(tab.id, tab.url);
        }
    }
});
