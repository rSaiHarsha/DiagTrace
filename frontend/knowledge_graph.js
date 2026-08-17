/**
 * knowledge_graph.js
 * DTC Relationship Explorer — Interactive Knowledge Graph
 */

let kgState = {
    dtcList: [],
    currentDtc: null,
    graphData: null,
    simulation: null,
    svg: null,
    zoom: null,
    selectedNode: null,
    rawNodes: [],
    rawEdges: [],
    expandedGroups: {},
    fullscreenGraph: false
};

// ── Initialization ──────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    loadDtcList();
    initSearch();
    initToolbarActions();
});

// ── DTC List Loading ────────────────────────────────────────────
function loadDtcList() {
    fetch('/api/knowledge-graph/dtc-list')
        .then(r => r.json())
        .then(data => {
            if (data.status === 'success') {
                kgState.dtcList = data.dtc_list || [];
                // Auto-select first DTC if available
                if (kgState.dtcList.length > 0) {
                    selectDtc(kgState.dtcList[0].code);
                }
            }
        })
        .catch(err => console.error('Failed to load DTC list:', err));
}

// ── Search / Selector ───────────────────────────────────────────
function initSearch() {
    const input = document.getElementById('kg-search-input');
    const dropdown = document.getElementById('kg-search-dropdown');
    const clearBtn = document.getElementById('kg-search-clear');

    if (!input) return;

    input.addEventListener('focus', () => {
        renderSearchDropdown(input.value);
        dropdown.classList.add('visible');
    });

    input.addEventListener('input', () => {
        const q = input.value.trim();
        clearBtn.classList.toggle('visible', q.length > 0);
        renderSearchDropdown(q);
        dropdown.classList.add('visible');
    });

    clearBtn.addEventListener('click', () => {
        input.value = '';
        clearBtn.classList.remove('visible');
        renderSearchDropdown('');
        dropdown.classList.add('visible');
        input.focus();
    });

    document.addEventListener('click', (e) => {
        if (!e.target.closest('.kg-search-wrapper')) {
            dropdown.classList.remove('visible');
        }
    });
}

function renderSearchDropdown(query) {
    const dropdown = document.getElementById('kg-search-dropdown');
    if (!dropdown) return;

    const q = (query || '').toLowerCase();
    const filtered = kgState.dtcList.filter(d =>
        d.code.toLowerCase().includes(q) ||
        d.description.toLowerCase().includes(q) ||
        d.module.toLowerCase().includes(q)
    );

    if (filtered.length === 0) {
        dropdown.innerHTML = '<div style="padding: 16px; text-align: center; color: var(--text-muted); font-size: 0.85rem;">No DTCs found</div>';
        return;
    }

    dropdown.innerHTML = filtered.map(d => `
        <div class="kg-search-item" onclick="selectDtcFromSearch('${escapeAttr(d.code)}')">
            <span class="item-code">${escapeHtml(d.code)}</span>
            <span class="item-desc">${escapeHtml(d.description)}</span>
            <span class="item-badge">${escapeHtml(d.module)} · ${d.occurrences}</span>
        </div>
    `).join('');
}

function selectDtcFromSearch(code) {
    const input = document.getElementById('kg-search-input');
    const dropdown = document.getElementById('kg-search-dropdown');
    const dtc = kgState.dtcList.find(d => d.code === code);
    if (dtc) {
        input.value = `${dtc.code} - ${dtc.description}`;
        document.getElementById('kg-search-clear').classList.add('visible');
    }
    dropdown.classList.remove('visible');
    selectDtc(code);
}

function selectDtc(code) {
    selectEntity('dtc', code);
}

