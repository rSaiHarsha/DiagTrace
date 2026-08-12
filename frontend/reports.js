// ============================================================
// DiagTrace - Saved Reports Page JS
// ============================================================

let allReports = [];
let currentViewReportId = null;
let pendingDeleteId = null;

// --- DOM References ---
const dom = {
    listContainer: document.getElementById('reports-list-container'),
    emptyState: document.getElementById('reports-empty-state'),
    loading: document.getElementById('reports-loading'),
    count: document.getElementById('reports-count'),
    search: document.getElementById('reports-search'),
    btnRefresh: document.getElementById('btn-refresh-reports'),
    // View Modal
    viewModal: document.getElementById('report-view-modal'),
    viewClose: document.getElementById('report-view-close'),
    viewTitle: document.getElementById('report-view-title'),
    viewBody: document.getElementById('report-view-body'),
    reportChartsContainer: document.getElementById('report-charts-container'),
    btnModalDownload: document.getElementById('btn-modal-download-pdf'),
    // Delete Confirm
    deleteModal: document.getElementById('confirm-delete-modal'),
    deleteClose: document.getElementById('confirm-delete-close'),
    deleteTitle: document.getElementById('confirm-delete-title'),
    btnCancelDelete: document.getElementById('btn-cancel-delete'),
    btnConfirmDelete: document.getElementById('btn-confirm-delete'),
};

// --- Init ---
document.addEventListener('DOMContentLoaded', () => {
    fetchReports();

    if (dom.btnRefresh) dom.btnRefresh.addEventListener('click', fetchReports);
    if (dom.search) dom.search.addEventListener('input', renderFilteredReports);

    // View Modal close
    if (dom.viewClose) dom.viewClose.addEventListener('click', closeViewModal);
    if (dom.viewModal) dom.viewModal.addEventListener('click', (e) => { if (e.target === dom.viewModal) closeViewModal(); });

    // Delete Modal close
    if (dom.deleteClose) dom.deleteClose.addEventListener('click', closeDeleteModal);
    if (dom.btnCancelDelete) dom.btnCancelDelete.addEventListener('click', closeDeleteModal);
    if (dom.deleteModal) dom.deleteModal.addEventListener('click', (e) => { if (e.target === dom.deleteModal) closeDeleteModal(); });
    if (dom.btnConfirmDelete) dom.btnConfirmDelete.addEventListener('click', confirmDelete);

    // Download from modal
    if (dom.btnModalDownload) dom.btnModalDownload.addEventListener('click', downloadCurrentReportPdf);
});

// --- Fetch Reports ---
function fetchReports() {
    if (dom.loading) dom.loading.classList.remove('hidden');
    if (dom.emptyState) dom.emptyState.classList.add('hidden');
    if (dom.listContainer) dom.listContainer.innerHTML = '';

    fetch('/api/reports')
        .then(res => res.json())
        .then(data => {
            if (dom.loading) dom.loading.classList.add('hidden');
            if (data.status === 'success') {
                allReports = data.reports || [];
                renderFilteredReports();
            } else {
                showEmptyState();
            }
        })
        .catch(err => {
            if (dom.loading) dom.loading.classList.add('hidden');
            console.error('Failed to fetch reports:', err);
            showEmptyState();
        });
}

function showEmptyState() {
    if (dom.emptyState) dom.emptyState.classList.remove('hidden');
    if (dom.count) dom.count.textContent = '0 reports';
}

