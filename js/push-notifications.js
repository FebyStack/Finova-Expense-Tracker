// js/push-notifications.js
import { auth } from './firebase-config.js';
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
    return outputArray;
}

export async function requestPushPermission(uid) {
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

        const reg = await navigator.serviceWorker.register('/Expense_Tracker/sw.js');
        console.log('Service Worker registered', reg);

        // Fetch Public VAPID key
        const validRes = await fetch('/Expense_Tracker/api/get-vapid.php');
        const vapidData = await validRes.json();
        
        if (!vapidData.success) {
            console.warn('VAPID public key not found on server.');
            return;
        }

        const applicationServerKey = urlB64ToUint8Array(vapidData.publicKey);
        const subscription = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: applicationServerKey
        });

        console.log('User is subscribed to Push:', subscription);

        // Save to our Postgres DB
        await apiFetch('/save-subscription.php', {
            method: 'POST',
            body: JSON.stringify({
                uid: uid,
                subscription: subscription.toJSON()
            })
        });
        
        console.log('Push subscription saved to server.');

    } catch (error) {
        console.error('Failed to subscribe the user to push:', error);
    }
}
