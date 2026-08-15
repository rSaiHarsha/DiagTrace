// Global Application State
let appState = {
    allData: [],
    filteredData: [],
    columns: [], // Dynamically loaded column list
    currentPage: 1,
    pageSize: 50,
    filters: {}, // Dynamically loaded column filters
    isPolling: false,
    pollIntervalId: null,
    currentExplorerPath: "",
    activeTab: "server",
    currentUser: null,
    authToken: localStorage.getItem('diagtrace_token') || null,
    currentTheme: localStorage.getItem('diagtrace_theme') || 'white',
    lastRcaMarkdown: ""
};

function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// Global Chart.js Instances
let charts = {
    topDtc: null,
    topModules: null,
    statusModules: null,
    programDist: null
};
let topDtcDialogChart = null;

// Chat Session ID — unique per page load for conversation memory
let chatSessionId = (typeof crypto !== 'undefined' && crypto.randomUUID) 
    ? crypto.randomUUID() 
    : 'session-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);

// DOM Elements Cache
const elements = {
    dbStatus: document.getElementById('db-status'),
    btnBrowseFolder: document.getElementById('btn-browse-folder'),
    folderPickerClient: document.getElementById('folder-picker-client'),
    btnRunAnalysis: document.getElementById('btn-run-analysis'),
    btnResetDb: document.getElementById('btn-reset-db'),
    versionBadge:document.getElementById("version-badge"),
    logConsoleContainer: document.getElementById('log-console-container'),
    logConsole: document.getElementById('log-console'),
    consoleSpinner: document.getElementById('console-spinner'),
    btnToggleLogs: document.getElementById('btn-toggle-logs'),
    
    resultsSection: document.getElementById('results-section'),
    ragSection: document.getElementById('rag-section'),
    btnOpenLogs: document.getElementById('btn-sidebar-logs-nav'),
    
    // KPIs
    kpiTotalRecords: document.getElementById('kpi-total-records'),
    kpiUniqueDtcs: document.getElementById('kpi-unique-dtcs'),
    kpiActivePrograms: document.getElementById('kpi-active-programs'),
    kpiActiveModules: document.getElementById('kpi-active-modules'),
    kpiOpenIssues: document.getElementById('kpi-open-issues'),
    
    // Table Header Row for Dynamic Headers
    tableHeadersRow: document.getElementById('table-headers-row'),
    btnClearFilters: document.getElementById('btn-clear-filters'),
    btnExportExcel: document.getElementById('btn-export-excel'),
    
    // Grid Table Body & Controls
    registryTableBody: document.getElementById('registry-table-body'),
    pageSizeSelect: document.getElementById('page-size-select'),
    paginationInfoText: document.getElementById('pagination-info-text'),
    btnPagePrev: document.getElementById('btn-page-prev'),
    pageNumDisplay: document.getElementById('page-num-display'),
    btnPageNext: document.getElementById('btn-page-next'),
    
    // Header Navigation Controls
    btnHeaderProfile: document.getElementById('btn-header-profile'),
    headerProfileText: document.getElementById('header-profile-text'),
    btnHeaderSettings: document.getElementById('btn-header-settings'),
    
    // Auth Modals & Profile / Settings
    signinModal: document.getElementById('signin-modal'),
    signinClose: document.getElementById('signin-close'),
    signinForm: document.getElementById('signin-form'),
    signinIdentifier: document.getElementById('signin-identifier'),
    signinPassword: document.getElementById('signin-password'),
    signinError: document.getElementById('signin-error'),
    linkGotoSignup: document.getElementById('link-goto-signup'),

    
    
    signupModal: document.getElementById('signup-modal'),
    signupClose: document.getElementById('signup-close'),
    signupForm: document.getElementById('signup-form'),
    signupName: document.getElementById('signup-name'),
    signupUsername: document.getElementById('signup-username'),
    signupEmail: document.getElementById('signup-email'),
    signupPassword: document.getElementById('signup-password'),
    signupError: document.getElementById('signup-error'),
    linkGotoSignin: document.getElementById('link-goto-signin'),
    
    profileModal: document.getElementById('profile-modal'),
    profileClose: document.getElementById('profile-close'),
    profileUserView: document.getElementById('profile-user-view'),
    profileGuestView: document.getElementById('profile-guest-view'),
    profileDisplayName: document.getElementById('profile-display-name'),
    profileUsername: document.getElementById('profile-username'),
    profileEmail: document.getElementById('profile-email'),
    btnProfileSignout: document.getElementById('btn-profile-signout'),
    btnProfileSignin: document.getElementById('btn-profile-signin'),
    btnProfileSignup: document.getElementById('btn-profile-signup'),
    
    settingsModal: document.getElementById('settings-modal'),
    settingsClose: document.getElementById('settings-close'),
    tabBtnTheme: document.getElementById('tab-btn-theme'),
    tabBtnAi: document.getElementById('tab-btn-ai'),
    settingsViewTheme: document.getElementById('settings-view-theme'),
    settingsViewAi: document.getElementById('settings-view-ai'),
    aiSettingsForm: document.getElementById('ai-settings-form'),
    settingLlmModel: document.getElementById('setting-llm-model'),
    settingEmbedModel: document.getElementById('setting-embed-model'),
    settingNvidiaKey: document.getElementById('setting-nvidia-key'),
    btnToggleNvidiaKey: document.getElementById('btn-toggle-nvidia-key'),
    settingQdrantUrl: document.getElementById('setting-qdrant-url'),
    settingQdrantKey: document.getElementById('setting-qdrant-key'),
    btnToggleQdrantKey: document.getElementById('btn-toggle-qdrant-key'),
    btnTestAiSettings: document.getElementById('btn-test-ai-settings'),
    
    // AI RCA & RAG & Chatbot
    btnRunRca: document.getElementById('btn-sidebar-rca-nav'),
    btnStartRca: document.getElementById('btn-start-rca'),
    btnDownloadRca: document.getElementById('btn-download-rca'),
    btnDockRca: document.getElementById('btn-dock-rca'),
    dockedRcaWidget: document.getElementById('docked-rca-widget'),
    dockedRcaStatusText: document.getElementById('docked-rca-status-text'),
    dockedRcaProgressBar: document.getElementById('docked-rca-progress-bar'),
    btnMaximizeDockedRca: document.getElementById('btn-maximize-docked-rca'),
    btnCloseDockedRca: document.getElementById('btn-close-docked-rca'),
    dockedRcaBody: document.getElementById('docked-rca-body'),
    btnOpenRag: document.getElementById('btn-sidebar-rag-nav'),
    rcaModal: document.getElementById('rca-modal'),
    rcaClose: document.getElementById('rca-close'),
    rcaLoading: document.getElementById('rca-loading'),
    rcaReportBody: document.getElementById('rca-report-body'),
    rcaScopeSelect: document.getElementById('rca-scope-select'),
    rcaChartsContainer: document.getElementById('rca-charts-container'),
    
    ragModal: document.getElementById('rag-section'), // kept as ragModal for compatibility
    ragClose: document.getElementById('rag-close'),
    ragTabFile: document.getElementById('rag-tab-file'),
    ragTabManual: document.getElementById('rag-tab-manual'),
    ragTabChunks: document.getElementById('rag-tab-chunks'),
    ragViewChunks: document.getElementById('rag-view-chunks'),
    ragChunkCategoryFilter: document.getElementById('rag-chunk-category-filter'),
    ragChunkSearch: document.getElementById('rag-chunk-search'),
    ragChunksContainer: document.getElementById('rag-chunks-container'),
    ragChunkCount: document.getElementById('rag-chunk-count'),
    ragChunkPageSize: document.getElementById('rag-chunk-page-size'),
    btnRagChunkPrev: document.getElementById('btn-rag-chunk-prev'),
    btnRagChunkNext: document.getElementById('btn-rag-chunk-next'),
    ragChunkPageNum: document.getElementById('rag-chunk-page-num'),

    ragViewFile: document.getElementById('rag-view-file'),
    ragViewManual: document.getElementById('rag-view-manual'),
    ragFileForm: document.getElementById('rag-file-form'),
    ragFileCategory: document.getElementById('rag-file-category'),
    ragDropzone: document.getElementById('rag-dropzone'),
    ragFileInput: document.getElementById('rag-file-input'),
    ragFilePreview: document.getElementById('rag-file-preview'),
    ragFileName: document.getElementById('rag-file-name'),
    btnRemoveRagFile: document.getElementById('btn-remove-rag-file'),
    btnUploadRagFile: document.getElementById('btn-upload-rag-file'),
    btnDockRag: document.getElementById('btn-dock-rag'),
    ragProgressSection: document.getElementById('rag-progress-section'),
    ragProgressStatusText: document.getElementById('rag-progress-status-text'),
    ragProgressPercentage: document.getElementById('rag-progress-percentage'),
    ragProgressBarFill: document.getElementById('rag-progress-bar-fill'),
    ragLiveLogList: document.getElementById('rag-live-log-list'),
    
    dockedRagWidget: document.getElementById('docked-rag-widget'),
    dockedRagStatusText: document.getElementById('docked-rag-status-text'),
    dockedRagProgressBar: document.getElementById('docked-rag-progress-bar'),
    btnMaximizeDockedRag: document.getElementById('btn-maximize-docked-rag'),
    btnCloseDockedRag: document.getElementById('btn-close-docked-rag'),
    
    ragIngestForm: document.getElementById('rag-ingest-form'),
    ragTitle: document.getElementById('rag-title'),
    ragCategory: document.getElementById('rag-category'),
    ragContent: document.getElementById('rag-content'),
    ragDocsContainer: document.getElementById('rag-docs-container'),
    
    chatWidgetToggle: document.getElementById('chat-widget-toggle'),
    chatDrawer: document.getElementById('chat-drawer'),
    chatDrawerClose: document.getElementById('chat-drawer-close'),
    chatDrawerExpand: document.getElementById('chat-drawer-expand'),
    chatModalBackdrop: document.getElementById('chat-modal-backdrop'),
    chatNewChat: document.getElementById('chat-new-chat'),
    chatHistory: document.getElementById('chat-history'),
    chatForm: document.getElementById('chat-form'),
    chatInput: document.getElementById('chat-input'),
    
    // Modal Explorer Tabs
    explorerModal: document.getElementById('explorer-modal'),
    explorerClose: document.getElementById('explorer-close'),
    tabServer: document.getElementById('tab-server'),
    tabClient: document.getElementById('tab-client'),
    explorerServerView: document.getElementById('explorer-server-view'),
    explorerClientView: document.getElementById('explorer-client-view'),
    
    // Explorer Server-side Elements
    explorerCurrentPath: document.getElementById('explorer-current-path'),
    explorerNavUp: document.getElementById('explorer-nav-up'),
    explorerNavHome: document.getElementById('explorer-nav-home'),
    explorerShortcutWorkspace: document.getElementById('explorer-shortcut-workspace'),
    explorerShortcutRoot: document.getElementById('explorer-shortcut-root'),
    explorerShortcutUser: document.getElementById('explorer-shortcut-user'),
    explorerItemsContainer: document.getElementById('explorer-items-container'),
    
    // Explorer Client-side Upload
    uploadDropzone: document.getElementById('upload-dropzone'),
    selectedClientFilesCount: document.getElementById('selected-client-files-count'),
    
    // Explorer Modal Controls
    explorerSelectedInfo: document.getElementById('explorer-selected-info'),
    explorerBtnCancel: document.getElementById('explorer-btn-cancel'),
    explorerBtnSelect: document.getElementById('explorer-btn-select'),
    
    // Toast
    toast: document.getElementById('toast'),
    toastMessage: document.getElementById('toast-message')
};

// Initialize App on DOM Content Loaded
document.addEventListener('DOMContentLoaded', () => {
    initApp();
});

function loadAppVersion(){
    fetch('/api/version')
    .then(res => res.json())
    .then(data => {
        if(elements.versionBadge){
        elements.versionBadge.innerText = data.version;
        }
    })
    .catch(err => {
        console.log("Failed to fetch version",err);
    })
}


function initApp() {
    applyTheme(appState.currentTheme);
    setupEventListeners();
    setupErrorLogging();
    checkAuthStatus();
    checkEngineStatus();
    loadRegistryData();
    loadAppVersion();
    restoreRcaSessionState();
    
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('open') === 'rca') {
        openRcaModal();
    }
    
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
        if (appState.currentTheme === 'system' && appState.allData.length > 0) {
            renderCharts();
        }
    });
}

