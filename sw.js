/**
 * ASARI - Service Worker
 * Estrategia: Cache-First con actualización en segundo plano
 * Versión: 1.0.0
 */

const CACHE_NAME = 'asari-pwa-v1.0.0';
const RUNTIME_CACHE = 'asari-runtime-v1.0.0';

// Recursos a cachear en la instalación
const PRECACHE_URLS = [
    '/',
    '/index.html',
    '/wallet.html',
    '/campus.html',
    '/validador.html',
    '/admin-login.html',
    '/admin-dios.html',
    '/supabase-config.js',
    '/manifest.json',
    // CDN externos (se cachearán bajo demanda)
];

// Recursos externos críticos
const EXTERNAL_RESOURCES = [
    'https://cdn.tailwindcss.com',
    'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
    'https://unpkg.com/lucide@latest',
];

// ============================================
// INSTALACIÓN DEL SERVICE WORKER
// ============================================
self.addEventListener('install', (event) => {
    console.log('🛠️ Service Worker: Instalando v1.0.0');
    
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('📦 Precaching recursos estáticos');
                
                // Intentar precachear recursos locales
                const precachePromises = PRECACHE_URLS.map(url => {
                    return cache.add(url).catch(err => {
                        console.warn(`⚠️ No se pudo precachear: ${url}`, err);
                        // No fallar si un recurso no se puede cachear
                        return Promise.resolve();
                    });
                });
                
                return Promise.all(precachePromises);
            })
            .then(() => {
                console.log('✅ Instalación completada');
                // Forzar activación inmediata
                return self.skipWaiting();
            })
    );
});

// ============================================
// ACTIVACIÓN DEL SERVICE WORKER
// ============================================
self.addEventListener('activate', (event) => {
    console.log('🚀 Service Worker: Activado');
    
    event.waitUntil(
        caches.keys()
            .then((cacheNames) => {
                return Promise.all(
                    cacheNames.map((cacheName) => {
                        // Eliminar caches antiguos
                        if (cacheName !== CACHE_NAME && cacheName !== RUNTIME_CACHE) {
                            console.log('🗑️ Eliminando cache antiguo:', cacheName);
                            return caches.delete(cacheName);
                        }
                    })
                );
            })
            .then(() => {
                console.log('✅ Activación completada');
                // Tomar control de todas las páginas inmediatamente
                return self.clients.claim();
            })
    );
});

// ============================================
// ESTRATEGIA DE CACHE: Cache-First con Network Update
// ============================================
self.addEventListener('fetch', (event) => {
    // Ignorar peticiones que no sean GET
    if (event.request.method !== 'GET') {
        return;
    }
    
    // Ignorar peticiones a Supabase API (siempre ir a red)
    if (event.request.url.includes('supabase.co')) {
        return; // Dejar que el navegador maneje la petición normalmente
    }
    
    // Ignorar peticiones de Chrome Extensions
    if (!event.request.url.startsWith('http')) {
        return;
    }
    
    event.respondWith(
        caches.match(event.request)
            .then((cachedResponse) => {
                // Si está en cache, devolverlo y actualizar en segundo plano
                if (cachedResponse) {
                    // Actualizar cache en segundo plano (stale-while-revalidate)
                    fetchAndUpdateCache(event.request);
                    return cachedResponse;
                }
                
                // Si no está en cache, ir a red y cachear para futuro
                return fetch(event.request)
                    .then((networkResponse) => {
                        // Verificar que la respuesta sea válida
                        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
                            return networkResponse;
                        }
                        
                        // Clonar respuesta para cachear
                        const responseToCache = networkResponse.clone();
                        
                        caches.open(RUNTIME_CACHE)
                            .then((cache) => {
                                cache.put(event.request, responseToCache);
                            })
                            .catch(err => {
                                console.warn('⚠️ Error cacheando recurso:', err);
                            });
                        
                        return networkResponse;
                    })
                    .catch((error) => {
                        console.error('❌ Error fetch:', error);
                        
                        // Si es una página HTML, devolver página offline
                        if (event.request.headers.get('accept')?.includes('text/html')) {
                            return caches.match('/index.html')
                                .then((offlineResponse) => {
                                    if (offlineResponse) {
                                        return offlineResponse;
                                    }
                                    // Fallback final
                                    return new Response(
                                        '<html><body style="font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;background:%23f5f5f5;"><div style="text-align:center;"><h1>📡 Sin conexión</h1><p>No se pudo cargar la página. Verifica tu conexión.</p><button onclick="location.reload()" style="background:%237c3aed;color:white;border:none;padding:12px 24px;border-radius:8px;cursor:pointer;font-size:16px;">Reintentar</button></div></body></html>',
                                        {
                                            status: 503,
                                            statusText: 'Service Unavailable',
                                            headers: { 'Content-Type': 'text/html' }
                                        }
                                    );
                                });
                        }
                        
                        // Para otros recursos, devolver error
                        return new Response('Recurso no disponible offline', {
                            status: 503,
                            statusText: 'Service Unavailable'
                        });
                    });
            })
    );
});

