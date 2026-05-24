const DEFAULT_SETTINGS = { history: false, cache: false, cookies: false };
const website = window.location.hostname;
let cachePreventionEnabled = false;
let metaTagsAdded = false;

function setPageFlag(on) {
    if (document.documentElement) {
        document.documentElement.dataset.sneakyCleanCache = on ? 'on' : 'off';
    }
}

setPageFlag(false);

chrome.storage.sync.get('siteSettings', function(result) {
    if (chrome.runtime.lastError) {
        console.debug('SneakyClean content:', chrome.runtime.lastError.message);
        return;
    }
    const allSiteSettings = result.siteSettings || {};
    const settings = allSiteSettings[website] || DEFAULT_SETTINGS;

    if (settings.cache) {
        enableCachePrevention();
    }
});

function enableCachePrevention() {
    if (cachePreventionEnabled) return;
    cachePreventionEnabled = true;
    setPageFlag(true);
    preventCaching();
}

function disableCachePrevention() {
    if (!cachePreventionEnabled) return;
    cachePreventionEnabled = false;
    setPageFlag(false);
    metaTagsAdded = false;
}

function preventCaching() {
    if (metaTagsAdded) return;

    const metaTags = [
        { httpEquiv: "Cache-Control", content: "no-store, no-cache, must-revalidate, post-check=0, pre-check=0" },
        { httpEquiv: "Pragma", content: "no-cache" },
        { httpEquiv: "Expires", content: "0" }
    ];

    function addMetaTags() {
        const head = document.head || document.getElementsByTagName('head')[0];
        if (!head) {
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', addMetaTags, { once: true });
            }
            return;
        }

        metaTags.forEach(tag => {
            const existing = head.querySelector(`meta[http-equiv="${tag.httpEquiv}"]`);
            if (!existing) {
                const meta = document.createElement('meta');
                meta.httpEquiv = tag.httpEquiv;
                meta.content = tag.content;
                head.insertBefore(meta, head.firstChild);
            }
        });

        metaTagsAdded = true;
    }

    addMetaTags();
}

chrome.storage.onChanged.addListener(function(changes, namespace) {
    if (namespace === 'sync' && changes.siteSettings) {
        const newSettings = changes.siteSettings.newValue || {};
        const settings = newSettings[website] || DEFAULT_SETTINGS;

        if (settings.cache) {
            enableCachePrevention();
        } else {
            disableCachePrevention();
        }
    }
});
