/* sw.js - Service Worker for Native Web Push (No Firebase) */

self.addEventListener('push', function(event) {
    if (!event.data) return;

    let notificationData;
    try {
        notificationData = event.data.json();
    } catch (e) {
        notificationData = { title: "New Notification", body: event.data.text() };
    }

    const title = notificationData.title || "Finova Alert";
    const options = {
        body: notificationData.body,
        icon: '/Expense_Tracker/assets/icon.png', // Add an icon if available
        badge: '/Expense_Tracker/assets/badge.png',
        vibrate: [200, 100, 200, 100, 200, 100, 200],
        data: {
            url: notificationData.url || '/Expense_Tracker/dashboard.html'
        }
    };

    event.waitUntil(
        self.registration.showNotification(title, options)
    );
});

self.addEventListener('notificationclick', function(event) {
    event.notification.close();
    const urlToOpen = event.notification.data.url;

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
            // Check if there is already a window/tab open with the target URL
            for (let i = 0; i < windowClients.length; i++) {
                const client = windowClients[i];
                // If it's open, just focus it
                if (client.url.includes(urlToOpen) && 'focus' in client) {
                    return client.focus();
                }
            }
            // Otherwise, open a new window
            if (clients.openWindow) {
                return clients.openWindow(urlToOpen);
            }
        })
    );
});
