// ============================================
// FACTO V2 - Complete Application Logic
// Focus & Action To Your Goals
// ============================================

// Firebase Configuration
const firebaseConfig = {
    apiKey: "AIzaSyDSQ1YkwbkWqK3CQxf_BbmIAdr5kg_cgiU",
    authDomain: "facto-app-f1fae.firebaseapp.com",
    projectId: "facto-app-f1fae",
    storageBucket: "facto-app-f1fae.firebasestorage.app",
    messagingSenderId: "576372391539",
    appId: "1:576372391539:web:e36d81ccacc0af84f07406"
};

// Initialize Firebase only if the script is loaded
let db;
if (typeof firebase !== 'undefined') {
    firebase.initializeApp(firebaseConfig);
    db = firebase.firestore();
}

// Default Categories
const DEFAULT_CATEGORIES = [
    { id: 'meta', name: 'Meta', icon: '🎯', color: '#667eea' },
    { id: 'proposito', name: 'Propósito', icon: '💫', color: '#764ba2' },
    { id: 'vision', name: 'Visión', icon: '🔥', color: '#f093fb' },
    { id: 'logro', name: 'Logro', icon: '✨', color: '#f5576c' },
    { id: 'deseo', name: 'Deseo', icon: '❤️', color: '#f59e0b' }
];