// ----------------------------------------------------
// Event Listeners Configuration
// ----------------------------------------------------
function setupEventListeners() {
    // Header Actions (Profile & Settings)
    if (elements.btnHeaderProfile) elements.btnHeaderProfile.addEventListener('click', openProfileModal);
    if (elements.btnHeaderSettings) elements.btnHeaderSettings.addEventListener('click', openSettingsModal);
    
    // Settings Tabs & AI Models
    if (elements.tabBtnTheme) elements.tabBtnTheme.addEventListener('click', () => switchSettingsTab('theme'));
    if (elements.tabBtnAi) elements.tabBtnAi.addEventListener('click', () => switchSettingsTab('ai'));
    if (elements.aiSettingsForm) elements.aiSettingsForm.addEventListener('submit', handleAiSettingsSubmit);
    if (elements.btnTestAiSettings) elements.btnTestAiSettings.addEventListener('click', handleAiSettingsTest);
    if (elements.btnToggleNvidiaKey) {
        elements.btnToggleNvidiaKey.addEventListener('click', () => {
            if (elements.settingNvidiaKey) {
                elements.settingNvidiaKey.type = elements.settingNvidiaKey.type === 'password' ? 'text' : 'password';
            }
        });
    }
    if (elements.btnToggleQdrantKey) {
        elements.btnToggleQdrantKey.addEventListener('click', () => {
            if (elements.settingQdrantKey) {
                elements.settingQdrantKey.type = elements.settingQdrantKey.type === 'password' ? 'text' : 'password';
            }
        });
    }
    
    // AI RCA & RAG Knowledge Base Controls
    if (elements.btnRunRca) elements.btnRunRca.addEventListener('click', openRcaModal);
    if (elements.btnStartRca) elements.btnStartRca.addEventListener('click', runAiRcaAnalysis);
    if (elements.btnDownloadRca) elements.btnDownloadRca.addEventListener('click', downloadRcaReport);
    if (elements.btnDockRca) elements.btnDockRca.addEventListener('click', dockRcaModal);
    if (elements.btnMaximizeDockedRca) elements.btnMaximizeDockedRca.addEventListener('click', maximizeRcaDock);
    if (elements.btnCloseDockedRca) elements.btnCloseDockedRca.addEventListener('click', closeRcaDock);
    if (elements.dockedRcaBody) elements.dockedRcaBody.addEventListener('click', maximizeRcaDock);
    if (elements.rcaClose) elements.rcaClose.addEventListener('click', closeRcaModal);
    
    // AI Chatbot Widget Controls
    if (elements.chatWidgetToggle) elements.chatWidgetToggle.addEventListener('click', toggleChatDrawer);
    if (elements.chatDrawerClose) elements.chatDrawerClose.addEventListener('click', closeChatDrawer);
    if (elements.chatDrawerExpand) elements.chatDrawerExpand.addEventListener('click', toggleExpandChatDrawer);
    if (elements.chatNewChat) elements.chatNewChat.addEventListener('click', newChatSession);
    if (elements.chatForm) elements.chatForm.addEventListener('submit', handleChatSubmit);
    
    document.querySelectorAll('.chip-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const prompt = btn.dataset.prompt;
            if (prompt && elements.chatInput) {
                elements.chatInput.value = prompt;
                handleChatSubmit(new Event('submit'));
            }
        });
    });
    
    // Load initial chat sessions
    loadChatSessions();
    
    if (elements.profileClose) elements.profileClose.addEventListener('click', closeProfileModal);
    if (elements.settingsClose) elements.settingsClose.addEventListener('click', closeSettingsModal);
    
    if (elements.btnProfileSignout) {
        elements.btnProfileSignout.addEventListener('click', () => {
            closeProfileModal();
            handleSignOut();
        });
    }
    if (elements.btnProfileSignin) {
        elements.btnProfileSignin.addEventListener('click', () => {
            closeProfileModal();
            openSignInModal();
        });
    }
    if (elements.btnProfileSignup) {
        elements.btnProfileSignup.addEventListener('click', () => {
            closeProfileModal();
            openSignUpModal();
        });
    }

    // Theme Selection Radios
    document.querySelectorAll('input[name="app-theme"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            applyTheme(e.target.value);
            showToast(`Theme changed to ${e.target.value.replace('-', ' ')}`);
        });
    });

    // Hide custom context menu on outside click
    document.addEventListener('click', (e) => {
        const contextMenu = document.getElementById('row-context-menu');
        if (contextMenu && !contextMenu.classList.contains('hidden')) {
            contextMenu.classList.add('hidden');
        }
    });

    // Auth Modals Controls
    if (elements.signinClose) elements.signinClose.addEventListener('click', closeSignInModal);
    if (elements.signupClose) elements.signupClose.addEventListener('click', closeSignUpModal);
    
    if (elements.linkGotoSignup) {
        elements.linkGotoSignup.addEventListener('click', (e) => {
            e.preventDefault();
            closeSignInModal();
            openSignUpModal();
        });
    }
    
    if (elements.linkGotoSignin) {
        elements.linkGotoSignin.addEventListener('click', (e) => {
            e.preventDefault();
            closeSignUpModal();
            openSignInModal();
        });
    }
    
    if (elements.signinForm) elements.signinForm.addEventListener('submit', handleSignIn);
    if (elements.signupForm) elements.signupForm.addEventListener('submit', handleSignUp);

    // Ingestion controls
    if (elements.folderPickerClient) elements.folderPickerClient.addEventListener('change', handleClientFolderSelected);
    if (elements.btnToggleLogs) elements.btnToggleLogs.addEventListener('click', toggleLogsMinimization);
    
    // Clear Filters Action
    if (elements.btnClearFilters) elements.btnClearFilters.addEventListener('click', clearAllFilters);
    if (elements.explorerCurrentPath) {
        elements.explorerCurrentPath.addEventListener('click', () => {
            const path = elements.explorerCurrentPath.value;
            if (path) {
                fetchDirectoryContents(path);
            }
        });
    }
    if (elements.btnToggleLogs) {
        elements.btnToggleLogs.addEventListener('click', toggleLogsMinimization);
        elements.btnToggleLogs.classList.add('hidden');
    }
    
    // Event delegation for dynamic header column filters
    if (elements.tableHeadersRow) {
        elements.tableHeadersRow.addEventListener('change', (e) => {
            if (e.target.classList.contains('header-filter-select') || e.target.classList.contains('custom-dropdown')) {
                handleFilterChange();
            }
        });
        elements.tableHeadersRow.addEventListener('input', debounce((e) => {
            if (e.target.classList.contains('header-filter-input')) {
                handleFilterChange();
            }
        }, 250));
    }
    
    // Pagination & Page Size
    if (elements.pageSizeSelect) {
        elements.pageSizeSelect.addEventListener('change', (e) => {
            appState.pageSize = e.target.value === 'all' ? 'all' : parseInt(e.target.value);
            appState.currentPage = 1;
            renderGridAndPagination();
        });
    }
    if (elements.btnPagePrev) {
        elements.btnPagePrev.addEventListener('click', () => {
            if (appState.currentPage > 1) {
                appState.currentPage--;
                renderGridAndPagination();
            }
        });
    }
    if (elements.btnPageNext) {
        elements.btnPageNext.addEventListener('click', () => {
            const totalPages = getTotalPages();
            if (appState.currentPage < totalPages) {
                appState.currentPage++;
                renderGridAndPagination();
            }
        });
    }
    
    // Export to Excel
    if (elements.btnExportExcel) elements.btnExportExcel.addEventListener('click', exportToExcel);
    
    // Modal Dialog Show / Hide triggers
    if (elements.btnBrowseFolder) elements.btnBrowseFolder.addEventListener('click', openExplorerModal);
    if (elements.explorerClose) elements.explorerClose.addEventListener('click', closeExplorerModal);
    if (elements.explorerBtnCancel) elements.explorerBtnCancel.addEventListener('click', closeExplorerModal);
    if (elements.explorerBtnSelect) elements.explorerBtnSelect.addEventListener('click', selectExplorerFolder);
    
    // Dialog Navigation Tab Selectors
    if (elements.tabServer) elements.tabServer.addEventListener('click', () => toggleModalTab('server'));
    if (elements.tabClient) elements.tabClient.addEventListener('click', () => toggleModalTab('client'));
    
    // Server Directory navigation click triggers
    if (elements.explorerNavUp) elements.explorerNavUp.addEventListener('click', explorerNavigateUp);
    if (elements.explorerNavHome) elements.explorerNavHome.addEventListener('click', () => fetchDirectoryContents(""));
    if (elements.explorerShortcutWorkspace) elements.explorerShortcutWorkspace.addEventListener('click', () => fetchDirectoryContents(""));
    if (elements.explorerShortcutRoot) elements.explorerShortcutRoot.addEventListener('click', () => fetchDirectoryContents("C:\\"));
    if (elements.explorerShortcutUser) elements.explorerShortcutUser.addEventListener('click', () => fetchDirectoryContents("USER_HOME"));

    // Click triggers for Client Drag/Drop
    if (elements.uploadDropzone) {
        elements.uploadDropzone.addEventListener('click', () => {
            if (elements.folderPickerClient) elements.folderPickerClient.click();
        });
        
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            elements.uploadDropzone.addEventListener(eventName, preventDefaults, false);
        });
        
        elements.uploadDropzone.addEventListener('drop', handleClientFolderDrop, false);
    }

    // Chart Dialog Event Listeners
    document.querySelectorAll('.chart-card[data-chart-id]').forEach(card => {
        card.addEventListener('click', function () {
            const chartId = this.dataset.chartId;
            const dialogTitle = this.dataset.dialogTitle;
            openChartDialog(chartId, dialogTitle);
        });
    });

    const closeChartDialogBtn = document.getElementById('close-chart-dialog');
    const chartDialogOverlay = document.getElementById('chart-dialog-overlay');

    if (closeChartDialogBtn) {
        closeChartDialogBtn.addEventListener('click', function (event) {
            event.stopPropagation();
            closeChartDialog();
        });
    }

    if (chartDialogOverlay) {
        chartDialogOverlay.addEventListener('click', function (event) {
            if (event.target === chartDialogOverlay) {
                closeChartDialog();
            }
        });
    }

    document.addEventListener('keydown', function (event) {
        if (event.key === 'Escape') {
            closeChartDialog();
        }
    });

    // open / close dropdown
    document.addEventListener('click', (e) => {
        const dropdown = e.target.closest('.custom-dropdown');
        document.querySelectorAll('.dropdown-menu').forEach(menu => {
            if (!dropdown || menu !== dropdown.querySelector('.dropdown-menu')) {
                menu.classList.add('hidden');
            }
        });
        if (dropdown) {
            const isClickOnSelected = e.target.closest('.dropdown-selected');
            if (isClickOnSelected) {
                const menu = dropdown.querySelector('.dropdown-menu');
                if (menu) {
                    menu.classList.toggle('hidden');
                }
            }
        }
    });

    // search inside dropdown
    document.addEventListener('input', (e) => {
        if (e.target.classList.contains('dropdown-search')) {
            const value = e.target.value.toLowerCase();
            const dropdownMenu = e.target.closest('.dropdown-menu');
            if (dropdownMenu) {
                const options = dropdownMenu.querySelectorAll('.dropdown-option');
                options.forEach(opt => {
                    opt.style.display = opt.innerText.toLowerCase().includes(value) ? 'block' : 'none';
                });
            }
        }
    });

    // Select option
    document.addEventListener('click', (e) => {
        const option = e.target.closest('.dropdown-option');
        if (option) {
            const dropdown = option.closest('.custom-dropdown');
            if (dropdown) {
                const selected = dropdown.querySelector('.dropdown-selected');
                if (selected) {
                    selected.innerText = option.innerText;
                    selected.dataset.value = option.dataset.value || option.innerText;
                    
                    // Dispatch a custom change event (with bubbles: true so event delegation catches it)
                    const changeEvent = new CustomEvent('change', {
                        bubbles: true,
                        detail: { value: selected.dataset.value, text: option.innerText }
                    });
                    dropdown.dispatchEvent(changeEvent);
                }
                const menu = dropdown.querySelector('.dropdown-menu');
                if (menu) {
                    menu.classList.add('hidden');
                }
            }
        }
    });
}

// ----------------------------------------------------
// Authentication Logic & Flow Handlers
// ----------------------------------------------------
function checkAuthStatus() {
    if (!appState.authToken) {
        appState.currentUser = null;
        updateAuthUI();
        return;
    }
    
    fetch('/api/me', {
        headers: { 'Authorization': `Bearer ${appState.authToken}` }
    })
    .then(async res => {
        if (!res.ok) {
            appState.authToken = null;
            appState.currentUser = null;
            localStorage.removeItem('diagtrace_token');
            updateAuthUI();
            return;
        }
        return res.json();
    })
    .then(data => {
        if (data && data.user) {
            appState.currentUser = data.user;
        } else {
            appState.currentUser = null;
            appState.authToken = null;
            localStorage.removeItem('diagtrace_token');
        }
        updateAuthUI();
    })
    .catch(() => {
        updateAuthUI();
    });
}

function applyTheme(themeName) {
    if (!themeName) themeName = 'white';
    appState.currentTheme = themeName;
    localStorage.setItem('diagtrace_theme', themeName);
    document.documentElement.setAttribute('data-theme', themeName);
    
    const radio = document.querySelector(`input[name="app-theme"][value="${themeName}"]`);
    if (radio) radio.checked = true;
    
    if (appState.allData && appState.allData.length > 0) {
        renderCharts();
    }
}

function updateAuthUI() {
    if (appState.currentUser) {
        if (elements.headerProfileText) {
            elements.headerProfileText.innerText = appState.currentUser.name || appState.currentUser.username;
        }
        if (elements.profileUserView) elements.profileUserView.classList.remove('hidden');
        if (elements.profileGuestView) elements.profileGuestView.classList.add('hidden');
        if (elements.profileDisplayName) elements.profileDisplayName.innerText = appState.currentUser.name;
        if (elements.profileUsername) elements.profileUsername.innerText = appState.currentUser.username;
        if (elements.profileEmail) elements.profileEmail.innerText = appState.currentUser.email;
    } else {
        if (elements.headerProfileText) {
            elements.headerProfileText.innerText = 'Profile';
        }
        if (elements.profileUserView) elements.profileUserView.classList.add('hidden');
        if (elements.profileGuestView) elements.profileGuestView.classList.remove('hidden');
    }
    buildHeaderFiltersMarkup();
    renderGridAndPagination();
}

function openProfileModal() {
    if (elements.profileModal) elements.profileModal.classList.remove('hidden');
}

function closeProfileModal() {
    if (elements.profileModal) elements.profileModal.classList.add('hidden');
}

function openSettingsModal() {
    applyTheme(appState.currentTheme);
    switchSettingsTab('ai');
    if (elements.settingsModal) elements.settingsModal.classList.remove('hidden');
}

function closeSettingsModal() {
    if (elements.settingsModal) elements.settingsModal.classList.add('hidden');
}

function switchSettingsTab(tabName) {
    if (tabName === 'theme') {
        if (elements.tabBtnTheme) elements.tabBtnTheme.classList.add('active');
        if (elements.tabBtnAi) elements.tabBtnAi.classList.remove('active');
        if (elements.settingsViewTheme) elements.settingsViewTheme.classList.remove('hidden');
        if (elements.settingsViewAi) elements.settingsViewAi.classList.add('hidden');
    } else {
        if (elements.tabBtnTheme) elements.tabBtnTheme.classList.remove('active');
        if (elements.tabBtnAi) elements.tabBtnAi.classList.add('active');
        if (elements.settingsViewTheme) elements.settingsViewTheme.classList.add('hidden');
        if (elements.settingsViewAi) elements.settingsViewAi.classList.remove('hidden');
        fetchAiSettings();
    }
}

function fetchAiSettings() {
    fetch('/api/settings/ai')
    .then(res => res.json())
    .then(data => {
        if (!elements.settingLlmModel) return;
        
        const modelOptions = Array.from(elements.settingLlmModel.options).map(o => o.value);
        if (modelOptions.includes(data.nvidia_model)) {
            elements.settingLlmModel.value = data.nvidia_model;
        }

        if (elements.settingEmbedModel) elements.settingEmbedModel.value = data.nvidia_embed_model || 'nvidia/nv-embedqa-e5-v5';
        if (elements.settingNvidiaKey) elements.settingNvidiaKey.value = data.nvidia_api_key || '';
        if (elements.settingQdrantUrl) elements.settingQdrantUrl.value = data.qdrant_url || '';
        if (elements.settingQdrantKey) elements.settingQdrantKey.value = data.qdrant_api_key || '';
    })
    .catch(() => {});
}

function handleAiSettingsSubmit(e) {
    e.preventDefault();
    const modelName = elements.settingLlmModel.value;
    const embedModel = elements.settingEmbedModel.value;
    const nvidiaKey = elements.settingNvidiaKey.value.trim();
    const qdrantUrl = elements.settingQdrantUrl.value.trim();
    const qdrantKey = elements.settingQdrantKey.value.trim();

    fetch('/api/settings/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            nvidia_api_key: nvidiaKey ? nvidiaKey : undefined,
            nvidia_model: modelName,
            nvidia_embed_model: embedModel,
            qdrant_url: qdrantUrl ? qdrantUrl : undefined,
            qdrant_api_key: qdrantKey ? qdrantKey : undefined
        })
    })
    .then(res => res.json())
    .then(data => {
        showToast("Information is stored successfully!");
        fetchAiSettings();
    })
    .catch(err => {
        showToast(`Failed to update AI settings: ${err.message}`, 'warning');
    });
}

function handleAiSettingsTest() {
    if (!elements.btnTestAiSettings) return;
    const originalText = elements.btnTestAiSettings.innerText;
    elements.btnTestAiSettings.innerText = "⚡ Testing (up to 30s)...";
    elements.btnTestAiSettings.disabled = true;

    const modelName = elements.settingLlmModel.value;
    const embedModel = elements.settingEmbedModel.value;
    const nvidiaKey = elements.settingNvidiaKey.value.trim();
    const qdrantUrl = elements.settingQdrantUrl.value.trim();
    const qdrantKey = elements.settingQdrantKey.value.trim();

    fetch('/api/settings/ai/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            nvidia_api_key: nvidiaKey ? nvidiaKey : undefined,
            nvidia_model: modelName,
            nvidia_embed_model: embedModel,
            qdrant_url: qdrantUrl ? qdrantUrl : undefined,
            qdrant_api_key: qdrantKey ? qdrantKey : undefined
        })
    })
    .then(async res => {
        const data = await res.json();
        elements.btnTestAiSettings.innerText = originalText;
        elements.btnTestAiSettings.disabled = false;
        
        if (!res.ok) {
            throw new Error(data.detail || 'Test request failed');
        }
        
        if (data.results && data.results.length > 0) {
            alert("Test Results:\n\n" + data.results.join("\n\n"));
        }
    })
    .catch(err => {
        elements.btnTestAiSettings.innerText = originalText;
        elements.btnTestAiSettings.disabled = false;
        showToast(`Failed to test AI settings: ${err.message}`, 'warning');
    });
}

function openSignInModal() {
    if (elements.signinError) {
        elements.signinError.classList.add('hidden');
        elements.signinError.innerText = '';
    }
    if (elements.signinForm) elements.signinForm.reset();
    if (elements.signinModal) elements.signinModal.classList.remove('hidden');
}

function closeSignInModal() {
    if (elements.signinModal) elements.signinModal.classList.add('hidden');
}

function openSignUpModal() {
    if (elements.signupError) {
        elements.signupError.classList.add('hidden');
        elements.signupError.innerText = '';
    }
    if (elements.signupForm) elements.signupForm.reset();
    if (elements.signupModal) elements.signupModal.classList.remove('hidden');
}

function closeSignUpModal() {
    if (elements.signupModal) elements.signupModal.classList.add('hidden');
}

function handleSignIn(e) {
    e.preventDefault();
    const identifier = elements.signinIdentifier.value.trim();
    const password = elements.signinPassword.value;
    
    fetch('/api/signin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username_or_email: identifier, password: password })
    })
    .then(async res => {
        const data = await res.json();
        if (!res.ok) {
            throw new Error(data.detail || 'Sign in failed.');
        }
        return data;
    })
    .then(data => {
        appState.authToken = data.token;
        appState.currentUser = data.user;
        localStorage.setItem('diagtrace_token', data.token);
        closeSignInModal();
        updateAuthUI();
        showToast(`Welcome back, ${data.user.name}!`);
    })
    .catch(err => {
        if (elements.signinError) {
            elements.signinError.innerText = err.message;
            elements.signinError.classList.remove('hidden');
        }
    });
}

