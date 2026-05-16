/* =====================================================
   app.js — NexusRepo
   Firebase Auth + Google Sign-In + lógica de la app
   ===================================================== */

// ══════════════════════════════════════════════════════
// 1. CONFIGURACIÓN FIREBASE
// ══════════════════════════════════════════════════════
const firebaseConfig = {
    apiKey: "AIzaSyBKiq_t-gZj_l1Bzj9Y1Jpft03b60pyyuQ",
    authDomain: "eduspace-auth-d7577.firebaseapp.com",
    databaseURL: "https://eduspace-auth-d7577-default-rtdb.firebaseio.com",
    projectId: "eduspace-auth-d7577",
    storageBucket: "eduspace-auth-d7577.firebasestorage.app",
    messagingSenderId: "49398558176",
    appId: "1:49398558276:web:e1c5f750543d5a4d6b4f85"
};

firebase.initializeApp(firebaseConfig);
// DESPUÉS
const auth = firebase.auth();
const db   = firebase.database();

// ── Cloudinary config ──────────────────────────────
const CLOUDINARY_CLOUD  = 'dwzwa3gp0';    
const CLOUDINARY_PRESET = 'hfqqxu13';   

// ══════════════════════════════════════════════════════
// 2. ESTADO GLOBAL
// ══════════════════════════════════════════════════════
let currentUser        = null;
let isAdmin            = false;
let currentSection     = 'docs';
let sidebarOpen        = true;
let pendingWorkId      = null;
let completedWorks     = [];
let desktopMenuOpen    = false;
let selectedAreaCurso  = null;   // curso del área actualmente seleccionada
let selectedAreaDocente= null;   // docente del área actualmente seleccionada

// ══════════════════════════════════════════════════════
// 3. OBSERVER DE AUTENTICACIÓN
//    → Controla qué se muestra según estado de sesión
// ══════════════════════════════════════════════════════
auth.onAuthStateChanged(async (user) => {
    if (user) {
        currentUser = user;
        hideLoginOverlay();

        // ── Verificar si es administrador ──────────────────
        const emailKey  = user.email.replace(/\./g, '_').replace(/@/g, '-at-');
        const adminSnap = await db.ref(`admins/${emailKey}`).once('value');
        isAdmin = adminSnap.exists();
        // ───────────────────────────────────────────────────

        const snap      = await db.ref(`users/${user.uid}/name`).once('value');
        const savedName = snap.val();

        if (!savedName) {
            showWelcomeModal(user);
        } else {
            loadUserProfile(user, savedName);
        }

    } else {
        currentUser = null;
        isAdmin     = false;
        showLoginOverlay();
    }
});

// ══════════════════════════════════════════════════════
// 4. LOGIN / LOGOUT
// ══════════════════════════════════════════════════════
function signInWithGoogle() {
    const btn     = document.getElementById('google-signin-btn');
    const loading = document.getElementById('login-loading');

    btn.disabled = true;
    btn.classList.add('opacity-60', 'cursor-not-allowed');
    loading.classList.remove('hidden');

    const provider = new firebase.auth.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });

    auth.signInWithPopup(provider).catch((err) => {
        console.error('Error al iniciar sesión:', err);
        btn.disabled = false;
        btn.classList.remove('opacity-60', 'cursor-not-allowed');
        loading.classList.add('hidden');
        alert('No se pudo iniciar sesión. Intenta de nuevo.');
    });
}

function signOutUser() {
    auth.signOut().then(() => {
        // Limpiar UI
        clearUserUI();
        closeProfileModal();
        closeDesktopProfileMenu();
    }).catch((err) => {
        console.error('Error al cerrar sesión:', err);
    });
}

// ══════════════════════════════════════════════════════
// 5. WELCOME MODAL — pedir nombre
// ══════════════════════════════════════════════════════
function showWelcomeModal(user) {
    // Poblar datos de Google
    document.getElementById('welcome-photo').src  = user.photoURL || '';
    document.getElementById('welcome-email').textContent = user.email || '';

    const modal = document.getElementById('welcome-modal');
    modal.classList.remove('hidden');
    document.body.classList.add('overflow-hidden');

    lucide.createIcons();

    // Focus en el input con pequeño delay (animación)
    setTimeout(() => {
        document.getElementById('welcome-name-input').focus();
    }, 400);
}

function closeWelcomeModal() {
    // Si cierra sin poner nombre, cerrar sesión
    document.getElementById('welcome-modal').classList.add('hidden');
    document.body.classList.remove('overflow-hidden');

    if (currentUser) {
        db.ref(`users/${currentUser.uid}/name`).once('value').then(snap => {
            if (!snap.val()) {
                // Sin nombre → desloguear para que vuelva a completar
                auth.signOut();
            }
        });
    }
}

async function saveUserName() {
    const input = document.getElementById('welcome-name-input');
    const error = document.getElementById('name-error');
    const name  = input.value.trim();

    // Validar obligatorio
    if (!name || name.length < 2) {
        error.classList.remove('hidden');
        input.classList.add('error');
        input.classList.add('shake');
        setTimeout(() => input.classList.remove('shake'), 450);
        input.focus();
        return;
    }

    error.classList.add('hidden');
    input.classList.remove('error');

    // Guardar en Firebase Realtime Database
    try {
        await db.ref(`users/${currentUser.uid}`).set({
            name:      name,
            email:     currentUser.email,
            photoURL:  currentUser.photoURL || '',
            uid:       currentUser.uid,
            provider:  'google',
            createdAt: firebase.database.ServerValue.TIMESTAMP
        });

        // Ocultar modal y cargar perfil
        document.getElementById('welcome-modal').classList.add('hidden');
        document.body.classList.remove('overflow-hidden');
        loadUserProfile(currentUser, name);

    } catch (err) {
        console.error('Error al guardar nombre:', err);
        alert('Hubo un error al guardar tu nombre. Intenta de nuevo.');
    }
}

// Enter en el input también guarda
document.addEventListener('DOMContentLoaded', () => {
    const input = document.getElementById('welcome-name-input');
    if (input) {
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') saveUserName();
        });
        // Quitar error al escribir
        input.addEventListener('input', () => {
            input.classList.remove('error');
            document.getElementById('name-error').classList.add('hidden');
        });
    }
});