// ============================================
// FUNCIÓN: Actualizar cache en segundo plano
// ============================================
async function fetchAndUpdateCache(request) {
    try {
        const networkResponse = await fetch(request);
        
        if (networkResponse && networkResponse.status === 200) {
            const cache = await caches.open(RUNTIME_CACHE);
            await cache.put(request, networkResponse.clone());
            console.log('🔄 Cache actualizado en segundo plano:', request.url);
        }
    } catch (error) {
        console.warn('⚠️ No se pudo actualizar cache en segundo plano:', error);
    }
}

// ============================================
// MANEJO DE MENSAJES
// ============================================
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
    
    if (event.data && event.data.type === 'CLEAR_CACHE') {
        event.waitUntil(
            caches.keys().then(cacheNames => {
                return Promise.all(
                    cacheNames.map(cacheName => caches.delete(cacheName))
                );
            }).then(() => {
                console.log('🗑️ Todos los caches eliminados por solicitud');
            })
        );
    }
    
    if (event.data && event.data.type === 'CHECK_UPDATE') {
        event.waitUntil(
            self.registration.update().then(() => {
                console.log('🔍 Buscando actualizaciones...');
            })
        );
    }
});

// ============================================
// SINCRONIZACIÓN EN SEGUNDO PLANO
// ============================================
self.addEventListener('sync', (event) => {
    if (event.tag === 'sync-credentials') {
        event.waitUntil(
            // Aquí se podría sincronizar datos pendientes con Supabase
            syncPendingData()
        );
    }
});

async function syncPendingData() {
    console.log('🔄 Sincronizando datos pendientes...');
    
    try {
        // Obtener datos pendientes de IndexedDB o similar
        // const pendingData = await getPendingSyncData();
        
        // Enviar a Supabase
        // if (pendingData.length > 0) {
        //     await sendToSupabase(pendingData);
        // }
        
        console.log('✅ Sincronización completada');
    } catch (error) {
        console.error('❌ Error en sincronización:', error);
        throw error;
    }
}

// ============================================
// NOTIFICACIONES PUSH (Opcional)
// ============================================
self.addEventListener('push', (event) => {
    if (!event.data) return;
    
    try {
        const data = event.data.json();
        
        const options = {
            body: data.body || 'Nueva notificación de ASARI',
            icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192"><rect width="192" height="192" rx="32" fill="%237c3aed"/><text x="96" y="110" font-size="120" text-anchor="middle" fill="white">🎓</text></svg>',
            badge: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 72 72"><rect width="72" height="72" rx="12" fill="%237c3aed"/></svg>',
            vibrate: [200, 100, 200],
            data: {
                url: data.url || '/'
            },
            actions: data.actions || [],
            tag: data.tag || 'default',
            requireInteraction: data.requireInteraction || false
        };
        
        event.waitUntil(
            self.registration.showNotification(
                data.title || 'ASARI',
                options
            )
        );
    } catch (error) {
        console.error('Error mostrando notificación:', error);
    }
});

// Manejar click en notificación
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    
    const urlToOpen = event.notification.data?.url || '/';
    
    event.waitUntil(
        clients.matchAll({
            type: 'window',
            includeUncontrolled: true
        }).then((clientList) => {
            // Si hay una ventana abierta, enfocarla
            for (const client of clientList) {
                if (client.url.includes(urlToOpen) && 'focus' in client) {
                    return client.focus();
                }
            }
            // Si no, abrir nueva ventana
            if (clients.openWindow) {
                return clients.openWindow(urlToOpen);
            }
        })
    );
});

// ============================================
// LOG DE ESTADO
// ============================================
console.log('🎯 ASARI Service Worker v1.0.0 cargado y listo');