function handleSignUp(e) {
    e.preventDefault();
    const name = elements.signupName.value.trim();
    const username = elements.signupUsername.value.trim();
    const email = elements.signupEmail.value.trim();
    const password = elements.signupPassword.value;
    
    fetch('/api/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, username, email, password })
    })
    .then(async res => {
        const data = await res.json();
        if (!res.ok) {
            throw new Error(data.detail || 'Sign up failed.');
        }
        return data;
    })
    .then(data => {
        appState.authToken = data.token;
        appState.currentUser = data.user;
        localStorage.setItem('diagtrace_token', data.token);
        closeSignUpModal();
        updateAuthUI();
        showToast(`Account created! Welcome, ${data.user.name}!`);
    })
    .catch(err => {
        if (elements.signupError) {
            elements.signupError.innerText = err.message;
            elements.signupError.classList.remove('hidden');
        }
    });
}

function handleSignOut() {
    if (appState.authToken) {
        fetch('/api/signout', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${appState.authToken}` }
        }).catch(() => {});
    }
    appState.authToken = null;
    appState.currentUser = null;
    localStorage.removeItem('diagtrace_token');
    updateAuthUI();
    showToast("Signed out successfully.");
}

function showSignInPromptToast() {
    if (!appState.currentUser) {
        showToast("Please sign in to edit diagnostic records.", "warning");
        openSignInModal();
    }
}
    
function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
}

function handleFolderPathChange() {
    if (!elements.folderPathInput || !elements.btnRunAnalysis) return;
    const val = elements.folderPathInput.value.trim();
    if (val.length > 0) {
        elements.btnRunAnalysis.disabled = false;
    } else {
        elements.btnRunAnalysis.disabled = true;
    }
}

function handleClientFolderSelected(e) {
    if (e.target.files.length > 0) {
        const sampleFile = e.target.files[0];
        const relativePath = sampleFile.webkitRelativePath;
        if (relativePath) {
            const folderName = relativePath.split('/')[0];
            const workspacePath = `C:\\DiagIngestTemp\\${folderName}`;
            
            handleFolderPathChange();
            appState.selectedFolderPath = workspacePath;
            
            elements.selectedClientFilesCount.innerText = `Selected Local Folder: "${folderName}" (${e.target.files.length} log files)`;
            elements.explorerSelectedInfo.innerHTML = `Folder (Client Upload): <b class="text-primary">${folderName}</b>`;
            elements.explorerBtnSelect.dataset.selectedPath = workspacePath;
            elements.explorerBtnSelect.dataset.folderSource = "client";
            
            showToast(`Ingested local client files list successfully.`);
        }
    }
}

function handleClientFolderDrop(e) {
    const dt = e.dataTransfer;
    const files = dt.files;
    
    if (files.length > 0) {
        const sampleFile = files[0];
        const folderName = sampleFile.name || "DroppedFolder";
        const workspacePath = `C:\\DiagIngestTemp\\${folderName}`;
        
        appState.selectedFolderPath = workspacePath;
        
        elements.selectedClientFilesCount.innerText = `Dropped Folder: "${folderName}" (${files.length} files detected)`;
        elements.explorerSelectedInfo.innerHTML = `Folder (Dropped Ingest): <b class="text-primary">${folderName}</b>`;
        elements.explorerBtnSelect.dataset.selectedPath = workspacePath;
        elements.explorerBtnSelect.dataset.folderSource = "client";
    }
}

// ----------------------------------------------------
// Explorer Modal Tab Control & Browse Logic
// ----------------------------------------------------
function openExplorerModal() {
    elements.explorerModal.classList.remove('hidden');
    toggleModalTab(appState.activeTab);
}

function closeExplorerModal() {
    elements.explorerModal.classList.add('hidden');
}

function toggleModalTab(tabType) {
    appState.activeTab = tabType;
    if (tabType === 'server') {
        elements.tabServer.classList.add('active');
        elements.tabClient.classList.remove('active');
        elements.explorerServerView.classList.remove('hidden');
        elements.explorerClientView.classList.add('hidden');
        
        fetchDirectoryContents(appState.currentExplorerPath);
    } else {
        elements.tabServer.classList.remove('active');
        elements.tabClient.classList.add('active');
        elements.explorerServerView.classList.add('hidden');
        elements.explorerClientView.classList.remove('hidden');
        
        elements.explorerSelectedInfo.innerHTML = "Upload a local client directory tree.";
        elements.explorerBtnSelect.dataset.folderSource = "client";
    }
}

function fetchDirectoryContents(targetPath) {
    let url = '/api/browse';
    if (targetPath) {
        url += `?path=${encodeURIComponent(targetPath)}`;
    }
    
    fetch(url)
        .then(async res => {
            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                const detail = errData.detail || `HTTP error ${res.status}`;
                throw new Error(detail);
            }
            return res.json();
        })
        .then(data => {
            appState.currentExplorerPath = data.current_path;
            // elements.explorerCurrentPath.innerText = data.current_path;
            elements.explorerCurrentPath.value = data.current_path;
            
            elements.explorerNavUp.disabled = !data.parent_path;
            elements.explorerNavUp.dataset.parent = data.parent_path || "";
            
            elements.explorerItemsContainer.innerHTML = "";
            
            if (data.subdirs && data.subdirs.length > 0) {
                data.subdirs.forEach(dir => {
                    const div = document.createElement('div');
                    div.className = "explorer-item";
                    div.innerHTML = `📁 ${dir}`;
                    div.addEventListener('click', () => {
                        document.querySelectorAll('.explorer-item').forEach(el => el.classList.remove('active'));
                        div.classList.add('active');
                        
                        const fullPath = getJoinedPath(appState.currentExplorerPath, dir);
                        elements.explorerSelectedInfo.innerHTML = `Folder: <b class="text-primary">${dir}</b>`;
                        elements.explorerBtnSelect.dataset.selectedPath = fullPath;
                        elements.explorerBtnSelect.dataset.folderSource = "server";
                    });
                    
                    div.addEventListener('dblclick', () => {
                        const fullPath = getJoinedPath(appState.currentExplorerPath, dir);
                        fetchDirectoryContents(fullPath);
                    });
                    
                    elements.explorerItemsContainer.appendChild(div);
                });
            } else {
                elements.explorerItemsContainer.innerHTML = `
                    <div style="grid-column: span 2; text-align: center; color: var(--text-muted); font-size: 0.72rem; padding: 20px;">
                        This directory contains no subfolders.
                    </div>
                `;
            }
            
            elements.explorerSelectedInfo.innerHTML = `Folder: <b>${getFolderName(data.current_path)}</b>`;
            elements.explorerBtnSelect.dataset.selectedPath = data.current_path;
            elements.explorerBtnSelect.dataset.folderSource = "server";
        })
        .catch(err => {
            logErrorToConsole("Browse Server Directories", err);
            showToast("Failed to browse server directories.", "error");
        });
}

function explorerNavigateUp() {
    const parentPath = elements.explorerNavUp.dataset.parent;
    if (parentPath) {
        fetchDirectoryContents(parentPath);
    }
}

function selectExplorerFolder() {
    const targetPath = elements.explorerBtnSelect.dataset.selectedPath;
    if (targetPath) {
      
        appState.selectedFolderPath = targetPath;

        closeExplorerModal();
        showToast("Folder selected: " + getFolderName(targetPath));

        elements.consoleSpinner.classList.remove("hidden");
        elements.logConsoleContainer.classList.remove("hidden");

        elements.btnToggleLogs.classList.remove('hidden');
        startAnalysis();
    }
}

// ----------------------------------------------------
// Log Viewer Controls (Minimization Options)
// ----------------------------------------------------
function toggleLogsMinimization() {
    const container = elements.logConsoleContainer;
    const btn = elements.btnToggleLogs;
    
    if (container.classList.contains('minimized')) {
        container.classList.remove('minimized');
        btn.innerHTML = '<svg class="status-btn-icon" fill="none" height="14" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" viewBox="0 0 24 24" width="14"><line x1="5" y1="12" x2="19" y2="12"></line></svg> Status';
        btn.title = "Minimize logs";
    } else {
        container.classList.add('minimized');
        btn.innerHTML = '<svg class="status-btn-icon" fill="none" height="14" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" viewBox="0 0 24 24" width="14"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg> Status';
        btn.title = "Maximize logs";
    }
}

function checkEngineStatus() {
    fetch('/api/status')
        .then(async res => {
            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                const detail = errData.detail || `HTTP error ${res.status}`;
                throw new Error(detail);
            }
            return res.json();
        })
        .then(status => {
            if (status.is_processing) {
                if (elements.folderPathInput) {
                    elements.folderPathInput.value = status.current_folder || "";
                }
                handleFolderPathChange();
                appState.selectedFolderPath = status.current_folder || "";
                elements.logConsoleContainer.classList.remove('hidden');
                elements.consoleSpinner.classList.remove('hidden');
                elements.btnToggleLogs.classList.remove('hidden');
                startPollingLogs();
            } else if (status.processing_complete) {
                elements.logConsoleContainer.classList.remove('hidden');
                elements.consoleSpinner.classList.add('hidden');
                 elements.btnToggleLogs.classList.remove('hidden');
                updateLogConsole(status.logs);
            }
        })
        .catch(err => logErrorToConsole("Check Engine Status", err));
}

function loadRegistryData() {
    fetch('/api/data')
        .then(async res => {
            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                const detail = errData.detail || `HTTP error ${res.status}`;
                throw new Error(detail);
            }
            return res.json();
        })
        .then(result => {
            const rawData = result.data || [];
            
            // Safely convert numeric strings back to numbers if it won't lose precision
            appState.allData = rawData.map(row => {
                const cleanedRow = { ...row };
                for (const key in cleanedRow) {
                    if (cleanedRow.hasOwnProperty(key) && key !== 'index') {
                        const val = cleanedRow[key];
                        if (typeof val === 'string' && val.trim() !== '') {
                            const num = Number(val);
                            // Verify it's a valid finite number, and that converting it back to string
                            // produces the identical string (prevents parsing precision loss for huge integer IDs)
                            if (!isNaN(num) && isFinite(num) && String(num) === val.trim()) {
                                cleanedRow[key] = num;
                            }
                        }
                    }
                }
                return cleanedRow;
            });
            
            if (appState.allData.length > 0) {
                if (elements.resultsSection) elements.resultsSection.classList.remove('hidden');
                
                // Identify and initialize dynamic columns
                buildDynamicColumns();
                buildHeaderFiltersMarkup();
                applyFilters();
            } else {
                if (elements.registryTableBody) {
                    elements.registryTableBody.innerHTML = `
                    <tr> 
                        <td colspan="10" class="no-data-msg">No Data Available</td>
                    </tr>
                    `;
                }
            }
        })
        .catch(err => logErrorToConsole("Load Diagnostics Data", err));
}

function startAnalysis() {
    const folderPath = (appState.selectedFolderPath || " ").trim();
    if (!folderPath) return;
    
    if (elements.logConsoleContainer) {
        elements.logConsoleContainer.classList.remove('hidden');
        elements.logConsoleContainer.classList.remove('minimized');
    }
   
    if (elements.btnBrowseFolder) elements.btnBrowseFolder.classList.add("hidden");
    if (elements.consoleSpinner) elements.consoleSpinner.classList.remove("hidden");
    if (elements.btnToggleLogs) {
        elements.btnToggleLogs.classList.remove("hidden");
        elements.btnToggleLogs.innerText = "➖ Status";
    }
    if (elements.logConsole) elements.logConsole.innerHTML = `<div class="log-line system-msg">[SYSTEM] Connecting to backend engine for parsing '${folderPath}'...</div>`;
    
    fetch('/api/start-parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folder_path: folderPath })
    })
    .then(async res => {
        if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            const detail = errData.detail || `HTTP error ${res.status}`;
            throw new Error(detail);
        }
        return res.json();
    })
    .then(data => {
        if (data.status === 'started' || data.status === 'already_processing') {
            startPollingLogs();
        } else {
            if (elements.consoleSpinner) elements.consoleSpinner.classList.add('hidden');
            appendLogLine({ message: "Failed to initiate parsing engine.", level: "error", time: "" });
        }
    })
    .catch(err => {
        if (elements.consoleSpinner) elements.consoleSpinner.classList.add('hidden');
        if (elements.btnRunAnalysis) elements.btnRunAnalysis.disabled = false;
        logErrorToConsole("Start Analysis Engine", err);
        if (elements.btnBrowseFolder) elements.btnBrowseFolder.classList.remove("hidden");
    });
}

function startPollingLogs() {
    if (appState.isPolling) return;
    appState.isPolling = true;
    
    appState.pollIntervalId = setInterval(() => {
        fetch('/api/status')
            .then(async res => {
                if (!res.ok) {
                    const errData = await res.json().catch(() => ({}));
                    const detail = errData.detail || `HTTP error ${res.status}`;
                    throw new Error(detail);
                }
                return res.json();
            })
            .then(status => {
                updateLogConsole(status.logs);
                
                if (!status.is_processing) {
                    clearInterval(appState.pollIntervalId);
                    appState.isPolling = false;
                    if (elements.consoleSpinner) elements.consoleSpinner.classList.add('hidden');
                    if (elements.btnBrowseFolder) elements.btnBrowseFolder.classList.remove('hidden');
                    
                    if (status.error_message) {
                        showToast(`Analysis error: ${status.error_message}`, "error");
                        logErrorToConsole("Analysis Engine Parsing", new Error(status.error_message));
                    } else if (status.processing_complete) {
                        showToast("Diagnostic analysis complete! Data grid sync successful.");
                        loadRegistryData();
                    }
                }
            })
            .catch(err => {
                logErrorToConsole("Poll Logs Progress", err);
                clearInterval(appState.pollIntervalId);
                appState.isPolling = false;
                if (elements.consoleSpinner) elements.consoleSpinner.classList.add('hidden');
            });
    }, 800);
}

function updateLogConsole(logs) {
    if (!logs || logs.length === 0) return;
    if (elements.logConsole) elements.logConsole.innerHTML = "";
    logs.forEach(log => {
        appendLogLine(log);
    });
}

function appendLogLine(log) {
    if (!elements.logConsole) return;
    const div = document.createElement('div');
    div.className = `log-line ${log.level || 'info'}`;
    const timeStr = log.time ? `[${log.time}] ` : '';
    div.innerText = `${timeStr}${log.message}`;
    elements.logConsole.appendChild(div);
    elements.logConsole.scrollTop = elements.logConsole.scrollHeight;
}

function resetParserEngine() {
    if (confirm("Are you sure you want to reset the current parser tracking state?")) {
        fetch('/api/reset', { method: 'POST' })
            .then(async res => {
                if (!res.ok) {
                    const errData = await res.json().catch(() => ({}));
                    const detail = errData.detail || `HTTP error ${res.status}`;
                    throw new Error(detail);
                }
                return res.json();
            })
            .then(() => {
                if (appState.pollIntervalId) {
                    clearInterval(appState.pollIntervalId);
                    appState.isPolling = false;
                }
                if (elements.logConsoleContainer) elements.logConsoleContainer.classList.add('hidden');
                if (elements.consoleSpinner) elements.consoleSpinner.classList.add('hidden');
                if (elements.logConsole) elements.logConsole.innerHTML = "";
                if (elements.folderPathInput) elements.folderPathInput.value = "";
                if (elements.btnRunAnalysis) elements.btnRunAnalysis.disabled = true;
                appState.selectedFolderPath = "";
                
                elements.selectedClientFilesCount.innerText = "No local folder selected.";
                showToast("Parser state reset successfully.");
            })
            .catch(err => logErrorToConsole("Reset Parser Engine", err));
    }
}

// ----------------------------------------------------
// Dynamic Columns & Column-header Filters Builder
// ----------------------------------------------------
function buildDynamicColumns() {
    if (appState.allData.length === 0) return;
    
    // Core columns listed in visual priority order
    const coreColumns = ["File", "Module", "Code", "Description", "Raw", "Hex", "Issue Status", "Comments", "Author", "Program name", "VIN Number"];
    
    // Get all column keys from dataset
    const allKeys = Object.keys(appState.allData[0] || {});
    
    const columns = [];
    
    // 1. Add core columns that exist in dataset
    coreColumns.forEach(col => {
        if (allKeys.includes(col)) {
            columns.push(col);
        }
    });
    
    // 2. Add any other "unknown/new" columns at the end,
    //    except index, Last Updated, and AI Analysis (pinned last)
    allKeys.forEach(key => {
        if (key !== "index" && key !== "Last Updated" && key !== "AI Analysis" && !columns.includes(key)) {
            columns.push(key);
        }
    });

    // 3. AI Analysis is always the last data column (before Last Updated)
    if (allKeys.includes("AI Analysis")) {
        columns.push("AI Analysis");
    }
    
    // 4. Make sure Last Updated is placed as the final column if it exists
    if (allKeys.includes("Last Updated")) {
        columns.push("Last Updated");
    }
    
    appState.columns = columns;
    
    // Initialize filters schema: preserve existing active filters, initialize new columns
    if (!appState.filters) appState.filters = {};
    columns.forEach(col => {
        if (!appState.filters[col]) {
            appState.filters[col] = []; // empty array = no filter active
        }
    });
}

function getUniqueValuesCount(colName) {
    return new Set(appState.allData.map(item => item[colName]).filter(v => v !== null && v !== undefined && v !== '')).size;
}

function buildHeaderFiltersMarkup() {
    if (!elements.tableHeadersRow) return;
    elements.tableHeadersRow.innerHTML = "";
    
    appState.columns.forEach(col => {
        const th = document.createElement('th');
        
        // Mark editable header visually when signed in
        const isEditableCol = (col === "Comments" || col === "Issue Status");
        const isEditable = isEditableCol && appState.currentUser;
        if (isEditable) {
            th.className = "editable-hdr";
        }
        
        let titleText = col;
        if (isEditableCol) {
            titleText = appState.currentUser ? `${col} ✏️` : col;
        }
        
        // Determine filter type dynamically
        let filterControl = "";
        
        // No filter for these columns — just a spacer
        if (col === "Last Updated" || col === "AI Analysis") {
            filterControl = `<div class="header-filter-dummy"></div>`;
        } else {
            const uniqueCount = getUniqueValuesCount(col);
            
            // Text search for Description, Comments, and high-cardinality columns
            const isTextField = (col === "Description" || col === "Comments" || uniqueCount > 50);
            
            if (isTextField) {
                const currentTextVal = typeof appState.filters[col] === 'string' ? appState.filters[col] : '';
                filterControl = `<input type="text" data-col="${col}" class="header-filter-input" placeholder="Search..." value="${currentTextVal.replace(/"/g, '&quot;')}" />`;
            } else {
                // Checkbox multi-select panel
                const uniqueVals = [...new Set(appState.allData.map(item => item[col]).filter(v => v !== null && v !== undefined && v !== ''))].sort((a, b) => String(a).localeCompare(String(b)));
                const safeCol = col.replace(/[^a-zA-Z0-9_-]/g, '_');
                const selectedForCol = (Array.isArray(appState.filters[col]) ? appState.filters[col] : []).map(String);
                const isAllChecked = (uniqueVals.length > 0 && selectedForCol.length === uniqueVals.length);
                
                let checkboxesHtml = uniqueVals.map(val => {
                    const strVal = String(val);
                    const isChecked = selectedForCol.includes(strVal) ? 'checked' : '';
                    const safeId = `chk_${safeCol}_${strVal.replace(/[^a-zA-Z0-9]/g, '_')}`;
                    return `<label class="chk-filter-label" title="${strVal.replace(/"/g, '&quot;')}">
                        <input type="checkbox" class="chk-filter-option" data-col="${col}" data-value="${strVal.replace(/"/g, '&quot;')}" id="${safeId}" ${isChecked}>
                        <span class="chk-filter-text">${strVal}</span>
                    </label>`;
                }).join('');
                
                filterControl = `
                    <div class="chk-dropdown" data-col="${col}">
                        <button type="button" class="chk-dropdown-trigger" data-col="${col}">All ▾</button>
                        <div class="chk-dropdown-panel hidden">
                            <input type="text" class="chk-dropdown-search" placeholder="Search..." />
                            <div class="chk-options-list">
                                <label class="chk-filter-label chk-filter-all" style="font-weight: 600; border-bottom: 1px solid var(--border-color); padding-bottom: 4px; margin-bottom: 4px;">
                                    <input type="checkbox" class="chk-select-all-option" data-col="${col}" ${isAllChecked ? 'checked' : ''}>
                                    <span class="chk-filter-text">Select All</span>
                                </label>
                                ${checkboxesHtml}
                            </div>
                            <div class="chk-footer" style="display: flex; justify-content: space-between; align-items: center; padding: 4px 8px; border-top: 1px solid var(--border-color); background: rgba(0,0,0,0.02);">
                                <button type="button" class="chk-select-all-btn" data-col="${col}" style="background: none; border: none; color: var(--primary); font-size: 0.7rem; cursor: pointer; font-weight: 500;">Select All</button>
                                <button type="button" class="chk-clear-btn" data-col="${col}" style="background: none; border: none; color: var(--text-muted); font-size: 0.7rem; cursor: pointer;">Clear</button>
                            </div>
                        </div>
                    </div>
                `;
            }
        }
        
        th.innerHTML = `
            <div class="header-cell-title">${titleText}</div>
            ${filterControl}
        `;
        
        elements.tableHeadersRow.appendChild(th);
    });

    // Update triggers based on current filter state
    appState.columns.forEach(col => {
        updateCheckboxTriggerLabel(col);
    });

    // ── Bind checkbox filter events ONCE after DOM injection ──
    bindCheckboxFilterEvents();
}