// ══════════════════════════════════════════════════════
// 6. CARGAR PERFIL DE USUARIO EN LA UI
// ══════════════════════════════════════════════════════
function loadUserProfile(user, name) {
    const photo = user.photoURL || '';
    const email = user.email    || '';

    // ── Sidebar desktop ──────────────────────
    const sidebarPhoto    = document.getElementById('sidebar-photo');
    const sidebarFallback = document.getElementById('sidebar-fallback');
    const sidebarName     = document.getElementById('sidebar-name');
    const sidebarEmail    = document.getElementById('sidebar-email');
    const sidebarEmailMenu= document.getElementById('sidebar-email-menu');

    if (photo) {
        sidebarPhoto.src = photo;
        sidebarPhoto.classList.remove('hidden');
        sidebarFallback.classList.add('hidden');
    } else {
        sidebarPhoto.classList.add('hidden');
        sidebarFallback.classList.remove('hidden');
        sidebarFallback.style.display = 'flex';
        sidebarFallback.textContent = name.charAt(0).toUpperCase();
    }
    sidebarName.textContent      = name;
    sidebarEmail.textContent     = email;
    if (sidebarEmailMenu) sidebarEmailMenu.textContent = email;

    // ── Modal perfil (móvil) ──────────────────
    document.getElementById('profile-photo').src = photo;
    document.getElementById('profile-name').textContent  = name;
    document.getElementById('profile-email').textContent = email;

    // ── Nav foto móvil ────────────────────────
    const mobileNavPhoto = document.getElementById('mobile-nav-photo');
    const mobileNavIcon  = document.getElementById('mobile-nav-icon');
   if (photo) {
        mobileNavPhoto.src = photo;
        mobileNavPhoto.classList.remove('hidden');
        if (mobileNavIcon) mobileNavIcon.classList.add('hidden');
    }

    // ── Botones exclusivos de admin ────────────────────
    // DESPUÉS
const btnAddWrapper    = document.getElementById('btn-add-wrapper');
const btnAddDesktop    = document.getElementById('btn-add-desktop');
const btnAddDesktopFab = document.getElementById('btn-add-desktop-fab');
if (isAdmin) {
    // btn-add-desktop del sidebar se mantiene oculto; el FAB flotante lo reemplaza
} else {
    if (btnAddWrapper)    btnAddWrapper.classList.add('hidden');
    if (btnAddDesktop)    btnAddDesktop.classList.add('hidden');
    if (btnAddDesktopFab) btnAddDesktopFab.classList.add('hidden');
}
    // ───────────────────────────────────────────────────

    // Cargar datos de Firebase
    loadDocumentsFromFirebase();
    loadWorksFromFirebase();
    loadTeachersFromFirebase();
}

function clearUserUI() {
    // Limpiar sidebar
    document.getElementById('sidebar-name').textContent  = 'Usuario';
    document.getElementById('sidebar-email').textContent = '';
    document.getElementById('sidebar-photo').src = '';

    // Limpiar nav móvil
    const mobileNavPhoto = document.getElementById('mobile-nav-photo');
    const mobileNavIcon  = document.getElementById('mobile-nav-icon');
    mobileNavPhoto.classList.add('hidden');
    if (mobileNavIcon) mobileNavIcon.classList.remove('hidden');
}

// ══════════════════════════════════════════════════════
// 7. SHOW / HIDE LOGIN OVERLAY
// ══════════════════════════════════════════════════════
function showLoginOverlay() {
    const overlay = document.getElementById('login-overlay');
    overlay.classList.remove('hidden');

    // Resetear botón de login
    const btn     = document.getElementById('google-signin-btn');
    const loading = document.getElementById('login-loading');
    btn.disabled  = false;
    btn.classList.remove('opacity-60', 'cursor-not-allowed');
    loading.classList.add('hidden');

    lucide.createIcons();
}

function hideLoginOverlay() {
    const overlay = document.getElementById('login-overlay');
    // Fade out suave
    overlay.style.opacity    = '0';
    overlay.style.pointerEvents = 'none';
    setTimeout(() => {
        overlay.classList.add('hidden');
        overlay.style.opacity    = '';
        overlay.style.pointerEvents = '';
    }, 400);
}

// ══════════════════════════════════════════════════════
// 8. MODAL PERFIL MÓVIL
// ══════════════════════════════════════════════════════
function openProfileModal() {
    if (!currentUser) return;
    document.getElementById('profile-modal').classList.remove('hidden');
    document.body.classList.add('overflow-hidden');
    lucide.createIcons();
}

function closeProfileModal() {
    document.getElementById('profile-modal').classList.add('hidden');
    document.body.classList.remove('overflow-hidden');
}

// ══════════════════════════════════════════════════════
// 9. MENÚ PERFIL DESKTOP (dropdown)
// ══════════════════════════════════════════════════════
function toggleDesktopProfileMenu() {
    const menu = document.getElementById('desktop-profile-menu');
    desktopMenuOpen = !desktopMenuOpen;
    menu.classList.toggle('hidden', !desktopMenuOpen);
    lucide.createIcons();
}

function closeDesktopProfileMenu() {
    const menu = document.getElementById('desktop-profile-menu');
    menu.classList.add('hidden');
    desktopMenuOpen = false;
}

// Cerrar dropdown al hacer click fuera
document.addEventListener('click', (e) => {
    const sidebar = document.getElementById('sidebar');
    const menu    = document.getElementById('desktop-profile-menu');
    if (desktopMenuOpen && sidebar && !sidebar.contains(e.target)) {
        closeDesktopProfileMenu();
    }
});

// ══════════════════════════════════════════════════════
// 10. SIDEBAR TOGGLE (desktop)
// ══════════════════════════════════════════════════════
function toggleSidebar() {
    const sidebar     = document.getElementById('sidebar');
    const logoText    = document.getElementById('logo-text');
    const userInfo    = document.getElementById('user-info');
    const toggleIcon  = document.getElementById('toggle-icon');
    const labels      = document.querySelectorAll('.sidebar-transition span');

    if (sidebarOpen) {
        sidebar.classList.replace('w-64', 'w-20');
        logoText.classList.add('hidden');
        userInfo.classList.add('hidden');
        toggleIcon.style.transform = 'rotate(180deg)';
        labels.forEach(l => l.classList.add('hidden'));
    } else {
        sidebar.classList.replace('w-20', 'w-64');
        logoText.classList.remove('hidden');
        userInfo.classList.remove('hidden');
        toggleIcon.style.transform = 'rotate(0deg)';
        labels.forEach(l => l.classList.remove('hidden'));
    }
    sidebarOpen = !sidebarOpen;
    closeDesktopProfileMenu();
}

