// Knowledge Base (RAG) JavaScript Logic

function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

document.addEventListener('DOMContentLoaded', () => {
    const ragElements = {
        ragTabFile: document.getElementById('rag-tab-file'),
        ragTabManual: document.getElementById('rag-tab-manual'),
        ragTabChunks: document.getElementById('rag-tab-chunks'),
        ragViewFile: document.getElementById('rag-view-file'),
        ragViewManual: document.getElementById('rag-view-manual'),
        ragViewChunks: document.getElementById('rag-view-chunks'),
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
        ragIngestForm: document.getElementById('rag-ingest-form'),
        ragTitle: document.getElementById('rag-title'),
        ragCategory: document.getElementById('rag-category'),
        ragContent: document.getElementById('rag-content'),
        ragDocsContainer: document.getElementById('rag-docs-container'),
        ragChunkCategoryFilter: document.getElementById('rag-chunk-category-filter'),
        ragChunkSearch: document.getElementById('rag-chunk-search'),
        ragChunksContainer: document.getElementById('rag-chunks-container'),
        ragChunkCount: document.getElementById('rag-chunk-count'),
        ragChunkPageSize: document.getElementById('rag-chunk-page-size'),
        btnRagChunkPrev: document.getElementById('btn-rag-chunk-prev'),
        btnRagChunkNext: document.getElementById('btn-rag-chunk-next'),
        ragChunkPageNum: document.getElementById('rag-chunk-page-num'),
    };
    
    if (typeof elements !== 'undefined') {
        Object.assign(elements, ragElements);
    } else {
        window.elements = ragElements;
    }

    if (elements.ragTabFile) elements.ragTabFile.addEventListener('click', () => switchRagTab('file'));
    if (elements.ragTabManual) elements.ragTabManual.addEventListener('click', () => switchRagTab('manual'));
    if (elements.ragTabChunks) elements.ragTabChunks.addEventListener('click', () => switchRagTab('chunks'));
    
    if (elements.ragDropzone) {
        elements.ragDropzone.addEventListener('click', () => {
            if (elements.ragFileInput) elements.ragFileInput.click();
        });
        elements.ragDropzone.addEventListener('dragover', (e) => {
            e.preventDefault();
            elements.ragDropzone.classList.add('drag-over');
        });
        elements.ragDropzone.addEventListener('dragleave', () => {
            elements.ragDropzone.classList.remove('drag-over');
        });
        elements.ragDropzone.addEventListener('drop', (e) => {
            e.preventDefault();
            elements.ragDropzone.classList.remove('drag-over');
            if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                handleSelectedRagFile(e.dataTransfer.files[0]);
            }
        });
    }
    if (elements.ragFileInput) {
        elements.ragFileInput.addEventListener('change', (e) => {
            if (e.target.files && e.target.files.length > 0) {
                handleSelectedRagFile(e.target.files[0]);
            }
        });
    }
    if (elements.btnRemoveRagFile) {
        elements.btnRemoveRagFile.addEventListener('click', (e) => {
            e.stopPropagation();
            clearSelectedRagFile();
        });
    }
    if (elements.ragFileForm) elements.ragFileForm.addEventListener('submit', handleRagFileUpload);
    if (elements.ragIngestForm) elements.ragIngestForm.addEventListener('submit', handleRagIngest);
    
    if (elements.ragChunkCategoryFilter) elements.ragChunkCategoryFilter.addEventListener('change', () => loadRagChunks(1));
    
    const searchHandler = typeof debounce === 'function' ? debounce(() => loadRagChunks(1), 300) : () => loadRagChunks(1);
    if (elements.ragChunkSearch) elements.ragChunkSearch.addEventListener('input', searchHandler);
    
    if (elements.ragChunkPageSize) elements.ragChunkPageSize.addEventListener('change', () => loadRagChunks(1));
    if (elements.btnRagChunkPrev) elements.btnRagChunkPrev.addEventListener('click', () => {
        if (typeof ragChunkCurrentPage !== 'undefined' && ragChunkCurrentPage > 1) loadRagChunks(ragChunkCurrentPage - 1);
    });
    if (elements.btnRagChunkNext) elements.btnRagChunkNext.addEventListener('click', () => {
        if (typeof ragChunkCurrentPage !== 'undefined' && typeof ragChunkTotalPages !== 'undefined' && ragChunkCurrentPage < ragChunkTotalPages) loadRagChunks(ragChunkCurrentPage + 1);
    });

    if (window.location.pathname.includes('knowledge_base.html')) {
        switchRagTab('file');
    }
    
    const chunkClose = document.getElementById('chunk-viewer-close');
    if (chunkClose) {
        chunkClose.addEventListener('click', () => {
            const modal = document.getElementById('chunk-viewer-modal');
            if (modal) modal.classList.add('hidden');
        });
    }
});