let isCheckboxFilterEventsBound = false;

/** Bind all checkbox-filter interactions ONCE */
function bindCheckboxFilterEvents() {
    if (isCheckboxFilterEventsBound) return;
    isCheckboxFilterEventsBound = true;

    // Open/close panel on trigger click
    elements.tableHeadersRow.addEventListener('click', (e) => {
        const trigger = e.target.closest('.chk-dropdown-trigger');
        if (trigger) {
            e.stopPropagation();
            const panel = trigger.nextElementSibling;
            if (!panel) return;
            const isHidden = panel.classList.contains('hidden');
            // Close all other panels first
            document.querySelectorAll('.chk-dropdown-panel').forEach(p => p.classList.add('hidden'));
            if (isHidden) {
                panel.classList.remove('hidden');
            }
            return;
        }
        // Select All button inside panel footer
        const selectAllBtn = e.target.closest('.chk-select-all-btn');
        if (selectAllBtn) {
            const col = selectAllBtn.dataset.col;
            const panel = selectAllBtn.closest('.chk-dropdown-panel');
            if (panel) {
                panel.querySelectorAll('.chk-filter-option').forEach(cb => { cb.checked = true; });
                const selectAllCb = panel.querySelector('.chk-select-all-option');
                if (selectAllCb) selectAllCb.checked = true;
            }
            collectCheckboxFilter(col);
            appState.currentPage = 1;
            applyFilters();
            return;
        }
        // Clear button inside panel footer
        const clearBtn = e.target.closest('.chk-clear-btn');
        if (clearBtn) {
            const col = clearBtn.dataset.col;
            const panel = clearBtn.closest('.chk-dropdown-panel');
            if (panel) {
                panel.querySelectorAll('.chk-filter-option').forEach(cb => { cb.checked = false; });
                const selectAllCb = panel.querySelector('.chk-select-all-option');
                if (selectAllCb) selectAllCb.checked = false;
            }
            appState.filters[col] = [];
            updateCheckboxTriggerLabel(col);
            appState.currentPage = 1;
            applyFilters();
            return;
        }
    });

    // Close panels when clicking outside
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.chk-dropdown')) {
            document.querySelectorAll('.chk-dropdown-panel').forEach(p => p.classList.add('hidden'));
        }
    }, true);

    // Checkbox change → update filter
    elements.tableHeadersRow.addEventListener('change', (e) => {
        // Select All checkbox toggle
        if (e.target.classList.contains('chk-select-all-option')) {
            const col = e.target.dataset.col;
            const panel = e.target.closest('.chk-dropdown-panel');
            if (panel) {
                const isChecked = e.target.checked;
                panel.querySelectorAll('.chk-filter-option').forEach(cb => { cb.checked = isChecked; });
            }
            collectCheckboxFilter(col);
            appState.currentPage = 1;
            applyFilters();
            return;
        }
        if (e.target.classList.contains('chk-filter-option')) {
            const col = e.target.dataset.col;
            collectCheckboxFilter(col);
            appState.currentPage = 1;
            applyFilters();
        }
    });

    // Search inside checkbox panel
    elements.tableHeadersRow.addEventListener('input', (e) => {
        if (e.target.classList.contains('chk-dropdown-search')) {
            const val = e.target.value.toLowerCase();
            const panel = e.target.closest('.chk-dropdown-panel');
            if (panel) {
                const list = panel.querySelector('.chk-options-list');
                if (list) {
                    list.querySelectorAll('.chk-filter-label:not(.chk-filter-all)').forEach(label => {
                        label.style.display = label.textContent.toLowerCase().includes(val) ? 'flex' : 'none';
                    });
                }
            }
        }
    });
}

function collectCheckboxFilter(col) {
    let dropdown = null;
    elements.tableHeadersRow.querySelectorAll('.chk-dropdown').forEach(d => {
        if (d.dataset.col === col) dropdown = d;
    });
    if (!dropdown) return;
    const checked = dropdown.querySelectorAll('.chk-filter-option:checked');
    appState.filters[col] = Array.from(checked).map(cb => cb.dataset.value);
    updateCheckboxTriggerLabel(col);
}

function updateCheckboxTriggerLabel(col) {
    let dropdown = null;
    elements.tableHeadersRow.querySelectorAll('.chk-dropdown').forEach(d => {
        if (d.dataset.col === col) dropdown = d;
    });
    if (!dropdown) return;
    const trigger = dropdown.querySelector('.chk-dropdown-trigger');
    if (!trigger) return;
    
    // Update Select All checkbox state
    const selectAllCb = dropdown.querySelector('.chk-select-all-option');
    if (selectAllCb) {
        const allCbs = dropdown.querySelectorAll('.chk-filter-option');
        const checkedCbs = dropdown.querySelectorAll('.chk-filter-option:checked');
        if (allCbs.length > 0 && checkedCbs.length === allCbs.length) {
            selectAllCb.checked = true;
            selectAllCb.indeterminate = false;
        } else if (checkedCbs.length > 0) {
            selectAllCb.checked = false;
            selectAllCb.indeterminate = true;
        } else {
            selectAllCb.checked = false;
            selectAllCb.indeterminate = false;
        }
    }

    const selected = appState.filters[col] || [];
    if (!Array.isArray(selected) || selected.length === 0) {
        trigger.textContent = 'All ▾';
        trigger.classList.remove('chk-active');
    } else {
        trigger.textContent = `${selected.length} selected ▾`;
        trigger.classList.add('chk-active');
    }
}

function handleFilterChange() {
    // Collect active values from text inputs
    elements.tableHeadersRow.querySelectorAll('.header-filter-input').forEach(input => {
        const col = input.dataset.col;
        if (col) appState.filters[col] = input.value;
    });

    appState.currentPage = 1;
    applyFilters();
}

function applyFilters() {
    appState.filteredData = appState.allData.filter(row => {
        for (const col of appState.columns) {
            if (col === "Last Updated" || col === "AI Analysis") continue;
            
            const filterVal = appState.filters[col];
            const cellVal = (row[col] !== undefined && row[col] !== null) ? String(row[col]) : "";
            
            const uniqueCount = getUniqueValuesCount(col);
            const isTextField = (col === "Description" || col === "Comments" || uniqueCount > 50);
            
            if (isTextField) {
                // String filter
                if (!filterVal || (typeof filterVal === 'string' && filterVal.trim() === '')) continue;
                if (!cellVal.toLowerCase().includes(String(filterVal).toLowerCase().trim())) {
                    return false;
                }
            } else {
                // Array filter (multi-select checkboxes) — OR logic
                if (!filterVal || (Array.isArray(filterVal) && filterVal.length === 0)) continue;
                const selected = Array.isArray(filterVal) ? filterVal.map(String) : [String(filterVal)];
                if (!selected.includes(cellVal)) {
                    return false;
                }
            }
        }
        return true;
    });
    
    updateKPIs();
    renderGridAndPagination();
    renderCharts();
}

function clearAllFilters() {
    appState.columns.forEach(col => {
        if (col === "Last Updated" || col === "AI Analysis") return;
        const uniqueCount = getUniqueValuesCount(col);
        const isTextField = (col === "Description" || col === "Comments" || uniqueCount > 50);
        if (isTextField) {
            const input = elements.tableHeadersRow.querySelector(`.header-filter-input[data-col]`);
            elements.tableHeadersRow.querySelectorAll('.header-filter-input').forEach(inp => {
                if (inp.dataset.col === col) inp.value = '';
            });
            appState.filters[col] = [];
        } else {
            // Uncheck all checkboxes for this column
            elements.tableHeadersRow.querySelectorAll(`.chk-filter-option[data-col]`).forEach(cb => {
                if (cb.dataset.col === col) cb.checked = false;
            });
            appState.filters[col] = [];
            updateCheckboxTriggerLabel(col);
        }
    });
    
    appState.currentPage = 1;
    applyFilters();
    showToast("Filters cleared.");
}

// ----------------------------------------------------
// UI Render Methods (KPIs, Grid, Pagination)
// ----------------------------------------------------
function updateKPIs() {
    const total = appState.filteredData.length;
    const uniqueDtcs = new Set(appState.filteredData.map(r => r.Code).filter(Boolean)).size;
    
    // Find active programs / open issues safely in case key names change slightly
    const programColName = appState.columns.find(c => c.toLowerCase().includes("program")) || "Program name";
    const statusColName = appState.columns.find(c => c.toLowerCase().includes("status")) || "Issue Status";
    const moduleColName = appState.columns.find(c => c.toLowerCase() === "module") || "Module";
    
    const activeProgs = new Set(appState.filteredData.map(r => r[programColName]).filter(Boolean)).size;
    const activeModules = new Set(appState.filteredData.map(r => r[moduleColName]).filter(Boolean)).size;
    const openIssues = appState.filteredData.filter(r => {
        const val = String(r[statusColName] || '').toLowerCase();
        return val === 'open' || val === 'new';
    }).length;
    
    if (elements.kpiTotalRecords) elements.kpiTotalRecords.innerText = total.toLocaleString();
    if (elements.kpiUniqueDtcs) elements.kpiUniqueDtcs.innerText = uniqueDtcs.toString();
    if (elements.kpiActivePrograms) elements.kpiActivePrograms.innerText = activeProgs.toString();
    if (elements.kpiActiveModules) {
        elements.kpiActiveModules.innerText = activeModules.toString();
    }
    if (elements.kpiOpenIssues) elements.kpiOpenIssues.innerText = openIssues.toString();
}

function getTotalPages() {
    if (appState.pageSize === 'all') return 1;
    return Math.max(1, Math.ceil(appState.filteredData.length / appState.pageSize));
}

