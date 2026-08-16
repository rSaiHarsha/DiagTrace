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
    selectedNode: null
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
    kgState.currentDtc = code;
    showLoading(true);

    fetch(`/api/knowledge-graph/${encodeURIComponent(code)}`)
        .then(r => r.json())
        .then(data => {
            if (data.status === 'success') {
                kgState.graphData = data;
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
        });

    // Node cards (rounded rects)
    node.each(function (d) {
        const g = d3.select(this);
        const isDtc = d.type === 'dtc';
        const cardW = isDtc ? 180 : 160;
        const cardH = isDtc ? 80 : 60;

        g.append('rect')
            .attr('class', 'kg-node-card')
            .attr('x', -cardW / 2)
            .attr('y', -cardH / 2)
            .attr('width', cardW)
            .attr('height', cardH)
            .attr('rx', 12)
            .attr('ry', 12)
            .attr('stroke-width', isDtc ? 2 : 1);

        // Main label
        g.append('text')
            .attr('class', 'kg-node-label')
            .attr('text-anchor', 'middle')
            .attr('dy', d.sublabel ? '-0.2em' : '0.35em')
            .text(truncate(d.label, isDtc ? 20 : 22));

        // Sublabel
        if (d.sublabel) {
            g.append('text')
                .attr('class', 'kg-node-sublabel')
                .attr('text-anchor', 'middle')
                .attr('dy', '1.2em')
                .text(truncate(d.sublabel, isDtc ? 26 : 22));
        }

        // Severity badge for DTC node
        if (isDtc && d.severity) {
            g.append('text')
                .attr('class', 'kg-node-sublabel')
                .attr('text-anchor', 'middle')
                .attr('dy', '2.4em')
                .attr('fill', getSeverityColor(d.severity))
                .attr('font-weight', '600')
                .attr('font-size', '10px')
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
    kgState.selectedNode = d;

    // If it's a related DTC, load that DTC's graph
    if (d.type === 'related_dtc') {
        const code = d.label;
        const input = document.getElementById('kg-search-input');
        if (input) input.value = '';
        selectDtc(code);
        return;
    }

    // Highlight node
    d3.selectAll('.kg-node-group').classed('dimmed', true);
    d3.selectAll('.kg-edge-line').classed('dimmed', true);

    d3.selectAll('.kg-node-group').filter(n => n.id === d.id || kgState.graphData.graph.edges.some(
        e => (e.source.id === d.id && e.target.id === n.id) || (e.target.id === d.id && e.source.id === n.id)
    )).classed('dimmed', false);

    d3.selectAll('.kg-edge-line').filter(e => 
        e.source.id === d.id || e.target.id === d.id
    ).classed('dimmed', false);
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
        let html = '<table class="kg-jira-table"><thead><tr><th>Ticket ID</th><th>Title</th><th>Status</th><th>Priority</th></tr></thead><tbody>';
        data.jira_tickets.slice(0, 5).forEach(t => {
            html += `<tr>
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

    // Root Causes
    const rcPanel = document.getElementById('kg-panel-rootcauses');
    if (data.root_causes && data.root_causes.length > 0) {
        rcPanel.innerHTML = data.root_causes.slice(0, 6).map((rc, i) => `
            <div class="kg-rc-item">
                <span class="kg-rc-name">${escapeHtml(rc)}</span>
            </div>
        `).join('') + (data.root_causes.length > 6 ? `<div class="kg-panel-footer"><span class="kg-view-all">View Full RCA Analysis →</span></div>` : '');
    } else {
        rcPanel.innerHTML = '<div style="padding: 12px; color: var(--text-muted); font-size: 0.82rem; text-align: center;">No root causes identified</div>';
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