function openRagModal() {
    if (elements.resultsSection) elements.resultsSection.classList.add('hidden');
    if (elements.ragModal) elements.ragModal.classList.remove('hidden');
    
    // Update sidebar active state
    document.querySelectorAll('.sidebar-link').forEach(link => link.classList.remove('active'));
    if (elements.btnOpenRag) elements.btnOpenRag.classList.add('active');
}

function closeRagModal() {
    if (elements.ragModal) elements.ragModal.classList.add('hidden');
    if (elements.resultsSection) elements.resultsSection.classList.remove('hidden');
    
    // Update sidebar active state
    document.querySelectorAll('.sidebar-link').forEach(link => link.classList.remove('active'));
    if (elements.btnOpenLogs) elements.btnOpenLogs.classList.add('active');
}

function fetchRagDocuments() {
    if (!elements.ragDocsContainer) return;
    fetch('/api/rag/documents')
    .then(res => res.json())
    .then(data => {
        if (data.documents && data.documents.length > 0) {
            elements.ragDocsContainer.innerHTML = data.documents.map(doc => `
                <div class="rag-doc-item">
                    <div>
                        <b>${escapeHtml(doc.title)}</b>
                        <div class="text-muted" style="font-size:0.78rem;">Indexed: ${doc.created_at}</div>
                    </div>
                    <span class="rag-doc-badge">${escapeHtml(doc.category)}</span>
                </div>
            `).join('');
        } else {
            elements.ragDocsContainer.innerHTML = '<p class="text-muted">No custom knowledge items indexed yet.</p>';
        }
    })
    .catch(() => {
        elements.ragDocsContainer.innerHTML = '<p class="text-muted">Failed to load documents.</p>';
    });
}

let selectedRagFile = null;

function switchRagTab(tabName) {
    const tabFile = document.getElementById('rag-tab-file');
    const tabManual = document.getElementById('rag-tab-manual');
    const tabChunks = document.getElementById('rag-tab-chunks');
    
    const viewFile = document.getElementById('rag-view-file');
    const viewManual = document.getElementById('rag-view-manual');
    const viewChunks = document.getElementById('rag-view-chunks');
    
    if (tabFile) tabFile.classList.remove('active');
    if (tabManual) tabManual.classList.remove('active');
    if (tabChunks) tabChunks.classList.remove('active');
    
    if (viewFile) viewFile.classList.add('hidden');
    if (viewManual) viewManual.classList.add('hidden');
    if (viewChunks) viewChunks.classList.add('hidden');
    
    if (tabName === 'file') {
        if (tabFile) tabFile.classList.add('active');
        if (viewFile) viewFile.classList.remove('hidden');
    } else if (tabName === 'manual') {
        if (tabManual) tabManual.classList.add('active');
        if (viewManual) viewManual.classList.remove('hidden');
    } else if (tabName === 'chunks') {
        if (tabChunks) tabChunks.classList.add('active');
        if (viewChunks) viewChunks.classList.remove('hidden');
        loadRagChunks(1);
    }
}

