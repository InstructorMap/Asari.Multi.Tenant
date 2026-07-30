/**
 * ASARI - Configuración Central de Supabase + Multi-Tenant
 * Versión: 1.0.0
 * Arquitectura: Marca Blanca con RLS
 */

// ============================================
// INICIALIZACIÓN DEL CLIENTE SUPABASE
// ============================================
const SUPABASE_URL = 'https://wdewtjdimbecdfyntcll.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndkZXd0amRpbWJlY2RmeW50Y2xsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU0MzYxMTYsImV4cCI6MjEwMTAxMjExNn0.YlJ99AVTuWrKAjNJ8DOrP-4-drHs1PcYVVU0_EwjpTA';

const supabase = window.supabase?.createClient 
    ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    : supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ============================================
// FUNCIÓN GLOBAL: Obtener Slug del Tenant
// ============================================
/**
 * Obtiene el identificador del instituto actual.
 * MODO TESTING (URL Params): Lee ?instituto=remaep
 * MODO PRODUCCIÓN (Subdominios): Lee window.location.hostname
 * 
 * Para cambiar a producción, comenta la línea actual y descomenta la de abajo.
 */
function getTenantSlug() {
    // MODO TESTING - URL Parameters
    const urlParams = new URLSearchParams(window.location.search);
    const slug = urlParams.get('instituto');
    
    if (slug) {
        localStorage.setItem('asari_tenant_slug', slug);
        return slug;
    }
    
    const storedSlug = localStorage.getItem('asari_tenant_slug');
    if (storedSlug) return storedSlug;
    
    // Fallback para desarrollo
    console.warn('⚠️ No se detectó tenant. Usando "default"');
    return 'default';
    
    // MODO PRODUCCIÓN - Subdominios (descomentar cuando uses dominios reales)
    // const hostname = window.location.hostname;
    // const subdomain = hostname.split('.')[0];
    // return subdomain !== 'www' && subdomain !== 'asari' ? subdomain : null;
}

// ============================================
// FUNCIÓN GLOBAL: Obtener Configuración del Tenant
// ============================================
/**
 * Carga la configuración del instituto desde Supabase
 * y aplica branding (colores, logos) + terminología al DOM.
 * 
 * @returns {Object|null} Datos completos de configuración o null si falla.
 */
async function fetchTenantConfig() {
    const slug = getTenantSlug();
    
    if (!slug || slug === 'default') {
        console.warn('🌐 Sin tenant específico, usando configuración por defecto.');
        return null;
    }

    try {
        // 1. Buscar el instituto por slug
        const { data: instituto, error: errorInstituto } = await supabase
            .from('sys_institutos')
            .select('id, nombre, slug_dominio, estado, modulos_activos')
            .eq('slug_dominio', slug)
            .eq('estado', 'activo')
            .single();

        if (errorInstituto || !instituto) {
            console.error('❌ Instituto no encontrado o inactivo:', errorInstituto);
            document.body.innerHTML = `
                <div style="display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;">
                    <h1>🏫 Instituto no encontrado</h1>
                </div>`;
            return null;
        }

        // 2. Obtener la configuración de branding + terminología
        const { data: configuracion, error: errorConfig } = await supabase
            .from('sys_configuracion')
            .select('branding, terminologia')
            .eq('instituto_id', instituto.id)
            .single();

        if (errorConfig) {
            console.error('⚠️ Error cargando configuración:', errorConfig);
            // Continuamos con datos básicos del instituto
        }

        // 3. Aplicar Branding al DOM (CSS Variables)
        const branding = configuracion?.branding || {};
        const colores = branding.colores || { primario: '#000000', secundario: '#ffffff' };
        
        document.documentElement.style.setProperty('--color-primary', colores.primario);
        document.documentElement.style.setProperty('--color-secondary', colores.secundario);
        document.documentElement.style.setProperty('--color-primary-light', adjustColor(colores.primario, 40));
        document.documentElement.style.setProperty('--color-primary-dark', adjustColor(colores.primario, -40));

        // 4. Aplicar Logos
        if (branding.logo_principal) {
            const logoElements = document.querySelectorAll('[data-tenant-logo="principal"]');
            logoElements.forEach(el => {
                if (el.tagName === 'IMG') el.src = branding.logo_principal;
                else el.style.backgroundImage = `url(${branding.logo_principal})`;
            });
        }
        
        if (branding.logo_secundario) {
            const logoElements = document.querySelectorAll('[data-tenant-logo="secundario"]');
            logoElements.forEach(el => {
                if (el.tagName === 'IMG') el.src = branding.logo_secundario;
                else el.style.backgroundImage = `url(${branding.logo_secundario})`;
            });
        }

        if (branding.favicon) {
            const favicon = document.querySelector('link[rel="icon"]');
            if (favicon) favicon.href = branding.favicon;
        }

        // 5. Aplicar Terminología (data-attributes)
        const terminologia = configuracion?.terminologia || {};
        document.querySelectorAll('[data-termino]').forEach(el => {
            const key = el.getAttribute('data-termino');
            if (terminologia[key]) {
                el.textContent = terminologia[key];
            }
        });

        // 6. Guardar en window para acceso global
        window.__ASARI_TENANT__ = {
            instituto,
            configuracion: {
                branding,
                terminologia
            }
        };

        console.log('✅ Configuración de tenant cargada:', instituto.nombre);
        return window.__ASARI_TENANT__;

    } catch (error) {
        console.error('💥 Error crítico en fetchTenantConfig:', error);
        return null;
    }
}

// ============================================
// UTILIDAD: Ajustar color (claro/oscuro)
// ============================================
function adjustColor(hex, percent) {
    const num = parseInt(hex.replace('#', ''), 16);
    const amt = Math.round(2.55 * percent);
    const R = Math.min(255, Math.max(0, (num >> 16) + amt));
    const G = Math.min(255, Math.max(0, ((num >> 8) & 0x00FF) + amt));
    const B = Math.min(255, Math.max(0, (num & 0x0000FF) + amt));
    return `#${(0x1000000 + R * 0x10000 + G * 0x100 + B).toString(16).slice(1)}`;
}

// ============================================
// INICIALIZACIÓN AUTOMÁTICA
// ============================================
document.addEventListener('DOMContentLoaded', async () => {
    // Solo ejecutar en páginas satélite (no en admin-dios ni admin-login)
    const isAdminPage = window.location.pathname.includes('admin-');
    if (!isAdminPage) {
        await fetchTenantConfig();
    }
});

// Exportar para uso en otros scripts
window.getTenantSlug = getTenantSlug;
window.fetchTenantConfig = fetchTenantConfig;
window.supabase = supabase;
