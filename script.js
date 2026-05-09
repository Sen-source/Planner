// --- Configuration ---
const START_HOUR = 7;
const END_HOUR = 20;
const HOUR_HEIGHT = 60; 
const PRESET_COLORS = [
    'linear-gradient(135deg, #FF9A9E 0%, #FAD0C4 100%)',
    'linear-gradient(135deg, #A18CD1 0%, #FBC2EB 100%)',
    'linear-gradient(135deg, #84FAB0 0%, #8FD3F4 100%)',
    'linear-gradient(135deg, #FFECD2 0%, #FCB69F 100%)',
    'linear-gradient(135deg, #E0C3FC 0%, #8EC5FC 100%)',
    'linear-gradient(135deg, #F093FB 0%, #F5576C 100%)',
    'linear-gradient(135deg, #5EE7DF 0%, #B490D2 100%)',
    'linear-gradient(135deg, #C2E9FB 0%, #A1C4FD 100%)',
    'linear-gradient(135deg, #667EEA 0%, #764BA2 100%)',
    'linear-gradient(135deg, #FF9A9E 0%, #FECFEF 100%)'
];

// --- State ---
let schedules = JSON.parse(localStorage.getItem('schedules') || '[]');
let selectedColor = PRESET_COLORS[0];
let editingId = null;
let deletingId = null;

// --- DOM Elements ---
const getEl = (id) => document.getElementById(id);

// --- Initialize ---
document.addEventListener('DOMContentLoaded', () => {
    initGrid();
    renderColorPicker();
    renderSchedules();
    loadCustomization();
    setupEventListeners();
});

function setupEventListeners() {
    getEl('submit-btn').onclick = handleFormSubmit;
    getEl('cancel-btn').onclick = resetForm;
    getEl('download-btn').onclick = downloadPlanner;
    getEl('bgColorPicker').onchange = (e) => updateBgColor(e.target.value);
    getEl('bgImageInput').onchange = (e) => updateBgImage(e);
    getEl('blurInput').oninput = (e) => updateBlur(e.target.value);
    
    // Custom color input handler
    getEl('custom-color').oninput = (e) => {
        selectedColor = e.target.value;
        // Deselect swatches
        document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
    };
}

// --- UI Rendering ---

function initGrid() {
    const grid = getEl('calendar-grid');
    grid.innerHTML = '';

    for (let h = START_HOUR; h <= END_HOUR; h++) {
        // :00 Marker
        const label00 = document.createElement('div');
        label00.className = 'time-label';
        label00.textContent = `${h}:00`;
        grid.appendChild(label00);

        for (let d = 0; d < 7; d++) {
            const cell = document.createElement('div');
            cell.className = 'grid-cell';
            cell.dataset.day = d;
            cell.dataset.time = `${h.toString().padStart(2, '0')}:00`;
            cell.onclick = () => handleGridClick(d, cell.dataset.time);
            grid.appendChild(cell);
        }

        // :30 Marker (except for the last hour if it's the end)
        if (h < END_HOUR) {
            const label30 = document.createElement('div');
            label30.className = 'time-label sub-time';
            label30.textContent = `${h}:30`;
            grid.appendChild(label30);

            for (let d = 0; d < 7; d++) {
                const cell = document.createElement('div');
                cell.className = 'grid-cell';
                cell.dataset.day = d;
                cell.dataset.time = `${h.toString().padStart(2, '0')}:30`;
                cell.onclick = () => handleGridClick(d, cell.dataset.time);
                grid.appendChild(cell);
            }
        }
    }
}