// ══════════════════════════════════════════════════════
// 11. SECCIONES DE NAVEGACIÓN (CAMBIO 7)
// ══════════════════════════════════════════════════════
function showSection(section) {
    currentSection = section;
    const secDocs     = document.getElementById('section-docs');
    const secWorks    = document.getElementById('section-works');
    const secTeachers = document.getElementById('section-teachers');
    const btnDocsD    = document.getElementById('btn-docs-desktop');
    const btnWorksD   = document.getElementById('btn-works-desktop');
    const btnTeachersD= document.getElementById('btn-teachers-desktop');
    const btnDocsM    = document.getElementById('btn-docs-mobile');
    const btnWorksM   = document.getElementById('btn-works-mobile');
    const btnTeachersM= document.getElementById('btn-teachers-mobile');
    const mobileSearch  = document.getElementById('mobile-search-btn');
    const mobileHistory = document.getElementById('mobile-history-btn');
    const desktopHistory= document.getElementById('desktop-history-btn');

    // Ocultar todas las secciones
    secDocs.classList.add('hidden');
    secWorks.classList.add('hidden');
    if (secTeachers) secTeachers.classList.add('hidden');

    // Quitar active de todos los botones nav desktop
    [btnDocsD, btnWorksD, btnTeachersD].forEach(b => b && b.classList.remove('active-nav'));

    // Quitar color activo de todos los botones nav móvil
    [btnDocsM, btnWorksM, btnTeachersM].forEach(b => {
        if (b) { b.classList.remove('text-blue-600'); b.classList.add('text-gray-400'); }
    });

    // DESPUÉS
const fabWrapper = document.getElementById('btn-add-wrapper');
const fabDesktop = document.getElementById('btn-add-desktop-fab');

if (section === 'docs') {
    secDocs.classList.remove('hidden');
    btnDocsD && btnDocsD.classList.add('active-nav');
    btnDocsM && btnDocsM.classList.replace('text-gray-400', 'text-blue-600');
    mobileSearch.classList.remove('hidden');
    mobileHistory.classList.add('hidden');
    desktopHistory.classList.add('hidden');
    // En Docs: FAB oculto hasta que se seleccione un área específica
   if (fabWrapper) fabWrapper.classList.add('hidden');
    if (fabDesktop) { fabDesktop.classList.add('hidden'); fabDesktop.style.display = ''; }
    // En móvil: abrir panel de áreas automáticamente
    if (window.innerWidth < 768) openAreasPanel();

} else if (section === 'works') {
    secWorks.classList.remove('hidden');
    btnWorksD && btnWorksD.classList.add('active-nav');
    btnWorksM && btnWorksM.classList.replace('text-gray-400', 'text-blue-600');
    mobileSearch.classList.add('hidden');
    mobileHistory.classList.remove('hidden');
    desktopHistory.classList.remove('hidden');
    // En Works: FAB siempre visible para admin
    if (isAdmin) {
        if (fabWrapper) fabWrapper.classList.remove('hidden');
        if (fabDesktop) { fabDesktop.classList.remove('hidden'); fabDesktop.style.display = 'flex'; }
    }

} else if (section === 'teachers') {
    if (secTeachers) secTeachers.classList.remove('hidden');
    btnTeachersD && btnTeachersD.classList.add('active-nav');
    btnTeachersM && btnTeachersM.classList.replace('text-gray-400', 'text-blue-600');
    mobileSearch.classList.add('hidden');
    mobileHistory.classList.add('hidden');
    desktopHistory.classList.add('hidden');
    // En Teachers: FAB siempre visible para admin
    if (isAdmin) {
        if (fabWrapper) fabWrapper.classList.remove('hidden');
        if (fabDesktop) { fabDesktop.classList.remove('hidden'); fabDesktop.style.display = 'flex'; }
    }
}
}

// ══════════════════════════════════════════════════════
// 12. ÁREAS (filtros)
// ══════════════════════════════════════════════════════
function initAreasBar() {
    const isMobile = window.innerWidth < 768;
    const extras   = Array.from(document.querySelectorAll('.area-extra'));
    const moreBtn  = document.getElementById('areas-more-btn');
    const todosBtn = document.querySelector('[data-area="todos"]');

    // El botón ícono NUNCA se oculta, ni en móvil ni en laptop
    moreBtn.classList.remove('hidden');

    if (isMobile) {
        if (todosBtn) todosBtn.classList.add('hidden');
        extras.forEach(btn => btn.classList.remove('hidden'));
    } else {
        if (todosBtn) todosBtn.classList.remove('hidden');
        const limit = 2;
        extras.forEach((btn, i) => {
            if (i < limit) btn.classList.remove('hidden');
            else btn.classList.add('hidden');
        });
    }
}
// CAMBIO 16 — selectArea() con apertura de modal pre-relleno para admin
function selectArea(btn) {
    document.querySelectorAll('.area-btn').forEach(b => {
        b.classList.remove('bg-blue-600', 'text-white', 'shadow-md', 'shadow-blue-100');
        b.classList.add('bg-white', 'text-gray-600', 'border', 'border-gray-200');
    });
    btn.classList.add('bg-blue-600', 'text-white', 'shadow-md', 'shadow-blue-100');
    btn.classList.remove('bg-white', 'text-gray-600', 'border', 'border-gray-200');

    // Si venía del panel "Más" (estaba oculto), moverlo al PRIMER slot de la barra
    if (btn.classList.contains('area-extra') && btn.classList.contains('hidden')) {
        const bar      = document.getElementById('areas-bar');
        const todosBtn = bar.querySelector('[data-area="todos"]');
        btn.classList.remove('hidden');
        bar.insertBefore(btn, todosBtn.nextSibling); // ← ocupa el primer slot
    }

    
  // En móvil: mostrar "Más" permanentemente una vez que el usuario selecciona un área
    closeAreasPanel();
    initAreasBar();

    if (window.innerWidth < 768) {
        const moreBtnMobile = document.getElementById('areas-more-btn');
        if (moreBtnMobile) moreBtnMobile.classList.remove('hidden');
    }

    // Actualizar contexto del área seleccionada para que el FAB lo use

    // Actualizar contexto del área seleccionada para que el FAB lo use
    if (btn.dataset.area === 'todos' || !btn.dataset.cursoReal) {
        selectedAreaCurso   = null;
        selectedAreaDocente = null;
    } else {
        selectedAreaCurso = btn.dataset.cursoReal;
        db.ref('teachers').once('value', snap => {
            const data = snap.val() || {};
            selectedAreaDocente = '';
            Object.values(data).forEach(t => {
                if (t.cursos && Object.values(t.cursos).includes(selectedAreaCurso)) {
                    selectedAreaDocente = t.nombre;
                }
            });
        });
    }

    // ✅ NUEVO — mostrar/ocultar FAB según área seleccionada
    if (isAdmin && currentSection === 'docs') {
        const fabWrapper = document.getElementById('btn-add-wrapper');
        const fabDesktop = document.getElementById('btn-add-desktop-fab');
        if (btn.dataset.area === 'todos' || !btn.dataset.cursoReal) {
            if (fabWrapper) fabWrapper.classList.add('hidden');
            if (fabDesktop) { fabDesktop.classList.add('hidden'); fabDesktop.style.display = ''; }
        } else {
            if (fabWrapper) fabWrapper.classList.remove('hidden');
            if (fabDesktop) { fabDesktop.classList.remove('hidden'); fabDesktop.style.display = 'flex'; }
        }
    }
}                         
function openAreasPanel() {
    const list = document.getElementById('areas-panel-list');
    list.innerHTML = '';
    document.querySelectorAll('.area-btn').forEach(btn => {
    if (window.innerWidth < 768 && btn.dataset.area === 'todos') return;
    const clone = document.createElement('button');
        const isActive = btn.classList.contains('bg-blue-600');
        clone.className = isActive
            ? 'px-5 py-2 bg-blue-600 text-white rounded-full text-sm font-medium shadow-md shadow-blue-100'
            : 'px-5 py-2 bg-white text-gray-600 border border-gray-200 rounded-full text-sm font-medium';
        clone.textContent = btn.textContent.trim();
        clone.addEventListener('click', () => { selectArea(btn); closeAreasPanel(); });
        list.appendChild(clone);
    });
    document.getElementById('areas-panel').classList.remove('hidden');
    document.body.classList.add('overflow-hidden');
    lucide.createIcons();
}