function handleSelectedRagFile(file) {
    if (!file) return;
    selectedRagFile = file;
    if (elements.ragFileName) elements.ragFileName.innerText = `${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
    if (elements.ragFilePreview) elements.ragFilePreview.classList.remove('hidden');
}

function clearSelectedRagFile() {
    selectedRagFile = null;
    if (elements.ragFileInput) elements.ragFileInput.value = '';
    if (elements.ragFilePreview) elements.ragFilePreview.classList.add('hidden');
    if (elements.ragFileName) elements.ragFileName.innerText = '';
}

let activeRagJobId = null;
let activeRagJobInterval = null;

function dockRagModal() {
    if (elements.ragModal) elements.ragModal.classList.add('hidden');
    if (elements.dockedRagWidget) elements.dockedRagWidget.classList.remove('hidden');
}

function maximizeRagDock() {
    if (elements.dockedRagWidget) elements.dockedRagWidget.classList.add('hidden');
    if (elements.ragModal) elements.ragModal.classList.remove('hidden');
}

function closeRagDock() {
    if (elements.dockedRagWidget) elements.dockedRagWidget.classList.add('hidden');
}

function resetRagUploadButton() {
    if (elements.btnUploadRagFile) {
        elements.btnUploadRagFile.disabled = false;
        elements.btnUploadRagFile.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg> Parse, LLM Chunk & Ingest to Vector DB`;
    }
}