// --- Render ---
function renderFilteredReports() {
    const query = (dom.search ? dom.search.value : '').toLowerCase().trim();
    const filtered = query
        ? allReports.filter(r => (r.title || '').toLowerCase().includes(query))
        : allReports;

    if (dom.count) dom.count.textContent = `${filtered.length} report${filtered.length !== 1 ? 's' : ''}`;

    if (filtered.length === 0) {
        if (dom.listContainer) dom.listContainer.innerHTML = '';
        if (dom.emptyState) dom.emptyState.classList.remove('hidden');
        return;
    }

    if (dom.emptyState) dom.emptyState.classList.add('hidden');
    if (!dom.listContainer) return;

    dom.listContainer.innerHTML = filtered.map(report => {
        const date = report.created_at ? formatDate(report.created_at) : 'Unknown';
        const typeBadge = report.type === 'RCA'
            ? '<span style="background: rgba(59,130,246,0.12); color: #3b82f6; padding: 2px 8px; border-radius: 4px; font-size: 0.72rem; font-weight: 600; letter-spacing: 0.3px;">RCA</span>'
            : `<span style="background: rgba(139,92,246,0.12); color: #8b5cf6; padding: 2px 8px; border-radius: 4px; font-size: 0.72rem; font-weight: 600; letter-spacing: 0.3px;">${escapeHtml(report.type || 'Report')}</span>`;

        return `
        <div class="report-card" style="background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 10px; padding: 16px 20px; display: flex; align-items: center; justify-content: space-between; gap: 16px; transition: border-color 0.2s, box-shadow 0.2s; cursor: pointer;" 
             onmouseenter="this.style.borderColor='var(--primary)'; this.style.boxShadow='0 2px 12px rgba(59,130,246,0.08)';"
             onmouseleave="this.style.borderColor='var(--border-color)'; this.style.boxShadow='none';"
             onclick="viewReport(${report.id})">
            <div style="display: flex; align-items: center; gap: 14px; flex: 1; min-width: 0;">
                <div style="width: 40px; height: 40px; border-radius: 8px; background: linear-gradient(135deg, rgba(59,130,246,0.1), rgba(139,92,246,0.1)); display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                    <svg fill="none" height="20" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" viewbox="0 0 24 24" width="20" style="color: var(--primary);"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" x2="8" y1="13" y2="13"></line><line x1="16" x2="8" y1="17" y2="17"></line></svg>
                </div>
                <div style="min-width: 0; flex: 1;">
                    <div style="font-weight: 600; font-size: 0.92rem; color: var(--text-main); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(report.title || 'Untitled Report')}</div>
                    <div style="display: flex; align-items: center; gap: 8px; margin-top: 4px;">
                        ${typeBadge}
                        <span style="font-size: 0.78rem; color: var(--text-muted);">${date}</span>
                    </div>
                </div>
            </div>
            <div style="display: flex; align-items: center; gap: 8px; flex-shrink: 0;" onclick="event.stopPropagation();">
                <button class="btn btn-secondary btn-small" onclick="viewReport(${report.id})" style="display: flex; align-items: center; gap: 5px; padding: 5px 12px; font-size: 0.8rem; border-radius: 6px;" title="View Report">
                    <svg fill="none" height="13" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" viewbox="0 0 24 24" width="13"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg> View
                </button>
                <button class="btn btn-success btn-small" onclick="downloadReportPdf(${report.id})" style="display: flex; align-items: center; gap: 5px; padding: 5px 12px; font-size: 0.8rem; border-radius: 6px;" title="Download PDF">
                    <svg fill="none" height="13" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2.2" viewbox="0 0 24 24" width="13"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" x2="12" y1="15" y2="3"></line></svg> PDF
                </button>
                <button class="btn btn-small" onclick="promptDeleteReport(${report.id}, '${escapeHtml(report.title || 'Untitled').replace(/'/g, "\\'")}') " style="display: flex; align-items: center; gap: 5px; padding: 5px 12px; font-size: 0.8rem; border-radius: 6px; background: rgba(239,68,68,0.08); color: #ef4444; border: 1px solid rgba(239,68,68,0.2);" title="Delete Report">
                    <svg fill="none" height="13" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" viewbox="0 0 24 24" width="13"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg> Delete
                </button>
            </div>
        </div>`;
    }).join('');
}