function selectEntity(type, id) {
    kgState.currentDtc = id;
    showLoading(true);

    let url = `/api/knowledge-graph/explore?entity_type=${encodeURIComponent(type)}&entity_id=${encodeURIComponent(id)}`;
    if (type === 'dtc') {
        url = `/api/knowledge-graph/${encodeURIComponent(id)}`;
    }

    fetch(url)
        .then(r => r.json())
        .then(data => {
            if (data.status === 'success') {
                kgState.graphData = data;
                kgState.rawNodes = [...data.graph.nodes];
                kgState.rawEdges = [...data.graph.edges];
                kgState.expandedGroups = {};

                hideDetailPanel();
                renderGraph(data.graph);
                renderSidebar(data);
                renderBottomPanels(data);
                // Update search input
                const input = document.getElementById('kg-search-input');
                if (input && !input.value) {
                    input.value = `${data.dtc_overview.code} - ${data.dtc_overview.description}`;
                    document.getElementById('kg-search-clear').classList.add('visible');
                }
            }
            showLoading(false);
            document.getElementById('kg-empty-state').style.display = 'none';
        })
        .catch(err => {
            console.error('Failed to load graph:', err);
            showLoading(false);
        });
}

function showLoading(show) {
    const el = document.getElementById('kg-loading');
    if (el) el.style.display = show ? 'flex' : 'none';
}

// ── Graph Rendering (D3 Force Layout) ───────────────────────────
function renderGraph(graphSpec) {
    const container = document.getElementById('kg-graph-canvas');
    if (!container) return;

    // Clear previous
    container.innerHTML = '';
    if (kgState.simulation) {
        kgState.simulation.stop();
    }

    const width = container.clientWidth;
    const height = container.clientHeight;

    const svg = d3.select(container)
        .append('svg')
        .attr('width', width)
        .attr('height', height);

    // Zoom
    const g = svg.append('g');
    const zoom = d3.zoom()
        .scaleExtent([0.3, 3])
        .on('zoom', (event) => g.attr('transform', event.transform));

    svg.call(zoom);
    kgState.zoom = zoom;
    kgState.svg = svg;

    // Clear highlight on background click
    svg.on('click', () => {
        kgState.selectedNode = null;
        d3.selectAll('.kg-node-group').classed('dimmed', false);
        d3.selectAll('.kg-edge-line').classed('dimmed', false);
        hideDetailPanel();
    });

    // Center the view
    svg.call(zoom.transform, d3.zoomIdentity.translate(width / 2, height / 2));

    // Define arrow markers
    svg.append('defs').append('marker')
        .attr('id', 'arrowhead')
        .attr('viewBox', '-0 -5 10 10')
        .attr('refX', 30) // Offset to account for node radius
        .attr('refY', 0)
        .attr('orient', 'auto')
        .attr('markerWidth', 8)
        .attr('markerHeight', 8)
        .attr('xoverflow', 'visible')
        .append('svg:path')
        .attr('d', 'M 0,-3 L 7,0 L 0,3')
        .attr('fill', 'var(--border-color)')
        .style('stroke', 'none');

    const nodes = graphSpec.nodes.map(d => ({ ...d }));
    const edges = graphSpec.edges.map(d => ({
        ...d,
        source: d.source,
        target: d.target
    }));

    // Force simulation
    const simulation = d3.forceSimulation(nodes)
        .force('link', d3.forceLink(edges).id(d => d.id).distance(180).strength(0.4))
        .force('charge', d3.forceManyBody().strength(-400))
        .force('center', d3.forceCenter(0, 0))
        .force('collision', d3.forceCollide().radius(80));

    kgState.simulation = simulation;

    // Draw edges
    const link = g.append('g')
        .selectAll('path')
        .data(edges)
        .join('path')
        .attr('class', 'kg-edge-line')
        .attr('stroke', 'var(--border-color)')
        .attr('stroke-width', 2)
        .attr('fill', 'none')
        .attr('marker-end', 'url(#arrowhead)');

    // Edge labels
    const linkLabel = g.append('g')
        .selectAll('text')
        .data(edges)
        .join('text')
        .attr('class', 'kg-edge-label')
        .text(d => d.label || '');

    // Draw nodes
    const node = g.append('g')
        .selectAll('g')
        .data(nodes)
        .join('g')
        .attr('class', d => `kg-node-group node-${d.type}`)
        .call(d3.drag()
            .on('start', (event, d) => {
                if (!event.active) simulation.alphaTarget(0.3).restart();
                d.fx = d.x;
                d.fy = d.y;
            })
            .on('drag', (event, d) => {
                d.fx = event.x;
                d.fy = event.y;
            })
            .on('end', (event, d) => {
                if (!event.active) simulation.alphaTarget(0);
                if (d.type !== 'dtc') {
                    d.fx = null;
                    d.fy = null;
                }
            })
        )
        .on('click', (event, d) => {
            event.stopPropagation();
            onNodeClick(d);
        })
        .on('dblclick', (event, d) => {
            event.stopPropagation();
            onNodeDblClick(d);
        });

    // Node cards (foreignObject)
    node.each(function (d) {
        const g = d3.select(this);
        const isDtc = d.type === 'dtc';
        const isGroup = d.type === 'group_node';
        const cardW = isDtc ? 180 : (isGroup ? 140 : 160);
        const cardH = isDtc ? 80 : (isGroup ? 50 : 60);

        const fo = g.append('foreignObject')
            .attr('x', -cardW / 2)
            .attr('y', -cardH / 2)
            .attr('width', cardW)
            .attr('height', cardH);

        const foDiv = fo.append('xhtml:div')
            .attr('class', 'kg-fo-card');

        foDiv.append('xhtml:div')
            .attr('class', 'kg-fo-title')
            .text(d.label);

        if (d.sublabel) {
            foDiv.append('xhtml:div')
                .attr('class', 'kg-fo-sub')
                .text(d.sublabel);
        }

        if (isDtc && d.severity) {
            foDiv.append('xhtml:div')
                .attr('class', 'kg-fo-sub')
                .style('color', getSeverityColor(d.severity))
                .style('font-weight', '700')
                .style('margin-top', '4px')
                .text(d.severity);
        }
    });

    // Tick
    simulation.on('tick', () => {
        link.attr('d', d => {
            const dx = d.target.x - d.source.x,
                  dy = d.target.y - d.source.y,
                  dr = Math.sqrt(dx * dx + dy * dy) * 1.5; // Curve radius
            return `M${d.source.x},${d.source.y}A${dr},${dr} 0 0,1 ${d.target.x},${d.target.y}`;
        });

        linkLabel
            .attr('x', d => (d.source.x + d.target.x) / 2)
            .attr('y', d => (d.source.y + d.target.y) / 2);

        node.attr('transform', d => `translate(${d.x},${d.y})`);
    });
}