function handleRagFileUpload(e) {
    e.preventDefault();
    if (!selectedRagFile) {
        showToast("Please select a document file to upload.", "warning");
        return;
    }

    const category = elements.ragFileCategory ? elements.ragFileCategory.value : "Architectures";
    const formData = new FormData();
    formData.append("file", selectedRagFile);
    formData.append("category", category);

    if (elements.btnUploadRagFile) {
        elements.btnUploadRagFile.disabled = true;
        elements.btnUploadRagFile.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg> ⌛ Ingestion Started...`;
    }

    if (elements.ragProgressSection) elements.ragProgressSection.classList.remove('hidden');
    if (elements.ragLiveLogList) elements.ragLiveLogList.innerHTML = '<li>⚡ Initializing background ingestion process...</li>';
    if (elements.ragProgressBarFill) elements.ragProgressBarFill.style.width = '5%';
    if (elements.ragProgressPercentage) elements.ragProgressPercentage.innerText = '5%';
    if (elements.ragProgressStatusText) elements.ragProgressStatusText.innerText = '⚡ Starting file processing...';

    fetch('/api/rag/upload-file', {
        method: 'POST',
        body: formData
    })
    .then(res => {
        if (!res.ok) return res.json().then(err => { throw new Error(err.detail || 'File upload failed'); });
        return res.json();
    })
    .then(data => {
        if (data.job_id) {
            activeRagJobId = data.job_id;
            startPollingRagJob(data.job_id);
        }
    })
    .catch(err => {
        showToast(`Failed to start ingestion: ${err.message}`, 'warning');
        resetRagUploadButton();
    });
}

function startPollingRagJob(jobId) {
    if (activeRagJobInterval) {
        clearInterval(activeRagJobInterval);
        activeRagJobInterval = null;
    }
    
    let pollCount = 0;
    activeRagJobInterval = setInterval(() => {
        pollCount++;
        fetch(`/api/rag/jobs/${jobId}`)
        .then(res => res.json())
        .then(job => {
            updateRagJobProgressUI(job);
            
            const isCompleted = job.status === 'completed' || (job.progress_percent !== undefined && job.progress_percent >= 100);
            const isError = job.status === 'error' || job.status === 'not_found';

            if (isCompleted || isError) {
                if (activeRagJobInterval) {
                    clearInterval(activeRagJobInterval);
                    activeRagJobInterval = null;
                }
                
                resetRagUploadButton();
                clearSelectedRagFile();
                fetchRagDocuments();

                if (isCompleted) {
                    showToast("🎉 Ingestion completed successfully!");
                    setTimeout(() => {
                        if (elements.ragProgressSection) elements.ragProgressSection.classList.add('hidden');
                        closeRagDock();
                    }, 1000);
                } else {
                    showToast(`RAG Ingestion Error: ${job.error || 'Processing failed'}`, 'warning');
                }
            } else if (pollCount > 300) { // Safety max timeout 4 minutes
                if (activeRagJobInterval) {
                    clearInterval(activeRagJobInterval);
                    activeRagJobInterval = null;
                }
                resetRagUploadButton();
                showToast("RAG ingestion status timed out.", "warning");
            }
        })
        .catch(err => {
            console.error("Error polling RAG job:", err);
        });
    }, 2500);
}

function updateRagJobProgressUI(job) {
    const pct = Math.min(100, Math.round(job.progress_percent || 0));
    
    if (elements.ragProgressBarFill) elements.ragProgressBarFill.style.width = `${pct}%`;
    if (elements.ragProgressPercentage) elements.ragProgressPercentage.innerText = `${pct}%`;
    
    const pageInfo = job.total_pages ? ` (Page ${job.current_page || 1}/${job.total_pages})` : '';
    const statusMsg = job.status === 'completed' ? '🎉 Ingestion Complete!' : (job.status === 'error' ? '❌ Failed' : `⚡ Ingesting ${job.file_name || 'file'}${pageInfo}`);
    
    if (elements.ragProgressStatusText) elements.ragProgressStatusText.innerText = statusMsg;

    if (elements.dockedRagProgressBar) elements.dockedRagProgressBar.style.width = `${pct}%`;
    if (elements.dockedRagStatusText) elements.dockedRagStatusText.innerText = `${statusMsg} [${pct}%]`;

    if (elements.ragLiveLogList && job.logs && job.logs.length > 0) {
        elements.ragLiveLogList.innerHTML = job.logs.map(l => `<li>${escapeHtml(l)}</li>`).join('');
        const logContainer = elements.ragLiveLogList.parentElement;
        if (logContainer) logContainer.scrollTop = logContainer.scrollHeight;
    }
}

function handleRagIngest(e) {
    e.preventDefault();
    const title = elements.ragTitle.value.trim();
    const category = elements.ragCategory.value;
    const content = elements.ragContent.value.trim();

    if (!title || !content) return;

    fetch('/api/rag/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, category, content })
    })
    .then(res => res.json())
    .then(data => {
        showToast("Information is stored successfully!");
        if (elements.ragTitle) elements.ragTitle.value = '';
        if (elements.ragContent) elements.ragContent.value = '';
        if (elements.ragIngestForm) elements.ragIngestForm.reset();
        fetchRagDocuments();
    })
    .catch(err => {
        showToast(`Failed to index document: ${err.message}`, 'warning');
    });
}

// ----------------------------------------------------
// AI Assistant Chatbot Widget & Dynamic Charts
// ----------------------------------------------------
function toggleChatDrawer() {
    if (elements.chatDrawer) {
        elements.chatDrawer.classList.toggle('hidden');
    }
}

function closeChatDrawer() {
    if (elements.chatDrawer) {
        elements.chatDrawer.classList.add('hidden');
    }
}


let ragChunkCurrentPage = 1;
let ragChunkTotalPages = 1;

function loadRagChunks(page = 1) {
    if (!elements.ragChunksContainer) return;
    
    ragChunkCurrentPage = page;
    const category = elements.ragChunkCategoryFilter ? elements.ragChunkCategoryFilter.value : 'All';
    const search = elements.ragChunkSearch ? elements.ragChunkSearch.value : '';
    const pageSize = elements.ragChunkPageSize ? parseInt(elements.ragChunkPageSize.value) : 20;
    
    elements.ragChunksContainer.innerHTML = '<div style="padding: 20px; text-align: center;"><span class="css-spinner"></span> Loading chunks...</div>';
    
    let url = `/api/rag/chunks?page=${page}&page_size=${pageSize}`;
    if (category !== 'All') url += `&category=${encodeURIComponent(category)}`;
    if (search.trim() !== '') url += `&search=${encodeURIComponent(search)}`;
    
    fetch(url)
    .then(res => {
        if (!res.ok) {
            return res.json().then(errData => { throw new Error(errData.detail || `HTTP ${res.status}`); }).catch(() => { throw new Error(`HTTP ${res.status}: ${res.statusText}`); });
        }
        return res.json();
    })
    .then(data => {
        elements.ragChunksContainer.innerHTML = '';
        
        if (!data || !data.chunks || data.chunks.length === 0) {
            elements.ragChunksContainer.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--text-secondary);">No chunks found for this criteria.</div>';
            if (elements.ragChunkCount) elements.ragChunkCount.innerText = "Showing 0 items";
            ragChunkTotalPages = 1;
            updateRagChunkPagination(0, 0, 0, pageSize);
            return;
        }
        
        data.chunks.forEach(chunk => {
            const date = chunk.created_at ? new Date(chunk.created_at).toLocaleString() : 'N/A';
            const titleEsc = escapeHtml(chunk.title || 'Untitled Chunk');
            const categoryEsc = escapeHtml(chunk.category || 'General');
            const chunkIdEsc = escapeHtml(chunk.id || '');
            const rawContent = chunk.content || '';
            const shortContent = rawContent.length > 200 ? rawContent.substring(0, 200) + '...' : rawContent;
            const contentEsc = escapeHtml(shortContent);

            const card = document.createElement('div');
            card.className = 'card';
            card.style.padding = '15px';
            card.style.border = '1px solid var(--border-color)';
            card.style.borderRadius = '6px';
            card.style.background = 'var(--bg-secondary)';
            card.style.boxShadow = 'none';
            card.style.flexShrink = '0';
            card.style.cursor = 'pointer';
            card.style.transition = 'border-color 0.2s';
            
            card.onmouseover = () => { card.style.borderColor = 'var(--primary)'; };
            card.onmouseout = () => { card.style.borderColor = 'var(--border-color)'; };

            card.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
                    <div style="font-weight: 600; color: var(--primary); font-size: 0.95rem; flex: 1; margin-right: 10px;">${titleEsc}</div>
                    <div style="display: flex; align-items: center; gap: 8px; flex-shrink: 0;">
                        <span style="font-size: 0.8rem; color: var(--text-secondary); background: var(--bg-tertiary); padding: 2px 6px; border-radius: 4px;">${categoryEsc}</span>
                        <button class="btn-delete-chunk-card" title="Delete Chunk" style="background: rgba(239, 68, 68, 0.12); border: 1px solid rgba(239, 68, 68, 0.35); color: #ef4444; border-radius: 4px; padding: 3px 8px; cursor: pointer; font-size: 0.78rem; display: inline-flex; align-items: center; gap: 4px; font-weight: 500; transition: all 0.2s;">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                            Delete
                        </button>
                    </div>
                </div>
                <div style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 10px;">ID: ${chunkIdEsc} • Added: ${date}</div>
                <div style="font-size: 0.9rem; line-height: 1.5; color: var(--text-primary); opacity: 0.85; white-space: pre-wrap; word-break: break-word;">${contentEsc}</div>
                <div style="font-size: 0.8rem; color: var(--primary); margin-top: 10px; font-weight: 500;">Click to view full content →</div>
            `;
            
            const deleteBtn = card.querySelector('.btn-delete-chunk-card');
            if (deleteBtn) {
                deleteBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    deleteRagChunk(chunk.id, chunk.title);
                });
            }

            card.addEventListener('click', () => {
                openChunkViewer(chunk, date);
            });
            
            elements.ragChunksContainer.appendChild(card);
        });
        
        const total = data.total || 0;
        ragChunkTotalPages = Math.ceil(total / pageSize) || 1;
        updateRagChunkPagination(page, ragChunkTotalPages, total, pageSize);
    })
    .catch(err => {
        elements.ragChunksContainer.innerHTML = `<div style="padding: 20px; text-align: center; color: #ef4444;">Error loading chunks: ${escapeHtml(err.message)}</div>`;
    });
}

