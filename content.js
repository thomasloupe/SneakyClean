chrome.runtime.sendMessage({}, function(response) {
    let website = window.location.hostname;
    if (response.enabledWebsites.includes(website)) {
        let meta = document.createElement('meta');
        meta.httpEquiv = "Cache-Control";
        meta.content = "no-store, no-cache, must-revalidate, post-check=0, pre-check=0";
        document.getElementsByTagName('head')[0].appendChild(meta);

        let metaPragma = document.createElement('meta');
        metaPragma.httpEquiv = "Pragma";
        metaPragma.content = "no-cache";
        document.getElementsByTagName('head')[0].appendChild(metaPragma);
    }
});