function onNodeClick(d) {
    if (d.type === 'group_node') return;

    const focusableTypes = ['dtc', 'related_dtc', 'module', 'vin', 'programs', 'program'];

    if (focusableTypes.includes(d.type)) {
        // If clicking the currently focused node, just collapse groups
        if (kgState.currentDtc === d.label || kgState.currentDtc === d.id) {
            if (Object.keys(kgState.expandedGroups).length > 0) {
                kgState.expandedGroups = {};
                renderGraph({nodes: kgState.rawNodes, edges: kgState.rawEdges});
            }
            return;
        }

        let type = d.type === 'related_dtc' ? 'dtc' : d.type === 'programs' ? 'program' : d.type;
        selectEntity(type, d.label);
        return;
    }

    // Collapse groups on click for non-focusable nodes
    if (Object.keys(kgState.expandedGroups).length > 0) {
        kgState.expandedGroups = {};
        renderGraph({nodes: kgState.rawNodes, edges: kgState.rawEdges});
        return;
    }

    // Toggle highlight
    if (kgState.selectedNode && kgState.selectedNode.id === d.id) {
        kgState.selectedNode = null;
        d3.selectAll('.kg-node-group').classed('dimmed', false);
        d3.selectAll('.kg-edge-line').classed('dimmed', false);
        hideDetailPanel();
        return;
    }

    kgState.selectedNode = d;
    showDetailPanel(d);

    // Highlight node
    d3.selectAll('.kg-node-group').classed('dimmed', true);
    d3.selectAll('.kg-edge-line').classed('dimmed', true);

    d3.selectAll('.kg-node-group').filter(n => n.id === d.id || (kgState.graphData && kgState.graphData.graph.edges.some(
        e => (e.source.id === d.id && e.target.id === n.id) || (e.target.id === d.id && e.source.id === n.id)
    ))).classed('dimmed', false);

    d3.selectAll('.kg-edge-line').filter(e =>
        e.source.id === d.id || e.target.id === d.id
    ).classed('dimmed', false);
}