function renderGridAndPagination() {
    if (!elements.registryTableBody) return;
    const total = appState.filteredData.length;
    elements.registryTableBody.innerHTML = "";
    
    if (total === 0) {
        if (elements.registryTableBody) {
            elements.registryTableBody.innerHTML = `
                <tr>
                    <td colspan="${appState.columns.length || 10}" class="no-data">No diagnostic records found matching current filters.</td>
                </tr>
            `;
        }
        if (elements.btnPagePrev) elements.btnPagePrev.disabled = true;
        if (elements.btnPageNext) elements.btnPageNext.disabled = true;
        if (elements.pageNumDisplay) elements.pageNumDisplay.innerText = "Page 1 of 1";
        if (elements.paginationInfoText) elements.paginationInfoText.innerText = "Showing 0-0 of 0 entries";
        return;
    }
    
    // Slicing pagination data
    let startIdx = 0;
    let endIdx = total;
    
    if (appState.pageSize !== 'all') {
        const totalPages = getTotalPages();
        if (appState.currentPage > totalPages) appState.currentPage = totalPages;
        
        startIdx = (appState.currentPage - 1) * appState.pageSize;
        endIdx = Math.min(total, startIdx + appState.pageSize);
        
        if (elements.btnPagePrev) elements.btnPagePrev.disabled = appState.currentPage === 1;
        if (elements.btnPageNext) elements.btnPageNext.disabled = appState.currentPage === totalPages;
        if (elements.pageNumDisplay) elements.pageNumDisplay.innerText = `Page ${appState.currentPage} of ${totalPages}`;
    } else {
        if (elements.btnPagePrev) elements.btnPagePrev.disabled = true;
        if (elements.btnPageNext) elements.btnPageNext.disabled = true;
        if (elements.pageNumDisplay) elements.pageNumDisplay.innerText = "Page 1 of 1";
    }
    
    if (elements.paginationInfoText) elements.paginationInfoText.innerHTML = `Showing <b>${startIdx + 1}</b>-<b>${endIdx}</b> of <b>${total.toLocaleString()}</b> entries`;
    
    const pageData = appState.filteredData.slice(startIdx, endIdx);
    const statusOptions = ['New', 'Known', 'Not an Issue', 'Fixed', 'Needs Investigation'];
    
    pageData.forEach(row => {
        const tr = document.createElement('tr');
        tr.dataset.index = row.index;
        
        appState.columns.forEach(col => {
            const td = document.createElement('td');
            const cellValue = (row[col] !== undefined && row[col] !== null) ? row[col] : "";
            td.title = cellValue;
            
            // Editable Column 1: Issue Status
            if (col === "Issue Status") {
                const statusClass = String(cellValue).toLowerCase().replace(/\s+/g, '-');
                td.innerHTML = `<span class="status-tag ${statusClass}">${cellValue}</span>`;
                if (appState.currentUser) {
                    td.className = "editable-cell editable-cell-active";
                    td.addEventListener('dblclick', () => editStatusCell(td, row.index, cellValue, statusOptions));
                } else {
                    td.className = "cell-locked";
                    td.addEventListener('dblclick', () => showSignInPromptToast());
                }
            } 
            // Editable Column 2: Comments
            else if (col === "Comments") {
                td.innerText = String(cellValue).replace(/[\r\n]+/g, ' ');
                if (appState.currentUser) {
                    td.className = "editable-cell editable-cell-active";
                    td.addEventListener('dblclick', () => editTextFieldCell(td, row.index, 'Comments', cellValue));
                } else {
                    td.className = "cell-locked";
                    td.addEventListener('dblclick', () => showSignInPromptToast());
                }
            } 
            // Automatic Author Column (Direct edit option removed)
            else if (col === "Author") {
                td.className = "cell-locked";
                td.innerText = String(cellValue).replace(/[\r\n]+/g, ' ');
                td.addEventListener('dblclick', () => {
                    if (!appState.currentUser) {
                        showSignInPromptToast();
                    } else {
                        showToast("Author is automatically set to your logged-in name when editing comments or status.", "info");
                    }
                });
            }
            // Saved AI Analysis Report
            else if (col === "AI Analysis") {
                if (cellValue && cellValue.trim() !== "" && cellValue.toLowerCase() !== "nan") {
                    td.innerHTML = `<button class="btn-secondary btn-sm" style="display:flex; align-items:center; gap:4px; font-size: 0.75rem; padding: 4px 8px;">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                        View Report
                    </button>`;
                    td.querySelector('button').addEventListener('click', (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        // Open the Log Analysis modal directly with the saved report
                        if (elementsLogAnalysis.modal) elementsLogAnalysis.modal.classList.remove('hidden');
                        if (elementsLogAnalysis.loading) elementsLogAnalysis.loading.classList.add('hidden');
                        if (elementsLogAnalysis.dockWidget) elementsLogAnalysis.dockWidget.classList.add('hidden');
                        
                        if (elementsLogAnalysis.reportBody) {
                            appState.lastLogAnalysisMarkdown = cellValue;
                            elementsLogAnalysis.reportBody.innerHTML = renderMarkdownSimple(cellValue);
                        }
                        if (elementsLogAnalysis.btnDownload) {
                            elementsLogAnalysis.btnDownload.classList.remove('hidden');
                        }
                    });
                } else {
                    td.className = "text-muted font-mono";
                    td.innerText = "-";
                }
            }
            // Non-editable columns
            else {
                if (col === "Last Updated") {
                    td.className = "font-mono text-muted";
                    td.id = `updated-time-${row.index}`;
                } else if (col === "Code" || col === "VIN Number") {
                    td.className = "font-mono";
                }
                td.innerText = String(cellValue).replace(/[\r\n]+/g, ' ');
                td.addEventListener('dblclick', () => {
                    if (!appState.currentUser) {
                        showSignInPromptToast();
                    }
                });
            }
            
            tr.appendChild(td);
        });
        
        tr.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (typeof handleRowContextMenu === 'function') {
                handleRowContextMenu(e, row);
            }
        });
        
        elements.registryTableBody.appendChild(tr);
    });
}

// ----------------------------------------------------
// Inline Cell Editing Commits
// ----------------------------------------------------
function editStatusCell(td, rowIndex, currentVal, options) {
    if (td.querySelector('select')) return;
    
    const select = document.createElement('select');
    select.className = "cell-select";
    
    options.forEach(opt => {
        const option = document.createElement('option');
        option.value = opt;
        option.innerText = opt;
        if (opt === currentVal) option.selected = true;
        select.appendChild(option);
    });
    
    td.innerHTML = "";
    td.appendChild(select);
    select.focus();
    
    const commitChange = () => {
        const newVal = select.value;
        if (newVal !== currentVal) {
            saveRowUpdate(rowIndex, { Issue_Status: newVal });
        } else {
            const statusClass = newVal.toLowerCase().replace('/\s+/g', '-');
            td.innerHTML = `<span class="status-tag ${statusClass}">${newVal}</span>`;
        }
    };
    
    select.addEventListener('blur', commitChange);
    select.addEventListener('change', commitChange);
}

function editTextFieldCell(td, rowIndex, fieldName, currentVal) {
    if (td.querySelector('textarea')) return;
    
    const input = document.createElement('textarea');
    input.type = "cell-textarea";
    input.className = "cell-input";
    input.value = currentVal;
    input.rows = 3;
    input.style.resize = "vertical";

    td.innerHTML = "";
    td.appendChild(input);
    input.focus();
    
    const commitChange = () => {
        const newVal = input.value.trim();
        if (newVal !== currentVal) {
            const updatePayload = {};
            updatePayload[fieldName] = newVal;
            saveRowUpdate(rowIndex, updatePayload);
        } else {
            td.innerText = currentVal;
        }
    };
    
    input.addEventListener('blur', commitChange);
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            commitChange();
        }
        if (e.key === 'Escape') {
            td.innerText = currentVal;
        }
    });
}

function saveRowUpdate(rowIndex, updatePayload) {
    const rowEl = document.querySelector(`tr[data-index="${rowIndex}"]`);
    if (rowEl) {
        rowEl.classList.add('row-updating');
    }
    
    const recordIdx = appState.allData.findIndex(r => r.index === rowIndex);
    if (recordIdx === -1) return;
    
    const record = appState.allData[recordIdx];
    
    // Check key columns in dataset safely
    const commentsCol = appState.columns.includes("Comments") ? "Comments" : "";
    const authorCol = appState.columns.includes("Author") ? "Author" : "";
    const statusCol = appState.columns.includes("Issue Status") ? "Issue Status" : "";
    
    const finalPayload = {
        index: rowIndex,
        Comments: updatePayload.hasOwnProperty('Comments') ? updatePayload.Comments : (commentsCol ? record[commentsCol] : ""),
        Issue_Status: updatePayload.hasOwnProperty('Issue_Status') ? updatePayload.Issue_Status : (statusCol ? record[statusCol] : ""),
        Author: updatePayload.hasOwnProperty('Author') ? updatePayload.Author : (authorCol ? record[authorCol] : "")
    };
    
    const headers = { 'Content-Type': 'application/json' };
    if (appState.authToken) {
        headers['Authorization'] = `Bearer ${appState.authToken}`;
    }
    
    fetch('/api/update-row', {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(finalPayload)
    })
    .then(async res => {
        if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            const detail = errData.detail || `HTTP error ${res.status}`;
            throw new Error(detail);
        }
        return res.json();
    })
    .then(result => {
        if (result.status === 'success') {
            const updatedAuthor = result.author || (appState.currentUser ? appState.currentUser.name : finalPayload.Author);
            
            // Update local state dynamically
            if (commentsCol) appState.allData[recordIdx][commentsCol] = finalPayload.Comments;
            if (statusCol) appState.allData[recordIdx][statusCol] = finalPayload.Issue_Status;
            if (authorCol) appState.allData[recordIdx][authorCol] = updatedAuthor;
            
            if (appState.columns.includes("Last Updated")) {
                appState.allData[recordIdx]["Last Updated"] = result.last_updated;
            }
            
            if (rowEl) {
                rowEl.classList.remove('row-updating');
                rowEl.classList.add('row-success');
                setTimeout(() => rowEl.classList.remove('row-success'), 1200);
            }
            
            showToast("Database registry entry updated successfully.");
            
            // Sync filteredData
            const fIdx = appState.filteredData.findIndex(r => r.index === rowIndex);
            if (fIdx !== -1) {
                if (commentsCol) appState.filteredData[fIdx][commentsCol] = finalPayload.Comments;
                if (statusCol) appState.filteredData[fIdx][statusCol] = finalPayload.Issue_Status;
                if (authorCol) appState.filteredData[fIdx][authorCol] = updatedAuthor;
                if (appState.columns.includes("Last Updated")) {
                    appState.filteredData[fIdx]["Last Updated"] = result.last_updated;
                }
            }
            
            updateKPIs();
            renderGridAndPagination();
            renderCharts();
        } else {
            throw new Error("Invalid response status from server");
        }
    })
    .catch(err => {
        logErrorToConsole("Save Row Update", err);
        showToast(`Save failed: ${err.message || err}`, "error");
        if (rowEl) rowEl.classList.remove('row-updating');
        renderGridAndPagination();
    });
}

// ----------------------------------------------------
// Adaptive Dashboard Visualizations (Respects System Colors)
// ----------------------------------------------------
function renderCharts() {
    if (!document.getElementById('chart-top-dtc')) return;
    const data = appState.filteredData;
    if (data.length === 0) return;
    
    const rootStyles = getComputedStyle(document.documentElement);
    const textSecColor = rootStyles.getPropertyValue('--text-secondary').trim() || '#94a3b8';
    const borderThemeColor = rootStyles.getPropertyValue('--border-color').trim() || 'rgba(0,0,0,0.1)';
    const fontTheme = rootStyles.getPropertyValue('--font-sans').trim() || 'sans-serif';
    
    // Find fields dynamically in case they exist under slightly altered casing
    const codeCol = appState.columns.find(c => c.toLowerCase() === "code") || "Code";
    const moduleCol = appState.columns.find(c => c.toLowerCase() === "module") || "Module";
    const statusCol = appState.columns.find(c => c.toLowerCase().includes("status")) || "Issue Status";
    const programCol = appState.columns.find(c => c.toLowerCase().includes("program")) || "Program name";
    
    const getCounts = (field, limit = 20) => {
        const counts = {};
        data.forEach(item => {
            const val = item[field];
            if (val) counts[val] = (counts[val] || 0) + 1;
        });
        return Object.entries(counts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, limit);
    };

    // Chart 1: Top 20 DTCs by Count
    const dtcCounts = getCounts(codeCol, 20);
    const dtcLabels = dtcCounts.map(x => x[0]);
    const dtcValues = dtcCounts.map(x => x[1]);
    
   const topDtcCanvas = document.getElementById('chart-top-dtc');
   if(topDtcCanvas){
    const existingTopDtcChart = Chart.getChart('chart-top-dtc');
    
    
    if( existingTopDtcChart){
        existingTopDtcChart.destroy();
    }  
    if(charts.topDtc){
        charts.topDtc = null;  
    }

    charts.topDtc = new Chart(topDtcCanvas, {
        type: 'bar',
        data: {
            labels: dtcLabels,
            datasets: [{
                label: 'Fault Occurrences',
                data: dtcValues,
                backgroundColor: 'rgba(59, 130, 246, 0.65)',
                borderColor: '#3b82f6',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: { bodyFont: { family: fontTheme } }
            },
            scales: {
                y: { grid: { color: borderThemeColor }, ticks: { color: textSecColor, font: { size: 9, family: fontTheme } } },
                x: { grid: { display: false }, ticks: { color: textSecColor, font: { size: 9, family: fontTheme }, maxRotation: 45, minRotation: 45 } }
            }
        }
    });
   }

    // Chart 2: Top Modules by DTC Count
    const modCounts = getCounts(moduleCol, 10);
    const modLabels = modCounts.map(x => x[0]);
    const modValues = modCounts.map(x => x[1]);
    
    if (charts.topModules) charts.topModules.destroy();
    charts.topModules = new Chart(document.getElementById('chart-top-modules'), {
        type: 'bar',
        data: {
            labels: modLabels,
            datasets: [{
                label: 'Total DTC Count',
                data: modValues,
                backgroundColor: 'rgba(13, 148, 136, 0.65)',
                borderColor: '#0d9488',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: { bodyFont: { family: fontTheme } }
            },
            scales: {
                y: { grid: { color: borderThemeColor }, ticks: { color: textSecColor, font: { size: 9, family: fontTheme } } },
                x: { grid: { display: false }, ticks: { color: textSecColor, font: { size: 9, family: fontTheme } } }
            }
        }
    });

    // Chart 3: Horizontal Stacked Bar Chart
    const modules = [...new Set(data.map(item => item[moduleCol]).filter(Boolean))];
    const statuses = [...new Set(data.map(item => item[statusCol]).filter(Boolean))];
    
    const statusMapByModule = {};
    modules.forEach(m => {
        statusMapByModule[m] = {};
        statuses.forEach(s => statusMapByModule[m][s] = 0);
    });
    
    data.forEach(item => {
        const m = item[moduleCol];
        const s = item[statusCol];
        if (m && s && statusMapByModule[m] && statusMapByModule[m].hasOwnProperty(s)) {
            statusMapByModule[m][s]++;
        }
    });
    
    const sortedModules = modules.map(m => {
        const sum = Object.values(statusMapByModule[m]).reduce((a, b) => a + b, 0);
        return { name: m, total: sum };
    }).sort((a, b) => b.total - a.total).map(x => x.name);

    const barHeight = 28; // px per module 
    const dynamicHeight = sortedModules.length*barHeight;
    const chartCanvas = document.getElementById('chart-status-modules');
    const chartWrapper = chartCanvas.parentElement;

    
    const datasets = [
        { label: 'New', data: [], backgroundColor: 'rgba(59, 130, 246, 0.7)', stack: 'Status' },
        { label: 'Known', data: [], backgroundColor: 'rgba(6, 182, 212, 0.7)', stack: 'Status' },
        { label: 'Not an Issue', data: [], backgroundColor: 'rgba(245, 158, 11, 0.7)', stack: 'Status' },
        { label: 'Fixed', data: [], backgroundColor: 'rgba(16, 185, 129, 0.7)', stack: 'Status' },
        { label: 'Needs Investigation', data: [], backgroundColor: 'rgba(167, 139, 250, 0.7)', stack: 'Status' }
    ];
    
    sortedModules.forEach(m => {
        datasets[0].data.push(statusMapByModule[m]['New']);
        datasets[1].data.push(statusMapByModule[m]['Known']);
        datasets[2].data.push(statusMapByModule[m]['Not an Issue']);
        datasets[3].data.push(statusMapByModule[m]['Fixed']);
        datasets[4].data.push(statusMapByModule[m]['Needs Investigation']);
    });
    
    if (charts.statusModules) charts.statusModules.destroy();
    charts.statusModules = new Chart(document.getElementById('chart-status-modules'), {
        type: 'bar',
        data: {
            labels: sortedModules,
            datasets: datasets
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'bottom', labels: { color: textSecColor, boxWidth: 10, font: { size: 9, family: fontTheme } } },
                tooltip: { bodyFont: { family: fontTheme } }
            },
            scales: {
                x: { grid: { color: borderThemeColor }, ticks: { color: textSecColor, font: { size: 9, family: fontTheme } }, stacked: true },
                y: { grid: { display: false }, ticks: { color: textSecColor, font: { size: 9, family: fontTheme } }, stacked: true }
            }
        }
    });

    // Chart 4: Donut distribution
    const progCounts = getCounts(programCol, 8);
    const progLabels = progCounts.map(x => x[0]);
    const progValues = progCounts.map(x => x[1]);
    const neonColors = [
        'rgba(99, 102, 241, 0.75)',
        'rgba(236, 72, 153, 0.75)',
        'rgba(168, 85, 247, 0.75)',
        'rgba(14, 165, 233, 0.75)',
        'rgba(234, 179, 8, 0.75)',
        'rgba(20, 184, 166, 0.75)',
        'rgba(244, 63, 94, 0.75)',
        'rgba(16, 185, 129, 0.75)'
    ];
    
    const cardBorderColor = rootStyles.getPropertyValue('--border-color').trim() || '#e2e8f0';
    
    if (charts.programDist) charts.programDist.destroy();
    charts.programDist = new Chart(document.getElementById('chart-program-distribution'), {
        type: 'doughnut',
        data: {
            labels: progLabels,
            datasets: [{
                data: progValues,
                backgroundColor: neonColors.slice(0, progLabels.length),
                borderColor: cardBorderColor,
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'right', labels: { color: textSecColor, boxWidth: 10, font: { size: 9, family: fontTheme } } },
                tooltip: { bodyFont: { family: fontTheme } }
            },
            cutout: '50%'
        }
    });
}

// ----------------------------------------------------
// Utility Actions (Excel, Toast, Debounce)
// ----------------------------------------------------
function exportToExcel() {
    showToast("Generating spreadsheet export... please wait.");
    window.open('/api/export', '_blank');
}

