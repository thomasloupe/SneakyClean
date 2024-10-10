document.addEventListener('DOMContentLoaded', function() {
    const powerSwitch = document.querySelector('.power-switch input');
    const toggles = document.querySelectorAll('.toggle');
    let currentTab = null;

    // Get the current tab
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        currentTab = tabs[0];
        updateUI();
    });

    function areAnyTogglesOn(settings) {
        return Object.values(settings).some(value => value);
    }

    function updatePowerSwitchState(settings) {
        powerSwitch.checked = areAnyTogglesOn(settings);
    }

    function updateUI() {
        if (currentTab && currentTab.url) {
            const url = new URL(currentTab.url);
            const hostname = url.hostname;

            chrome.storage.sync.get('siteSettings', function(data) {
                const allSiteSettings = data.siteSettings || {};
                const settings = allSiteSettings[hostname] || { history: false, cache: false, cookies: false };
                
                toggles.forEach(toggle => {
                    const feature = toggle.getAttribute('data-feature');
                    toggle.classList.toggle('toggle--on', settings[feature]);
                    toggle.classList.toggle('toggle--off', !settings[feature]);
                });
                
                updatePowerSwitchState(settings);
            });
        }
    }

    function saveSettings(hostname, settings) {
        chrome.storage.sync.get('siteSettings', function(data) {
            const allSiteSettings = data.siteSettings || {};
            allSiteSettings[hostname] = settings;
            chrome.storage.sync.set({ siteSettings: allSiteSettings }, function() {
                chrome.runtime.sendMessage({ action: 'updateSettings', hostname: hostname, settings: settings });
            });
        });
    }

    toggles.forEach(function(toggle) {
        toggle.addEventListener('click', function(e) {
            e.preventDefault();

            this.classList.toggle('toggle--on');
            this.classList.toggle('toggle--off');
            this.classList.add('toggle--moving');

            setTimeout(() => {
                this.classList.remove('toggle--moving');
            }, 200);

            const feature = this.getAttribute('data-feature');
            const isEnabled = this.classList.contains('toggle--on');
            console.log(`${feature} is now ${isEnabled ? 'on' : 'off'}`);

            if (currentTab && currentTab.url) {
                const url = new URL(currentTab.url);
                const hostname = url.hostname;
                chrome.storage.sync.get('siteSettings', function(data) {
                    const allSiteSettings = data.siteSettings || {};
                    const settings = allSiteSettings[hostname] || { history: false, cache: false, cookies: false };
                    settings[feature] = isEnabled;
                    saveSettings(hostname, settings);
                    updatePowerSwitchState(settings);
                });
            }
        });
    });

    powerSwitch.addEventListener('click', function(event) {
        const newState = this.checked;
        if (currentTab && currentTab.url) {
            const url = new URL(currentTab.url);
            const hostname = url.hostname;
            chrome.storage.sync.get('siteSettings', function(data) {
                const allSiteSettings = data.siteSettings || {};
                const settings = allSiteSettings[hostname] || { history: false, cache: false, cookies: false };
                Object.keys(settings).forEach(key => settings[key] = newState);
                saveSettings(hostname, settings);
                updateUI();
            });
        }
    });

    updateUI();
});