function closeAreasPanel() {
    document.getElementById('areas-panel').classList.add('hidden');
    document.body.classList.remove('overflow-hidden');
}

// ══════════════════════════════════════════════════════
// 13. DOCUMENTO — expandir título en móvil
// ══════════════════════════════════════════════════════
function toggleDocTitle() {
    const title = document.getElementById('doc-title-mobile');
    if (!title.classList.contains('truncate')) {
        title.classList.add('truncate');
        title.classList.remove('whitespace-normal', 'break-words');
    } else {
        title.classList.remove('truncate');
        title.classList.add('whitespace-normal', 'break-words');
    }
}

// ══════════════════════════════════════════════════════
// 14. LÓGICA "CUMPLIDO" + EFECTO SUCCIÓN
// ══════════════════════════════════════════════════════
function markCompleted(workId, workName) {
    pendingWorkId = workId;
    document.getElementById('confirm-work-name').innerText = workName;
    document.getElementById('confirm-modal').classList.remove('hidden');
    document.body.classList.add('overflow-hidden');
}

function cancelCompleted() {
    pendingWorkId = null;
    document.getElementById('confirm-modal').classList.add('hidden');
    document.body.classList.remove('overflow-hidden');
}

function confirmCompleted() {
    if (!pendingWorkId) return;
    const card     = document.getElementById(pendingWorkId);
    const workName = document.getElementById('confirm-work-name').innerText;
    const date     = new Date().toLocaleDateString('es-PE', { day: 'numeric', month: 'long', year: 'numeric' });

    completedWorks.push({ name: workName, date });

    document.getElementById('confirm-modal').classList.add('hidden');
    document.body.classList.remove('overflow-hidden');

    // Efecto succión
    const isMobile  = window.innerWidth < 768;
    const targetBtn = isMobile
        ? document.getElementById('mobile-history-btn')
        : document.getElementById('desktop-history-btn');

    const cardRect   = card.getBoundingClientRect();
    const targetRect = targetBtn.getBoundingClientRect();
    const cx   = cardRect.left + cardRect.width  / 2;
    const cy   = cardRect.top  + cardRect.height / 2;
    const size = Math.max(cardRect.width, cardRect.height);

    const circle = document.createElement('div');
    circle.style.cssText = `
        position: fixed;
        left: ${cx}px; top: ${cy}px;
        width: ${size}px; height: ${size}px;
        background: linear-gradient(135deg, #4f46e5, #2563eb);
        border-radius: 50%;
        transform: translate(-50%, -50%) scale(1);
        z-index: 9999;
        pointer-events: none;
        opacity: 0.85;
        transition:
            left 0.65s cubic-bezier(0.4,0,0.2,1),
            top  0.65s cubic-bezier(0.4,0,0.2,1),
            width  0.65s cubic-bezier(0.4,0,0.2,1),
            height 0.65s cubic-bezier(0.4,0,0.2,1),
            opacity 0.55s ease;
    `;
    document.body.appendChild(circle);
    card.style.visibility = 'hidden';

    requestAnimationFrame(() => requestAnimationFrame(() => {
        const tx = targetRect.left + targetRect.width  / 2;
        const ty = targetRect.top  + targetRect.height / 2;
        circle.style.left    = `${tx}px`;
        circle.style.top     = `${ty}px`;
        circle.style.width   = '16px';
        circle.style.height  = '16px';
        circle.style.opacity = '0';

        setTimeout(() => {
            circle.remove();
            card.remove();
            targetBtn.style.transition = 'transform 0.15s ease, background-color 0.15s ease';
            targetBtn.style.transform  = 'scale(1.45)';
            targetBtn.style.backgroundColor = '#dbeafe';
            setTimeout(() => {
                targetBtn.style.transform = 'scale(1)';
                targetBtn.style.backgroundColor = '';
            }, 180);
        }, 680);
    }));

    pendingWorkId = null;
}

// ══════════════════════════════════════════════════════
// 15. HISTORIAL DE TRABAJOS TERMINADOS
// ══════════════════════════════════════════════════════
function openHistory() {
    const list = document.getElementById('history-list');
    list.innerHTML = '';

    if (completedWorks.length === 0) {
        list.innerHTML = '<p class="text-center text-gray-400 text-sm py-8">No hay trabajos terminados aún.</p>';
    } else {
        completedWorks.forEach(work => {
            const item = document.createElement('div');
            item.className = 'flex items-center gap-4 p-4 bg-gray-50 rounded-2xl';
            item.innerHTML = `
                <div class="w-9 h-9 bg-green-100 rounded-xl flex items-center justify-center shrink-0">
                    <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 text-green-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="20 6 9 17 4 12"/>
                    </svg>
                </div>
                <div class="flex-1 min-w-0">
                    <p class="text-sm font-semibold text-gray-900 truncate">${work.name}</p>
                    <p class="text-xs text-gray-400 mt-0.5">Finalizado el ${work.date}</p>
                </div>
                <span class="text-[10px] font-bold px-2 py-0.5 bg-green-100 text-green-700 rounded-full uppercase shrink-0">Cumplido</span>
            `;
            list.appendChild(item);
        });
    }

    document.getElementById('history-modal').classList.remove('hidden');
    document.body.classList.add('overflow-hidden');
    lucide.createIcons();
}

function closeHistory() {
    document.getElementById('history-modal').classList.add('hidden');
    document.body.classList.remove('overflow-hidden');
}