function showToast(message, type = "success") {
    if (!elements.toast || !elements.toastMessage) return;
    elements.toastMessage.innerText = message;
    const iconEl = elements.toast.querySelector('.toast-icon');
    
    if (type === "error") {
        elements.toast.style.borderColor = "var(--error)";
        if (iconEl) {
            iconEl.innerText = "⚠️";
            iconEl.style.color = "var(--error)";
        }
    } else {
        elements.toast.style.borderColor = "var(--success)";
        if (iconEl) {
            iconEl.innerText = "✅";
            iconEl.style.color = "var(--success)";
        }
    }
    
    elements.toast.classList.remove('hidden');
    setTimeout(() => {
        if (elements.toast) elements.toast.classList.add('hidden');
    }, 3000);
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

function getJoinedPath(parent, child) {
    const isWindows = parent.includes('\\') || parent.includes(':');
    const sep = isWindows ? '\\' : '/';
    
    if (parent.endsWith(sep)) {
        return parent + child;
    }
    return parent + sep + child;
}

function getFolderName(path) {
    if (!path) return "";
    const isWindows = path.includes('\\');
    const parts = isWindows ? path.split('\\') : path.split('/');
    return parts.filter(Boolean).pop() || path;
}

// ----------------------------------------------------
// Global Error Handlers & Visual Logging Consolidation
// ----------------------------------------------------
function setupErrorLogging() {
    window.addEventListener('error', (event) => {
        logErrorToConsole("Unhandled Runtime Exception", event.error || event.message);
    });
    window.addEventListener('unhandledrejection', (event) => {
        logErrorToConsole("Unhandled Promise Rejection", event.reason);
    });
}

function logErrorToConsole(errContext, err) {
    console.error(`${errContext}:`, err);
    if (elements.logConsoleContainer) {
        elements.logConsoleContainer.classList.remove('hidden');
        elements.logConsoleContainer.classList.remove('minimized');
    }
    
    const message = err && err.message ? err.message : String(err);
    appendLogLine({
        message: `❌ [FRONTEND EXCEPTION] ${errContext}: ${message}`,
        level: "error",
        time: new Date().toTimeString().split(' ')[0]
    });
}

// graph dialogue controls
let activeDialogChart = null;

function openChartDialog(sourceCanvasId, dialogTitle) {
    const overlay = document.getElementById('chart-dialog-overlay');
    const dialogCanvas = document.getElementById('chart-dialog-canvas');
    const titleElement = document.getElementById('chart-dialog-title');

    if (!overlay || !dialogCanvas || !titleElement) {
        console.error('Chart dialog elements not found.');
        return;
    }

    const sourceChart = Chart.getChart(sourceCanvasId);
    if (!sourceChart) {
        console.warn(`Chart is not ready yet: ${sourceCanvasId}`);
        return;
    }

    titleElement.innerText = dialogTitle || 'Chart Preview';
    overlay.style.display = 'flex';

    const existingDialogChart = Chart.getChart('chart-dialog-canvas');
    if (existingDialogChart) {
        existingDialogChart.destroy();
    }

    const sourceOptions = JSON.parse(JSON.stringify(sourceChart.options || {}));
    sourceOptions.responsive = true;
    sourceOptions.maintainAspectRatio = false;

    activeDialogChart = new Chart(dialogCanvas, {
        type: sourceChart.config.type,
        data: JSON.parse(JSON.stringify(sourceChart.data)),
        options: sourceOptions
    });
}

function closeChartDialog() {
    const overlay = document.getElementById('chart-dialog-overlay');
    if (overlay) {
        overlay.style.display = 'none';
    }
    
    const existingDialogChart = Chart.getChart('chart-dialog-canvas');
    if (existingDialogChart) {
        existingDialogChart.destroy();
    }
    activeDialogChart = null;
}

// ----------------------------------------------------
// AI Root Cause Analysis (RCA) & RAG Knowledge Base
// ----------------------------------------------------
// ----------------------------------------------------
// AI Root Cause Analysis (RCA) & RAG Knowledge Base Session Persistence
// ----------------------------------------------------
const RCA_STORAGE_KEY = 'diagtrace_rca_session_state';

function getRcaSessionState() {
    try {
        const raw = sessionStorage.getItem(RCA_STORAGE_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch (e) {
        return null;
    }
}

function saveRcaSessionState(overrides = {}) {
    const currentState = getRcaSessionState() || {};
    const newState = {
        isDocked: overrides.isDocked !== undefined ? overrides.isDocked : currentState.isDocked || false,
        isModalOpen: overrides.isModalOpen !== undefined ? overrides.isModalOpen : currentState.isModalOpen || false,
        statusText: overrides.statusText !== undefined ? overrides.statusText : currentState.statusText || '',
        progressWidth: overrides.progressWidth !== undefined ? overrides.progressWidth : currentState.progressWidth || '0%',
        progressBg: overrides.progressBg !== undefined ? overrides.progressBg : currentState.progressBg || 'var(--primary)',
        lastRcaMarkdown: appState.lastRcaMarkdown || currentState.lastRcaMarkdown || '',
        rcaReportBodyHtml: elements.rcaReportBody ? elements.rcaReportBody.innerHTML : currentState.rcaReportBodyHtml || '',
        scope: elements.rcaScopeSelect ? elements.rcaScopeSelect.value : currentState.scope || 'fleet',
        timestamp: Date.now()
    };
    try {
        sessionStorage.setItem(RCA_STORAGE_KEY, JSON.stringify(newState));
    } catch (e) {
        console.error("Failed to save RCA session state", e);
    }
}

function clearRcaSessionState() {
    try {
        sessionStorage.removeItem(RCA_STORAGE_KEY);
    } catch (e) {}
}

function restoreRcaSessionState() {
    const saved = getRcaSessionState();
    if (!saved) return;

    if (saved.lastRcaMarkdown) {
        appState.lastRcaMarkdown = saved.lastRcaMarkdown;
    }

    if (saved.statusText && elements.dockedRcaStatusText) {
        elements.dockedRcaStatusText.innerText = saved.statusText;
    }
    if (elements.dockedRcaProgressBar) {
        elements.dockedRcaProgressBar.style.width = saved.progressWidth || '100%';
        elements.dockedRcaProgressBar.style.backgroundColor = saved.progressBg || '#10b981';
    }

    if (saved.rcaReportBodyHtml && elements.rcaReportBody && (!elements.rcaReportBody.innerText || !elements.rcaReportBody.innerText.trim())) {
        elements.rcaReportBody.innerHTML = saved.rcaReportBodyHtml;
    }

    if (saved.lastRcaMarkdown && elements.btnDownloadRca) {
        elements.btnDownloadRca.classList.remove('hidden');
    }

    if (saved.isDocked) {
        if (elements.rcaModal) elements.rcaModal.classList.add('hidden');
        if (elements.dockedRcaWidget) elements.dockedRcaWidget.classList.remove('hidden');
    } else if (saved.isModalOpen) {
        if (elements.dockedRcaWidget) elements.dockedRcaWidget.classList.add('hidden');
        if (elements.rcaModal) elements.rcaModal.classList.remove('hidden');
    }
}

function dockRcaModal() {
    if (elements.rcaModal) elements.rcaModal.classList.add('hidden');
    if (elements.dockedRcaWidget) elements.dockedRcaWidget.classList.remove('hidden');
    saveRcaSessionState({ isDocked: true, isModalOpen: false });
}

function maximizeRcaDock() {
    if (elements.dockedRcaWidget) elements.dockedRcaWidget.classList.add('hidden');
    if (elements.rcaModal) elements.rcaModal.classList.remove('hidden');
    saveRcaSessionState({ isDocked: false, isModalOpen: true });
}

let rcaAbortController = null;

function stopRcaAnalysis() {
    if (rcaAbortController) {
        rcaAbortController.abort();
        rcaAbortController = null;
        showToast("RCA process stopped.", "warning");
    }
    clearRcaSessionState();
    if (elements.dockedRcaWidget) elements.dockedRcaWidget.classList.add('hidden');
    if (elements.rcaModal) elements.rcaModal.classList.add('hidden');
    if (elements.rcaLoading) elements.rcaLoading.classList.add('hidden');
}

function closeRcaDock() {
    stopRcaAnalysis();
}

function updateRcaStatusUI(status, message) {
    if (elements.dockedRcaStatusText) elements.dockedRcaStatusText.innerText = message;
    let width = '0%';
    let bg = 'var(--primary)';
    if (elements.dockedRcaProgressBar) {
        if (status === 'running') {
            width = '45%';
            bg = 'var(--primary)';
        } else if (status === 'completed') {
            width = '100%';
            bg = '#10b981';
        } else if (status === 'error') {
            width = '100%';
            bg = '#ef4444';
        }
        elements.dockedRcaProgressBar.style.width = width;
        elements.dockedRcaProgressBar.style.backgroundColor = bg;
    }
    saveRcaSessionState({ statusText: message, progressWidth: width, progressBg: bg });
}

function openRcaModal() {
    if (elements.dockedRcaWidget) {
        elements.dockedRcaWidget.classList.add('hidden');
    }
    if (elements.rcaModal) {
        elements.rcaModal.classList.remove('hidden');
    }
    saveRcaSessionState({ isDocked: false, isModalOpen: true });
    fetchRcaFiles();

    if (appState.lastRcaMarkdown && elements.btnDownloadRca) {
        elements.btnDownloadRca.classList.remove('hidden');
    }

    const hasReportContent = appState.lastRcaMarkdown || 
        (elements.rcaReportBody && elements.rcaReportBody.innerText && elements.rcaReportBody.innerText.trim() !== '');

    if (!hasReportContent && elements.rcaReportBody) {
        elements.rcaReportBody.innerHTML = `
            <div style="text-align: center; padding: 40px 20px; color: var(--text-secondary);">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom: 12px; color: var(--primary); opacity: 0.85;">
                    <rect x="4" y="4" width="16" height="16" rx="2" ry="2"></rect>
                    <rect x="9" y="9" width="6" height="6"></rect>
                    <line x1="9" y1="1" x2="9" y2="4"></line>
                    <line x1="15" y1="1" x2="15" y2="4"></line>
                    <line x1="9" y1="20" x2="9" y2="23"></line>
                    <line x1="15" y1="20" x2="15" y2="23"></line>
                    <line x1="20" y1="9" x2="23" y2="9"></line>
                    <line x1="20" y1="15" x2="23" y2="15"></line>
                    <line x1="1" y1="9" x2="4" y2="9"></line>
                    <line x1="1" y1="15" x2="4" y2="15"></line>
                </svg>
                <h4 style="margin: 0 0 8px 0; color: var(--text-main); font-weight: 600;">AI Root Cause Analysis & Diagnostic Report</h4>
                <p style="margin: 0; font-size: 0.9rem; max-width: 480px; margin: 0 auto; line-height: 1.5;">
                    Select an analysis scope above (Fleet-Wide or specific log file) and click <strong style="color: var(--primary);">Start Analysis</strong> to synthesize DTC trends and generate an AI diagnostic report.
                </p>
                <div style="margin-top: 14px; font-size: 0.8rem; background: rgba(59,130,246,0.08); border: 1px solid rgba(59,130,246,0.2); color: var(--primary); padding: 8px 14px; border-radius: 6px; display: inline-block;">
                    💡 <strong>Note:</strong> Select a file from the scope selector dropdown and click <strong>Start Analysis</strong>.
                </div>
            </div>
        `;
    }
}

function fetchRcaFiles() {
    fetch('/api/ai/rca/files')
        .then(res => res.json())
        .then(data => {
            if (data.status === 'success' && elements.rcaScopeSelect) {
                const currentValue = elements.rcaScopeSelect.value || 'fleet';
                elements.rcaScopeSelect.innerHTML = '<option value="fleet">Fleet-Wide Analysis</option>';
                
                if (Array.isArray(data.files)) {
                    data.files.forEach(file => {
                        if (file) {
                            const opt = document.createElement('option');
                            opt.value = file;
                            opt.textContent = `File: ${file}`;
                            elements.rcaScopeSelect.appendChild(opt);
                        }
                    });
                }
                elements.rcaScopeSelect.value = currentValue;
            }
        })
        .catch(err => console.error("Failed to fetch RCA files:", err));
}

function runAiRcaAnalysis() {
    if (rcaAbortController) {
        rcaAbortController.abort();
    }
    rcaAbortController = new AbortController();

    if (elements.rcaModal) elements.rcaModal.classList.remove('hidden');
    if (elements.rcaLoading) elements.rcaLoading.classList.remove('hidden');
    if (elements.rcaReportBody) elements.rcaReportBody.innerHTML = '';
    if (elements.rcaChartsContainer) elements.rcaChartsContainer.innerHTML = '';
    if (elements.btnDownloadRca) elements.btnDownloadRca.classList.add('hidden');

    if (elements.btnStartRca) {
        elements.btnStartRca.disabled = true;
        elements.btnStartRca.innerHTML = `<span class="css-spinner" style="width:12px;height:12px;border-width:2px;display:inline-block;margin-right:4px;"></span> Analyzing...`;
    }

    const scope = elements.rcaScopeSelect ? elements.rcaScopeSelect.value : 'fleet';
    const endpoint = scope === 'fleet' ? '/api/ai/rca' : `/api/ai/rca/file/${encodeURIComponent(scope)}`;
    
    if (elements.rcaScopeSelect && elements.rcaScopeSelect.options.length <= 1) {
        fetchRcaFiles();
    }

    updateRcaStatusUI('running', `⚡ Synthesizing RCA report for ${scope === 'fleet' ? 'Fleet' : scope}...`);

    fetch(endpoint, { method: 'POST', signal: rcaAbortController.signal })
    .then(res => res.json())
    .then(data => {
        rcaAbortController = null;
        if (elements.btnStartRca) {
            elements.btnStartRca.disabled = false;
            elements.btnStartRca.innerHTML = `Start Analysis`;
        }
        if (elements.rcaLoading) elements.rcaLoading.classList.add('hidden');
        if (data.status === 'success' && elements.rcaReportBody) {
            appState.lastRcaMarkdown = data.report_markdown || '';
            const scopeLabel = scope === 'fleet' ? 'Fleet-Wide Analysis' : `File: ${scope}`;
            const timestamp = new Date().toLocaleString();
            const headerBanner = `
                <div style="background: var(--bg-surface); border: 1px solid var(--border-color); border-radius: 8px; padding: 14px 18px; margin-bottom: 20px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px;">
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <span style="background: rgba(59,130,246,0.12); color: #3b82f6; padding: 4px 10px; border-radius: 4px; font-size: 0.78rem; font-weight: 600; letter-spacing: 0.3px;">RCA REPORT</span>
                        <span style="font-size: 0.88rem; color: var(--text-main); font-weight: 500;">${scopeLabel}</span>
                    </div>
                    <div style="font-size: 0.78rem; color: var(--text-muted); display: flex; align-items: center; gap: 6px;">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                        Generated ${timestamp}
                    </div>
                </div>
            `;
            elements.rcaReportBody.innerHTML = headerBanner + renderMarkdownSimple(data.report_markdown);
            if (elements.btnDownloadRca && data.report_markdown) {
                elements.btnDownloadRca.classList.remove('hidden');
            }
            if (data.chart_data && elements.rcaChartsContainer && typeof Chart !== 'undefined') {
                Object.entries(data.chart_data).forEach(([chartId, config]) => {
                    const canvasWrapper = document.createElement('div');
                    canvasWrapper.className = 'chart-wrapper';
                    canvasWrapper.style.cssText = "background: var(--bg-surface); padding: 16px; border-radius: 10px; border: 1px solid var(--border-color); position: relative; height: 350px; width: 100%; margin-bottom: 20px; page-break-inside: avoid !important; break-inside: avoid !important;";
                    const canvas = document.createElement('canvas');
                    canvasWrapper.appendChild(canvas);
                    elements.rcaChartsContainer.appendChild(canvasWrapper);
                    new Chart(canvas.getContext('2d'), config);
                });
            }
            updateRcaStatusUI('completed', '🎉 RCA Report Generated! (Click to View)');
            showToast('🎉 AI Root Cause Analysis Report Generated!');
        } else if (elements.rcaReportBody) {
            const errMsg = data.message || 'Failed to run RCA analysis.';
            elements.rcaReportBody.innerHTML = `<p class="auth-error-msg">${errMsg}</p>`;
            updateRcaStatusUI('error', `❌ RCA Failed: ${errMsg}`);
        }
    })
    .catch(err => {
        if (elements.btnStartRca) {
            elements.btnStartRca.disabled = false;
            elements.btnStartRca.innerHTML = `Start Analysis`;
        }
        if (err.name === 'AbortError') {
            console.log('RCA generation stopped by user.');
            return;
        }
        rcaAbortController = null;
        if (elements.rcaLoading) elements.rcaLoading.classList.add('hidden');
        if (elements.rcaReportBody) {
            elements.rcaReportBody.innerHTML = `<p class="auth-error-msg">Error running RCA: ${err.message}</p>`;
        }
        updateRcaStatusUI('error', `❌ RCA Error: ${err.message}`);
    });
}

function downloadRcaReport() {
    if (!appState.lastRcaMarkdown && (!elements.rcaReportBody || !elements.rcaReportBody.innerText.trim())) {
        showToast("No RCA report content available to download.", "warning");
        return;
    }

    showToast("📄 Generating PDF report...", "info");

    const modalBody = document.querySelector('#rca-modal .rca-modal-body');
    if (!modalBody) {
        showToast("Unable to find RCA report content.", "error");
        return;
    }

    const scope = elements.rcaScopeSelect ? elements.rcaScopeSelect.value : 'fleet';
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = `DiagTrace_AI_RCA_Report_${scope}_${timestamp}.pdf`;

    const originalMaxHeight = modalBody.style.maxHeight;
    const originalOverflow = modalBody.style.overflowY;
    const originalColor = modalBody.style.color;

    modalBody.style.maxHeight = 'none';
    modalBody.style.overflowY = 'visible';
    modalBody.style.color = 'var(--text-main, #0f172a)';

    const chartsContainer = elements.rcaChartsContainer;
    let originalChartsDisplay = '';
    if (chartsContainer) {
        originalChartsDisplay = chartsContainer.style.display;
        chartsContainer.style.display = 'block';
    }

    const opt = {
        margin:       [12, 12, 12, 12],
        filename:     filename,
        image:        { type: 'jpeg', quality: 0.98 },
        html2canvas:  { scale: 2, useCORS: true, logging: false, backgroundColor: '#ffffff' },
        jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' },
        pagebreak:    { mode: ['avoid-all', 'css', 'legacy'], avoid: ['.chart-wrapper', 'table', 'tr', 'h1', 'h2', 'h3', 'code', 'ul'] }
    };

    const pdfStyles = document.createElement('style');
    pdfStyles.id = 'pdf-export-styles-rca';
    pdfStyles.innerHTML = `
        #rca-modal code, .markdown-body code {
            background: #f1f5f9 !important;
            color: #0f172a !important;
            border: 1px solid #cbd5e1 !important;
            font-weight: 600 !important;
            padding: 2px 6px !important;
            display: inline-block !important;
        }
        #rca-modal .rca-modal-body, .markdown-body {
            color: #0f172a !important;
        }
        #rca-modal th, .markdown-body th {
            background: #f8fafc !important;
            color: #0f172a !important;
        }
        #rca-modal td, .markdown-body td {
            color: #1e293b !important;
        }
    `;
    document.head.appendChild(pdfStyles);

    const cleanupPdfStyles = () => {
        const el = document.getElementById('pdf-export-styles-rca');
        if (el) el.remove();
        modalBody.style.maxHeight = originalMaxHeight;
        modalBody.style.overflowY = originalOverflow;
        modalBody.style.color = originalColor;
        if (chartsContainer) chartsContainer.style.display = originalChartsDisplay;
    };

    if (typeof html2pdf !== 'undefined') {
        html2pdf().set(opt).from(modalBody).save().then(() => {
            cleanupPdfStyles();
            showToast(`🎉 Downloaded PDF Report (${filename})`);
        }).catch(err => {
            console.error("PDF generation error:", err);
            cleanupPdfStyles();
            showToast("Failed to generate PDF report.", "error");
        });
    } else {
        window.print();
        cleanupPdfStyles();
    }
}

function closeRcaModal() {
    stopRcaAnalysis();
}

// ----------------------------------------------------
// AI Assistant Chatbot Widget & Dynamic Charts
// ----------------------------------------------------
function toggleChatDrawer() {
    if (elements.chatDrawer) {
        elements.chatDrawer.classList.toggle('hidden');
        if (elements.chatDrawer.classList.contains('hidden')) {
            closeExpandChatDrawer();
        }
    }
}

function closeChatDrawer() {
    if (elements.chatDrawer) {
        elements.chatDrawer.classList.add('hidden');
        closeExpandChatDrawer();
    }
}

function toggleExpandChatDrawer() {
    if (!elements.chatDrawer) return;
    
    // Ensure drawer is open
    elements.chatDrawer.classList.remove('hidden');

    const isExpanded = elements.chatDrawer.classList.toggle('expanded');
    const widget = document.getElementById('ai-chatbot-widget');
    if (widget) {
        widget.classList.toggle('expanded-widget', isExpanded);
    }
    
    // Manage Backdrop
    let backdrop = elements.chatModalBackdrop || document.getElementById('chat-modal-backdrop');
    if (!backdrop) {
        backdrop = document.createElement('div');
        backdrop.id = 'chat-modal-backdrop';
        backdrop.className = 'chat-modal-backdrop';
        document.body.appendChild(backdrop);
        elements.chatModalBackdrop = backdrop;
        backdrop.addEventListener('click', closeExpandChatDrawer);
    }
    
    if (isExpanded) {
        backdrop.classList.add('active');
        document.body.style.overflow = 'hidden';
    } else {
        backdrop.classList.remove('active');
        document.body.style.overflow = '';
    }

    updateExpandBtnState(isExpanded);
}

function closeExpandChatDrawer() {
    if (elements.chatDrawer) {
        elements.chatDrawer.classList.remove('expanded');
    }
    const widget = document.getElementById('ai-chatbot-widget');
    if (widget) {
        widget.classList.remove('expanded-widget');
    }
    const backdrop = elements.chatModalBackdrop || document.getElementById('chat-modal-backdrop');
    if (backdrop) {
        backdrop.classList.remove('active');
    }
    document.body.style.overflow = '';
    updateExpandBtnState(false);
}

function updateExpandBtnState(isExpanded) {
    const expandBtn = elements.chatDrawerExpand || document.getElementById('chat-drawer-expand');
    if (!expandBtn) return;

    if (isExpanded) {
        expandBtn.innerHTML = `
            <svg fill="none" height="14" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" viewBox="0 0 24 24" width="14">
                <polyline points="4 14 10 14 10 20"></polyline>
                <polyline points="20 10 14 10 14 4"></polyline>
                <line x1="14" y1="10" x2="21" y2="3"></line>
                <line x1="10" y1="14" x2="3" y2="21"></line>
            </svg>
            <span class="expand-text">Compress</span>
        `;
        expandBtn.title = "Collapse Assistant Dialog";
    } else {
        expandBtn.innerHTML = `
            <svg fill="none" height="14" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" viewBox="0 0 24 24" width="14">
                <polyline points="15 3 21 3 21 9"></polyline>
                <polyline points="9 21 3 21 3 15"></polyline>
                <line x1="21" y1="3" x2="14" y2="10"></line>
                <line x1="3" y1="21" x2="10" y2="14"></line>
            </svg>
            <span class="expand-text">Expand</span>
        `;
        expandBtn.title = "Expand Assistant Dialog";
    }
}

let chatChartCounter = 0;

function handleChatSubmit(e) {
    if (e && e.preventDefault) e.preventDefault();
    if (!elements.chatInput) return;
    const message = elements.chatInput.value.trim();
    if (!message) return;

    // Append User Message
    appendChatMessage('user', message);
    elements.chatInput.value = '';

    // Append Bot Thinking Message
    const botMsgId = `bot-msg-${Date.now()}`;
    appendChatMessage('bot', '<em>AI is thinking & analyzing context...</em>', botMsgId);

    fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: message, session_id: chatSessionId })
    })
    .then(res => res.json())
    .then(data => {
        const botMsgEl = document.getElementById(botMsgId);
        if (botMsgEl) {
            let contentHtml = renderMarkdownSimple(data.reply_markdown);
            
            // If chart spec exists, create chart canvas container
            if (data.chart_spec) {
                chatChartCounter++;
                const canvasId = `chat-chart-canvas-${chatChartCounter}`;
                contentHtml += `<div class="chat-canvas-container"><canvas id="${canvasId}"></canvas></div>`;
                botMsgEl.querySelector('.msg-bubble').innerHTML = contentHtml;
                
                // Render Chart.js chart after DOM update
                setTimeout(() => {
                    renderDynamicChatChart(canvasId, data.chart_spec);
                }, 100);
            } else {
                botMsgEl.querySelector('.msg-bubble').innerHTML = contentHtml;
            }
        }
        scrollChatToBottom();
    })
    .catch(err => {
        const botMsgEl = document.getElementById(botMsgId);
        if (botMsgEl) {
            botMsgEl.querySelector('.msg-bubble').innerHTML = `<span style="color:var(--error);">Failed to get AI response: ${err.message}</span>`;
        }
    });
}

