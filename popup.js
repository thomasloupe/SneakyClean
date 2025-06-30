document.addEventListener('DOMContentLoaded', function() {
    const powerSwitch = document.querySelector('.power-switch input');
    const toggles = document.querySelectorAll('.toggle');
    let currentTab = null;
    let isUpdating = false; // Prevent recursive updates

    // Get the current tab
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        currentTab = tabs[0];
        loadAndUpdateUI();
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

    function loadAndUpdateUI() {
        if (!currentTab || !currentTab.url) {
            return;
        }

        const url = new URL(currentTab.url);
        const hostname = url.hostname;

        // Skip chrome:// URLs
        if (hostname.startsWith('chrome://') || !hostname) {
            return;
        }

        chrome.storage.sync.get('siteSettings', function(data) {
            const allSiteSettings = data.siteSettings || {};
            const settings = allSiteSettings[hostname] || { history: false, cache: false, cookies: false };

            // Update toggle states first
            updateToggleStates(settings);

            // Then update power switch to match
            updatePowerSwitchState(settings, true);
        });
    }

    function saveSettings(hostname, settings, callback) {
        chrome.storage.sync.get('siteSettings', function(data) {
            const allSiteSettings = data.siteSettings || {};
            allSiteSettings[hostname] = settings;
            chrome.storage.sync.set({ siteSettings: allSiteSettings }, function() {
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

            if (currentTab && currentTab.url) {
                const url = new URL(currentTab.url);
                const hostname = url.hostname;

                chrome.storage.sync.get('siteSettings', function(data) {
                    const allSiteSettings = data.siteSettings || {};
                    const settings = allSiteSettings[hostname] || { history: false, cache: false, cookies: false };
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

        if (currentTab && currentTab.url) {
            const url = new URL(currentTab.url);
            const hostname = url.hostname;

            chrome.storage.sync.get('siteSettings', function(data) {
                const allSiteSettings = data.siteSettings || {};
                const settings = allSiteSettings[hostname] || { history: false, cache: false, cookies: false };

                // Set all settings to the new state
                Object.keys(settings).forEach(key => {
                    settings[key] = newState;
                });

                saveSettings(hostname, settings, function() {
                    updateToggleStates(settings);
                    isUpdating = false;
                });
            });
        } else {
            isUpdating = false;
        }
    });

    // Listen for tab changes while popup is open
    chrome.tabs.onActivated.addListener(function(activeInfo) {
        chrome.tabs.get(activeInfo.tabId, function(tab) {
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

    // Initial load
    loadAndUpdateUI();
});