function onNodeDblClick(d) {
    if (d.type === 'group_node') {
        // Expand
        kgState.expandedGroups[d.id] = true;

        let newNodes = kgState.rawNodes.filter(n => !kgState.expandedGroups[n.id]);
        let newEdges = kgState.rawEdges.filter(e => {
            let targetId = e.target.id || e.target;
            return !kgState.expandedGroups[targetId];
        });

        for (let gid in kgState.expandedGroups) {
            let group = kgState.rawNodes.find(n => n.id === gid);
            if (group && group.items) {
                group.items.forEach(item => {
                    newNodes.push({...item});
                    let edgeToGroup = kgState.rawEdges.find(e => (e.target.id || e.target) === gid);
                    if (edgeToGroup) {
                        newEdges.push({
                            source: edgeToGroup.source.id || edgeToGroup.source,
                            target: item.id,
                            label: edgeToGroup.label
                        });
                    }
                });
            }
        }

        renderGraph({nodes: newNodes, edges: newEdges});
    }
}

// ── Detail Panel Logic ──────────────────────────────────────────
function showDetailPanel(d) {
    const panel = document.getElementById('kg-detail-panel');
    if (!panel) return;

    document.getElementById('kg-detail-type').textContent = (d.type || 'unknown').replace('_', ' ');
    document.getElementById('kg-detail-title').textContent = d.label || 'Details';

    const content = document.getElementById('kg-detail-content');
    content.innerHTML = '';

    if (d.sublabel) {
        content.innerHTML += `<p><strong>${d.sublabel}</strong></p>`;
    }

    if (d.items && Array.isArray(d.items) && d.items.length > 0) {
        let ul = document.createElement('ul');
        ul.className = 'kg-detail-list';
        d.items.forEach(item => {
            let li = document.createElement('li');
            li.textContent = typeof item === 'object' ? item.label : item;
            ul.appendChild(li);
        });
        content.appendChild(ul);
    }

    panel.classList.remove('hidden');
}

function hideDetailPanel() {
    const panel = document.getElementById('kg-detail-panel');
    if (panel) panel.classList.add('hidden');
}

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('kg-detail-close')?.addEventListener('click', () => {
        hideDetailPanel();
        kgState.selectedNode = null;
        d3.selectAll('.kg-node-group').classed('dimmed', false);
        d3.selectAll('.kg-edge-line').classed('dimmed', false);
    });
    document.getElementById('report-view-close')?.addEventListener('click', () => {
        document.getElementById('report-view-modal')?.classList.add('hidden');
    });
    document.getElementById('ticket-detail-close')?.addEventListener('click', closeTicketModal);
});