function newChatSession() {
    // Generate new session ID
    chatSessionId = (typeof crypto !== 'undefined' && crypto.randomUUID) 
        ? crypto.randomUUID() 
        : 'session-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);

    // Clear chat history UI — restore to default welcome message
    if (elements.chatHistory) {
        elements.chatHistory.innerHTML = `
            <div class="chat-message bot">
                <div class="msg-avatar" style="display: flex; align-items: center; justify-content: center;">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="2" ry="2"></rect><rect x="9" y="9" width="6" height="6"></rect><line x1="9" y1="1" x2="9" y2="4"></line><line x1="15" y1="1" x2="15" y2="4"></line><line x1="9" y1="20" x2="9" y2="23"></line><line x1="15" y1="20" x2="15" y2="23"></line><line x1="20" y1="9" x2="23" y2="9"></line><line x1="20" y1="15" x2="23" y2="15"></line><line x1="1" y1="9" x2="4" y2="9"></line><line x1="1" y1="15" x2="4" y2="15"></line></svg>
                </div>
                <div class="msg-bubble">
                    Hello! I'm your AI Diagnostics &amp; RCA Assistant. Ask me anything about ECU architecture, CAN DTC root cause analysis, or ask me to <b>generate reports and draw custom charts</b>.
                </div>
            </div>
        `;
    }

    // Show quick chips again
    const quickChips = document.getElementById('chat-quick-chips');
    if (quickChips) quickChips.style.display = '';

    // Focus input
    if (elements.chatInput) elements.chatInput.focus();
    
    // Refresh sessions list
    loadChatSessions();
}

function loadChatSessions() {
    fetch('/api/ai/chat/sessions')
        .then(res => res.json())
        .then(data => {
            const listEl = document.getElementById('chat-sessions-list');
            if (!listEl) return;
            
            if (data.status === 'success' && data.sessions && data.sessions.length > 0) {
                let html = '';
                data.sessions.forEach(session => {
                    const isActive = session.id === chatSessionId ? 'active' : '';
                    let dateStr = '';
                    if (session.updated_at) {
                        const isoStr = session.updated_at.replace(' ', 'T') + (session.updated_at.includes('Z') ? '' : 'Z');
                        const dateObj = new Date(isoStr);
                        if (!isNaN(dateObj.getTime())) {
                            dateStr = dateObj.toLocaleDateString() + ' ' + dateObj.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
                        } else {
                            dateStr = session.updated_at;
                        }
                    }
                    
                    html += `
                        <div class="chat-session-item ${isActive}" onclick="selectChatSession('${session.id}')">
                            <div class="chat-session-info">
                                <span class="chat-session-title">${escapeHtml(session.title)}</span>
                                <span class="chat-session-date">${dateStr}</span>
                            </div>
                            <button class="chat-session-delete" onclick="deleteChatSession('${session.id}', event)" title="Delete Chat">
                                <svg fill="none" height="14" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" viewBox="0 0 24 24" width="14"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                            </button>
                        </div>
                    `;
                });
                listEl.innerHTML = html;
            } else {
                listEl.innerHTML = '<div style="padding: 10px; font-size: 0.8rem; color: var(--text-muted); text-align: center;">No previous chats</div>';
            }
        })
        .catch(err => console.error('Failed to load chat sessions:', err));
}

function selectChatSession(id) {
    if (chatSessionId === id) return;
    
    chatSessionId = id;
    loadChatSessions(); // Update active state in UI
    
    if (elements.chatHistory) {
        elements.chatHistory.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--text-muted); font-size: 0.9rem;">Loading history...</div>';
    }
    
    fetch('/api/ai/chat/history?session_id=' + encodeURIComponent(id))
        .then(res => res.json())
        .then(data => {
            if (data.status === 'success' && data.history) {
                if (elements.chatHistory) {
                    elements.chatHistory.innerHTML = '';
                    if (data.history.length === 0) {
                        elements.chatHistory.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--text-muted); font-size: 0.9rem;">No messages in this chat.</div>';
                    } else {
                        data.history.forEach((msg, idx) => {
                            if (msg.role === 'system') return;
                            
                            let contentHtml = renderMarkdownSimple(msg.content);
                            const msgId = `history-msg-${Date.now()}-${idx}`;
                            
                            if (msg.role === 'assistant' && msg.chart_spec) {
                                chatChartCounter++;
                                const canvasId = `chat-chart-canvas-${chatChartCounter}`;
                                contentHtml += `<div class="chat-canvas-container"><canvas id="${canvasId}"></canvas></div>`;
                                
                                appendChatMessage('bot', contentHtml, msgId);
                                
                                setTimeout(() => {
                                    renderDynamicChatChart(canvasId, msg.chart_spec);
                                }, 100);
                            } else {
                                appendChatMessage(msg.role === 'user' ? 'user' : 'bot', contentHtml, msgId);
                            }
                        });
                    }
                }
            }
        })
        .catch(err => {
            console.error('Failed to load chat history:', err);
            if (elements.chatHistory) {
                elements.chatHistory.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--error); font-size: 0.9rem;">Failed to load chat history.</div>';
            }
        });
}

function deleteChatSession(id, event) {
    event.stopPropagation();
    
    if (!confirm('Are you sure you want to delete this chat session?')) return;
    
    fetch('/api/ai/chat/sessions/' + encodeURIComponent(id), {
        method: 'DELETE'
    })
    .then(res => res.json())
    .then(data => {
        if (data.status === 'success') {
            if (chatSessionId === id) {
                newChatSession();
            } else {
                loadChatSessions();
            }
        }
    })
    .catch(err => console.error('Failed to delete chat session:', err));
}

function appendChatMessage(sender, htmlContent, msgId = null) {
    if (!elements.chatHistory) return;
    const msgDiv = document.createElement('div');
    msgDiv.className = `chat-message ${sender}`;
    if (msgId) msgDiv.id = msgId;

    const avatarHtml = sender === 'bot' 
        ? '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="2" ry="2"></rect><rect x="9" y="9" width="6" height="6"></rect><line x1="9" y1="1" x2="9" y2="4"></line><line x1="15" y1="1" x2="15" y2="4"></line><line x1="9" y1="20" x2="9" y2="23"></line><line x1="15" y1="20" x2="15" y2="23"></line><line x1="20" y1="9" x2="23" y2="9"></line><line x1="20" y1="15" x2="23" y2="15"></line><line x1="1" y1="9" x2="4" y2="9"></line><line x1="1" y1="15" x2="4" y2="15"></line></svg>'
        : '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>';
    msgDiv.innerHTML = `
        <div class="msg-avatar" style="display: flex; align-items: center; justify-content: center;">${avatarHtml}</div>
        <div class="msg-bubble">${htmlContent}</div>
    `;
    elements.chatHistory.appendChild(msgDiv);
    scrollChatToBottom();
}

function scrollChatToBottom() {
    if (elements.chatHistory) {
        elements.chatHistory.scrollTop = elements.chatHistory.scrollHeight;
    }
}

function renderDynamicChatChart(canvasId, spec) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    new Chart(ctx, {
        type: spec.type || 'bar',
        data: {
            labels: spec.labels || [],
            datasets: spec.datasets || []
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                title: {
                    display: true,
                    text: spec.title || 'Diagnostic Analysis',
                    color: getComputedStyle(document.documentElement).getPropertyValue('--text-primary').trim() || '#333',
                    font: { size: 11 }
                },
                legend: {
                    labels: {
                        color: getComputedStyle(document.documentElement).getPropertyValue('--text-primary').trim() || '#333',
                        font: { size: 9 }
                    }
                }
            }
        }
    });
}