function handleGridClick(day, time) {
    resetForm();
    // Check the specific day
    const cb = document.querySelector(`#day-checkboxes input[value="${day}"]`);
    if (cb) cb.checked = true;
    
    getEl('startTime').value = time;
    // Auto-set end time to 1 hour later
    const [h, m] = time.split(':').map(Number);
    const endH = Math.min(h + 1, END_HOUR);
    getEl('endTime').value = `${endH.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
    
    getEl('subject').focus();
}

function renderColorPicker() {
    const picker = getEl('color-picker');
    picker.innerHTML = '';
    PRESET_COLORS.forEach((color) => {
        const swatch = document.createElement('div');
        swatch.className = `color-swatch ${color === selectedColor ? 'active' : ''}`;
        swatch.style.background = color;
        swatch.onclick = () => {
            selectedColor = color;
            document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
            swatch.classList.add('active');
            getEl('custom-color').value = '#ffffff'; 
        };
        picker.appendChild(swatch);
    });
}

function renderSchedules() {
    document.querySelectorAll('.day-column').forEach(col => col.innerHTML = '');

    const grouped = {};
    schedules.forEach(item => {
        if (!item.days) item.days = [item.day];
        item.days.forEach(day => {
            if (!grouped[day]) grouped[day] = [];
            grouped[day].push(item);
        });
    });

    Object.keys(grouped).forEach(day => {
        const columnSchedules = grouped[day].sort((a, b) => a.start.localeCompare(b.start));
        const column = document.querySelector(`.day-column[data-day="${day}"]`);
        if (!column) return;

        // --- Robust Overlap Clustering (Connected Components) ---
        const clusters = [];
        columnSchedules.forEach(item => {
            const overlappingClusters = clusters.filter(cluster => 
                cluster.some(cItem => item.start < cItem.end && item.end > cItem.start)
            );

            if (overlappingClusters.length === 0) {
                clusters.push([item]);
            } else if (overlappingClusters.length === 1) {
                overlappingClusters[0].push(item);
            } else {
                // Merge all overlapping clusters into one
                const mergedCluster = [item];
                overlappingClusters.forEach(cluster => {
                    mergedCluster.push(...cluster);
                    const idx = clusters.indexOf(cluster);
                    clusters.splice(idx, 1);
                });
                clusters.push(mergedCluster);
            }
        });

        clusters.forEach(cluster => {
            // Find max simultaneous overlaps in this cluster
            const columns = []; // Array of arrays, each sub-array is a visual column
            cluster.forEach(item => {
                let placedInCol = false;
                for (let col of columns) {
                    const overlaps = col.some(cItem => 
                        item.start < cItem.end && item.end > cItem.start
                    );
                    if (!overlaps) {
                        col.push(item);
                        placedInCol = true;
                        break;
                    }
                }
                if (!placedInCol) columns.push([item]);
            });

            const colCount = columns.length;
            columns.forEach((col, colIdx) => {
                col.forEach(item => {
                    const block = document.createElement('div');
                    block.className = 'schedule-block';
                    block.style.background = item.color;
                    block.style.top = `${calculateTop(item.start)}px`;
                    block.style.height = `${calculateHeight(item.start, item.end)}px`;
                    
                    const width = 100 / colCount;
                    block.style.width = `calc(${width}% - 4px)`;
                    block.style.left = `calc(${colIdx * width}% + 2px)`;
                    
                    const isDark = isColorDark(item.color);
                    block.classList.add(isDark ? 'light-text' : 'dark-text');
                    
                    block.innerHTML = `
                        <div class="subject">${item.subject}</div>
                        <div class="time">${item.start} - ${item.end}</div>
                    `;

                    block.onclick = (e) => {
                        e.stopPropagation();
                        deletingId = item.id;
                        openModal('delete-modal');
                    };

                    block.ondblclick = (e) => {
                        e.stopPropagation();
                        editSchedule(item.id);
                    };

                    column.appendChild(block);
                });
            });
        });
    });
}

// --- Logic ---

function calculateTop(timeStr) {
    const [hours, minutes] = timeStr.split(':').map(Number);
    const totalMinutesSinceStart = (hours - START_HOUR) * 60 + minutes;
    return (totalMinutesSinceStart / 60) * HOUR_HEIGHT;
}

function calculateHeight(startStr, endStr) {
    const start = startStr.split(':').map(Number);
    const end = endStr.split(':').map(Number);
    const durationMinutes = (end[0] * 60 + end[1]) - (start[0] * 60 + start[1]);
    return Math.max((durationMinutes / 60) * HOUR_HEIGHT, 20);
}

function isColorDark(color) {
    if (!color) return false;
    
    // For gradients, we'll check the first color if possible, 
    // but typically our presets are designed for dark text.
    if (color.startsWith('linear-gradient')) {
        // Simple heuristic for our preset gradients: they are mostly light/pastel
        return false; 
    }
    
    let r, g, b;
    if (color.startsWith('#')) {
        const hex = color.replace('#', '');
        r = parseInt(hex.substr(0, 2), 16);
        g = parseInt(hex.substr(2, 2), 16);
        b = parseInt(hex.substr(4, 2), 16);
    } else if (color.startsWith('rgb')) {
        const rgb = color.match(/\d+/g);
        r = parseInt(rgb[0]);
        g = parseInt(rgb[1]);
        b = parseInt(rgb[2]);
    } else return false;

    // HSP equation
    const hsp = Math.sqrt(0.299 * (r * r) + 0.587 * (g * g) + 0.114 * (b * b));
    return hsp < 150; // Threshold for dark color
}

function handleFormSubmit() {
    const subject = getEl('subject').value;
    const selectedDays = [];
    document.querySelectorAll('#day-checkboxes input[type="checkbox"]:checked').forEach((cb) => {
        selectedDays.push(cb.value);
    });

    const start = getEl('startTime').value;
    const end = getEl('endTime').value;

    if (!subject) {
        alert('Please enter a subject');
        return;
    }
    if (selectedDays.length === 0) {
        alert('Please select at least one day');
        return;
    }
    if (start >= end) {
        alert('End time must be after start time');
        return;
    }

    const scheduleData = {
        id: editingId || Date.now().toString(),
        subject,
        days: selectedDays,
        start,
        end,
        color: selectedColor
    };

    if (editingId) {
        schedules = schedules.map(s => s.id === editingId ? scheduleData : s);
    } else {
        schedules.push(scheduleData);
    }

    saveAndRefresh();
    resetForm();
}

function editSchedule(id) {
    const item = schedules.find(s => s.id === id);
    if (!item) return;

    editingId = id;
    getEl('subject').value = item.subject;
    
    document.querySelectorAll('#day-checkboxes input[type="checkbox"]').forEach((cb) => {
        cb.checked = item.days.includes(cb.value);
    });

    getEl('startTime').value = item.start;
    getEl('endTime').value = item.end;
    selectedColor = item.color;

    document.querySelectorAll('.color-swatch').forEach((s) => {
        s.classList.toggle('active', s.style.background === item.color);
    });
    if (!PRESET_COLORS.includes(item.color)) {
        getEl('custom-color').value = item.color;
    }

    getEl('form-title').textContent = 'Edit Schedule';
    getEl('submit-btn').textContent = 'Update Schedule';
    getEl('cancel-btn').style.display = 'block';
}

function confirmDelete() {
    if (!deletingId) return;
    schedules = schedules.filter(s => s.id !== deletingId);
    if (editingId === deletingId) resetForm();
    saveAndRefresh();
    closeModal('delete-modal');
    deletingId = null;
}

function resetForm() {
    editingId = null;
    getEl('subject').value = '';
    document.querySelectorAll('#day-checkboxes input[type="checkbox"]').forEach((cb) => cb.checked = false);
    getEl('form-title').textContent = 'Add Schedule';
    getEl('submit-btn').textContent = 'Add to Schedule';
    getEl('cancel-btn').style.display = 'none';
}

function saveAndRefresh() {
    localStorage.setItem('schedules', JSON.stringify(schedules));
    renderSchedules();
}

// --- Customization ---

function updateBgColor(color) {
    const bg = getEl('dynamic-bg');
    bg.style.backgroundImage = 'none';
    bg.style.backgroundColor = color;
    localStorage.setItem('planner-bg-color', color);
    localStorage.removeItem('planner-bg-image');
}

function updateBgImage(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        const url = e.target.result;
        getEl('dynamic-bg').style.backgroundImage = `url(${url})`;
        localStorage.setItem('planner-bg-image', url);
        localStorage.removeItem('planner-bg-color');
    };
    reader.readAsDataURL(file);
}

function updateBlur(value) {
    getEl('bg-overlay').style.backdropFilter = `blur(${value}px)`;
    localStorage.setItem('planner-blur', value);
}

function loadCustomization() {
    const bgColor = localStorage.getItem('planner-bg-color');
    const bgImage = localStorage.getItem('planner-bg-image');
    const blur = localStorage.getItem('planner-blur') || '10';

    if (bgImage) {
        getEl('dynamic-bg').style.backgroundImage = `url(${bgImage})`;
    } else if (bgColor) {
        getEl('dynamic-bg').style.backgroundColor = bgColor;
        getEl('bgColorPicker').value = bgColor;
    }

    getEl('bg-overlay').style.backdropFilter = `blur(${blur}px)`;
    getEl('blurInput').value = blur;
}

// --- Modals ---

function openModal(id) {
    getEl(id).style.display = 'flex';
}

function closeModal(id) {
    getEl(id).style.display = 'none';
}

// --- Export ---

async function downloadPlanner() {
    const captureArea = getEl('planner-capture');
    const bgLayer = getEl('dynamic-bg');
    const overlayLayer = getEl('bg-overlay');
    
    // Prepare for capture
    const exportWrapper = document.createElement('div');
    exportWrapper.id = 'export-wrapper';
    
    // Get current computed styles to replicate
    const bgStyle = window.getComputedStyle(bgLayer);
    const overlayStyle = window.getComputedStyle(overlayLayer);
    
    exportWrapper.style.cssText = `
        position: absolute;
        top: 0; left: 0;
        width: 1200px; /* Fixed width for consistent export */
        min-height: fit-content;
        z-index: -9999;
        display: flex;
        flex-direction: column;
        align-items: center;
        padding: 60px;
        background-color: ${bgStyle.backgroundColor};
        background-image: ${bgStyle.backgroundImage};
        background-size: cover;
        background-position: center;
        box-sizing: border-box;
    `;
    
    // Create a background container inside exportWrapper to handle blur simulation
    const innerContent = document.createElement('div');
    innerContent.style.cssText = `
        position: relative;
        z-index: 1;
        width: 100%;
        display: flex;
        flex-direction: column;
        align-items: center;
    `;

    const title = document.createElement('h1');
    title.textContent = 'Weekly Schedule';
    title.style.cssText = `
        font-size: 52px;
        font-weight: 900;
        margin-bottom: 40px;
        color: #1c1c1e;
        letter-spacing: -2px;
        font-family: -apple-system, system-ui, sans-serif;
        text-align: center;
    `;
    innerContent.appendChild(title);

    const exportContent = captureArea.cloneNode(true);
    // Force desktop-like styles on the clone to prevent mobile layout shifts
    exportContent.style.cssText = `
        width: 100%;
        background: rgba(255, 255, 255, 0.7);
        border-radius: 32px;
        overflow: hidden;
        border: 1px solid rgba(255, 255, 255, 0.5);
        box-shadow: 0 40px 100px rgba(0,0,0,0.2);
        display: flex; /* Ensure it maintains its structure */
        flex-direction: column;
    `;
    
    // Fix grid internal dimensions for the export
    const gridClone = exportContent.querySelector('#calendar-grid');
    if (gridClone) {
        gridClone.style.display = 'grid';
        gridClone.style.gridTemplateColumns = '60px repeat(7, 1fr)';
        gridClone.style.width = '100%';
    }

    const headerClone = exportContent.querySelector('.calendar-header');
    if (headerClone) {
        headerClone.style.display = 'grid';
        headerClone.style.gridTemplateColumns = '60px repeat(7, 1fr)';
        headerClone.style.width = '100%';
    }

    // Force some styles on children for better export
    const labels = exportContent.querySelectorAll('.day-label, .time-label');
    labels.forEach(l => {
        l.style.color = '#1c1c1e';
        l.style.opacity = '1';
        l.style.fontSize = '14px';
    });

    innerContent.appendChild(exportContent);
    exportWrapper.appendChild(innerContent);
    document.body.appendChild(exportWrapper);

    try {
        // Wait for fonts and images
        await new Promise(r => setTimeout(r, 800));

        const canvas = await html2canvas(exportWrapper, {
            useCORS: true,
            scale: 2, // High resolution
            backgroundColor: bgStyle.backgroundColor || '#ffffff',
            logging: false,
            width: 1200, // Force specific width to prevent mobile viewport issues
            height: exportWrapper.offsetHeight,
            windowWidth: 1200, // Important for mobile: simulate desktop viewport
            onclone: (doc) => {
                // Ensure the cloned document has the right styles
            }
        });
        
        const link = document.createElement('a');
        link.download = `Planner_${new Date().toISOString().slice(0,10)}.png`;
        link.href = canvas.toDataURL('image/png', 1.0);
        link.click();
    } catch (err) {
        console.error('Export failed', err);
        alert('Export failed. Try again.');
    } finally {
        document.body.removeChild(exportWrapper);
    }
}
