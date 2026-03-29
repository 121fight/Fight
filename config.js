// GitHub JSON Remote Control Logic
const CONFIG_URL = 'https://raw.githubusercontent.com/smirajul935-ui/Chatroom/refs/heads/main/Ban%20user';

function generateDeviceId() {
    let deviceId = localStorage.getItem('deviceId');
    if (!deviceId) {
        // Generate a permanent ID like DEV-A1B2C3D4
        deviceId = 'DEV-' + Math.random().toString(36).substr(2, 8).toUpperCase();
        localStorage.setItem('deviceId', deviceId);
    }
    return deviceId;
}

async function fetchConfig() {
    const deviceId = generateDeviceId();
    
    // Set Device ID in profile UI
    const displayId = document.getElementById('display-device-id');
    if(displayId) displayId.textContent = deviceId;

    try {
        const response = await fetch(CONFIG_URL);
        const data = await response.json();
        handleConfig(data, deviceId);
    } catch (error) {
        console.warn("Could not fetch remote config. App will start normally.", error);
        document.dispatchEvent(new Event('ConfigLoaded'));
    }
}

function handleConfig(data, deviceId) {
    const overlay = document.getElementById('system-overlay');
    const title = document.getElementById('overlay-title');
    const message = document.getElementById('overlay-message');
    const btn = document.getElementById('overlay-btn');

    if (data.app_status === "off") {
        showOverlay("App Disabled", "The application is currently turned off by the administrator.");
    } else if (data.force_update) {
        showOverlay("Update Required", data.update_message || "A new update is available.");
        btn.classList.remove('hidden');
        btn.textContent = "Update Now";
        btn.className = "primary-btn";
        btn.onclick = () => window.location.href = data.update_link;
    } else if (data.banned_users && data.banned_users.includes(deviceId)) {
        // Block user if their Device ID is in GitHub JSON
        showOverlay("Access Denied", `Your device (${deviceId}) has been banned by the Admin.`);
        title.style.color = "var(--danger)";
    } else {
        // Safe to enter
        document.dispatchEvent(new Event('ConfigLoaded'));
    }

    function showOverlay(t, m) {
        overlay.classList.remove('hidden');
        title.textContent = t;
        message.textContent = m;
    }
}

// Start checking on load
window.addEventListener('load', fetchConfig);