// ══════════════════════════════════════════════════════
// 16. MODAL DETALLES DE TRABAJO
// ══════════════════════════════════════════════════════
function openModal(title, docente, area, date, desc) {
    document.getElementById('modal-title').innerText       = title;
    document.getElementById('modal-docente').innerText     = docente;
    document.getElementById('modal-area').innerText        = area;
    document.getElementById('modal-date').innerText        = date;
    document.getElementById('modal-description').innerText = desc;
    document.getElementById('detail-modal').classList.remove('hidden');
    document.body.classList.add('overflow-hidden');
}

function closeModal() {
    document.getElementById('detail-modal').classList.add('hidden');
    document.body.classList.remove('overflow-hidden');
}

// ══════════════════════════════════════════════════════
// 17. INICIALIZACIÓN
// ══════════════════════════════════════════════════════
window.addEventListener('DOMContentLoaded', () => {
    lucide.createIcons();
    initAreasBar();
});

window.addEventListener('resize', initAreasBar);

// ══════════════════════════════════════════════════════
// 18. BOTÓN + ADMIN — abre panel según sección activa
// ══════════════════════════════════════════════════════
function openAddPanel() {
    if (!isAdmin) return;

    if (currentSection === 'docs') {
        // Si hay un área/curso seleccionado, abrir con contexto pre-relleno
        if (selectedAreaCurso && selectedAreaDocente) {
            openAddCourseModal(selectedAreaCurso, selectedAreaDocente);
        } else {
            openDocOptionsModal();
        }
    } else if (currentSection === 'works') {
        openAddWorkModal();
    } else if (currentSection === 'teachers') {
        openAddTeacherModal();
    }
}

// ── Modal de opciones en Documentos ──
function openDocOptionsModal() {
    document.getElementById('doc-options-modal').classList.remove('hidden');
    document.body.classList.add('overflow-hidden');
    lucide.createIcons();
}
function closeDocOptionsModal() {
    document.getElementById('doc-options-modal').classList.add('hidden');
    document.body.classList.remove('overflow-hidden');
}

// ══════════════════════════════════════════════════════
// 19. MODAL AGREGAR CURSO/DOCUMENTO (CAMBIO 10)
// ══════════════════════════════════════════════════════
// cursoNombre y docenteNombre son opcionales (cuando se viene desde un área)
function openAddCourseModal(cursoNombre = null, docenteNombre = null) {
    closeDocOptionsModal();

    const contextInfo   = document.getElementById('course-context-info');
    const manualFields  = document.getElementById('course-manual-fields');
    const ctxCurso      = document.getElementById('course-context-curso');
    const ctxDocente    = document.getElementById('course-context-docente');

    if (cursoNombre && docenteNombre) {
        // Vino desde un botón de área: mostrar etiquetas, ocultar inputs
        ctxCurso.textContent   = cursoNombre;
        ctxDocente.textContent = docenteNombre;
        contextInfo.classList.remove('hidden');
        manualFields.classList.add('hidden');
    } else {
        // Sin contexto: mostrar campos manuales
        contextInfo.classList.add('hidden');
        manualFields.classList.remove('hidden');
    }

    document.getElementById('add-course-modal').classList.remove('hidden');
    document.body.classList.add('overflow-hidden');
    lucide.createIcons();
}

function closeAddCourseModal() {
    document.getElementById('add-course-modal').classList.add('hidden');
    document.body.classList.remove('overflow-hidden');
    document.getElementById('course-form').reset();
    document.getElementById('course-error').classList.add('hidden');
}