// --- View Report ---
function viewReport(id) {
    if (!dom.viewModal) return;
    dom.viewModal.classList.remove('hidden');
    if (dom.viewBody) dom.viewBody.innerHTML = '<div style="text-align:center; padding: 40px;"><span class="css-spinner"></span><p style="color: var(--text-muted); margin-top: 12px;">Loading report...</p></div>';
    currentViewReportId = id;

    fetch(`/api/reports/${id}`)
        .then(res => res.json())
        .then(data => {
            if (data.status === 'success' && data.report) {
                const report = data.report;
                if (dom.viewTitle) {
                    dom.viewTitle.innerHTML = `
                        <svg fill="none" height="18" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" style="color: var(--primary);" viewbox="0 0 24 24" width="18"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg> ${escapeHtml(report.title || 'Report')}`;
                }
                
                if (dom.reportChartsContainer) {
                    dom.reportChartsContainer.innerHTML = '';
                    if (report.chart_data) {
                        try {
                            const chartsObj = typeof report.chart_data === 'string' ? JSON.parse(report.chart_data) : report.chart_data;
                            if (typeof Chart !== 'undefined' && chartsObj) {
                                Object.entries(chartsObj).forEach(([chartId, config]) => {
                                    const canvasWrapper = document.createElement('div');
                                    canvasWrapper.className = 'chart-wrapper';
                                    canvasWrapper.style.cssText = "background: var(--bg-surface); padding: 12px; border-radius: 8px; border: 1px solid var(--border-color); position: relative; height: 350px; width: 100%; margin-bottom: 20px; page-break-inside: avoid !important; break-inside: avoid !important; break-inside: avoid-page !important;";
                                    const canvas = document.createElement('canvas');
                                    canvasWrapper.appendChild(canvas);
                                    dom.reportChartsContainer.appendChild(canvasWrapper);
                                    new Chart(canvas.getContext('2d'), config);
                                });
                            }
                        } catch (e) {
                            console.error("Failed to parse chart data", e);
                        }
                    }
                }

                if (dom.viewBody) {
                    dom.viewBody.innerHTML = renderMarkdown(report.content_markdown || '');
                }
            } else {
                if (dom.viewBody) dom.viewBody.innerHTML = '<p style="color: var(--danger, #ef4444); text-align: center; padding: 20px;">Failed to load report.</p>';
            }
        })
        .catch(err => {
            console.error('Failed to load report:', err);
            if (dom.viewBody) dom.viewBody.innerHTML = '<p style="color: var(--danger, #ef4444); text-align: center; padding: 20px;">Error loading report.</p>';
        });
}

function closeViewModal() {
    if (dom.viewModal) dom.viewModal.classList.add('hidden');
    currentViewReportId = null;
}

// --- Download PDF ---
function downloadReportPdf(id) {
    fetch(`/api/reports/${id}`)
        .then(res => res.json())
        .then(data => {
            if (data.status === 'success' && data.report) {
                generatePdfFromMarkdown(data.report.title, data.report.content_markdown);
            }
        })
        .catch(err => console.error('Failed to download report:', err));
}

function downloadCurrentReportPdf() {
    if (!currentViewReportId) return;
    const element = document.querySelector('#report-view-modal .rca-modal-body');
    if (!element) return;

    const title = dom.viewTitle ? dom.viewTitle.textContent.trim() : 'Report';
    const filename = `${title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.pdf`;

    const originalMaxHeight = element.style.maxHeight;
    const originalOverflow = element.style.overflowY;
    const originalColor = element.style.color;
    element.style.maxHeight = 'none';
    element.style.overflowY = 'visible';
    element.style.color = '#000000'; // Force black text for PDF

    // Temporarily disable grid for PDF generation to allow page breaks to work
    const chartsContainer = element.querySelector('.rca-charts-container');
    let originalChartsDisplay = '';
    if (chartsContainer) {
        originalChartsDisplay = chartsContainer.style.display;
        chartsContainer.style.display = 'block';
    }

    const opt = {
        margin:       10,
        filename:     filename,
        image:        { type: 'jpeg', quality: 0.98 },
        html2canvas:  { scale: 2, useCORS: true, logging: false },
        jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' },
        pagebreak:    { mode: ['avoid-all', 'css', 'legacy'], avoid: ['.chart-wrapper', '.chart-card', 'h1', 'h2', 'h3', 'table', 'tr', 'pre', 'img'] }
    };

    const pdfStyles = document.createElement('style');
    pdfStyles.id = 'pdf-export-styles-reports';
    pdfStyles.innerHTML = `
        #report-view-modal code, .markdown-body code {
            background: #f1f5f9 !important;
            color: #0f172a !important;
            border: 1px solid #cbd5e1 !important;
            font-weight: 600 !important;
            padding: 2px 6px !important;
            display: inline-block !important;
        }
        #report-view-modal .rca-modal-body, .markdown-body {
            color: #0f172a !important;
        }
        #report-view-modal th, .markdown-body th {
            background: #f8fafc !important;
            color: #0f172a !important;
        }
        #report-view-modal td, .markdown-body td {
            color: #1e293b !important;
        }
    `;
    document.head.appendChild(pdfStyles);

    const cleanupPdfStyles = () => {
        const el = document.getElementById('pdf-export-styles-reports');
        if (el) el.remove();
        element.style.maxHeight = originalMaxHeight;
        element.style.overflowY = originalOverflow;
        element.style.color = originalColor;
        if (chartsContainer) chartsContainer.style.display = originalChartsDisplay;
    };

    html2pdf().set(opt).from(element).save().then(() => {
        cleanupPdfStyles();
    }).catch(err => {
        console.error('PDF generation error:', err);
        cleanupPdfStyles();
    });
}