const app = {
    // V2 State
    data: {
        version: 2,
        user: null,

        // Categories
        categories: [...DEFAULT_CATEGORIES],
        customCategories: [],

        // Goals (multiple)
        goals: [],
        selectedGoalIdsForConcentration: [],

        // Timer Settings
        timerSettings: {
            progressionType: 'seconds', // 'minutes' | 'seconds'
            incrementAmount: 30,
            daysForLevelUp: 3
        },
        currentLevel: 1,
        concentrationStreak: 0,
        lastConcentrationDate: null,
        consecutiveDays: 0,

        // Actions
        actions: [],
        actionStreak: 0,
        lastActionDate: null,

        // UI State
        theme: 'light',
        reminderEnabled: false,
        reminderTime: '09:00',
        timerRunning: false,
        timerSeconds: 0,
        musicPlaying: false,

        // History
        history: []
    },

    // ============================================
    // INITIALIZATION
    // ============================================

    init() {
        this.applyTheme();
        this.setupServiceWorker();
        this.requestNotificationPermission();
        this.setupAuth();
    },

    setupAuth() {
        if (typeof firebase !== 'undefined') {
            firebase.auth().onAuthStateChanged(user => {
                const loadingScreen = document.getElementById('loading-screen');
                if (loadingScreen) loadingScreen.classList.remove('active');

                if (user) {
                    this.data.user = {
                        uid: user.uid,
                        email: user.email,
                        displayName: user.displayName,
                        photoURL: user.photoURL
                    };
                    this.syncId = user.uid;
                    this.updateUserUI();

                    this.loadData().then(() => {
                        this.updateStreaks();
                        this.checkFirstVisit();
                    });
                } else {
                    this.data.user = null;
                    this.syncId = null;
                    this.showScreen('login-screen');
                }
            });
        } else {
            this.hideLoading();
            this.loadData().then(() => {
                this.updateStreaks();
                this.checkFirstVisit();
            });
        }
    },

    loginWithGoogle() {
        if (typeof firebase !== 'undefined') {
            const provider = new firebase.auth.GoogleAuthProvider();
            firebase.auth().signInWithPopup(provider).catch(error => {
                console.error("Error al iniciar sesión:", error);
                alert("Error al iniciar sesión: " + error.message);
            });
        }
    },

    logout() {
        if (typeof firebase !== 'undefined') {
            firebase.auth().signOut().catch(error => {
                console.error("Error al cerrar sesión:", error);
            });
        }
    },

    updateUserUI() {
        if (this.data.user) {
            const nameEl = document.getElementById('user-name');
            const emailEl = document.getElementById('user-email');
            const avatarEl = document.getElementById('user-avatar');
            if (nameEl) nameEl.textContent = this.data.user.displayName || 'Usuario';
            if (emailEl) emailEl.textContent = this.data.user.email;
            if (avatarEl && this.data.user.photoURL) {
                avatarEl.src = this.data.user.photoURL;
                avatarEl.style.display = 'block';
            }
        }
    },

    checkFirstVisit() {
        if (!localStorage.getItem('facto_visited')) {
            this.showScreen('onboarding-screen');
            localStorage.setItem('facto_visited', 'true');
        } else {
            this.showScreen('home-screen');
            this.renderHome();
        }
    },

    startApp() {
        this.showScreen('home-screen');
        this.renderHome();
    },

    hideLoading() {
        document.getElementById('loading-screen').classList.remove('active');
    },

    showScreen(screenId) {
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        document.getElementById(screenId).classList.add('active');
    },

    // ============================================
    // DATA MANAGEMENT
    // ============================================

    async loadData() {
        // 1. Cargar local primero para rapidez
        const saved = localStorage.getItem('facto_data');
        if (saved) {
            const parsedData = JSON.parse(saved);

            if (!parsedData.version || parsedData.version === 1) {
                this.data = this.migrateV1toV2(parsedData);
                this.saveData();
                console.log('✅ Migrated from V1 to V2');
            } else {
                this.data = { ...this.data, ...parsedData };
            }

            this.applyTheme();
        }

        // 2. Sincronizar en la nube (Firestore)
        if (typeof firebase !== 'undefined' && typeof db !== 'undefined' && this.syncId) {

            try {
                const docRef = db.collection('users').doc(this.syncId);
                const docSnap = await docRef.get();

                if (docSnap.exists) {
                    const cloudData = docSnap.data();
                    if (cloudData.version === 2) {
                        this.data = { ...this.data, ...cloudData };
                        localStorage.setItem('facto_data', JSON.stringify(this.data));
                        this.applyTheme();

                        // Refrescar UI si cambiaron datos y estamos en alguna pantalla
                        if (document.getElementById('home-screen') && document.getElementById('home-screen').classList.contains('active')) {
                            this.renderHome();
                        }
                    }
                } else {
                    // Si no existen en la nube, guardar los locales (ej. primera vez)
                    this.saveDataToCloud();
                }
            } catch (error) {
                console.error("Error al sincronizar con Firebase:", error);
            }
        }
    },

    saveData() {
        // Guardado local instantáneo para UI sin interrupciones
        localStorage.setItem('facto_data', JSON.stringify(this.data));
        // Guardado en la nube en segundo plano
        this.saveDataToCloud();
    },

    async saveDataToCloud() {
        if (typeof firebase !== 'undefined' && typeof db !== 'undefined' && this.syncId) {
            try {
                // Almacenarlo bajo una colección 'users' y el ID del dispositivo
                await db.collection('users').doc(this.syncId).set(this.data);
            } catch (error) {
                console.error("Error al guardar en Firebase:", error);
            }
        }
    },

    migrateV1toV2(oldData) {
        const newData = {
            version: 2,
            user: null,
            categories: [...DEFAULT_CATEGORIES],
            customCategories: [],
            goals: [],
            selectedGoalIdsForConcentration: [],
            timerSettings: {
                progressionType: 'minutes',
                incrementAmount: 1,
                daysForLevelUp: 3
            },
            currentLevel: oldData.currentLevel || 1,
            concentrationStreak: oldData.streak || 0,
            lastConcentrationDate: oldData.lastConcentrationDate || null,
            consecutiveDays: oldData.consecutiveDays || 0,
            actions: [],
            actionStreak: 0,
            lastActionDate: null,
            theme: oldData.theme || 'light',
            reminderEnabled: oldData.reminderEnabled || false,
            reminderTime: oldData.reminderTime || '09:00',
            timerRunning: false,
            timerSeconds: 0,
            musicPlaying: false,
            history: oldData.history || []
        };

        // Migrate old manifestation to a goal
        if (oldData.manifestation) {
            const goalId = this.generateId();
            newData.goals.push({
                id: goalId,
                category: 'meta',
                title: oldData.manifestation,
                description: '',
                createdDate: new Date().toISOString(),
                isActive: true,
                isArchived: false,
                concentrationCount: oldData.streak || 0,
                lastConcentrationDate: oldData.lastConcentrationDate || null
            });
        }

        // Migrate old daily action
        if (oldData.dailyAction) {
            newData.actions.push({
                id: this.generateId(),
                text: oldData.dailyAction.text || oldData.dailyAction,
                goalIds: newData.goals.length > 0 ? [newData.goals[0].id] : [],
                date: oldData.dailyAction.date || new Date().toDateString(),
                completed: oldData.actionCompleted || false,
                completedDate: oldData.actionCompleted ? new Date().toISOString() : null,
                notes: ''
            });
        }

        return newData;
    },

    generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    },

    // ============================================
    // HOME SCREEN
    // ============================================

    renderHome() {
        // Update both streaks - show consecutive days
        document.getElementById('concentration-streak').textContent = this.data.consecutiveDays || 0;
        // Totalizador de acciones globales
        document.getElementById('action-streak').textContent = this.data.actions.filter(a => a.completed).length;

        // Update tagline
        this.updateTagline();

        // Render Focus To (compact goals)
        this.renderActiveGoalsCompact();

        // Update timer level
        const levelText = this.data.timerSettings.progressionType === 'minutes'
            ? `${this.data.currentLevel} min`
            : `${this.data.currentLevel * this.data.timerSettings.incrementAmount}s`;
        document.getElementById('current-level').textContent = levelText;

        const daysNeeded = this.data.timerSettings.daysForLevelUp - this.data.consecutiveDays;
        if (daysNeeded > 0) {
            document.getElementById('timer-progress-text').textContent =
                `Completa ${daysNeeded} día${daysNeeded > 1 ? 's' : ''} más para subir de nivel`;
        } else {
            document.getElementById('timer-progress-text').textContent = '¡Listo para subir de nivel!';
        }

        // Render Actions To (actions grouped by goal)
        this.renderActionsTo();

        // Check concentration availability
        this.checkConcentrationAvailability();
    },

    renderActiveGoals() {
        const goalsContainer = document.getElementById('goals-list');
        const activeGoals = this.data.goals.filter(g => g.isActive && !g.isArchived);

        if (activeGoals.length === 0) {
            goalsContainer.innerHTML = `
                <div class="empty-state-goals">
                    <p class="empty-text">No tienes metas activas aún</p>
                    <p class="motivational-text">"Sé específico, claro y directo. La claridad es poder."</p>
                </div>
            `;
        } else {
            goalsContainer.innerHTML = activeGoals.map(goal => {
                const category = this.data.categories.find(c => c.id === goal.category) ||
                    this.data.customCategories.find(c => c.id === goal.category) ||
                    { name: 'Meta', icon: '🎯', color: '#667eea' };

                return `
                    <div class="goal-card" data-goal-id="${goal.id}">
                        <div class="goal-header">
                            <span class="goal-icon" style="color: ${category.color}">${category.icon}</span>
                            <span class="goal-category">${category.name}</span>
                        </div>
                        <div class="goal-title">${this.escapeHtml(goal.title)}</div>
                        ${goal.description ? `<div class="goal-description">${this.escapeHtml(goal.description)}</div>` : ''}
                        
                        <div style="font-size: 0.75rem; color: var(--text-secondary); margin-bottom: 12px; display: flex; justify-content: space-between;">
                            <span>Última mod: ${goal.modifiedDate ? new Date(goal.modifiedDate).toLocaleDateString() : 'N/A'}</span>
                            <span style="font-weight: 600; color: var(--primary);">
                                Acciones: ${this.data.actions.filter(a => a.goalIds.includes(goal.id) && a.completed).length} / ${this.data.actions.filter(a => a.goalIds.includes(goal.id)).length}
                            </span>
                        </div>

                        <div class="goal-footer">
                            <span class="goal-stats">${goal.concentrationCount || 0} sesiones</span>
                            
                            <div class="goal-actions">
                                <button class="btn-icon-small" onclick="app.editGoal('${goal.id}')" title="Editar">✏️</button>
                                <button class="btn-icon-small" onclick="app.archiveGoal('${goal.id}')" title="Archivar">📦</button>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');
        }

        // Add "New Goal" button
        goalsContainer.innerHTML += `
            <div class="goal-card goal-card-new" onclick="app.showCreateGoalScreen()">
                <div class="new-goal-content">
                    <span class="new-goal-icon">+</span>
                    <span class="new-goal-text">Nueva Meta</span>
                </div>
            </div>
        `;
    },

    checkConcentrationAvailability() {
        const today = new Date().toDateString();
        const btn = document.getElementById('concentrate-btn');
        const activeGoals = this.data.goals.filter(g => g.isActive && !g.isArchived);

        if (activeGoals.length === 0) {
            btn.textContent = 'Crea un Focus primero';
            btn.disabled = true;
            btn.style.opacity = '0.6';
        } else if (this.data.lastConcentrationDate === today) {
            btn.innerHTML = '🧠 Focus de Nuevo';
            btn.disabled = false;
            btn.style.opacity = '1';
        } else {
            btn.innerHTML = '🧠 Focus';
            btn.disabled = false;
            btn.style.opacity = '1';
        }
    },

    renderTodayActions() {
        const actionDisplay = document.getElementById('action-display');
        const today = new Date().toDateString();
        // Solo mostrar acciones "Para Hoy" que NO estén completadas (Archivado visual automático)
        const todayActions = this.data.actions.filter(a => a.date === today && !a.completed);

        if (todayActions.length === 0) {
            // Verificar si tenían acciones hoy y las terminaron
            const completedToday = this.data.actions.filter(a => a.date === today && a.completed);

            if (completedToday.length > 0) {
                actionDisplay.innerHTML = `
                    <div class="no-action" style="padding: 20px 10px; text-align: center;">
                        <span style="font-size: 2.5rem; display: block; margin-bottom: 10px;">🎉</span>
                        <p class="motivational-text" style="color: var(--primary);">¡Completaste todas tus acciones de hoy!</p>
                        <p class="small-text">Sigue así, el focus está rindiendo frutos.</p>
                        <button class="btn btn-secondary btn-small" style="margin-top: 15px;" onclick="app.showCreateActionScreen()">+ Agregar otra Acción</button>
                    </div>
                `;
            } else {
                actionDisplay.innerHTML = `
                    <div class="no-action">
                        <p class="empty-text">No hay acciones para hoy</p>
                        <p class="motivational-text">"La acción hay que hacerla, no te podés quedar sentado"</p>
                        <button class="btn btn-secondary" onclick="app.showCreateActionScreen()">Definir Acción</button>
                    </div>
                `;
            }
        } else {
            actionDisplay.innerHTML = todayActions.map(action => {
                const linkedGoals = action.goalIds.map(gId => {
                    const goal = this.data.goals.find(g => g.id === gId);
                    return goal ? goal.title : '';
                }).filter(t => t).join(', ');

                return `
                    <div class="action-item ${action.completed ? 'completed' : ''}">
                        <input type="checkbox" class="action-checkbox" 
                            ${action.completed ? 'checked' : ''} 
                            onchange="app.toggleActionComplete('${action.id}')">
                        <div class="action-content">
                            <div class="action-text">${this.escapeHtml(action.text)}</div>
                            ${linkedGoals ? `<div class="action-goals">🎯 ${this.escapeHtml(linkedGoals)}</div>` : ''}
                            ${action.notes ? `<div class="action-notes">💭 ${this.escapeHtml(action.notes)}</div>` : ''}
                            <div style="font-size: 0.7rem; color: var(--text-secondary); margin-top: 4px;">
                                Modificado: ${action.modifiedDate ? new Date(action.modifiedDate).toLocaleDateString() : 'Hoy'}
                            </div>
                        </div>
                        <button class="btn-icon-small" onclick="app.editActionNotes('${action.id}')" title="Editar notas">💬</button>
                    </div>
                `;
            }).join('') + `
                <button class="btn btn-secondary btn-small" style="margin-top: 8px;" onclick="app.showCreateActionScreen()">+ Agregar Acción</button>
            `;
        }

        // Show history link
        const allActions = this.data.actions.filter(a => a.date !== today);
        if (allActions.length > 0) {
            actionDisplay.innerHTML += `
                <button class="btn-link" style="margin-top: 12px; font-size: 0.85rem; color: var(--primary); cursor: pointer; background: none; border: none;" onclick="app.showHistoryScreen()">📋 Ver historial de acciones (${allActions.length})</button>
            `;
        }
    },

    // ============================================
    // GOALS MANAGEMENT
    // ============================================

    showCreateGoalScreen() {
        document.getElementById('goal-form-title').textContent = 'Nueva Meta';
        document.getElementById('goal-id-input').value = '';
        document.getElementById('goal-title-input').value = '';
        document.getElementById('goal-description-input').value = '';
        document.getElementById('goal-category-select').value = 'meta';
        this.renderCategoryOptions();
        this.showScreen('create-goal-screen');
    },

    renderCategoryOptions() {
        const select = document.getElementById('goal-category-select');
        const allCategories = [...this.data.categories, ...this.data.customCategories];

        select.innerHTML = allCategories.map(cat =>
            `<option value="${cat.id}">${cat.icon} ${cat.name}</option>`
        ).join('');
    },

    saveGoal() {
        const goalId = document.getElementById('goal-id-input').value;
        const title = document.getElementById('goal-title-input').value.trim();
        const description = document.getElementById('goal-description-input').value.trim();
        const category = document.getElementById('goal-category-select').value;

        if (!title) {
            alert('Por favor escribe un título para tu meta');
            return;
        }

        if (goalId) {
            // Edit existing goal
            const goal = this.data.goals.find(g => g.id === goalId);
            if (goal) {
                goal.title = title;
                goal.description = description;
                goal.category = category;
                goal.modifiedDate = new Date().toISOString();
            }
        } else {
            // Create new goal
            const newGoal = {
                id: this.generateId(),
                category,
                title,
                description,
                createdDate: new Date().toISOString(),
                modifiedDate: new Date().toISOString(),
                isActive: true,
                isArchived: false,
                concentrationCount: 0,
                lastConcentrationDate: null
            };
            this.data.goals.push(newGoal);
        }

        this.saveData();
        this.showScreen('home-screen');
        this.renderHome();
    },

    editGoal(goalId) {
        const goal = this.data.goals.find(g => g.id === goalId);
        if (!goal) return;

        document.getElementById('goal-form-title').textContent = 'Editar Meta';
        document.getElementById('goal-id-input').value = goal.id;
        document.getElementById('goal-title-input').value = goal.title;
        document.getElementById('goal-description-input').value = goal.description || '';
        this.renderCategoryOptions();
        document.getElementById('goal-category-select').value = goal.category;
        this.showScreen('create-goal-screen');
    },

    archiveGoal(goalId) {
        if (confirm('¿Archivar esta meta?')) {
            const goal = this.data.goals.find(g => g.id === goalId);
            if (goal) {
                goal.isArchived = true;
                goal.isActive = false;
                this.saveData();
                this.renderHome();
            }
        }
    },

    cancelGoalEdit() {
        this.showScreen('home-screen');
        this.renderHome();
    },

    // ============================================
    // CONCENTRATION & TIMER
    // ============================================

    startConcentration() {
        const activeGoals = this.data.goals.filter(g => g.isActive && !g.isArchived);
        if (activeGoals.length === 0) {
            alert('Crea una meta primero');
            return;
        }

        // Show goal selection modal
        this.showGoalSelectionModal();
    },

    showGoalSelectionModal() {
        const activeGoals = this.data.goals.filter(g => g.isActive && !g.isArchived);
        const modal = document.getElementById('goal-selection-modal');
        const list = document.getElementById('goal-selection-list');

        list.innerHTML = activeGoals.map(goal => {
            const category = this.data.categories.find(c => c.id === goal.category) ||
                this.data.customCategories.find(c => c.id === goal.category) ||
                { icon: '🎯', color: '#667eea' };

            return `
                <label class="goal-select-item">
                    <input type="checkbox" value="${goal.id}" class="goal-select-checkbox">
                    <span class="goal-select-icon" style="color: ${category.color}">${category.icon}</span>
                    <span class="goal-select-title">${this.escapeHtml(goal.title)}</span>
                </label>
            `;
        }).join('');

        modal.classList.add('active');
    },

    confirmGoalSelection() {
        const checkboxes = document.querySelectorAll('.goal-select-checkbox:checked');
        const selectedIds = Array.from(checkboxes).map(cb => cb.value);

        if (selectedIds.length === 0) {
            alert('Selecciona al menos una meta');
            return;
        }

        this.data.selectedGoalIdsForConcentration = selectedIds;
        document.getElementById('goal-selection-modal').classList.remove('active');
        this.beginConcentrationSession();
    },

    cancelGoalSelection() {
        document.getElementById('goal-selection-modal').classList.remove('active');
    },

    beginConcentrationSession() {
        // Calculate timer duration
        const durationMinutes = this.data.timerSettings.progressionType === 'minutes'
            ? this.data.currentLevel
            : (this.data.currentLevel * this.data.timerSettings.incrementAmount) / 60;

        this.data.timerSeconds = Math.round(durationMinutes * 60);
        this.totalSeconds = this.data.timerSeconds;

        // Display selected goals as large list items
        const selectedGoals = this.data.goals.filter(g =>
            this.data.selectedGoalIdsForConcentration.includes(g.id)
        );
        const focusContainer = document.getElementById('manifestation-focus');
        if (selectedGoals.length > 0) {
            focusContainer.innerHTML = `
                <div class="focus-list">
                    ${selectedGoals.map(g => {
                const cat = this.data.categories.find(c => c.id === g.category) ||
                    this.data.customCategories.find(c => c.id === g.category) ||
                    { icon: '🎯' };
                return `<div class="focus-list-item">${cat.icon} ${this.escapeHtml(g.title)}</div>`;
            }).join('')}
                </div>
            `;
        } else {
            focusContainer.textContent = '';
        }

        // Update timer display
        this.updateTimerDisplay();

        // Show concentration screen
        this.showScreen('concentrate-screen');

        // Auto-start timer and sound
        this.data.timerRunning = true;
        const btn = document.getElementById('play-pause-btn');
        if (btn) btn.textContent = '⏸️';
        this.runTimer();
        this.playMusic();
        const musicBtn = document.getElementById('music-btn');
        if (musicBtn) musicBtn.textContent = '🔊';
    },

    toggleTimer() {
        this.data.timerRunning = !this.data.timerRunning;
        const btn = document.getElementById('play-pause-btn');
        btn.textContent = this.data.timerRunning ? '⏸️' : '▶️';

        if (this.data.timerRunning) {
            this.runTimer();
            // Resume music
            this.playMusic();
            const musicBtn = document.getElementById('music-btn');
            if (musicBtn) musicBtn.textContent = '🔊';
        } else {
            clearInterval(this.timerInterval);
            // Pause music
            this.stopMusic();
            const musicBtn = document.getElementById('music-btn');
            if (musicBtn) musicBtn.textContent = '🔇';
        }
    },

    runTimer() {
        this.timerInterval = setInterval(() => {
            if (this.data.timerSeconds > 0) {
                this.data.timerSeconds--;
                this.updateTimerDisplay();
            } else {
                this.completeConcentration();
            }
        }, 1000);
    },

    updateTimerDisplay() {
        const minutes = Math.floor(this.data.timerSeconds / 60);
        const seconds = this.data.timerSeconds % 60;
        document.getElementById('timer-text').textContent =
            `${minutes}:${seconds.toString().padStart(2, '0')}`;

        // Update circle progress
        const progress = (this.totalSeconds - this.data.timerSeconds) / this.totalSeconds;
        const circumference = 2 * Math.PI * 90;
        const offset = circumference * (1 - progress);
        document.getElementById('timer-progress-circle').style.strokeDashoffset = offset;
    },

    completeConcentration() {
        clearInterval(this.timerInterval);
        this.data.timerRunning = false;

        // Update concentration streak (only first session of the day counts)
        const today = new Date().toDateString();
        const isFirstSessionToday = this.data.lastConcentrationDate !== today;

        if (isFirstSessionToday) {
            const yesterday = new Date(Date.now() - 86400000).toDateString();

            if (this.data.lastConcentrationDate === yesterday) {
                this.data.consecutiveDays++;
            } else {
                this.data.consecutiveDays = 1;
            }

            this.data.lastConcentrationDate = today;
            this.data.concentrationStreak++;

            // Check for level up (only on first session)
            if (this.data.consecutiveDays >= this.data.timerSettings.daysForLevelUp) {
                this.data.currentLevel++;
                this.data.consecutiveDays = 0;
                alert(`¡Subiste de nivel! Ahora: ${this.data.currentLevel} ${this.data.timerSettings.progressionType === 'minutes' ? 'min' : 's'} 🎉`);
            }
        }

        // Update selected goals
        this.data.selectedGoalIdsForConcentration.forEach(goalId => {
            const goal = this.data.goals.find(g => g.id === goalId);
            if (goal) {
                goal.concentrationCount = (goal.concentrationCount || 0) + 1;
                goal.lastConcentrationDate = today;
            }
        });

        // Add to history
        this.data.history.push({
            date: today,
            type: 'concentration',
            level: this.data.currentLevel,
            goalIds: [...this.data.selectedGoalIdsForConcentration]
        });

        this.saveData();
        this.stopMusic();

        alert('¡Concentración completada! 🎯\n"Ahora viene la acción"');
        this.showScreen('home-screen');
        this.renderHome();
    },

    stopConcentration() {
        clearInterval(this.timerInterval);
        this.data.timerRunning = false;
        this.stopMusic();
        this.showScreen('home-screen');
        this.renderHome();
    },

    // ============================================
    // ACTIONS MANAGEMENT
    // ============================================

    showCreateActionScreen() {
        document.getElementById('action-id-input').value = '';
        document.getElementById('action-text-input').value = '';
        document.getElementById('action-notes-input').value = '';
        this.renderGoalCheckboxesForAction();
        this.showScreen('create-action-screen');

        window.scrollTo({ top: 0, behavior: 'smooth' });

        // Enfocar el input del texto nombre
        setTimeout(() => {
            const textInput = document.getElementById('action-text-input');
            if (textInput) textInput.focus();
        }, 100);
    },

    prepareActionForConcentratedGoals() {
        document.getElementById('action-id-input').value = '';
        document.getElementById('action-text-input').value = '';
        document.getElementById('action-notes-input').value = '';
        this.renderGoalCheckboxesForAction(this.data.selectedGoalIdsForConcentration);
    },

    renderGoalCheckboxesForAction(preselectedIds = []) {
        const container = document.getElementById('action-goals-checkboxes');
        const activeGoals = this.data.goals.filter(g => g.isActive && !g.isArchived);

        if (activeGoals.length === 0) {
            container.innerHTML = '<p class="small-text">No hay metas activas</p>';
            return;
        }

        container.innerHTML = activeGoals.map(goal => {
            const category = this.data.categories.find(c => c.id === goal.category) ||
                this.data.customCategories.find(c => c.id === goal.category) ||
                { icon: '🎯' };

            const isChecked = preselectedIds.includes(goal.id);

            return `
                <label class="action-goal-checkbox">
                    <input type="checkbox" value="${goal.id}" ${isChecked ? 'checked' : ''}>
                    ${category.icon} ${this.escapeHtml(goal.title)}
                </label>
            `;
        }).join('');
    },

    saveAction() {
        const actionId = document.getElementById('action-id-input').value;
        const text = document.getElementById('action-text-input').value.trim();
        const notes = document.getElementById('action-notes-input').value.trim();

        const checkboxes = document.querySelectorAll('#action-goals-checkboxes input:checked');
        const goalIds = Array.from(checkboxes).map(cb => cb.value);

        if (!text) {
            alert('Escribe tu acción');
            return;
        }

        const today = new Date().toDateString();

        if (actionId) {
            // Edit existing action
            const action = this.data.actions.find(a => a.id === actionId);
            if (action) {
                action.text = text;
                action.notes = notes;
                action.goalIds = goalIds;
                action.modifiedDate = new Date().toISOString();
            }
        } else {
            // Create new action
            const newAction = {
                id: this.generateId(),
                text,
                goalIds,
                date: today,
                completed: false,
                completedDate: null,
                notes,
                createdDate: new Date().toISOString(),
                modifiedDate: new Date().toISOString()
            };
            this.data.actions.push(newAction);
        }

        this.saveData();
        this.showScreen('home-screen');
        this.renderHome();
    },

    toggleActionComplete(actionId, fromScreen) {
        const action = this.data.actions.find(a => a.id === actionId);
        if (!action) return;

        action.completed = !action.completed;
        action.completedDate = action.completed ? new Date().toISOString() : null;
        action.modifiedDate = new Date().toISOString();

        // Update action streak - Independientemente de qué acción sea, verificamos si hoy completó AL MENOS UNA
        if (action.completed) {
            const today = new Date().toDateString();
            const yesterday = new Date(Date.now() - 86400000).toDateString();

            // Reviso si en las acciones (además de la actual) ya completó alguna hoy para no sumar doble Streak el mismo día
            const otherCompletedToday = this.data.actions.some(a => a.id !== actionId && a.completed && new Date(a.completedDate).toDateString() === today);

            if (!otherCompletedToday) {
                if (this.data.lastActionDate === yesterday) {
                    this.data.actionStreak++;
                } else if (this.data.lastActionDate !== today) {
                    this.data.actionStreak = 1;
                }
                this.data.lastActionDate = today;
            }

            // Add to history
            this.data.history.push({
                date: today,
                type: 'action_completed',
                actionId: action.id,
                goalIds: action.goalIds
            });
        }

        this.saveData();

        if (fromScreen === 'actions') {
            this.renderActionsScreen();
        } else {
            this.renderHome();
        }
    },

    editActionNotes(actionId) {
        const action = this.data.actions.find(a => a.id === actionId);
        if (!action) return;

        const notes = prompt('Notas sobre esta acción (¿qué lograste?):', action.notes || '');
        if (notes !== null) {
            action.notes = notes.trim();
            this.saveData();
            this.renderHome();
        }
    },

    cancelActionEdit() {
        this.showScreen('home-screen');
        this.renderHome();
    },

    // ============================================
    // MUSIC
    // ============================================

    toggleMusic() {
        const btn = document.getElementById('music-btn');

        if (this.data.musicPlaying) {
            this.stopMusic();
            btn.textContent = '🔇';
        } else {
            this.playMusic();
            btn.textContent = '🔊';
        }
    },

    playMusic() {
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        this.oscillator = this.audioContext.createOscillator();
        this.gainNode = this.audioContext.createGain();

        this.oscillator.type = 'sine';
        this.oscillator.frequency.setValueAtTime(174.61, this.audioContext.currentTime);
        this.gainNode.gain.setValueAtTime(0.1, this.audioContext.currentTime);

        this.oscillator.connect(this.gainNode);
        this.gainNode.connect(this.audioContext.destination);
        this.oscillator.start();

        this.data.musicPlaying = true;
    },

    stopMusic() {
        if (this.oscillator) {
            this.oscillator.stop();
            this.audioContext.close();
            this.data.musicPlaying = false;
        }
    },

    // ============================================
    // SETTINGS
    // ============================================

    showSettings() {
        document.getElementById('reminder-toggle').checked = this.data.reminderEnabled;
        document.getElementById('reminder-time').value = this.data.reminderTime;
        document.getElementById('settings-level').textContent = `${this.data.currentLevel}`;
        document.getElementById('progression-type').value = this.data.timerSettings.progressionType;
        document.getElementById('increment-amount').value = this.data.timerSettings.incrementAmount;
        document.getElementById('days-for-levelup').value = this.data.timerSettings.daysForLevelUp;

        if (this.data.reminderEnabled) {
            document.getElementById('reminder-time-picker').classList.remove('hidden');
        }

        this.showScreen('settings-screen');
    },

    closeSettings() {
        this.showScreen('home-screen');
        this.renderHome();
    },

    toggleTheme() {
        this.data.theme = this.data.theme === 'light' ? 'dark' : 'light';
        this.applyTheme();
        this.saveData();
    },

    applyTheme() {
        document.documentElement.setAttribute('data-theme', this.data.theme);
        const icon = document.getElementById('theme-icon');
        if (icon) {
            icon.textContent = this.data.theme === 'light' ? '🌙' : '☀️';
        }
    },

    toggleReminder() {
        this.data.reminderEnabled = !this.data.reminderEnabled;
        const picker = document.getElementById('reminder-time-picker');

        if (this.data.reminderEnabled) {
            picker.classList.remove('hidden');
            this.scheduleNotification();
        } else {
            picker.classList.add('hidden');
        }

        this.saveData();
    },

    saveReminderTime() {
        this.data.reminderTime = document.getElementById('reminder-time').value;
        this.saveData();
        this.scheduleNotification();
        alert('Recordatorio configurado ✅');
    },

    saveTimerSettings() {
        this.data.timerSettings.progressionType = document.getElementById('progression-type').value;
        this.data.timerSettings.incrementAmount = parseInt(document.getElementById('increment-amount').value);
        this.data.timerSettings.daysForLevelUp = parseInt(document.getElementById('days-for-levelup').value);
        this.saveData();
        alert('Configuración del timer guardada ✅');
        this.renderHome();
    },

    resetApp() {
        if (confirm('¿Estás seguro? Se perderá todo tu progreso.')) {
            localStorage.clear();
            location.reload();
        }
    },

    // ============================================
    // NOTIFICATIONS
    // ============================================

    requestNotificationPermission() {
        if ('Notification' in window && Notification.permission === 'default') {
            setTimeout(() => {
                Notification.requestPermission();
            }, 3000);
        }
    },

    scheduleNotification() {
        if (!('Notification' in window) || Notification.permission !== 'granted') {
            return;
        }

        const checkTime = () => {
            const now = new Date();
            const [hours, minutes] = this.data.reminderTime.split(':');
            const reminderTime = new Date();
            reminderTime.setHours(parseInt(hours), parseInt(minutes), 0);

            const today = new Date().toDateString();
            if (this.data.lastConcentrationDate !== today &&
                Math.abs(now - reminderTime) < 60000) {
                new Notification('Facto', {
                    body: '🎯 Es hora de concentrarte en tus metas',
                    icon: 'icon-192.png',
                    badge: 'icon-192.png'
                });
            }
        };

        setInterval(checkTime, 60000);
    },

    // ============================================
    // SERVICE WORKER
    // ============================================

    setupServiceWorker() {
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('sw.js')
                .then(reg => console.log('Service Worker registered'))
                .catch(err => console.log('Service Worker error:', err));
        }
    },

    // ============================================
    // STREAKS
    // ============================================

    updateStreaks() {
        const today = new Date().toDateString();
        const yesterday = new Date(Date.now() - 86400000).toDateString();

        // Update concentration streak
        if (this.data.lastConcentrationDate !== today &&
            this.data.lastConcentrationDate !== yesterday) {
            if (this.data.lastConcentrationDate) {
                this.data.concentrationStreak = 0;
                this.data.consecutiveDays = 0;
            }
        }

        // Update action streak
        if (this.data.lastActionDate !== today &&
            this.data.lastActionDate !== yesterday) {
            if (this.data.lastActionDate) {
                this.data.actionStreak = 0;
            }
        }

        this.saveData();
    },

    getActionConsecutiveDays() {
        // Calculate consecutive days of completing at least one action
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        let consecutiveDays = 0;
        let checkDate = new Date(today);

        // Check if today has a completed action
        const completedActions = this.data.actions.filter(a => a.completed && a.completedDate);

        while (true) {
            const dateStr = checkDate.toDateString();
            const hasCompletedAction = completedActions.some(a =>
                new Date(a.completedDate).toDateString() === dateStr
            );

            if (hasCompletedAction) {
                consecutiveDays++;
                checkDate.setDate(checkDate.getDate() - 1);
            } else if (consecutiveDays === 0) {
                // If no action today, check yesterday as the start
                checkDate.setDate(checkDate.getDate() - 1);
                const yesterdayStr = checkDate.toDateString();
                const hasYesterday = completedActions.some(a =>
                    new Date(a.completedDate).toDateString() === yesterdayStr
                );
                if (hasYesterday) {
                    consecutiveDays++;
                    checkDate.setDate(checkDate.getDate() - 1);
                } else {
                    break;
                }
            } else {
                break;
            }
        }

        return consecutiveDays;
    },

    // ============================================
    // UTILITIES
    // ============================================

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },


    // ============================================
    // V2.1 ENHANCEMENTS
    // ============================================

    // Dynamic Tagline
    updateTagline() {
        const taglineElements = document.querySelectorAll('.tagline-ending');
        taglineElements.forEach(el => {
            el.textContent = this.data.taglineEnding;
        });
    },

    setTaglineEnding(ending) {
        this.data.taglineEnding = ending;
        this.updateTagline();
        this.saveData();
    },

    // Compact Goals for Home
    renderActiveGoalsCompact() {
        const goalsContainer = document.getElementById('goals-list');
        const activeGoals = this.data.goals.filter(g => g.isActive && !g.isArchived);

        if (activeGoals.length === 0) {
            goalsContainer.innerHTML = `
               <div class="empty-state-goals">
                    <p class="empty-text">No tienes metas activas aún</p>
                    <button class="btn btn-secondary" onclick="app.showGoalsScreen()">Crear Meta</button>
                </div>
            `;
        } else {
            goalsContainer.innerHTML = `
                <div class="goal-titles-list">
                    ${activeGoals.map(goal => {
                const category = this.data.categories.find(c => c.id === goal.category) ||
                    this.data.customCategories.find(c => c.id === goal.category) ||
                    { icon: '🎯' };
                const completedCount = this.data.actions.filter(a => a.goalIds && a.goalIds.includes(goal.id) && a.completed).length;
                const totalCount = this.data.actions.filter(a => a.goalIds && a.goalIds.includes(goal.id)).length;
                return `
                            <div class="goal-title-item" onclick="app.showActionsForGoal('${goal.id}')">
                                <span class="goal-title-icon">${category.icon}</span>
                                <span class="goal-title-text" style="flex:1;">${this.escapeHtml(goal.title)}</span>
                                <span style="font-size: 0.75rem; color: var(--text-secondary); background: var(--bg-secondary); padding: 2px 6px; border-radius: 4px;">
                                    ${completedCount}/${totalCount} ✅
                                </span>
                            </div>
                        `;
            }).join('')}
                </div>
                <button class="btn btn-secondary btn-small" onclick="app.showGoalsScreen()">Ver Todas</button>
            `;
        }
    },

    // Actions To - Actions grouped by Focus (goal) - shows all on home
    renderActionsTo() {
        const container = document.getElementById('actions-to-list');
        if (!container) return;

        const allActions = this.data.actions;
        const activeGoals = this.data.goals.filter(g => g.isActive && !g.isArchived);

        if (allActions.length === 0) {
            container.innerHTML = `
                <div class="empty-state-goals">
                    <p class="empty-text">No hay acciones definidas aún</p>
                    <p class="motivational-text">"La acción hay que hacerla, no te podés quedar sentado"</p>
                    <button class="btn btn-secondary" onclick="app.showCreateActionScreen()">Definir Acción</button>
                </div>
            `;
            return;
        }

        const actionsByGoal = {};
        const unlinkedActions = [];

        allActions.forEach(action => {
            if (action.goalIds && action.goalIds.length > 0) {
                action.goalIds.forEach(goalId => {
                    if (!actionsByGoal[goalId]) actionsByGoal[goalId] = [];
                    actionsByGoal[goalId].push(action);
                });
            } else {
                unlinkedActions.push(action);
            }
        });

        let html = '<div class="actions-to-groups">';

        activeGoals.forEach(goal => {
            const goalActions = actionsByGoal[goal.id];
            if (!goalActions || goalActions.length === 0) return;

            const category = this.data.categories.find(c => c.id === goal.category) ||
                this.data.customCategories.find(c => c.id === goal.category) ||
                { icon: '🎯', color: '#667eea' };

            const completedCount = goalActions.filter(a => a.completed).length;
            const incompleteActions = goalActions.filter(a => !a.completed);
            const today = new Date().toDateString();

            if (incompleteActions.length === 0) return; // No mostrar el grupo si todas ya se completaron

            html += `
                <div class="action-goal-group" style="background: var(--card-bg); border-radius: 12px; padding: 14px; margin-bottom: 12px; border-left: 4px solid ${category.color};">
                    <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 10px;">
                        <span style="font-size: 1.2rem;">${category.icon}</span>
                        <span style="font-weight: 600; font-size: 0.95rem; flex: 1;">${this.escapeHtml(goal.title)}</span>
                        <span style="font-size: 0.75rem; color: var(--text-secondary);">${completedCount}/${goalActions.length} ✅</span>
                    </div>
                    <div class="action-items-list">
            `;

            incompleteActions.forEach(action => {
                const isToday = action.date === today;
                const dateLabel = isToday ? 'Hoy' : new Date(action.date).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
                let prosConsIndicator = '';
                if (action.prosPct !== undefined && action.prosPct !== null) {
                    const pct = action.prosPct;
                    const barColor = pct >= 60 ? '#22c55e' : pct <= 40 ? '#ef4444' : '#f59e0b';
                    prosConsIndicator = `<span style="font-size: 0.65rem; padding: 1px 5px; border-radius: 4px; background: ${barColor}22; color: ${barColor}; font-weight: 600;">${pct}%👍</span>`;
                }
                html += `
                    <div id="action-item-${action.id}" class="action-item-compact" style="display: flex; align-items: center; gap: 8px; padding: 6px 0; border-bottom: 1px solid var(--border-color, rgba(0,0,0,0.06));">
                        <input type="checkbox" class="action-checkbox" 
                            ${action.completed ? 'checked' : ''} 
                            onchange="app.toggleActionComplete('${action.id}')">
                        <div style="flex: 1; font-size: 0.88rem; ${action.completed ? 'text-decoration: line-through; opacity: 0.6;' : ''}">
                            ${this.escapeHtml(action.text)}
                            ${prosConsIndicator}
                            ${action.notes ? `<span style="color: var(--text-secondary); font-size: 0.75rem;"> 💭 ${this.escapeHtml(action.notes)}</span>` : ''}
                        </div>
                        <span style="font-size: 0.7rem; color: var(--text-secondary); white-space: nowrap;">${dateLabel}</span>
                        <button class="btn-icon-small" onclick="app.editActionNotes('${action.id}')" title="Notas" style="font-size: 0.8rem;">💬</button>
                    </div>
                `;
            });

            html += `
                    </div>
                </div>
            `;
        });

        if (unlinkedActions.length > 0) {
            html += `
                <div class="action-goal-group" style="background: var(--card-bg); border-radius: 12px; padding: 14px; margin-bottom: 12px; border-left: 4px solid #999;">
                    <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 10px;">
                        <span style="font-size: 1.2rem;">📋</span>
                        <span style="font-weight: 600; font-size: 0.95rem;">Sin Focus vinculado</span>
                    </div>
                    <div class="action-items-list">
            `;

            const today = new Date().toDateString();
            unlinkedActions.forEach(action => {
                const isToday = action.date === today;
                const dateLabel = isToday ? 'Hoy' : new Date(action.date).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
                html += `
                    <div id="action-item-${action.id}" class="action-item-compact" style="display: flex; align-items: center; gap: 8px; padding: 6px 0; border-bottom: 1px solid var(--border-color, rgba(0,0,0,0.06));">
                        <input type="checkbox" class="action-checkbox" 
                            ${action.completed ? 'checked' : ''} 
                            onchange="app.toggleActionComplete('${action.id}')">
                        <div style="flex: 1; font-size: 0.88rem; ${action.completed ? 'text-decoration: line-through; opacity: 0.6;' : ''}">
                            ${this.escapeHtml(action.text)}
                        </div>
                        <span style="font-size: 0.7rem; color: var(--text-secondary); white-space: nowrap;">${dateLabel}</span>
                        <button class="btn-icon-small" onclick="app.editActionNotes('${action.id}')" title="Notas" style="font-size: 0.8rem;">💬</button>
                    </div>
                `;
            });

            html += `
                    </div>
                </div>
            `;
        }

        html += '</div>';

        const pastActions = allActions.filter(a => a.date !== new Date().toDateString());
        if (pastActions.length > 0) {
            html += `<button class="btn-link" style="margin-top: 8px; font-size: 0.85rem; color: var(--primary); cursor: pointer; background: none; border: none;" onclick="app.showHistoryScreen()">📋 Ver historial completo</button>`;
        }

        container.innerHTML = html;
    },

    populateFilterFocus() {
        const select = document.getElementById('filter-focus');
        if (!select) return;
        const currentValue = select.value;
        const activeGoals = this.data.goals.filter(g => g.isActive && !g.isArchived);
        let options = '<option value="all">Todos los Focus</option>';
        activeGoals.forEach(g => {
            const cat = this.data.categories.find(c => c.id === g.category) ||
                this.data.customCategories.find(c => c.id === g.category) || { icon: '🎯' };
            options += `<option value="${g.id}">${cat.icon} ${this.escapeHtml(g.title)}</option>`;
        });
        select.innerHTML = options;
        if (currentValue && select.querySelector(`option[value="${currentValue}"]`)) {
            select.value = currentValue;
        }
    },

    applyActionsScreenFilter() {
        this.renderActionsScreen();
    },

    showActionsForGoal(goalId) {
        this.showFocusDetail(goalId);
    },

    showFocusDetail(goalId) {
        const goal = this.data.goals.find(g => g.id === goalId);
        if (!goal) return;
        const category = this.data.categories.find(c => c.id === goal.category) ||
            this.data.customCategories.find(c => c.id === goal.category) ||
            { icon: '🎯', color: '#667eea' };
        const goalActions = this.data.actions.filter(a => a.goalIds && a.goalIds.includes(goalId));
        const completedCount = goalActions.filter(a => a.completed).length;
        const dtOpts = { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' };
        let actionsHtml = '';
        if (goalActions.length === 0) {
            actionsHtml = '<p class="empty-text" style="text-align: center; padding: 20px;">No hay acciones vinculadas</p>';
        } else {
            goalActions.forEach(action => {
                const dateStr = action.createdDate ? new Date(action.createdDate).toLocaleString('es-AR', dtOpts) : (action.date || '');
                const completedStr = action.completedDate ? new Date(action.completedDate).toLocaleString('es-AR', dtOpts) : '';
                let prosConsHtml = '';
                if (action.prosPct !== undefined && action.prosPct !== null) {
                    const pct = action.prosPct;
                    prosConsHtml = `
                        <div style="margin-top: 6px;">
                            <div style="display: flex; justify-content: space-between; font-size: 0.7rem; font-weight: 600;">
                                <span style="color: #22c55e;">👍 ${pct}%</span>
                                <span style="color: #ef4444;">👎 ${100 - pct}%</span>
                            </div>
                            <div style="height: 6px; border-radius: 3px; overflow: hidden; display: flex; margin-top: 2px;">
                                <div style="width: ${pct}%; background: #22c55e;"></div>
                                <div style="width: ${100 - pct}%; background: #ef4444;"></div>
                            </div>
                            ${action.pros ? `<div style="font-size: 0.75rem; color: #22c55e; margin-top: 4px;">✅ ${this.escapeHtml(action.pros)}</div>` : ''}
                            ${action.cons ? `<div style="font-size: 0.75rem; color: #ef4444;">❌ ${this.escapeHtml(action.cons)}</div>` : ''}
                        </div>
                    `;
                }
                actionsHtml += `
                    <div style="padding: 12px; background: var(--bg-secondary); border-radius: 10px; margin-bottom: 8px; border-left: 3px solid ${action.completed ? '#22c55e' : '#94a3b8'};">
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <input type="checkbox" ${action.completed ? 'checked' : ''} onchange="app.toggleActionComplete('${action.id}'); app.showFocusDetail('${goalId}');">
                            <div style="flex: 1;">
                                <div style="font-weight: 600; font-size: 0.9rem; ${action.completed ? 'text-decoration: line-through; opacity: 0.7;' : ''}">${this.escapeHtml(action.text)}</div>
                                ${action.notes ? `<div style="font-size: 0.8rem; color: var(--text-secondary); margin-top: 2px;">💭 ${this.escapeHtml(action.notes)}</div>` : ''}
                            </div>
                        </div>
                        <div style="font-size: 0.7rem; color: var(--text-secondary); margin-top: 6px;">
                            📅 Creada: ${dateStr}
                            ${action.completed ? `<br>✅ Completada: ${completedStr}` : ''}
                        </div>
                        ${prosConsHtml}
                    </div>
                `;
            });
        }
        let overlay = document.getElementById('focus-detail-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'focus-detail-overlay';
            document.body.appendChild(overlay);
        }
        overlay.style.cssText = 'position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 1000; display: flex; align-items: center; justify-content: center; padding: 20px;';
        overlay.innerHTML = `
            <div style="background: var(--bg); border-radius: 16px; max-width: 500px; width: 100%; max-height: 85vh; overflow-y: auto; padding: 24px; box-shadow: 0 25px 50px rgba(0,0,0,0.25);">
                <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 16px;">
                    <span style="font-size: 2rem;">${category.icon}</span>
                    <div style="flex: 1;">
                        <h2 style="margin: 0; font-size: 1.2rem;">${this.escapeHtml(goal.title)}</h2>
                        ${goal.description ? `<p style="margin: 4px 0 0; font-size: 0.85rem; color: var(--text-secondary);">${this.escapeHtml(goal.description)}</p>` : ''}
                    </div>
                    <button onclick="document.getElementById('focus-detail-overlay').remove()" style="background: none; border: none; font-size: 1.5rem; cursor: pointer; color: var(--text);">\u2715</button>
                </div>
                <div style="display: flex; gap: 12px; margin-bottom: 16px;">
                    <div style="flex: 1; text-align: center; padding: 10px; background: var(--bg-secondary); border-radius: 10px;">
                        <div style="font-size: 1.5rem; font-weight: 700; color: ${category.color};">${completedCount}/${goalActions.length}</div>
                        <div style="font-size: 0.75rem; color: var(--text-secondary);">Acciones</div>
                    </div>
                    <div style="flex: 1; text-align: center; padding: 10px; background: var(--bg-secondary); border-radius: 10px;">
                        <div style="font-size: 1.5rem; font-weight: 700; color: ${goalActions.length > 0 ? (completedCount === goalActions.length ? '#22c55e' : '#f59e0b') : '#94a3b8'};">
                            ${goalActions.length > 0 ? Math.round((completedCount / goalActions.length) * 100) : 0}%
                        </div>
                        <div style="font-size: 0.75rem; color: var(--text-secondary);">Progreso</div>
                    </div>
                </div>
                <h3 style="font-size: 0.95rem; margin-bottom: 10px;">Acciones</h3>
                ${actionsHtml}
                <button class="btn btn-secondary btn-small" onclick="document.getElementById('focus-detail-overlay').remove(); app.showCreateActionScreen();" style="width: 100%; margin-top: 8px;">+ Nueva Acción</button>
            </div>
        `;
    },

    updateProsConsBar() {
        const pct = parseInt(document.getElementById('action-pros-pct').value);
        document.getElementById('pros-pct-label').textContent = pct + '%';
        const bar = document.getElementById('pros-cons-bar');
        bar.children[0].style.width = pct + '%';
        bar.children[1].style.width = (100 - pct) + '%';
        const verdict = document.getElementById('pros-cons-verdict');
        if (pct >= 70) { verdict.textContent = '✅ Muy favorable'; verdict.style.color = '#22c55e'; }
        else if (pct >= 55) { verdict.textContent = '👍 Favorable'; verdict.style.color = '#22c55e'; }
        else if (pct >= 45) { verdict.textContent = '⚖️ Equilibrado'; verdict.style.color = '#f59e0b'; }
        else if (pct >= 30) { verdict.textContent = '👎 Desfavorable'; verdict.style.color = '#ef4444'; }
        else { verdict.textContent = '❌ Muy desfavorable'; verdict.style.color = '#ef4444'; }
    },

    showOnboardingFromHome() {
        this.showScreen('onboarding-screen');
        const btn = document.querySelector('#onboarding-screen .btn-primary');
        if (btn) {
            btn.textContent = '← Volver al Home';
            btn.onclick = () => {
                btn.textContent = 'Comenzar';
                btn.onclick = () => app.startApp();
                this.showScreen('home-screen');
                this.renderHome();
            };
        }
    },

    // Goals Management Screen
    showGoalsScreen() {
        this.renderGoalsScreen();
        this.showScreen('goals-screen');
    },

    renderGoalsScreen() {
        const activeGoals = this.data.goals.filter(g => g.isActive && !g.isArchived);
        const archivedGoals = this.data.goals.filter(g => g.isArchived);

        const activeContainer = document.getElementById('active-goals-container');
        const archivedContainer = document.getElementById('archived-goals-container');

        if (activeGoals.length === 0) {
            activeContainer.innerHTML = `
                <div class="empty-state-goals">
                    <p class="empty-text">No tienes metas activas</p>
                    <p class="motivational-text">"Sé específico, claro y directo. La claridad es poder."</p>
                </div>
            `;
        } else {
            activeContainer.innerHTML = activeGoals.map(goal => this.renderGoalCard(goal, false)).join('');
        }

        if (archivedGoals.length === 0) {
            archivedContainer.innerHTML = '<p class="empty-text" style="text-align:center; padding:20px;">No hay metas archivadas</p>';
        } else {
            archivedContainer.innerHTML = archivedGoals.map(goal => this.renderGoalCard(goal, true)).join('');
        }
    },

    showGoalsTab(tab) {
        const activeContainer = document.getElementById('active-goals-container');
        const archivedContainer = document.getElementById('archived-goals-container');
        const tabs = document.querySelectorAll('#goals-screen .tab-button');

        tabs.forEach(t => t.classList.remove('active'));

        if (tab === 'active') {
            activeContainer.style.display = 'block';
            archivedContainer.style.display = 'none';
            tabs[0].classList.add('active');
        } else {
            activeContainer.style.display = 'none';
            archivedContainer.style.display = 'block';
            tabs[1].classList.add('active');
        }
    },

    renderGoalCard(goal, isArchived) {
        const category = this.data.categories.find(c => c.id === goal.category) ||
            this.data.customCategories.find(c => c.id === goal.category) ||
            { name: 'Meta', icon: '🎯', color: '#667eea' };

        const linkedActions = this.data.actions.filter(a => a.goalIds && a.goalIds.includes(goal.id));
        const completedActions = linkedActions.filter(a => a.completed).length;

        const dtOpts = { day: 'numeric', month: 'short', year: 'numeric' };
        const createdDate = goal.createdDate
            ? new Date(goal.createdDate).toLocaleDateString('es-AR', dtOpts) : '';

        return `
            <div class="goal-card ${isArchived ? 'archived' : ''}" data-goal-id="${goal.id}" onclick="app.showFocusDetail('${goal.id}')">
                <div class="goal-header">
                    <span class="goal-icon">${category.icon}</span>
                    <span class="goal-category" style="color: ${category.color};">${category.name}</span>
                    ${createdDate ? `<span class="goal-date" style="font-size: 0.75rem; color: var(--text-secondary); margin-left: auto;">📅 ${createdDate}</span>` : ''}
                </div>
                <div class="goal-title">${this.escapeHtml(goal.title)}</div>
                ${goal.description ? `<div class="goal-description">${this.escapeHtml(goal.description)}</div>` : ''}
                <div class="goal-footer">
                    <div class="goal-stats-detail">
                        <span>✅ ${completedActions}/${linkedActions.length} acciones</span>
                    </div>
                    <div class="goal-actions">
                        <button class="btn-icon-small" onclick="event.stopPropagation(); app.editGoal('${goal.id}')" title="Editar">✏️</button>
                        ${isArchived
                ? `<button class="btn-icon-small" onclick="event.stopPropagation(); app.unarchiveGoal('${goal.id}')" title="Restaurar">♻️</button>`
                : `<button class="btn-icon-small" onclick="event.stopPropagation(); app.archiveGoal('${goal.id}')" title="Archivar">📦</button>`
            }
                        <button class="btn-icon-small" onclick="event.stopPropagation(); app.deleteGoal('${goal.id}')" title="Eliminar">🗑️</button>
                    </div>
                </div>
            </div>
        `;
    },

    showCreateGoalScreen() {
        document.getElementById('goal-form-title').textContent = 'Nueva Meta';
        document.getElementById('goal-id-input').value = '';
        document.getElementById('goal-title-input').value = '';
        document.getElementById('goal-description-input').value = '';
        this.populateGoalCategories();
        this.showScreen('create-goal-screen');
    },

    populateGoalCategories() {
        const select = document.getElementById('goal-category-select');
        const allCats = [...this.data.categories, ...this.data.customCategories];
        select.innerHTML = allCats.map(c => `<option value="${c.id}">${c.icon} ${c.name}</option>`).join('');
    },

    editGoal(goalId) {
        const goal = this.data.goals.find(g => g.id === goalId);
        if (!goal) return;
        document.getElementById('goal-form-title').textContent = 'Editar Meta';
        document.getElementById('goal-id-input').value = goal.id;
        document.getElementById('goal-title-input').value = goal.title;
        document.getElementById('goal-description-input').value = goal.description || '';
        this.populateGoalCategories();
        document.getElementById('goal-category-select').value = goal.category;
        this.showScreen('create-goal-screen');
    },

    saveGoal() {
        const id = document.getElementById('goal-id-input').value;
        const title = document.getElementById('goal-title-input').value.trim();
        const description = document.getElementById('goal-description-input').value.trim();
        const category = document.getElementById('goal-category-select').value;

        if (!title) {
            alert('Escribe un título para tu meta');
            return;
        }

        if (id) {
            const goal = this.data.goals.find(g => g.id === id);
            if (goal) {
                goal.title = title;
                goal.description = description;
                goal.category = category;
                goal.modifiedDate = new Date().toISOString();
            }
        } else {
            this.data.goals.push({
                id: 'goal_' + Date.now(),
                title,
                description,
                category,
                isActive: true,
                isArchived: false,
                createdDate: new Date().toISOString(),
                modifiedDate: new Date().toISOString(),
                history: []
            });
        }

        this.saveData();
        this.showGoalsScreen();
    },

    cancelGoalEdit() {
        this.showGoalsScreen();
    },

    archiveGoal(goalId) {
        const goal = this.data.goals.find(g => g.id === goalId);
        if (goal) {
            goal.isArchived = true;
            goal.isActive = false;
            this.saveData();
            this.renderGoalsScreen();
        }
    },

    unarchiveGoal(goalId) {
        const goal = this.data.goals.find(g => g.id === goalId);
        if (goal) {
            goal.isArchived = false;
            goal.isActive = true;
            this.saveData();
            this.renderGoalsScreen();
        }
    },

    deleteGoal(goalId) {
        if (confirm('¿Eliminar esta meta? Esta acción no se puede deshacer.')) {
            this.data.goals = this.data.goals.filter(g => g.id !== goalId);
            this.saveData();
            this.renderGoalsScreen();
        }
    },

    // Actions Management Screen with filters
    showActionsScreen() {
        this.renderActionsScreen();
        this.showScreen('actions-screen');
    },

    renderActionsScreen() {
        const container = document.getElementById('filtered-actions-container');
        if (!container) return;

        // Populate filter
        this.populateFilterFocus();

        const filterFocus = document.getElementById('filter-focus')?.value || 'all';
        const filterStatus = document.getElementById('filter-status')?.value || 'all';

        let actions = [...this.data.actions];

        if (filterStatus === 'pending') {
            actions = actions.filter(a => !a.completed);
        } else if (filterStatus === 'completed') {
            actions = actions.filter(a => a.completed);
        }

        if (filterFocus !== 'all') {
            actions = actions.filter(a => a.goalIds && a.goalIds.includes(filterFocus));
        }

        if (actions.length === 0) {
            container.innerHTML = '<p class="empty-text" style="text-align: center; padding: 20px; opacity: 0.7;">No hay acciones con estos filtros</p>';
            return;
        }

        container.innerHTML = actions.map(action => this.renderActionCard(action, action.completed)).join('');
    },

    renderActionCard(action, isCompleted) {
        const linkedGoals = (action.goalIds || []).map(gId => {
            const goal = this.data.goals.find(g => g.id === gId);
            if (!goal) return null;
            const category = this.data.categories.find(c => c.id === goal.category) ||
                this.data.customCategories.find(c => c.id === goal.category) ||
                { icon: '🎯', color: '#667eea' };
            return { title: goal.title, icon: category.icon, color: category.color };
        }).filter(g => g);

        const dtOpts = { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' };
        const createdDate = action.createdDate
            ? new Date(action.createdDate).toLocaleString('es-AR', dtOpts)
            : (action.date ? new Date(action.date).toLocaleDateString('es-AR') : '');
        const modifiedDate = action.modifiedDate
            ? new Date(action.modifiedDate).toLocaleString('es-AR', dtOpts)
            : '';

        // Pros/cons display
        let prosConsHtml = '';
        if (action.prosPct !== undefined && action.prosPct !== null) {
            const pct = action.prosPct;
            const barColor = pct >= 60 ? '#22c55e' : pct <= 40 ? '#ef4444' : '#f59e0b';
            const verdict = pct >= 70 ? '✅ Muy favorable' : pct >= 55 ? '👍 Favorable' : pct >= 45 ? '⚖️ Equilibrado' : pct >= 30 ? '👎 Desfavorable' : '❌ Muy desfavorable';
            prosConsHtml = `
                <div style="margin-top: 8px; padding: 8px; background: var(--bg-secondary); border-radius: 8px;">
                    <div style="font-size: 0.8rem; font-weight: 600; margin-bottom: 4px;">⚖️ ${verdict}</div>
                    <div style="height: 6px; border-radius: 3px; overflow: hidden; display: flex;">
                        <div style="width: ${pct}%; background: #22c55e;"></div>
                        <div style="width: ${100 - pct}%; background: #ef4444;"></div>
                    </div>
                    <div style="display: flex; justify-content: space-between; font-size: 0.7rem; margin-top: 2px;">
                        <span style="color: #22c55e;">👍 ${pct}%</span>
                        <span style="color: #ef4444;">👎 ${100 - pct}%</span>
                    </div>
                    ${action.pros ? `<div style="font-size: 0.75rem; color: #22c55e; margin-top: 4px;">✅ ${this.escapeHtml(action.pros)}</div>` : ''}
                    ${action.cons ? `<div style="font-size: 0.75rem; color: #ef4444;">❌ ${this.escapeHtml(action.cons)}</div>` : ''}
                </div>
            `;
        }

        return `
            <div class="goal-card ${isCompleted ? 'archived' : ''}" data-action-id="${action.id}">
                <div class="goal-header">
                    <span class="goal-icon">${isCompleted ? '✅' : '⬜'}</span>
                    <span class="goal-category" style="font-size: 0.85rem;">${isCompleted ? 'Completada' : 'Pendiente'}</span>
                    ${createdDate ? `<span class="goal-date" style="font-size: 0.75rem; color: var(--text-secondary); margin-left: auto;">📅 ${createdDate}</span>` : ''}
                </div>
                <div class="goal-title" style="${isCompleted ? 'text-decoration: line-through; opacity: 0.7;' : ''}">${this.escapeHtml(action.text)}</div>
                ${action.notes ? `<div class="goal-description">💭 ${this.escapeHtml(action.notes)}</div>` : ''}
                ${linkedGoals.length > 0 ? `
                    <div style="display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px;">
                        ${linkedGoals.map(g => `
                            <span style="background: ${g.color}22; color: ${g.color}; padding: 2px 8px; border-radius: 8px; font-size: 0.75rem; font-weight: 500;">
                                ${g.icon} ${this.escapeHtml(g.title)}
                            </span>
                        `).join('')}
                    </div>
                ` : '<div style="font-size: 0.75rem; color: var(--text-secondary); margin-top: 6px;">📋 Sin Focus vinculado</div>'}
                ${prosConsHtml}
                <div class="goal-footer">
                    <div class="goal-stats-detail" style="display: flex; flex-direction: column; gap: 2px; font-size: 0.8rem; color: var(--text-secondary);">
                        ${modifiedDate ? `<span>✏️ Modificada: ${modifiedDate}</span>` : ''}
                    </div>
                    <div class="goal-actions">
                        <button class="btn-icon-small" onclick="app.toggleActionComplete('${action.id}', 'actions')" title="${isCompleted ? 'Desmarcar' : 'Completar'}">${isCompleted ? '↩️' : '✅'}</button>
                        <button class="btn-icon-small" onclick="app.editAction('${action.id}')" title="Editar">✏️</button>
                        <button class="btn-icon-small" onclick="app.deleteAction('${action.id}')" title="Eliminar">🗑️</button>
                    </div>
                </div>
            </div>
        `;
    },

    // Create/Edit Action
    showCreateActionScreen() {
        document.getElementById('action-id-input').value = '';
        document.getElementById('action-text-input').value = '';
        document.getElementById('action-notes-input').value = '';
        document.getElementById('action-pros-input').value = '';
        document.getElementById('action-cons-input').value = '';
        document.getElementById('action-pros-pct').value = 50;
        this.updateProsConsBar();
        this.populateActionGoals();
        this.showScreen('create-action-screen');
    },

    populateActionGoals() {
        const container = document.getElementById('action-goals-checkboxes');
        const activeGoals = this.data.goals.filter(g => g.isActive && !g.isArchived);
        if (activeGoals.length === 0) {
            container.innerHTML = '<p class="empty-text" style="font-size: 0.85rem;">No hay metas activas. Crea una primero.</p>';
            return;
        }
        container.innerHTML = activeGoals.map(goal => {
            const cat = this.data.categories.find(c => c.id === goal.category) ||
                this.data.customCategories.find(c => c.id === goal.category) || { icon: '🎯' };
            return `
                <label style="display: flex; align-items: center; gap: 8px; padding: 8px; background: var(--bg-secondary); border-radius: 8px; margin-bottom: 6px; cursor: pointer;">
                    <input type="checkbox" class="action-goal-check" value="${goal.id}">
                    <span>${cat.icon} ${this.escapeHtml(goal.title)}</span>
                </label>
            `;
        }).join('');
    },

    editAction(actionId) {
        // Record if we are coming from the actions-screen
        this.editingFromActionsScreen = document.getElementById('actions-screen').classList.contains('active');

        const action = this.data.actions.find(a => a.id === actionId);
        if (!action) return;
        document.getElementById('action-id-input').value = action.id;
        document.getElementById('action-text-input').value = action.text;
        document.getElementById('action-notes-input').value = action.notes || '';
        document.getElementById('action-pros-input').value = action.pros || '';
        document.getElementById('action-cons-input').value = action.cons || '';
        document.getElementById('action-pros-pct').value = action.prosPct !== undefined ? action.prosPct : 50;
        this.updateProsConsBar();
        this.populateActionGoals();
        // Check linked goals
        if (action.goalIds) {
            const checks = document.querySelectorAll('.action-goal-check');
            checks.forEach(cb => {
                if (action.goalIds.includes(cb.value)) cb.checked = true;
            });
        }
        this.showScreen('create-action-screen');
        window.scrollTo({ top: 0, behavior: 'smooth' });
    },

    saveAction() {
        const id = document.getElementById('action-id-input').value;
        const text = document.getElementById('action-text-input').value.trim();
        const notes = document.getElementById('action-notes-input').value.trim();
        const pros = document.getElementById('action-pros-input').value.trim();
        const cons = document.getElementById('action-cons-input').value.trim();
        const prosPct = parseInt(document.getElementById('action-pros-pct').value);

        if (!text) {
            alert('Escribe tu acción');
            return;
        }

        const goalIds = [];
        document.querySelectorAll('.action-goal-check:checked').forEach(cb => {
            goalIds.push(cb.value);
        });

        if (id) {
            const action = this.data.actions.find(a => a.id === id);
            if (action) {
                action.text = text;
                action.notes = notes;
                action.pros = pros || null;
                action.cons = cons || null;
                action.prosPct = (pros || cons) ? prosPct : null;
                action.goalIds = goalIds;
                action.modifiedDate = new Date().toISOString();
            }
        } else {
            this.data.actions.push({
                id: 'action_' + Date.now(),
                text,
                notes,
                pros: pros || null,
                cons: cons || null,
                prosPct: (pros || cons) ? prosPct : null,
                date: new Date().toDateString(),
                goalIds,
                completed: false,
                completedDate: null,
                createdDate: new Date().toISOString(),
                modifiedDate: new Date().toISOString()
            });
        }

        this.saveData();

        if (this.editingFromActionsScreen) {
            this.showScreen('actions-screen');
            this.renderActionsScreen();
            this.editingFromActionsScreen = false;
        } else {
            this.showScreen('home-screen');
            this.renderHome();
        }
    },

    cancelActionEdit() {
        this.showScreen('home-screen');
        this.renderHome();
    },

    deleteAction(actionId) {
        if (confirm('¿Eliminar esta acción?')) {
            this.data.actions = this.data.actions.filter(a => a.id !== actionId);
            this.saveData();
            this.renderActionsScreen();
        }
    },

    editActionNotes(actionId) {
        const action = this.data.actions.find(a => a.id === actionId);
        if (!action) return;
        const newNotes = prompt('Notas/Resultado:', action.notes || '');
        if (newNotes !== null) {
            action.notes = newNotes.trim();
            action.modifiedDate = new Date().toISOString();
            this.saveData();
            this.renderHome();
        }
    },

    // Categories Management
    showCategoriesScreen() {
        this.renderCategoriesScreen();
        this.showScreen('categories-screen');
    },

    renderCategoriesScreen() {
        const container = document.getElementById('categories-list');
        const allCats = [...this.data.categories, ...this.data.customCategories];
        container.innerHTML = allCats.map(cat => `
            <div class="category-item" style="display: flex; align-items: center; gap: 10px; padding: 12px; background: var(--card-bg); border-radius: 10px; margin-bottom: 8px;">
                <span style="font-size: 1.5rem;">${cat.icon}</span>
                <span style="flex: 1; font-weight: 500;">${cat.name}</span>
                <span style="width: 20px; height: 20px; border-radius: 50%; background: ${cat.color};"></span>
                ${this.data.customCategories.find(c => c.id === cat.id) ?
                `<button class="btn-icon-small" onclick="app.deleteCategory('${cat.id}')">🗑️</button>` : ''}
            </div>
        `).join('');
    },

    showCreateCategoryScreen() {
        this.showScreen('create-category-screen');
    },

    saveCategory() {
        const name = document.getElementById('category-name-input').value.trim();
        const icon = document.getElementById('category-icon-input').value.trim() || '🎯';
        const color = document.getElementById('category-color-input').value;

        if (!name) {
            alert('Escribe un nombre');
            return;
        }

        this.data.customCategories.push({
            id: 'cat_' + Date.now(),
            name,
            icon,
            color
        });

        this.saveData();
        this.showCategoriesScreen();
    },

    deleteCategory(catId) {
        if (confirm('¿Eliminar esta categoría?')) {
            this.data.customCategories = this.data.customCategories.filter(c => c.id !== catId);
            this.saveData();
            this.renderCategoriesScreen();
        }
    },

    // Settings
    showSettings() {
        this.loadSettingsValues();
        this.showScreen('settings-screen');
    },

    closeSettings() {
        this.showScreen('home-screen');
        this.renderHome();
    },

    loadSettingsValues() {
        const taglineInput = document.getElementById('custom-tagline-input');
        if (taglineInput) {
            taglineInput.value = this.data.customTagline || '';
        }
        const reminderCheck = document.getElementById('reminder-check');
        if (reminderCheck) {
            reminderCheck.checked = this.data.reminderEnabled;
        }
        const reminderTime = document.getElementById('reminder-time');
        if (reminderTime) {
            reminderTime.value = this.data.reminderTime || '09:00';
        }
    },

    saveTagline() {
        const input = document.getElementById('custom-tagline-input');
        if (input) {
            this.data.customTagline = input.value.trim();
            this.saveData();
            const taglineEl = document.querySelector('.tagline-ending');
            if (taglineEl && this.data.customTagline) {
                taglineEl.textContent = this.data.customTagline;
            }
            alert('Tagline guardado ✅');
        }
    },

    toggleReminder() {
        const check = document.getElementById('reminder-check');
        this.data.reminderEnabled = check.checked;
        this.saveData();
    },

    saveReminderTime() {
        const time = document.getElementById('reminder-time');
        if (time) {
            this.data.reminderTime = time.value;
            this.saveData();
            alert('Hora guardada ✅');
        }
    },

    exportData() {
        const blob = new Blob([JSON.stringify(this.data, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'facto_backup_' + new Date().toISOString().split('T')[0] + '.json';
        a.click();
    },

    importData() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (ev) => {
                try {
                    const imported = JSON.parse(ev.target.result);
                    if (confirm('¿Importar estos datos? Se reemplazarán los actuales.')) {
                        this.data = { ...this.data, ...imported };
                        this.saveData();
                        this.renderHome();
                        alert('Datos importados ✅');
                    }
                } catch (err) {
                    alert('Error al importar: ' + err.message);
                }
            };
            reader.readAsText(file);
        };
        input.click();
    },

    resetData() {
        if (confirm('¿Eliminar TODOS los datos? Esta acción no se puede deshacer.')) {
            if (confirm('¿Estás seguro? Se perderá todo.')) {
                localStorage.removeItem('facto_data');
                location.reload();
            }
        }
    },

    // History
    showHistoryScreen() {
        const container = document.getElementById('history-list');
        if (!container) return;

        const history = (this.data.history || []).slice().reverse();

        if (history.length === 0) {
            container.innerHTML = '<p class="empty-text" style="text-align: center; padding: 20px;">No hay historial aún</p>';
        } else {
            container.innerHTML = history.map(entry => {
                const action = this.data.actions.find(a => a.id === entry.actionId);
                return `
                    <div style="padding: 10px; background: var(--card-bg); border-radius: 8px; margin-bottom: 6px; font-size: 0.85rem;">
                        <span>✅</span> ${action ? this.escapeHtml(action.text) : 'Acción eliminada'} 
                        <span style="color: var(--text-secondary); font-size: 0.75rem;">${entry.date}</span>
                    </div>
                `;
            }).join('');
        }

        this.showScreen('history-screen');
    },

    // Utility functions
    showScreen(screenId) {
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        const screen = document.getElementById(screenId);
        if (screen) screen.classList.add('active');
    },

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },

};

// Initialize the app when the DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    app.init();
});

// Register service worker
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
            .then(reg => console.log('SW registered'))
            .catch(err => console.log('SW failed:', err));
    });
}