// ══════════════════════════════════════════════════════
// 20. GUARDAR NUEVO CURSO/DOCUMENTO (CAMBIO 11)
// ══════════════════════════════════════════════════════
// DESPUÉS
async function saveNewCourse() {
    const titulo     = document.getElementById('course-titulo').value.trim();
    const fileEl     = document.getElementById('course-archivo');
    const errorEl    = document.getElementById('course-error');
    const btnGuardar = document.querySelector('#add-course-modal button[onclick="saveNewCourse()"]');
    const isContext  = !document.getElementById('course-context-info').classList.contains('hidden');

    const curso   = isContext
        ? document.getElementById('course-context-curso').textContent.trim()
        : document.getElementById('course-curso').value.trim();
    const docente = isContext
        ? document.getElementById('course-context-docente').textContent.trim()
        : document.getElementById('course-docente').value.trim();

    if (!titulo || !curso || !docente) {
        errorEl.textContent = '⚠️ Completa todos los campos obligatorios';
        errorEl.classList.remove('hidden');
        return;
    }

    const archivo = fileEl.files[0];
    let archivoURL    = '';
    let archivoNombre = '';

    if (btnGuardar) {
        btnGuardar.disabled = true;
        btnGuardar.textContent = '⏳ Subiendo archivo...';
    }

    try {
        if (archivo) {
            archivoNombre = archivo.name;
            const formData = new FormData();
            formData.append('file', archivo);
            formData.append('upload_preset', CLOUDINARY_PRESET);
            formData.append('folder', 'nexusrepo');

            const res  = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD}/auto/upload`, {
                method: 'POST',
                body: formData
            });
            const data = await res.json();
            if (!data.secure_url) throw new Error('Error en Cloudinary');
            archivoURL = data.secure_url;
        }

        await db.ref('documents').push({
            titulo,
            curso,
            docente,
            archivoNombre,
            archivoURL,
            createdAt: firebase.database.ServerValue.TIMESTAMP
        });
        closeAddCourseModal();
        showAdminToast('✓', 'Documento guardado correctamente');

    } catch (err) {
        console.error(err);
        errorEl.textContent = '⚠️ Error al guardar. Intenta de nuevo.';
        errorEl.classList.remove('hidden');
    } finally {
        if (btnGuardar) {
            btnGuardar.disabled = false;
            btnGuardar.textContent = 'Guardar Documento';
        }
    }
}

// ══════════════════════════════════════════════════════
// 21. MODAL AGREGAR TRABAJO (CAMBIO 13)
// ══════════════════════════════════════════════════════
function openAddWorkModal() {
    document.getElementById('add-work-modal').classList.remove('hidden');
    document.body.classList.add('overflow-hidden');
    // Resetear el select de cursos
    document.getElementById('work-curso-container').classList.add('hidden');
    document.getElementById('work-curso').innerHTML = '<option value="">-- Selecciona un curso --</option>';
    // Poblar docentes desde Firebase
    populateTeacherDropdown();
    lucide.createIcons();
}

function closeAddWorkModal() {
    document.getElementById('add-work-modal').classList.add('hidden');
    document.body.classList.remove('overflow-hidden');
    document.getElementById('work-form').reset();
    document.getElementById('work-error').classList.add('hidden');
}

// ══════════════════════════════════════════════════════
// 22. GUARDAR NUEVO TRABAJO (CAMBIO 14)
// ══════════════════════════════════════════════════════
async function saveNewWork() {
    const titulo      = document.getElementById('work-titulo').value.trim();
    const docenteSel  = document.getElementById('work-docente');
    const cursoSel    = document.getElementById('work-curso');
    const culminacion = document.getElementById('work-culminacion').value.trim();
    const descripcion = document.getElementById('work-descripcion').value.trim();
    const errorEl     = document.getElementById('work-error');

    const docenteId   = docenteSel.value;
    const docenteNom  = docenteSel.options[docenteSel.selectedIndex]?.text || '';
    const curso       = cursoSel.value.trim();

    if (!titulo || !docenteId || !curso || !culminacion) {
        errorEl.textContent = '⚠️ Completa todos los campos obligatorios';
        errorEl.classList.remove('hidden');
        return;
    }

    try {
        await db.ref('works').push({
            titulo,
            docente:    docenteNom,
            docenteId,
            curso,
            culminacion,
            descripcion: descripcion || '',
            estado:      'pendiente',
            createdAt:   firebase.database.ServerValue.TIMESTAMP
        });
        closeAddWorkModal();
        showAdminToast('✓', 'Trabajo agregado correctamente');
    } catch (err) {
        console.error(err);
        errorEl.textContent = '⚠️ Error al guardar.';
        errorEl.classList.remove('hidden');
    }
}

// ══════════════════════════════════════════════════════
// 23. CARGAR DOCUMENTOS DESDE FIREBASE
// ══════════════════════════════════════════════════════
function loadDocumentsFromFirebase() {
    db.ref('documents').on('value', snap => {
        const list = document.getElementById('docs-list');
        if (!list) return;
        const data = snap.val();
        if (!data) {
            list.innerHTML = `<p class="text-center text-gray-400 text-sm py-10">No hay documentos subidos aún.</p>`;
            return;
        }
        list.innerHTML = Object.entries(data).map(([id, doc]) => `
    <div class="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all group flex flex-col overflow-hidden">
        <div class="p-5 flex items-start gap-4 flex-1">
            <div class="w-12 h-12 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center shrink-0 mt-0.5">
                <i data-lucide="file-text" class="w-6 h-6"></i>
            </div>
            <div class="min-w-0 flex-1">
                <h3 class="font-semibold text-gray-900 group-hover:text-blue-600 transition-colors leading-snug">${doc.titulo}</h3>
                <p class="text-xs text-blue-600 font-medium mt-1.5">${doc.curso}</p>
                <p class="text-xs text-gray-400 mt-0.5">${doc.docente}</p>
            </div>
        </div>
        <div class="border-t border-gray-100 px-5 py-3 flex items-center gap-2">
            <button onclick="viewDocument('${doc.archivoURL}', '${doc.titulo}')" title="Ver archivo"
    class="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-semibold text-gray-500 hover:text-orange-700 hover:bg-orange-50 rounded-xl transition-all">
    <i data-lucide="eye" class="w-4 h-4"></i><span class="hidden md:inline"> Ver</span>
</button>
<div class="w-px h-5 bg-gray-100"></div>
<button onclick="downloadDocument('${doc.archivoURL}', '${doc.archivoNombre || doc.titulo}')" title="Descargar"
    class="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-semibold text-gray-500 hover:text-green-600 hover:bg-green-50 rounded-xl transition-all">
    <i data-lucide="download" class="w-4 h-4"></i><span class="hidden md:inline"> Descargar</span>
</button>
${isAdmin ? `<div class="w-px h-5 bg-gray-100"></div>
<button onclick="deleteDoc('${id}')" title="Eliminar"
    class="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-semibold text-red-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all">
    <i data-lucide="trash-2" class="w-4 h-4"></i><span class="hidden md:inline"> Eliminar</span>
</button>` : ''}
        </div>
    </div>`).join('');
        lucide.createIcons();
    });
}

function deleteDoc(id) {
    if (!isAdmin) return;
    db.ref(`documents/${id}`).remove();
    showAdminToast('🗑️', 'Documento eliminado');
}

// DESPUÉS
// Abrir visor con Google Docs Viewer dentro de un modal
function viewDocument(url, titulo) {
    if (!url) {
        showAdminToast('⚠️', 'Este documento no tiene archivo disponible aún');
        return;
    }
    const viewerURL = `https://docs.google.com/viewer?url=${encodeURIComponent(url)}&embedded=true`;
    document.getElementById('doc-viewer-iframe').src = viewerURL;
    document.getElementById('doc-viewer-title').textContent = titulo || 'Documento';
    document.getElementById('doc-viewer-modal').classList.remove('hidden');
    lucide.createIcons();
}

function closeDocViewer() {
    document.getElementById('doc-viewer-modal').classList.add('hidden');
    document.getElementById('doc-viewer-iframe').src = '';
}

// Descargar con nombre correcto usando fetch + blob
async function downloadDocument(url, nombre) {
    if (!url) {
        showAdminToast('⚠️', 'Este documento no tiene archivo disponible aún');
        return;
    }
    try {
        showAdminToast('⏳', 'Preparando descarga...');
        const res  = await fetch(url);
        const blob = await res.blob();
        const a    = document.createElement('a');
        a.href     = URL.createObjectURL(blob);
        a.download = nombre || 'documento';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(a.href);
    } catch (err) {
        console.error(err);
        showAdminToast('⚠️', 'Error al descargar. Intenta de nuevo.');
    }
}
// ══════════════════════════════════════════════════════
// 24. CARGAR TRABAJOS DESDE FIREBASE
// ══════════════════════════════════════════════════════
function loadWorksFromFirebase() {
    db.ref('works').on('value', snap => {
        const list = document.getElementById('works-list');
        if (!list) return;
        const data = snap.val();
        if (!data) {
            list.innerHTML = `<p class="text-center text-gray-400 text-sm py-10 col-span-2">No hay trabajos registrados aún.</p>`;
            return;
        }
        list.innerHTML = Object.entries(data).map(([id, w]) => `
            <div id="work-${id}" class="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden flex flex-col h-full hover:shadow-lg transition-shadow">
                <div class="h-28 p-6 flex flex-col justify-center gap-2" style="background: linear-gradient(135deg, #8547AA, #33265C);">
                    <h3 class="text-xl font-bold text-white leading-tight">${w.titulo}</h3>
                    <span class="text-[10px] font-bold px-2.5 py-0.5 bg-orange-400 text-white rounded-full uppercase tracking-wider w-fit">${w.estado || 'Pendiente'}</span>
                </div>
                <div class="p-6 flex-1 flex flex-col justify-between">
                    <div class="space-y-4">
                        <div class="flex items-center gap-3">
                            <div class="w-8 h-8 rounded-lg flex items-center justify-center" style="background:#AEE8FC20; color:#8547AA;">
                                <i data-lucide="user" class="w-4 h-4"></i>
                            </div>
                            <div>
                                <p class="text-[10px] text-gray-400 font-bold uppercase">Docente</p>
                                <p class="text-sm font-semibold text-gray-700">${w.docente}</p>
                            </div>
                        </div>
                        <div class="flex items-center gap-3">
                            <div class="w-8 h-8 rounded-lg bg-orange-50 flex items-center justify-center text-orange-500">
                                <i data-lucide="calendar" class="w-4 h-4"></i>
                            </div>
                            <div>
                                <p class="text-[10px] text-gray-400 font-bold uppercase">Culminación</p>
                                <p class="text-sm font-semibold text-gray-700">${w.culminacion}</p>
                            </div>
                        </div>
                    </div>
                    <div class="mt-6 flex gap-2">
                        <button onclick="openModal('${w.titulo}','${w.docente}','','${w.culminacion}','${(w.descripcion||'').replace(/'/g,'')}')"
                            class="flex-1 py-3.5 bg-gray-900 text-white rounded-2xl text-sm font-bold hover:bg-blue-600 transition-all active:scale-95">
                            Ver Detalles
                        </button>
                        ${isAdmin
                            ? `<button onclick="deleteWork('${id}')" class="py-3.5 px-4 bg-red-50 text-red-500 rounded-2xl text-sm font-bold hover:bg-red-100 transition-all">🗑️</button>`
                            : `<button onclick="markCompleted('work-${id}','${w.titulo}')" class="flex-1 py-3.5 bg-green-600 text-white rounded-2xl text-sm font-bold hover:bg-green-700 transition-all active:scale-95">Cumplido</button>`
                        }
                    </div>
                </div>
            </div>`).join('');
        lucide.createIcons();
    });
}

function deleteWork(id) {
    if (!isAdmin) return;
    db.ref(`works/${id}`).remove();
    showAdminToast('🗑️', 'Trabajo eliminado');
}

// ══════════════════════════════════════════════════════
// 25. CARGAR DOCENTES DESDE FIREBASE (CAMBIO 8)
// ══════════════════════════════════════════════════════
function loadTeachersFromFirebase() {
    db.ref('teachers').on('value', snap => {
        const list = document.getElementById('teachers-list');
        if (!list) return;
        const data = snap.val();
        if (!data) {
            list.innerHTML = `<p class="text-center text-gray-400 text-sm py-10 col-span-2">No hay docentes registrados aún.</p>`;
            loadAreasBar({});
            return;
        }
        list.innerHTML = Object.entries(data).map(([id, t]) => {
            const cursos = t.cursos ? Object.values(t.cursos) : [];
            const cursosJSON = JSON.stringify(cursos).replace(/"/g, '&quot;');
return `
<div class="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden hover:shadow-lg transition-shadow p-6 flex flex-col gap-4">
    <div class="flex items-center gap-4">
       <div class="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0" style="background: linear-gradient(135deg, #A47ADE, #8547AA);">
            <i data-lucide="user" class="w-6 h-6 text-white"></i>
        </div>
        <div class="flex-1 min-w-0">
            <h3 class="font-bold text-gray-900 text-base truncate">${t.nombre}</h3>
            <p class="text-xs text-gray-400 mt-0.5">${cursos.length} curso${cursos.length !== 1 ? 's' : ''}</p>
        </div>
        ${isAdmin ? `
        <button onclick="openEditTeacherModal('${id}', '${t.nombre.replace(/'/g, "\\'")}', ${cursosJSON})"
            class="p-2 bg-blue-50 text-blue-400 hover:text-blue-600 rounded-xl transition-all">
            <i data-lucide="pencil" class="w-4 h-4"></i>
        </button>
        <button onclick="deleteTeacher('${id}')" class="p-2 bg-red-50 text-red-400 hover:text-red-600 rounded-xl transition-all">
            <i data-lucide="trash-2" class="w-4 h-4"></i>
        </button>` : ''}
    </div>
    <div class="flex flex-wrap gap-2">
        ${cursos.map(c => `
            <span class="px-3 py-1 bg-blue-50 text-blue-600 text-xs font-semibold rounded-full">${c}</span>
        `).join('')}
    </div>
</div>`;
        }).join('');
        lucide.createIcons();
        loadAreasBar(data);
    });
}

// ── Construir barra de áreas dinámicamente desde los cursos de docentes ──
function loadAreasBar(teachersData) {
    const bar = document.getElementById('areas-bar');
    if (!bar) return;

    // Guardar el botón "Todos" y "Más..."
    const todosBtn   = bar.querySelector('[data-area="todos"]');
    const moreBtn    = document.getElementById('areas-more-btn');

    // Eliminar botones de áreas anteriores (no "Todos" ni "Más...")
    bar.querySelectorAll('.area-extra').forEach(b => b.remove());

    // Recolectar todos los cursos únicos
    const cursos = new Set();
    Object.values(teachersData).forEach(t => {
        if (t.cursos) Object.values(t.cursos).forEach(c => cursos.add(c));
    });

    // Insertar antes del botón "Más..."
    cursos.forEach(curso => {
        const btn = document.createElement('button');
        btn.dataset.area = curso.toLowerCase().replace(/\s+/g, '-');
        btn.dataset.cursoReal = curso;
        btn.onclick = () => selectArea(btn);
        btn.className = 'area-btn area-extra px-5 py-2 bg-white text-gray-600 border border-gray-200 rounded-full text-sm font-medium hover:bg-gray-50 transition-colors shrink-0';
        btn.textContent = curso;
        bar.appendChild(btn);
    });

    initAreasBar();
}

function deleteTeacher(id) {
    if (!isAdmin) return;
    db.ref(`teachers/${id}`).remove();
    showAdminToast('🗑️', 'Docente eliminado');
}

// ══════════════════════════════════════════════════════
// 26. MODAL AGREGAR DOCENTE (CAMBIO 9)
// ══════════════════════════════════════════════════════
function openAddTeacherModal() {
    document.getElementById('add-teacher-modal').classList.remove('hidden');
    document.body.classList.add('overflow-hidden');
    lucide.createIcons();
}

function closeAddTeacherModal() {
    document.getElementById('add-teacher-modal').classList.add('hidden');
    document.body.classList.remove('overflow-hidden');
    document.getElementById('teacher-form').reset();
    // Dejar solo un campo de curso
    const list = document.getElementById('teacher-courses-list');
    const inputs = list.querySelectorAll('.teacher-course-input');
    inputs.forEach((inp, i) => { if (i > 0) inp.remove(); });
    if (inputs[0]) inputs[0].value = '';
    document.getElementById('teacher-error').classList.add('hidden');
}

function addCourseField() {
    const list = document.getElementById('teacher-courses-list');
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'Ej: Matemáticas Avanzadas';
    input.className = 'teacher-course-input w-full px-4 py-3 rounded-2xl border-2 border-gray-200 focus:border-blue-400 focus:outline-none text-sm font-medium text-gray-800 transition-colors placeholder-gray-400';
    list.appendChild(input);
    input.focus();
}

async function saveNewTeacher() {
    const nombre  = document.getElementById('teacher-nombre').value.trim();
    const errorEl = document.getElementById('teacher-error');
    const inputs  = document.querySelectorAll('.teacher-course-input');
    const cursos  = Array.from(inputs).map(i => i.value.trim()).filter(v => v.length > 0);

    if (!nombre) {
        errorEl.textContent = '⚠️ Ingresa el nombre del docente';
        errorEl.classList.remove('hidden');
        return;
    }
    if (cursos.length === 0) {
        errorEl.textContent = '⚠️ Agrega al menos un curso';
        errorEl.classList.remove('hidden');
        return;
    }

    try {
        const cursosObj = {};
        cursos.forEach((c, i) => { cursosObj[`curso_${i}`] = c; });
        await db.ref('teachers').push({
            nombre,
            cursos: cursosObj,
            createdAt: firebase.database.ServerValue.TIMESTAMP
        });
        closeAddTeacherModal();
        showAdminToast('✓', 'Docente agregado correctamente');
    } catch (err) {
        console.error(err);
        errorEl.textContent = '⚠️ Error al guardar. Intenta de nuevo.';
        errorEl.classList.remove('hidden');
    }
}

// ══════════════════════════════════════════════════════
// 27. DROPDOWN DOCENTES Y CURSOS PARA TRABAJOS (CAMBIO 12)
// ══════════════════════════════════════════════════════
// ── Llenar el select de docentes en el modal de agregar trabajo ──
function populateTeacherDropdown() {
    db.ref('teachers').once('value', snap => {
        const select = document.getElementById('work-docente');
        if (!select) return;
        select.innerHTML = '<option value="">-- Selecciona un docente --</option>';
        const data = snap.val();
        if (!data) return;
        Object.entries(data).forEach(([id, t]) => {
            const opt = document.createElement('option');
            opt.value = id;
            opt.textContent = t.nombre;
            select.appendChild(opt);
        });
    });
}

// ── Al elegir docente, carga sus cursos en el segundo select ──
function loadCoursesForTeacher(teacherId) {
    const container = document.getElementById('work-curso-container');
    const select    = document.getElementById('work-curso');
    if (!teacherId) {
        container.classList.add('hidden');
        return;
    }
    db.ref(`teachers/${teacherId}/cursos`).once('value', snap => {
        const data = snap.val();
        select.innerHTML = '<option value="">-- Selecciona un curso --</option>';
        if (data) {
            Object.values(data).forEach(c => {
                const opt = document.createElement('option');
                opt.value = c;
                opt.textContent = c;
                select.appendChild(opt);
            });
        }
        container.classList.remove('hidden');
    });
}

// ══════════════════════════════════════════════════════
// 28. TOAST ADMIN
// ══════════════════════════════════════════════════════
function showAdminToast(icon, msg) {
    const t = document.createElement('div');
    t.className = 'fixed bottom-6 left-1/2 -translate-x-1/2 z-[200] flex items-center gap-3 px-5 py-3.5 bg-gray-900 text-white rounded-2xl shadow-xl text-sm font-bold';
    t.style.animation = 'fadeIn 0.3s ease both';
    t.innerHTML = `<span>${icon}</span><span>${msg}</span>`;
    document.body.appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; t.style.transition = '0.3s'; setTimeout(() => t.remove(), 300); }, 3000);
}