async function fetchAndRenderLogAnalysis(dtcCode, panel) {
    try {
        const res = await fetch(`/api/knowledge-graph/analysis/${encodeURIComponent(dtcCode)}`);
        if (res.ok) {
            const data = await res.json();
            if (data.status === 'success' && data.reports && data.reports.length > 0) {
                // escapeAttr needs to be used carefully with markdown which contains quotes.
                // It's safer to store data in a global map or use encodeURIComponent.
                window.kgCurrentReports = {};
                panel.innerHTML = data.reports.slice(0, 6).map((r, i) => {
                    const id = 'rep_' + i;
                    window.kgCurrentReports[id] = r.markdown;
                    return `
                    <div class="kg-rc-item" style="cursor:pointer;" onclick="openReportModal('${escapeAttr(r.title)}', window.kgCurrentReports['${id}'])">
                        <span class="kg-rc-name" style="color:var(--primary); font-weight:600;">📄 ${escapeHtml(r.title)}</span>
                        <div style="font-size: 0.75rem; color: var(--text-muted); margin-top:2px;">${escapeHtml(r.date)}</div>
                    </div>
                `}).join('');
            } else {
                panel.innerHTML = '<div style="padding: 12px; color: var(--text-muted); font-size: 0.82rem; text-align: center;">No analysis reports found for this DTC.<br/>Click "Run AI Analysis" to generate one.</div>';
            }
        }
    } catch (e) {
        panel.innerHTML = '<div style="padding: 12px; color: #ef4444; font-size: 0.82rem; text-align: center;">Failed to load reports.</div>';
    }
}

function openReportModal(title, markdownText) {
    const modal = document.getElementById('report-view-modal');
    if (!modal) return;

    document.getElementById('report-view-title').innerHTML = `
        <svg fill="none" height="18" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" style="color: var(--primary);" viewbox="0 0 24 24" width="18"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>
        ${title}`;

    const body = document.getElementById('report-view-body');
    if (window.marked) {
        body.innerHTML = marked.parse(markdownText);
    } else {
        body.innerText = markdownText;
    }

    modal.classList.remove('hidden');
}

// ── Ticket Detail Modal ─────────────────────────────────────────
function openTicketModal(ticket) {
    const modal = document.getElementById('ticket-detail-modal');
    if (!modal || !ticket) return;

    document.getElementById('ticket-detail-title').innerHTML = `
        <svg fill="none" height="18" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" style="color: var(--primary);" viewBox="0 0 24 24" width="18"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
        ${escapeHtml(ticket.ticket_id)}`;

    const statusClass = (ticket.status || '').toLowerCase().replace(/\s/g, '-');
    const priorityColor = getSeverityColor(ticket.priority); // reuses Critical/High/Medium/Low color map

    document.getElementById('ticket-detail-body').innerHTML = `
        <h4 style="margin: 0 0 16px 0; font-size: 1.05rem; color: var(--text-primary); line-height: 1.4;">${escapeHtml(ticket.title || 'Untitled Ticket')}</h4>
        <div class="kg-overview-grid" style="grid-template-columns: 110px 1fr;">
            <span class="label">Ticket ID</span>
            <span class="value">${escapeHtml(ticket.ticket_id) || '—'}</span>
            <span class="label">Status</span>
            <span class="value"><span class="kg-badge ${statusClass}">${escapeHtml(ticket.status) || 'Open'}</span></span>
            <span class="label">Priority</span>
            <span class="value" style="color:${priorityColor}; font-weight:700;">${escapeHtml(ticket.priority) || 'Medium'}</span>
            <span class="label">Assignee</span>
            <span class="value">${ticket.assignee ? escapeHtml(ticket.assignee) : '<span style="color:var(--text-muted);">Unassigned</span>'}</span>
        </div>
    `;

    modal.classList.remove('hidden');
}

function closeTicketModal() {
    document.getElementById('ticket-detail-modal')?.classList.add('hidden');
}