function updateRagChunkPagination(page, totalPages, totalItems, pageSize) {
    if (elements.ragChunkCount) {
        const start = totalItems === 0 ? 0 : (page - 1) * pageSize + 1;
        const end = Math.min(page * pageSize, totalItems);
        elements.ragChunkCount.innerText = `Showing ${start}-${end} of ${totalItems} items`;
    }
    
    if (elements.ragChunkPageNum) {
        elements.ragChunkPageNum.innerText = `Page ${page || 1} of ${totalPages || 1}`;
    }
    
    if (elements.btnRagChunkPrev) elements.btnRagChunkPrev.disabled = page <= 1;
    if (elements.btnRagChunkNext) elements.btnRagChunkNext.disabled = page >= totalPages;
}

let currentViewerChunk = null;

function openChunkViewer(chunk, date) {
    currentViewerChunk = chunk;
    const modal = document.getElementById('chunk-viewer-modal');
    const title = document.getElementById('chunk-viewer-title');
    const meta = document.getElementById('chunk-viewer-meta');
    const content = document.getElementById('chunk-viewer-content');
    
    if (title) title.innerText = chunk.title;
    if (meta) meta.innerHTML = `<span>ID: ${chunk.id}</span><span style="background: var(--bg-tertiary); padding: 2px 6px; border-radius: 4px; font-weight: 500;">${chunk.category}</span><span>Added: ${date}</span>`;
    if (content) content.innerText = chunk.content;
    
    if (modal) {
        modal.classList.remove('hidden');
    }
}

