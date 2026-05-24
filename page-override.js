(function() {
    function isEnabled() {
        const root = document.documentElement;
        return root && root.dataset && root.dataset.sneakyCleanCache === 'on';
    }

    const originalFetch = window.fetch;
    if (originalFetch) {
        window.fetch = function(input, init) {
            if (!isEnabled()) {
                return originalFetch.call(this, input, init);
            }

            const opts = init || {};
            let headers;
            if (opts.headers instanceof Headers) {
                headers = new Headers(opts.headers);
            } else if (opts.headers && typeof opts.headers === 'object') {
                headers = new Headers(opts.headers);
            } else {
                headers = new Headers();
            }

            headers.set('Cache-Control', 'no-cache, no-store, must-revalidate');
            headers.set('Pragma', 'no-cache');
            headers.set('Expires', '0');

            return originalFetch.call(this, input, {
                ...opts,
                headers: headers,
                cache: 'no-store'
            });
        };
    }

    const originalXHROpen = XMLHttpRequest.prototype.open;
    const originalXHRSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function() {
        this._sneakyCleanOpened = true;
        return originalXHROpen.apply(this, arguments);
    };

    XMLHttpRequest.prototype.send = function() {
        if (this._sneakyCleanOpened && isEnabled()) {
            try {
                this.setRequestHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
                this.setRequestHeader('Pragma', 'no-cache');
                this.setRequestHeader('Expires', '0');
            } catch (e) {
                // Headers may already be locked; ignore.
            }
        }
        return originalXHRSend.apply(this, arguments);
    };
})();