// ── Sidebar Rendering ───────────────────────────────────────────
function renderSidebar(data) {
    const o = data.dtc_overview;

    // Overview card
    document.getElementById('kg-ov-code').textContent = o.code;
    document.getElementById('kg-ov-severity').innerHTML = `<span class="kg-badge ${o.severity.toLowerCase()}">${o.severity}</span>`;
    document.getElementById('kg-ov-module').textContent = o.module;
    document.getElementById('kg-ov-status').innerHTML = `<span class="kg-badge ${(o.status || 'active').toLowerCase().replace(/\s/g, '-')}">${o.status || 'Active'}</span>`;
    document.getElementById('kg-ov-first-seen').textContent = o.first_seen || '—';
    document.getElementById('kg-ov-last-seen').textContent = o.last_seen || '—';
    document.getElementById('kg-ov-occurrences').textContent = o.occurrences;
    document.getElementById('kg-ov-frequency').textContent = o.frequency;

    // Related DTCs
    const relContainer = document.getElementById('kg-related-dtcs');
    if (data.related_dtcs && data.related_dtcs.length > 0) {
        relContainer.innerHTML = data.related_dtcs.slice(0, 6).map(r => `
            <div class="kg-related-item" onclick="selectDtc('${escapeAttr(r.code)}')">
                <span class="kg-related-code">${escapeHtml(r.code)}</span>
                <span class="kg-related-desc">${escapeHtml(r.description)}</span>
            </div>
        `).join('');
    } else {
        relContainer.innerHTML = '<div style="padding: 8px; color: var(--text-muted); font-size: 0.82rem;">No related DTCs found</div>';
    }
}