function deleteRagChunk(chunkId, chunkTitle) {
    const titleText = chunkTitle ? `'${chunkTitle}'` : `ID: ${chunkId}`;
    if (!confirm(`Are you sure you want to delete the chunk ${titleText}? This action cannot be undone.`)) {
        return;
    }
    
    fetch(`/api/rag/chunks/${encodeURIComponent(chunkId)}`, {
        method: 'DELETE'
    })
    .then(res => {
        if (!res.ok) {
            return res.json().then(err => { throw new Error(err.detail || 'Failed to delete chunk'); });
        }
        return res.json();
    })
    .then(data => {
        if (typeof showToast === 'function') {
            showToast('Chunk deleted successfully!', 'success');
        } else {
            alert('Chunk deleted successfully!');
        }
        const modal = document.getElementById('chunk-viewer-modal');
        if (modal && !modal.classList.contains('hidden')) {
            modal.classList.add('hidden');
        }
        loadRagChunks(ragChunkCurrentPage);
    })
    .catch(err => {
        if (typeof showToast === 'function') {
            showToast(`Error deleting chunk: ${err.message}`, 'warning');
        } else {
            alert(`Error deleting chunk: ${err.message}`);
        }
    });
}

document.addEventListener('DOMContentLoaded', () => {
    const closeBtn = document.getElementById('chunk-viewer-close');
    const modal = document.getElementById('chunk-viewer-modal');
    if (closeBtn && modal) {
        closeBtn.addEventListener('click', () => modal.classList.add('hidden'));
    }
    
    const deleteModalBtn = document.getElementById('btn-delete-modal-chunk');
    if (deleteModalBtn) {
        deleteModalBtn.addEventListener('click', () => {
            if (currentViewerChunk) {
                deleteRagChunk(currentViewerChunk.id, currentViewerChunk.title);
            }
        });
    }
});