function generatePdfFromMarkdown(title, markdown) {
    // Create a temporary hidden container, render markdown, generate PDF, then remove
    const container = document.createElement('div');
    container.className = 'markdown-body';
    container.style.cssText = 'padding: 20px; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; max-width: 800px; color: #1a1a2e;';
    container.innerHTML = renderMarkdown(markdown || '');
    document.body.appendChild(container);

    const filename = `${(title || 'report').replace(/[^a-z0-9]/gi, '_').toLowerCase()}.pdf`;

    const opt = {
        margin:       10,
        filename:     filename,
        image:        { type: 'jpeg', quality: 0.98 },
        html2canvas:  { scale: 2, useCORS: true, logging: false },
        jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' },
        pagebreak:    { mode: ['avoid-all', 'css', 'legacy'], avoid: ['h1', 'h2', 'h3', 'table', 'tr', 'pre', 'img'] }
    };

    html2pdf().set(opt).from(container).save().then(() => {
        document.body.removeChild(container);
    }).catch(err => {
        console.error('PDF generation error:', err);
        document.body.removeChild(container);
    });
}

// --- Delete Report ---
function promptDeleteReport(id, title) {
    pendingDeleteId = id;
    if (dom.deleteTitle) dom.deleteTitle.textContent = title;
    if (dom.deleteModal) dom.deleteModal.classList.remove('hidden');
}

function closeDeleteModal() {
    if (dom.deleteModal) dom.deleteModal.classList.add('hidden');
    pendingDeleteId = null;
}

function confirmDelete() {
    if (!pendingDeleteId) return;
    const id = pendingDeleteId;
    closeDeleteModal();

    fetch(`/api/reports/${id}`, { method: 'DELETE' })
        .then(res => res.json())
        .then(data => {
            if (data.status === 'success') {
                allReports = allReports.filter(r => r.id !== id);
                renderFilteredReports();
                showToast('Report deleted successfully.', 'success');
            } else {
                showToast('Failed to delete report.', 'error');
            }
        })
        .catch(err => {
            console.error('Failed to delete report:', err);
            showToast('Error deleting report.', 'error');
        });
}

// --- Utils ---
function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function formatDate(dateStr) {
    try {
        const d = new Date(dateStr);
        return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) + ' at ' +
               d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    } catch {
        return dateStr;
    }
}

function renderMarkdown(md) {
    if (!md) return '<p style="color: var(--text-muted);">No content available.</p>';
    let html = md
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

function showToast(message, type) {
    const toast = document.createElement('div');
    const bgColor = type === 'error' ? '#ef4444' : type === 'success' ? '#10b981' : '#3b82f6';
    toast.style.cssText = `
        position: fixed; bottom: 24px; right: 24px; z-index: 200000;
        background: ${bgColor}; color: #fff; padding: 12px 20px; border-radius: 8px;
        font-size: 0.88rem; font-weight: 500; box-shadow: 0 4px 20px rgba(0,0,0,0.2);
        animation: slideInRight 0.3s ease-out;
    `;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transition = 'opacity 0.3s';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}