// ── Bottom Panels Rendering ─────────────────────────────────────
function renderBottomPanels(data) {
    // Requirements
    const reqPanel = document.getElementById('kg-panel-requirements');
    if (data.requirements && data.requirements.length > 0) {
        reqPanel.innerHTML = data.requirements.slice(0, 5).map(r => `
            <div class="kg-req-item">
                <span class="kg-req-id">${escapeHtml(r.req_id)}</span>
                <span class="kg-req-text">${escapeHtml(r.summary)}</span>
            </div>
        `).join('') + (data.requirements.length > 5 ? `<div class="kg-panel-footer"><span class="kg-view-all">View All ${data.requirements.length} Requirements →</span></div>` : '');
    } else {
        reqPanel.innerHTML = '<div style="padding: 12px; color: var(--text-muted); font-size: 0.82rem; text-align: center;">No requirements linked</div>';
    }

    // Jira/SIMS Tickets
    const jiraPanel = document.getElementById('kg-panel-jira');
    if (data.jira_tickets && data.jira_tickets.length > 0) {
        window.kgCurrentTickets = {};
        let html = '<table class="kg-jira-table"><thead><tr><th>Ticket ID</th><th>Title</th><th>Status</th><th>Priority</th></tr></thead><tbody>';
        data.jira_tickets.slice(0, 5).forEach((t, i) => {
            const id = 'tix_' + i;
            window.kgCurrentTickets[id] = t;
            html += `<tr class="kg-jira-row" style="cursor:pointer;" onclick="openTicketModal(window.kgCurrentTickets['${id}'])">
                <td style="font-weight:600;color:var(--primary);">${escapeHtml(t.ticket_id)}</td>
                <td>${escapeHtml(t.title)}</td>
                <td><span class="kg-badge ${t.status.toLowerCase().replace(/\s/g, '-')}">${escapeHtml(t.status)}</span></td>
                <td>${escapeHtml(t.priority)}</td>
            </tr>`;
        });
        html += '</tbody></table>';
        if (data.jira_tickets.length > 5) {
            html += `<div class="kg-panel-footer"><span class="kg-view-all">View All ${data.jira_tickets.length} Tickets →</span></div>`;
        }
        jiraPanel.innerHTML = html;
    } else {
        jiraPanel.innerHTML = '<div style="padding: 12px; color: var(--text-muted); font-size: 0.82rem; text-align: center;">No Jira/SIMS tickets linked</div>';
    }

    // AI Log Analysis
    const logAnalysisPanel = document.getElementById('kg-panel-log-analysis');
    const runBtn = document.getElementById('btn-kg-run-analysis');
    if (logAnalysisPanel && runBtn) {
        logAnalysisPanel.innerHTML = '<div style="padding: 12px; color: var(--text-muted); font-size: 0.82rem; text-align: center;">Loading...</div>';
        runBtn.classList.remove('hidden');

        const dtcCode = data.dtc_overview.code;

        // Remove previous listeners using cloneNode
        const newRunBtn = runBtn.cloneNode(true);
        runBtn.parentNode.replaceChild(newRunBtn, runBtn);

        newRunBtn.onclick = async () => {
            newRunBtn.disabled = true;
            newRunBtn.innerText = "Analyzing...";
            try {
                const res = await fetch(`/api/knowledge-graph/analyze/${encodeURIComponent(dtcCode)}`, { method: 'POST' });
                if (res.ok) {
                    const ans = await res.json();
                    if (ans.status === 'success') {
                        // Reload the panel
                        fetchAndRenderLogAnalysis(dtcCode, logAnalysisPanel);
                        // Open the modal right away with the result
                        openReportModal(`Log Analysis: ${dtcCode}`, ans.report);
                    }
                } else {
                    alert("Analysis failed. See console for details.");
                }
            } catch (e) {
                console.error(e);
                alert("Error running analysis.");
            } finally {
                newRunBtn.disabled = false;
                newRunBtn.innerText = "Run AI Analysis";
            }
        };

        fetchAndRenderLogAnalysis(dtcCode, logAnalysisPanel);
    }

    // Activity Timeline
    const timelinePanel = document.getElementById('kg-panel-timeline');
    if (data.activity_timeline && data.activity_timeline.length > 0) {
        timelinePanel.innerHTML = '<div class="kg-timeline">' + data.activity_timeline.slice(0, 6).map(t => `
            <div class="kg-timeline-item">
                <div class="kg-timeline-dot ${t.type}"></div>
                <div class="kg-timeline-content">
                    <div class="kg-timeline-date">${escapeHtml(t.timestamp)}</div>
                    <div class="kg-timeline-event">${escapeHtml(t.event)}</div>
                </div>
            </div>
        `).join('') + '</div>' + (data.activity_timeline.length > 6 ? `<div class="kg-panel-footer"><span class="kg-view-all">View Full Timeline →</span></div>` : '');
    } else {
        timelinePanel.innerHTML = '<div style="padding: 12px; color: var(--text-muted); font-size: 0.82rem; text-align: center;">No activity recorded</div>';
    }
}

// ── Toolbar Actions ─────────────────────────────────────────────
function initToolbarActions() {
    const fitBtn = document.getElementById('kg-btn-fit');
    if (fitBtn) fitBtn.addEventListener('click', fitGraph);

    const zoomInBtn = document.getElementById('kg-ctrl-zoom-in');
    if (zoomInBtn) zoomInBtn.addEventListener('click', () => zoomGraph(1.3));

    const zoomOutBtn = document.getElementById('kg-ctrl-zoom-out');
    if (zoomOutBtn) zoomOutBtn.addEventListener('click', () => zoomGraph(0.7));

    const resetBtn = document.getElementById('kg-ctrl-reset');
    if (resetBtn) resetBtn.addEventListener('click', fitGraph);

    const expandBtn = document.getElementById('kg-btn-expand-graph');
    if (expandBtn) expandBtn.addEventListener('click', toggleFullscreenGraph);
}

function fitGraph() {
    if (!kgState.svg || !kgState.zoom) return;
    const container = document.getElementById('kg-graph-canvas');
    const width = container.clientWidth;
    const height = container.clientHeight;
    kgState.svg.transition().duration(500).call(
        kgState.zoom.transform,
        d3.zoomIdentity.translate(width / 2, height / 2).scale(0.8)
    );
}