function renderMarkdownSimple(text) {
    if (!text) return '<p style="color: var(--text-muted);">No content available.</p>';
    let html = text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
        
    let lines = html.split('\n');
    let inTable = false;
    let newLines = [];
    
    for (let i = 0; i < lines.length; i++) {
        let line = lines[i].trim();
        if (line.startsWith('|') && line.endsWith('|')) {
            if (!inTable) {
                inTable = true;
                newLines.push('<div style="overflow-x: auto; margin: 16px 0;"><table style="width: 100%; border-collapse: collapse; font-size: 0.88rem; text-align: left; border: 1px solid var(--border-color, #e2e8f0); border-radius: 8px; overflow: hidden;">');
            }
            if (line.match(/^\|[\s\-\|:]+\|$/)) continue;
            
            let cells = line.split('|').slice(1, -1);
            let rowHtml = '<tr style="border-bottom: 1px solid var(--border-color, #e2e8f0);">';
            for (let cell of cells) {
                let isHeader = (i + 1 < lines.length) && lines[i+1].trim().match(/^\|[\s\-\|:]+\|$/);
                let tag = isHeader ? 'th' : 'td';
                let style = isHeader 
                    ? 'padding: 10px 14px; background: var(--bg-surface, rgba(0,0,0,0.03)); font-weight: 600; color: var(--text-main, #0f172a); border-right: 1px solid var(--border-color, #e2e8f0);' 
                    : 'padding: 10px 14px; color: var(--text-main, #334155); border-right: 1px solid var(--border-color, #e2e8f0);';
                
                let cellHtml = cell.trim()
                    .replace(/\*\*\*(.*?)\*\*\*/g, '<strong><em>$1</em></strong>')
                    .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')
                    .replace(/\*(.*?)\*/g, '<i>$1</i>')
                    .replace(/`([^`]+)`/g, '<code style="background: rgba(0,0,0,0.06); padding: 2px 5px; border-radius: 4px; font-family: var(--font-mono); font-size: 0.82rem;">$1</code>');
                rowHtml += `<${tag} style="${style}">${cellHtml}</${tag}>`;
            }
            rowHtml += '</tr>';
            newLines.push(rowHtml);
        } else {
            if (inTable) {
                inTable = false;
                newLines.push('</table></div>');
            }
            let formattedLine = line
                .replace(/^### (.*$)/gim, '<h3 style="margin-top: 18px; margin-bottom: 8px; font-size: 1.05rem; font-weight: 600; color: var(--text-main, #0f172a);">$1</h3>')
                .replace(/^## (.*$)/gim, '<h2 style="margin-top: 22px; margin-bottom: 10px; font-size: 1.2rem; font-weight: 600; color: var(--primary, #2563eb); border-bottom: 1px solid var(--border-color, #e2e8f0); padding-bottom: 6px;">$1</h2>')
                .replace(/^# (.*$)/gim, '<h1 style="margin-top: 24px; margin-bottom: 14px; font-size: 1.4rem; font-weight: 700; color: var(--text-main, #0f172a); border-bottom: 2px solid var(--primary, #2563eb); padding-bottom: 8px;">$1</h1>')
                .replace(/\*\*\*(.*?)\*\*\*/g, '<strong><em>$1</em></strong>')
                .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')
                .replace(/\*(.*?)\*/g, '<i>$1</i>')
                .replace(/`([^`]+)`/g, '<code style="background: rgba(0,0,0,0.06); padding: 2px 5px; border-radius: 4px; font-family: var(--font-mono); font-size: 0.85rem;">$1</code>')
                .replace(/^[-*]\s+(.+)$/gim, '<li>$1</li>')
                .replace(/^\d+\.\s+(.+)$/gim, '<li>$1</li>')
                .replace(/^---$/gm, '<hr style="border: none; border-top: 1px solid var(--border-color, #e2e8f0); margin: 20px 0;">');
            newLines.push(formattedLine);
        }
    }
    if (inTable) newLines.push('</table></div>');
    
    html = newLines.join('\n');
    html = html.replace(/(<\/table><\/div>|<\/h[1-3]>)[\s\n]+/g, '$1\n');
    
    // Group <li> into <ul>
    html = html.replace(/(<li>.*?<\/li>(\s*\n)?)+/gs, (match) => {
        return '<ul style="padding-left: 22px; margin: 10px 0; line-height: 1.6;">' + match.replace(/\n/g, '') + '</ul>';
    });

    html = html.replace(/\n\n/g, '<br/><br/>').replace(/\n/g, '<br/>');
    
    html = html.replace(/<br\/>(<div style="overflow-x)/g, '$1')
               .replace(/(<\/div>)<br\/>/g, '$1')
               .replace(/(<tr.*?>)<br\/>/g, '$1')
               .replace(/(<\/tr>)<br\/>/g, '$1')
               .replace(/(<ul.*?>)<br\/>/g, '$1')
               .replace(/(<\/ul>)<br\/>/g, '$1')
               .replace(/(<h[1-3].*?>)<br\/>/g, '$1')
               .replace(/(<\/h[1-3]>)<br\/>/g, '$1');
    
    return `<div class="markdown-body" style="line-height: 1.7; font-size: 0.92rem; color: var(--text-main, #334155);">${html}</div>`;
}

// ----------------------------------------------------
// Context Menu & Log Analysis
// ----------------------------------------------------
let contextMenuTargetRow = null;

function handleRowContextMenu(e, rowData) {
    const contextMenu = document.getElementById('row-context-menu');
    if (!contextMenu) return;
    
    contextMenuTargetRow = rowData;
    
    // Position menu
    contextMenu.style.top = `${e.clientY}px`;
    contextMenu.style.left = `${e.clientX}px`;
    contextMenu.classList.remove('hidden');
}

// UI Elements for Log Analysis
const elementsLogAnalysis = {
    modal: document.getElementById('log-analysis-modal'),
    closeBtn: document.getElementById('log-analysis-close'),
    loading: document.getElementById('log-analysis-loading'),
    reportBody: document.getElementById('log-analysis-report-body'),
    dockWidget: document.getElementById('docked-log-analysis-widget'),
    dockStatusText: document.getElementById('docked-log-analysis-status-text'),
    dockProgressBar: document.getElementById('docked-log-analysis-progress-bar'),
    btnDock: document.getElementById('btn-dock-log-analysis'),
    btnMaximizeDock: document.getElementById('btn-maximize-docked-log-analysis'),
    btnCloseDock: document.getElementById('btn-close-docked-log-analysis'),
    dockBody: document.getElementById('docked-log-analysis-body'),
    btnDownload: document.getElementById('btn-download-log-analysis')
};

let logAnalysisAbortController = null;
let logAnalysisTargetRowIndex = null; // Track which row is being analyzed

function stopLogAnalysis() {
    const wasRunning = logAnalysisAbortController !== null;
    if (logAnalysisAbortController) {
        logAnalysisAbortController.abort();
        logAnalysisAbortController = null;
    }
    logAnalysisTargetRowIndex = null;
    if (elementsLogAnalysis.dockWidget) elementsLogAnalysis.dockWidget.classList.add('hidden');
    if (elementsLogAnalysis.modal) elementsLogAnalysis.modal.classList.add('hidden');
    if (elementsLogAnalysis.loading) elementsLogAnalysis.loading.classList.add('hidden');
    if (wasRunning) {
        showToast("Log analysis process stopped.", "warning");
    }
}

function updateLogAnalysisStatusUI(status, message) {
    if (elementsLogAnalysis.dockStatusText) elementsLogAnalysis.dockStatusText.innerText = message;
    if (elementsLogAnalysis.dockProgressBar) {
        if (status === 'running') {
            elementsLogAnalysis.dockProgressBar.style.width = '45%';
            elementsLogAnalysis.dockProgressBar.style.backgroundColor = 'var(--primary)';
        } else if (status === 'completed') {
            elementsLogAnalysis.dockProgressBar.style.width = '100%';
            elementsLogAnalysis.dockProgressBar.style.backgroundColor = '#10b981';
        } else if (status === 'error') {
            elementsLogAnalysis.dockProgressBar.style.width = '100%';
            elementsLogAnalysis.dockProgressBar.style.backgroundColor = '#ef4444';
        }
    }
}

function runLogAnalysis(rowData) {
    if (logAnalysisAbortController) {
        logAnalysisAbortController.abort();
    }
    logAnalysisAbortController = new AbortController();

    logAnalysisTargetRowIndex = rowData.index !== undefined ? parseInt(rowData.index) : null;

    if (elementsLogAnalysis.modal) elementsLogAnalysis.modal.classList.add('hidden');
    if (elementsLogAnalysis.dockWidget) elementsLogAnalysis.dockWidget.classList.remove('hidden');
    if (elementsLogAnalysis.loading) elementsLogAnalysis.loading.classList.remove('hidden');
    if (elementsLogAnalysis.reportBody) elementsLogAnalysis.reportBody.innerHTML = '';
    if (elementsLogAnalysis.btnDownload) elementsLogAnalysis.btnDownload.classList.add('hidden');

    updateLogAnalysisStatusUI('running', '⚡ Analyzing log context...');

    fetch('/api/analyze-log', { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rowData),
        signal: logAnalysisAbortController.signal
    })
    .then(res => res.json())
    .then(data => {
        const completedRowIndex = logAnalysisTargetRowIndex;
        logAnalysisAbortController = null;
        logAnalysisTargetRowIndex = null;

        if (elementsLogAnalysis.loading) elementsLogAnalysis.loading.classList.add('hidden');
        if (data.status === 'success' && elementsLogAnalysis.reportBody) {
            appState.lastLogAnalysisMarkdown = data.report_markdown || '';
            elementsLogAnalysis.reportBody.innerHTML = renderMarkdownSimple(data.report_markdown);
            if (elementsLogAnalysis.btnDownload && data.report_markdown) {
                elementsLogAnalysis.btnDownload.classList.remove('hidden');
            }
            updateLogAnalysisStatusUI('completed', '🎉 Analysis Complete! (Click to View)');
            showToast('🎉 Log Analysis Generated!');

            if (completedRowIndex !== null && data.report_markdown) {
                updateAiAnalysisCellLive(completedRowIndex, data.report_markdown);
            }
        } else if (elementsLogAnalysis.reportBody) {
            const errMsg = data.message || data.detail || 'Failed to run analysis.';
            elementsLogAnalysis.reportBody.innerHTML = `<p class="auth-error-msg">${errMsg}</p>`;
            updateLogAnalysisStatusUI('error', `❌ Analysis Failed: ${errMsg}`);
        }
    })
    .catch(err => {
        if (err.name === 'AbortError') {
            console.log('Log analysis request stopped by user.');
            return;
        }
        logAnalysisAbortController = null;
        logAnalysisTargetRowIndex = null;
        if (elementsLogAnalysis.loading) elementsLogAnalysis.loading.classList.add('hidden');
        if (elementsLogAnalysis.reportBody) {
            elementsLogAnalysis.reportBody.innerHTML = `<p class="auth-error-msg">Error running analysis: ${err.message}</p>`;
        }
        updateLogAnalysisStatusUI('error', `❌ Analysis Error: ${err.message}`);
    });
}

function updateAiAnalysisCellLive(rowIndex, reportMarkdown) {
    const allIdx = appState.allData.findIndex(r => r.index === rowIndex);
    if (allIdx !== -1) {
        appState.allData[allIdx]['AI Analysis'] = reportMarkdown;
    }
    const filtIdx = appState.filteredData.findIndex(r => r.index === rowIndex);
    if (filtIdx !== -1) {
        appState.filteredData[filtIdx]['AI Analysis'] = reportMarkdown;
    }

    const rowEl = document.querySelector(`tr[data-index="${rowIndex}"]`);
    if (rowEl && appState.columns.includes('AI Analysis')) {
        const colIdx = appState.columns.indexOf('AI Analysis');
        const cells = rowEl.querySelectorAll('td');
        const td = cells[colIdx];
        if (td) {
            td.innerHTML = `<button class="btn-secondary btn-sm" style="display:flex; align-items:center; gap:4px; font-size: 0.75rem; padding: 4px 8px;">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                View Report
            </button>`;
            rowEl.classList.add('row-success');
            setTimeout(() => rowEl.classList.remove('row-success'), 1500);

            td.querySelector('button').addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (elementsLogAnalysis.modal) elementsLogAnalysis.modal.classList.remove('hidden');
                if (elementsLogAnalysis.loading) elementsLogAnalysis.loading.classList.add('hidden');
                if (elementsLogAnalysis.dockWidget) elementsLogAnalysis.dockWidget.classList.add('hidden');
                if (elementsLogAnalysis.reportBody) {
                    appState.lastLogAnalysisMarkdown = reportMarkdown;
                    elementsLogAnalysis.reportBody.innerHTML = renderMarkdownSimple(reportMarkdown);
                }
                if (elementsLogAnalysis.btnDownload) {
                    elementsLogAnalysis.btnDownload.classList.remove('hidden');
                }
            });
        }
    }
}

function downloadLogAnalysisReport() {
    if (!appState.lastLogAnalysisMarkdown && (!elementsLogAnalysis.reportBody || !elementsLogAnalysis.reportBody.innerText.trim())) {
        showToast("No analysis report content available to download.", "warning");
        return;
    }

    showToast("📄 Generating PDF report...", "info");

    const modalBody = document.querySelector('#log-analysis-modal .rca-modal-body');
    if (!modalBody) {
        showToast("Unable to find log analysis report content.", "error");
        return;
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = `DiagTrace_Log_Analysis_Report_${timestamp}.pdf`;

    const originalMaxHeight = modalBody.style.maxHeight;
    const originalOverflow = modalBody.style.overflowY;
    const originalColor = modalBody.style.color;

    modalBody.style.maxHeight = 'none';
    modalBody.style.overflowY = 'visible';
    modalBody.style.color = 'var(--text-main, #0f172a)';

    const opt = {
        margin:       [12, 12, 12, 12],
        filename:     filename,
        image:        { type: 'jpeg', quality: 0.98 },
        html2canvas:  { scale: 2, useCORS: true, logging: false, backgroundColor: '#ffffff' },
        jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' },
        pagebreak:    { mode: ['avoid-all', 'css', 'legacy'], avoid: ['table', 'tr', 'h1', 'h2', 'h3', 'code', 'ul'] }
    };

    if (typeof html2pdf !== 'undefined') {
        html2pdf().set(opt).from(modalBody).save().then(() => {
            modalBody.style.maxHeight = originalMaxHeight;
            modalBody.style.overflowY = originalOverflow;
            modalBody.style.color = originalColor;
            showToast(`🎉 Downloaded Log Analysis PDF (${filename})`);
        }).catch(err => {
            console.error("PDF generation error:", err);
            modalBody.style.maxHeight = originalMaxHeight;
            modalBody.style.overflowY = originalOverflow;
            modalBody.style.color = originalColor;
            showToast("Failed to generate PDF report.", "error");
        });
    } else {
        window.print();
        modalBody.style.maxHeight = originalMaxHeight;
        modalBody.style.overflowY = originalOverflow;
        modalBody.style.color = originalColor;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const analyzeLogBtn = document.getElementById('menu-analyze-log');
    if (analyzeLogBtn) {
        analyzeLogBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const ctxMenu = document.getElementById('row-context-menu');
            if (ctxMenu) ctxMenu.classList.add('hidden');
            if (contextMenuTargetRow) {
                runLogAnalysis(contextMenuTargetRow);
            }
        });
    }

    if (elementsLogAnalysis.btnDock) {
        elementsLogAnalysis.btnDock.addEventListener('click', () => {
            if (elementsLogAnalysis.modal) elementsLogAnalysis.modal.classList.add('hidden');
            if (elementsLogAnalysis.dockWidget) elementsLogAnalysis.dockWidget.classList.remove('hidden');
        });
    }
    if (elementsLogAnalysis.btnMaximizeDock) {
        elementsLogAnalysis.btnMaximizeDock.addEventListener('click', () => {
            if (elementsLogAnalysis.dockWidget) elementsLogAnalysis.dockWidget.classList.add('hidden');
            if (elementsLogAnalysis.modal) elementsLogAnalysis.modal.classList.remove('hidden');
        });
    }
    if (elementsLogAnalysis.dockBody) {
        elementsLogAnalysis.dockBody.addEventListener('click', () => {
            if (elementsLogAnalysis.dockWidget) elementsLogAnalysis.dockWidget.classList.add('hidden');
            if (elementsLogAnalysis.modal) elementsLogAnalysis.modal.classList.remove('hidden');
        });
    }
    if (elementsLogAnalysis.btnCloseDock) {
        elementsLogAnalysis.btnCloseDock.addEventListener('click', () => {
            stopLogAnalysis();
        });
    }
    if (elementsLogAnalysis.closeBtn) {
        elementsLogAnalysis.closeBtn.addEventListener('click', () => {
            stopLogAnalysis();
        });
    }
    if (elementsLogAnalysis.btnDownload) {
        elementsLogAnalysis.btnDownload.addEventListener('click', downloadLogAnalysisReport);
    }
});

