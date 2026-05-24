document.addEventListener('DOMContentLoaded', function() {
    const DEFAULT_SETTINGS = { history: false, cache: false, cookies: false };
    const powerSwitch = document.querySelector('.power-switch input');
    const toggles = document.querySelectorAll('.toggle');
    let currentTab = null;
    let isUpdating = false;
    let listenersAdded = false;

    // Helper function to safely parse URLs
    function safeParseUrl(url) {
        if (!url) return null;
        try {
            return new URL(url);
        } catch (e) {
            return null;
        }
    }

    // Helper function to check if URL should be skipped
    function shouldSkipUrl(url) {
        const parsed = safeParseUrl(url);
        if (!parsed) return true;

        const skipProtocols = ['chrome:', 'chrome-extension:', 'about:', 'edge:', 'file:'];
        return skipProtocols.includes(parsed.protocol) || !parsed.hostname;
    }

    // Get the current tab
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        currentTab = tabs[0];
        loadAndUpdateUI();
        setupTabListeners();
    });

    function areAnyTogglesOn(settings) {
        return Object.values(settings).some(value => value === true);
    }

    function updatePowerSwitchState(settings, forceUpdate = false) {
        if (isUpdating && !forceUpdate) return;

        const shouldBeOn = areAnyTogglesOn(settings);
        if (powerSwitch.checked !== shouldBeOn) {
            powerSwitch.checked = shouldBeOn;
        }
    }

    function updateToggleStates(settings) {
        toggles.forEach(toggle => {
            const feature = toggle.getAttribute('data-feature');
            const isEnabled = settings[feature] === true;

            // Remove existing classes first
            toggle.classList.remove('toggle--on', 'toggle--off');

            // Add the appropriate class
            if (isEnabled) {
                toggle.classList.add('toggle--on');
            } else {
                toggle.classList.add('toggle--off');
            }
        });
    }

    function resetUI() {
        updateToggleStates(DEFAULT_SETTINGS);
        powerSwitch.checked = false;
    }

    function loadAndUpdateUI() {
        if (!currentTab || !currentTab.url || shouldSkipUrl(currentTab.url)) {
            resetUI();
            return;
        }

        const parsed = safeParseUrl(currentTab.url);
        if (!parsed) {
            resetUI();
            return;
        }

        const hostname = parsed.hostname;

        chrome.storage.sync.get('siteSettings', function(data) {
            if (chrome.runtime.lastError) {
                console.debug('SneakyClean popup:', chrome.runtime.lastError.message);
                return;
            }

            const allSiteSettings = data.siteSettings || {};
            const settings = allSiteSettings[hostname] || { ...DEFAULT_SETTINGS };

            updateToggleStates(settings);
            updatePowerSwitchState(settings, true);
        });
    }

    function saveSettings(hostname, settings, callback) {
        chrome.storage.sync.get('siteSettings', function(data) {
            if (chrome.runtime.lastError) {
                console.debug('SneakyClean popup:', chrome.runtime.lastError.message);
                if (callback) callback();
                return;
            }

            const allSiteSettings = data.siteSettings || {};
            allSiteSettings[hostname] = settings;
            chrome.storage.sync.set({ siteSettings: allSiteSettings }, function() {
                if (chrome.runtime.lastError) {
                    console.debug('SneakyClean popup:', chrome.runtime.lastError.message);
                }
                chrome.runtime.sendMessage({
                    action: 'updateSettings',
                    hostname: hostname,
                    settings: settings
                });
                if (callback) callback();
            });
        });
    }

    // Handle individual toggle clicks
    toggles.forEach(function(toggle) {
        toggle.addEventListener('click', function(e) {
            e.preventDefault();

            if (isUpdating) return;
            isUpdating = true;

            // Toggle the state
            const wasOn = this.classList.contains('toggle--on');
            this.classList.remove('toggle--on', 'toggle--off');
            this.classList.add(wasOn ? 'toggle--off' : 'toggle--on');
            this.classList.add('toggle--moving');

            setTimeout(() => {
                this.classList.remove('toggle--moving');
            }, 200);

            const feature = this.getAttribute('data-feature');
            const isEnabled = this.classList.contains('toggle--on');

            if (currentTab && currentTab.url && !shouldSkipUrl(currentTab.url)) {
                const parsed = safeParseUrl(currentTab.url);
                if (!parsed) {
                    isUpdating = false;
                    return;
                }

                const hostname = parsed.hostname;

                chrome.storage.sync.get('siteSettings', function(data) {
                    if (chrome.runtime.lastError) {
                        console.debug('SneakyClean popup:', chrome.runtime.lastError.message);
                        isUpdating = false;
                        return;
                    }

                    const allSiteSettings = data.siteSettings || {};
                    const settings = allSiteSettings[hostname] || { ...DEFAULT_SETTINGS };
                    settings[feature] = isEnabled;

                    saveSettings(hostname, settings, function() {
                        updatePowerSwitchState(settings, true);
                        isUpdating = false;
                    });
                });
            } else {
                isUpdating = false;
            }
        });
    });

    // Handle power switch clicks
    powerSwitch.addEventListener('change', function(event) {
        if (isUpdating) return;
        isUpdating = true;

        const newState = this.checked;

        if (currentTab && currentTab.url && !shouldSkipUrl(currentTab.url)) {
            const parsed = safeParseUrl(currentTab.url);
            if (!parsed) {
                isUpdating = false;
                return;
            }

            const hostname = parsed.hostname;

            chrome.storage.sync.get('siteSettings', function(data) {
                if (chrome.runtime.lastError) {
                    console.debug('SneakyClean popup:', chrome.runtime.lastError.message);
                    isUpdating = false;
                    return;
                }

                const allSiteSettings = data.siteSettings || {};
                const settings = allSiteSettings[hostname] || { ...DEFAULT_SETTINGS };

                Object.keys(settings).forEach(key => {
                    settings[key] = newState;
                });

                // Update the toggle UI immediately for snappier feedback.
                updateToggleStates(settings);

                saveSettings(hostname, settings, function() {
                    isUpdating = false;
                });
            });
        } else {
            isUpdating = false;
        }
    });

    // Setup tab listeners only once to prevent memory leaks
    function setupTabListeners() {
        if (listenersAdded) return;
        listenersAdded = true;

        // Listen for tab changes while popup is open
        chrome.tabs.onActivated.addListener(function(activeInfo) {
            chrome.tabs.get(activeInfo.tabId, function(tab) {
                if (chrome.runtime.lastError) {
                    console.debug('SneakyClean popup:', chrome.runtime.lastError.message);
                    return;
                }
                currentTab = tab;
                loadAndUpdateUI();
            });
        });

        chrome.tabs.onUpdated.addListener(function(tabId, changeInfo, tab) {
            if (changeInfo.status === 'complete' && currentTab && tab.id === currentTab.id) {
                currentTab = tab;
                loadAndUpdateUI();
            }
        });
    }
});