// ══════════════════════════════════════════════════════
// 29. EDITAR DOCENTE
// ══════════════════════════════════════════════════════
function openEditTeacherModal(id, nombre, cursos) {
    document.getElementById('edit-teacher-id').value = id;
    document.getElementById('edit-teacher-nombre').value = nombre;
    const list = document.getElementById('edit-teacher-courses-list');
    list.innerHTML = '';
    cursos.forEach(c => {
        const inp = document.createElement('input');
        inp.type = 'text';
        inp.value = c;
        inp.className = 'edit-teacher-course-input w-full px-4 py-3 rounded-2xl border-2 border-gray-200 focus:border-blue-400 focus:outline-none text-sm font-medium text-gray-800 transition-colors placeholder-gray-400';
        inp.placeholder = 'Ej: Ingeniería de Software';
        list.appendChild(inp);
    });
    document.getElementById('edit-teacher-error').classList.add('hidden');
    document.getElementById('edit-teacher-modal').classList.remove('hidden');
    document.body.classList.add('overflow-hidden');
    lucide.createIcons();
}

function closeEditTeacherModal() {
    document.getElementById('edit-teacher-modal').classList.add('hidden');
    document.body.classList.remove('overflow-hidden');
}

function addEditCourseField() {
    const list = document.getElementById('edit-teacher-courses-list');
    const inp = document.createElement('input');
    inp.type = 'text';
    inp.placeholder = 'Ej: Matemáticas Avanzadas';
    inp.className = 'edit-teacher-course-input w-full px-4 py-3 rounded-2xl border-2 border-gray-200 focus:border-blue-400 focus:outline-none text-sm font-medium text-gray-800 transition-colors placeholder-gray-400';
    list.appendChild(inp);
    inp.focus();
}

async function saveEditTeacher() {
    const id       = document.getElementById('edit-teacher-id').value;
    const nombre   = document.getElementById('edit-teacher-nombre').value.trim();
    const errorEl  = document.getElementById('edit-teacher-error');
    const inputs   = document.querySelectorAll('.edit-teacher-course-input');
    const cursos   = Array.from(inputs).map(i => i.value.trim()).filter(v => v.length > 0);

    if (!nombre) {
        errorEl.textContent = '⚠️ Ingresa el nombre del docente';
        errorEl.classList.remove('hidden');
        return;
    }
    if (cursos.length === 0) {
        errorEl.textContent = '⚠️ Agrega al menos un curso';
        errorEl.classList.remove('hidden');
        return;
    }

    try {
        const cursosObj = {};
        cursos.forEach((c, i) => { cursosObj[`curso_${i}`] = c; });
        await db.ref(`teachers/${id}`).update({ nombre, cursos: cursosObj });
        closeEditTeacherModal();
        showAdminToast('✓', 'Docente actualizado correctamente');
    } catch (err) {
        console.error(err);
        errorEl.textContent = '⚠️ Error al guardar. Intenta de nuevo.';
        errorEl.classList.remove('hidden');
    }
}