function zoomGraph(factor) {
    if (!kgState.svg || !kgState.zoom) return;
    kgState.svg.transition().duration(300).call(kgState.zoom.scaleBy, factor);
}

// ── Expand Graph (fullscreen layout) ────────────────────────────
// Moves the Requirements / SIMS-Jira / AI Log Analysis panels out of the
// bottom row and into the right sidebar so the graph can take up the
// freed-up space. Activity Timeline intentionally stays at the bottom.
const KG_MOVABLE_PANEL_IDS = [
    'kg-panel-wrap-requirements',
    'kg-panel-wrap-jira',
    'kg-panel-wrap-loganalysis'
];

function toggleFullscreenGraph() {
    const layout = document.getElementById('kg-page-layout');
    const btn = document.getElementById('kg-btn-expand-graph');
    const btnText = document.getElementById('kg-btn-expand-graph-text');
    const expandedSlot = document.getElementById('kg-expanded-panels');
    const bottomPanels = document.getElementById('kg-bottom-panels');
    const timelineWrap = document.getElementById('kg-panel-wrap-timeline');
    if (!layout || !expandedSlot || !bottomPanels) return;

    kgState.fullscreenGraph = !kgState.fullscreenGraph;
    layout.classList.toggle('kg-fullscreen-graph', kgState.fullscreenGraph);
    btn?.classList.toggle('active', kgState.fullscreenGraph);
    if (btnText) {
        btnText.textContent = kgState.fullscreenGraph ? 'Collapse Graph' : 'Expand Graph';
    }
    if (btn) {
        const svg = btn.querySelector('svg');
        if (svg) {
            svg.innerHTML = kgState.fullscreenGraph
                ? '<polyline points="4 14 10 14 10 20"></polyline><polyline points="20 10 14 10 14 4"></polyline><line x1="14" y1="10" x2="21" y2="3"></line><line x1="3" y1="21" x2="10" y2="14"></line>'
                : '<polyline points="15 3 21 3 21 9"></polyline><polyline points="9 21 3 21 3 15"></polyline><line x1="21" y1="3" x2="14" y2="10"></line><line x1="3" y1="21" x2="10" y2="14"></line>';
        }
    }

    if (kgState.fullscreenGraph) {
        // Move the 3 panels into the sidebar, preserving order
        KG_MOVABLE_PANEL_IDS.forEach(id => {
            const el = document.getElementById(id);
            if (el) expandedSlot.appendChild(el);
        });
    } else {
        // Restore original order ahead of the (never-moved) timeline panel
        KG_MOVABLE_PANEL_IDS.forEach(id => {
            const el = document.getElementById(id);
            if (!el) return;
            if (timelineWrap) {
                bottomPanels.insertBefore(el, timelineWrap);
            } else {
                bottomPanels.appendChild(el);
            }
        });
    }

    // Let the layout settle, then resize the D3 canvas to fit the new
    // graph area dimensions.
    requestAnimationFrame(() => {
        setTimeout(() => {
            if (kgState.graphData) {
                renderGraph(kgState.graphData.graph);
            }
        }, 60);
    });
}

// ── Utilities ───────────────────────────────────────────────────
function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function escapeAttr(str) {
    return escapeHtml(str).replace(/'/g, "\\'");
}

function truncate(str, len) {
    if (!str) return '';
    return str.length > len ? str.substring(0, len) + '…' : str;
}

function getSeverityColor(severity) {
    const map = {
        'Critical': '#e11d48',
        'High': '#d97706',
        'Medium': '#2563eb',
        'Low': '#10b981'
    };
    return map[severity] || '#64748b';
}

// ── Theme Support ───────────────────────────────────────────────
// Read saved theme
const savedTheme = localStorage.getItem('diagtrace_theme') || 'white';
if (savedTheme && savedTheme !== 'white') {
    document.documentElement.setAttribute('data-theme', savedTheme);
}
