// js/push-notifications.js
import { apiFetch } from './api.js';

// Convert base64 url-safe string to Uint8Array for Push API
function urlB64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return Array.from(outputArray);
}

export async function requestPushPermission() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        console.log('Push messaging is not supported.');
        return;
    }

    try {
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
            console.log('Notification permission denied.');
            return;
        }

        const reg = await navigator.serviceWorker.ready;
        console.log('PWA Service Worker ready check...');

        // Fetch Public VAPID key
        const vapidData = await apiFetch('push/get-vapid');
        
        if (!vapidData.success || !vapidData.publicKey) {
            console.warn('VAPID public key not found on server.');
            return;
        }

        const applicationServerKey = new Uint8Array(urlB64ToUint8Array(vapidData.publicKey));
        const subscription = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: applicationServerKey
        });

        console.log('User is subscribed to Push:', subscription);

        // Save to our Postgres DB
        await apiFetch('push/save-subscription', {
            method: 'POST',
            body: JSON.stringify({
                subscription: subscription.toJSON()
            })
        });
        
        console.log('Push subscription saved to Desktop server.');

    } catch (error) {
        console.error('Failed to subscribe the user to push:', error);
    }
}
