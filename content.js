let website = window.location.hostname;

// Apply cache prevention immediately if cache clearing is enabled
chrome.storage.sync.get('siteSettings', function(result) {
    const allSiteSettings = result.siteSettings || {};
    const settings = allSiteSettings[website] || { history: false, cache: false, cookies: false };

    if (settings.cache) {
        // Prevent caching for this page load
        preventCaching();

        // Also intercept any dynamic requests to prevent caching
        interceptFetchRequests();
    }
});

function preventCaching() {
    // Add cache control meta tags
    const metaTags = [
        { httpEquiv: "Cache-Control", content: "no-store, no-cache, must-revalidate, post-check=0, pre-check=0" },
        { httpEquiv: "Pragma", content: "no-cache" },
        { httpEquiv: "Expires", content: "0" }
    ];

    metaTags.forEach(tag => {
        let meta = document.createElement('meta');
        meta.httpEquiv = tag.httpEquiv;
        meta.content = tag.content;

        // Insert at the beginning of head to ensure it takes precedence
        const head = document.getElementsByTagName('head')[0];
        if (head) {
            head.insertBefore(meta, head.firstChild);
        }
    });

    // Also add to existing head if it already exists
    if (document.head) {
        metaTags.forEach(tag => {
            // Check if tag already exists
            const existing = document.head.querySelector(`meta[http-equiv="${tag.httpEquiv}"]`);
            if (!existing) {
                let meta = document.createElement('meta');
                meta.httpEquiv = tag.httpEquiv;
                meta.content = tag.content;
                document.head.insertBefore(meta, document.head.firstChild);
            }
        });
    }
}

function interceptFetchRequests() {
    // Override fetch to add no-cache headers
    const originalFetch = window.fetch;
    window.fetch = function(input, init = {}) {
        // Add no-cache headers to the request
        init.headers = init.headers || {};
        init.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate';
        init.headers['Pragma'] = 'no-cache';
        init.headers['Expires'] = '0';

        // Also disable cache mode
        init.cache = 'no-store';

        return originalFetch.call(this, input, init);
    };

    // Override XMLHttpRequest to add no-cache headers
    const originalXHROpen = XMLHttpRequest.prototype.open;
    const originalXHRSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function(method, url, async, user, password) {
        this._url = url;
        return originalXHROpen.apply(this, arguments);
    };

    XMLHttpRequest.prototype.send = function(body) {
        // Add no-cache headers
        this.setRequestHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        this.setRequestHeader('Pragma', 'no-cache');
        this.setRequestHeader('Expires', '0');

        return originalXHRSend.apply(this, arguments);
    };
}

// Listen for storage changes to update cache prevention in real-time
chrome.storage.onChanged.addListener(function(changes, namespace) {
    if (namespace === 'sync' && changes.siteSettings) {
        const newSettings = changes.siteSettings.newValue || {};
        const settings = newSettings[website] || { history: false, cache: false, cookies: false };

        if (settings.cache) {
            preventCaching();
            interceptFetchRequests();
        }
    }
});