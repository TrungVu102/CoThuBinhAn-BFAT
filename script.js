const CANVAS_WIDTH = 540;
const CANVAS_HEIGHT = 960;
let showGrid = false;
let showCenterAxis = true; 
let gridColor = 'light'; 
let frameWidth = 540;
let frameHeight = 960;
let frameY = 0;
const MIN_W = 100;
const MIN_H = 100;

// Biến lưu tỷ lệ khi bắt đầu kéo
let dragStartRatio = 0; 
let dragAnchorY = 0;

let isExporting = false;
let isFrameLocked = false; 
// Đã xóa biến includeGridInExport không dùng đến nữa
let includeCenterAxisInExport = false; 
let isGhostMode = false;

let activeEditor = null;

const LS_KEY_STATE = 'cothu_pc_state';
const LS_KEY_IMAGES = 'cothu_pc_images';
const historyStack = [];
const redoStack = []; 
const MAX_HISTORY = 50;

// --- UI HELPERS ---
function showToast(msg) {
    const toast = document.getElementById('toast');
    const toastMsg = document.getElementById('toastMsg');
    toastMsg.innerText = msg;
    toast.classList.remove('opacity-0');
    setTimeout(() => toast.classList.add('opacity-0'), 3000);
}

// --- MODALS & EVENTS ---
const saveModalEl = document.getElementById('saveModal');
const saveFileNameInputEl = document.getElementById('saveFileNameInput');
const resetModalEl = document.getElementById('resetModal');
const helpModalEl = document.getElementById('helpModal');

function openSaveModal() {
    const timestamp = new Date().toISOString().slice(0,19).replace(/[-T:]/g,"");
    saveFileNameInputEl.value = `DuAn_CoThu_${timestamp}`;
    saveModalEl.classList.remove('hidden');
    setTimeout(() => saveFileNameInputEl.focus(), 100);
}
function closeSaveModal() { saveModalEl.classList.add('hidden'); }
function openResetModal() { resetModalEl.classList.remove('hidden'); }
function closeResetModal() { resetModalEl.classList.add('hidden'); }

window.toggleHelpModal = function() {
    if (helpModalEl.classList.contains('hidden')) {
        helpModalEl.classList.remove('hidden');
    } else {
        helpModalEl.classList.add('hidden');
    }
}
helpModalEl.addEventListener('click', (e) => { if (e.target === helpModalEl) toggleHelpModal(); });
if (!localStorage.getItem('seen_help')) { setTimeout(() => { toggleHelpModal(); localStorage.setItem('seen_help', 'true'); }, 1000); }

function confirmResetData() {
    localStorage.removeItem(LS_KEY_STATE); localStorage.removeItem(LS_KEY_IMAGES); location.reload();
}

function confirmSaveProject() {
    try {
        let fileName = saveFileNameInputEl.value.trim();
        if (!fileName) fileName = `DuAn_CoThu_${new Date().getTime()}`;
        if (!fileName.toLowerCase().endsWith('.json')) fileName += '.json';
        const projectData = {
            version: "1.0", timestamp: new Date().toISOString(),
            state: { frameWidth, frameHeight, frameY, isFrameLocked, showGrid, showCenterAxis, gridColor, edit1: { crop: edit1.crop, state: edit1.state, stickers: edit1.stickers }, edit2: { crop: edit2.crop, state: edit2.state, stickers: edit2.stickers } },
            images: { img1: edit1.isLoaded ? edit1.img.src : null, img2: edit2.isLoaded ? edit2.img.src : null }
        };
        const jsonString = JSON.stringify(projectData);
        const blob = new Blob([jsonString], {type: "application/json"});
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a'); link.href = url; link.download = fileName; document.body.appendChild(link); link.click(); document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        closeSaveModal(); showToast("Đã lưu dự án thành công!");
    } catch (e) { showToast("Lỗi: " + e.message); }
}

let saveTimeout;
function debouncedSave() { clearTimeout(saveTimeout); saveTimeout = setTimeout(saveToLocalStorage, 1000); }
function saveToLocalStorage() { try { const state = { frameWidth, frameHeight, frameY, isFrameLocked, showGrid, showCenterAxis, gridColor, edit1: { crop: edit1.crop, state: edit1.state, stickers: edit1.stickers }, edit2: { crop: edit2.crop, state: edit2.state, stickers: edit2.stickers } }; localStorage.setItem(LS_KEY_STATE, JSON.stringify(state)); } catch (e) {} }
function saveImagesToLocalStorage() { try { const images = { img1: edit1.isLoaded ? edit1.img.src : null, img2: edit2.isLoaded ? edit2.img.src : null }; const str = JSON.stringify(images); if (str.length > 5 * 1024 * 1024) showToast("Ảnh quá lớn để tự động lưu!"); else localStorage.setItem(LS_KEY_IMAGES, str); } catch (e) {} }

function loadProject(input) {
    const file = input.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => { try { const data = JSON.parse(e.target.result); restoreProjectFromData(data); showToast("Đã mở dự án!"); } catch (err) { showToast("Lỗi đọc file!"); } input.value = ''; };
    reader.readAsText(file);
}

function restoreProjectFromData(data) {
    const state = data.state; const images = data.images;
    if (state) {
        frameWidth = state.frameWidth; frameHeight = state.frameHeight; frameY = state.frameY;
        isFrameLocked = state.isFrameLocked; showGrid = state.showGrid || false; showCenterAxis = state.showCenterAxis ?? true; gridColor = state.gridColor || 'light';
        updateLockUI();
        if (state.edit1) { edit1.crop = state.edit1.crop; edit1.state = state.edit1.state; edit1.stickers = state.edit1.stickers; }
        if (state.edit2) { edit2.crop = state.edit2.crop; edit2.state = state.edit2.state; edit2.stickers = state.edit2.stickers; }
        edit1.updateControls(); edit2.updateControls();
    }
    if (images) {
        if (images.img1) { const img1 = new Image(); img1.onload = () => { edit1.img = img1; edit1.isLoaded = true; edit1.placeholder.style.display = 'none'; edit1.draw(); }; img1.src = images.img1; }
        if (images.img2) { const img2 = new Image(); img2.onload = () => { edit2.img = img2; edit2.isLoaded = true; edit2.placeholder.style.display = 'none'; edit2.draw(); }; img2.src = images.img2; }
    }
    setTimeout(() => { edit1.draw(); edit2.draw(); }, 200);
}

function loadFromLocalStorage() { try { const savedState = localStorage.getItem(LS_KEY_STATE); const savedImages = localStorage.getItem(LS_KEY_IMAGES); if (savedState || savedImages) { const data = { state: savedState ? JSON.parse(savedState) : null, images: savedImages ? JSON.parse(savedImages) : null }; restoreProjectFromData(data); } } catch (e) {} }

function saveHistory() {
    const state = { frameWidth, frameHeight, frameY, isFrameLocked, edit1: { crop: {...edit1.crop}, state: {...edit1.state}, stickers: edit1.stickers.map(s => ({...s})) }, edit2: { crop: {...edit2.crop}, state: {...edit2.state}, stickers: edit2.stickers.map(s => ({...s})) } };
    historyStack.push(state); if (historyStack.length > MAX_HISTORY) historyStack.shift(); redoStack.length = 0; debouncedSave();
}
function undo() { if (historyStack.length <= 1) return; redoStack.push(historyStack.pop()); restoreState(historyStack[historyStack.length - 1]); debouncedSave(); }
function redo() { if (redoStack.length === 0) return; const next = redoStack.pop(); historyStack.push(next); restoreState(next); debouncedSave(); }

function restoreState(state) {
    frameWidth = state.frameWidth; frameHeight = state.frameHeight; frameY = state.frameY; isFrameLocked = state.isFrameLocked;
    updateLockUI();
    edit1.crop = {...state.edit1.crop}; edit1.state = {...state.edit1.state}; edit1.stickers = state.edit1.stickers.map(s => ({...s})); edit1.interaction.stickerIndex = -1;
    edit2.crop = {...state.edit2.crop}; edit2.state = {...state.edit2.state}; edit2.stickers = state.edit2.stickers.map(s => ({...s})); edit2.interaction.stickerIndex = -1;
    edit1.updateControls(); edit2.updateControls(); edit1.draw(); edit2.draw();
}

function updateLockUI() {
    if (isFrameLocked) { lockBtn.innerHTML = '<i class="fa-solid fa-lock"></i>'; lockBtn.className = "btn-icon text-rose-500 border-rose-200 bg-rose-50"; } 
    else { lockBtn.innerHTML = '<i class="fa-solid fa-lock-open"></i>'; lockBtn.className = "btn-icon text-emerald-600 border-emerald-200"; }
}

window.setAspectRatio = function(wRatio, hRatio) {
    isFrameLocked = false;
    currentAspectRatio = wRatio / hRatio; 
    let newW = CANVAS_WIDTH; let newH = CANVAS_WIDTH * (hRatio / wRatio);
    if (newH > CANVAS_HEIGHT) { newH = CANVAS_HEIGHT; newW = CANVAS_HEIGHT * (wRatio / hRatio); }
    frameWidth = Math.round(newW); frameHeight = Math.round(newH); 
    frameY = (CANVAS_HEIGHT - frameHeight) / 2;
    isFrameLocked = true; updateLockUI();
    
    edit1.draw(); edit2.draw(); 
    showToast(`Tỉ lệ ${wRatio}:${hRatio}`);
}

window.toggleGhostMode = function() {
    isGhostMode = !isGhostMode;
    const btn = document.getElementById('ghostBtn');
    if (isGhostMode) { btn.classList.add('bg-blue-100', 'text-blue-600', 'border-blue-300'); showToast("Đã bật Soi Bóng (Ghost Mode)"); } 
    else { btn.classList.remove('bg-blue-100', 'text-blue-600', 'border-blue-300'); }
    edit2.draw();
}

class Editor {
    constructor(canvasId, wrapperId, uploadId, rotateRangeId, rotateInputId, placeholderId, side) {
        this.canvas = document.getElementById(canvasId); this.wrapper = document.getElementById(wrapperId); 
        this.ctx = this.canvas.getContext('2d'); this.placeholder = document.getElementById(placeholderId); this.side = side;
        this.rotateRange = document.getElementById(rotateRangeId); this.rotateInput = document.getElementById(rotateInputId);
        this.zoomRange = document.getElementById(side === 'left' ? 'zoomRange1' : 'zoomRange2');
        this.zoomInput = document.getElementById(side === 'left' ? 'zoomInput1' : 'zoomInput2'); 
        
        this.canvas.width = CANVAS_WIDTH; this.canvas.height = CANVAS_HEIGHT;
        this.img = new Image(); this.isLoaded = false;
        this.crop = { t: 0, b: 0, l: 0, r: 0 }; this.state = { x: CANVAS_WIDTH/2, y: CANVAS_HEIGHT/2, scale: 1, angle: 0 }; this.stickers = []; 
        this.drag = { isDragging: false, lastX: 0, lastY: 0 };
        this.interaction = { active: false, type: 'none', startDist: 0, startScale: 1, anchorCanvas: { x: 0, y: 0 }, stickerIndex: -1 };
        this.initEvents(uploadId);
    }

    fitToScreen() {
        if (!this.isLoaded) return;
        this.state.angle = 0;
        let ax = (this.side === 'left') ? (CANVAS_WIDTH - frameWidth) : 0;
        this.state.x = ax + frameWidth/2; this.state.y = frameY + frameHeight/2;
        const w = this.img.width - this.crop.l - this.crop.r; const h = this.img.height - this.crop.t - this.crop.b;
        this.state.scale = Math.min(frameWidth / w, frameHeight / h);
        this.updateControls();
        this.draw(); 
    }

    addSticker(emoji) {
        if (!this.isLoaded) return showToast("Vui lòng tải ảnh lên trước!");
        const size = (CANVAS_WIDTH / 5) / (100 * this.state.scale);
        this.stickers.push({ text: emoji, x: 0, y: 0, scale: size < 0.1 ? 0.1 : size, angle: 0 });
        this.interaction.stickerIndex = this.stickers.length - 1; saveHistory(); this.draw();
    }
    deleteSelectedSticker() { if (this.interaction.stickerIndex !== -1) { this.stickers.splice(this.interaction.stickerIndex, 1); this.interaction.stickerIndex = -1; saveHistory(); this.draw(); } }
    pan(dx, dy) { if (!this.isLoaded) return; this.state.x += dx; this.state.y += dy; saveHistory(); this.draw(); }
    setActive() { if (activeEditor && activeEditor !== this) activeEditor.wrapper.classList.remove('active-editor-wrapper'); activeEditor = this; this.wrapper.classList.add('active-editor-wrapper'); }

    getCanvasCoords(evt) {
        const rect = this.canvas.getBoundingClientRect();
        const clientX = evt.touches ? evt.touches[0].clientX : evt.clientX;
        const clientY = evt.touches ? evt.touches[0].clientY : evt.clientY;
        return { x: (clientX - rect.left) * (this.canvas.width / rect.width), y: (clientY - rect.top) * (this.canvas.height / rect.height) };
    }
    
    transformPoint(lx, ly, s, a, cx, cy) {
        const rad = a * Math.PI / 180; const cos = Math.cos(rad); const sin = Math.sin(rad);
        return { x: cx + (lx * s * cos - ly * s * sin), y: cy + (lx * s * sin + ly * s * cos) };
    }
    getInverseTransformedPoint(x, y) {
        const rad = -this.state.angle * Math.PI / 180; const cos = Math.cos(rad); const sin = Math.sin(rad);
        const dx = x - this.state.x; const dy = y - this.state.y;
        return { x: (dx * cos - dy * sin) / this.state.scale, y: (dx * sin + dy * cos) / this.state.scale };
    }
    getVisibleCorners() {
        if (!this.isLoaded) return [];
        const w = this.img.width, h = this.img.height, c = this.crop;
        const l = -w/2 + c.l, r = w/2 - c.r, t = -h/2 + c.t, b = h/2 - c.b;
        return [{x:l,y:t},{x:r,y:t},{x:r,y:b},{x:l,y:b}].map(p => this.transformPoint(p.x, p.y, this.state.scale, this.state.angle, this.state.x, this.state.y));
    }
    getCropHandles() {
        if (!this.isLoaded) return {};
        const w = this.img.width, h = this.img.height, c = this.crop;
        const l = -w/2 + c.l, r = w/2 - c.r, t = -h/2 + c.t, b = h/2 - c.b;
        const mx = (l+r)/2, my = (t+b)/2;
        const pts = {top:{x:mx,y:t}, bottom:{x:mx,y:b}, left:{x:l,y:my}, right:{x:r,y:my}};
        const handles = {};
        for(let k in pts) handles[k] = this.transformPoint(pts[k].x, pts[k].y, this.state.scale, this.state.angle, this.state.x, this.state.y);
        return handles;
    }

    checkHit(x, y) {
        const margin = 25; 
        if (this.isLoaded && this.interaction.stickerIndex !== -1 && this.interaction.stickerIndex < this.stickers.length) {
            const s = this.stickers[this.interaction.stickerIndex];
            const half = 100 * s.scale / 2;
            const corners = [{x:s.x-half,y:s.y-half},{x:s.x+half,y:s.y-half},{x:s.x+half,y:s.y+half},{x:s.x-half,y:s.y+half}];
            const screenCorners = corners.map(p => this.transformPoint(p.x, p.y, this.state.scale, this.state.angle, this.state.x, this.state.y));
            for(let k=0; k<4; k++) { if (Math.sqrt((x-screenCorners[k].x)**2 + (y-screenCorners[k].y)**2) < 20) return { type: 'sticker-resize', index: this.interaction.stickerIndex, handle: k, anchorLocal: corners[(k+2)%4] }; }
        }
        
        if (!isFrameLocked) {
            const topY = frameY; const botY = frameY + frameHeight;
            let activeX = (this.side === 'left') ? (CANVAS_WIDTH - frameWidth) : 0;
            let rightX = activeX + frameWidth;
            if (Math.abs(x - activeX) < margin && Math.abs(y - topY) < margin) return { type: 'frame-corner-tl' };
            if (Math.abs(x - rightX) < margin && Math.abs(y - topY) < margin) return { type: 'frame-corner-tr' };
            if (Math.abs(x - activeX) < margin && Math.abs(y - botY) < margin) return { type: 'frame-corner-bl' };
            if (Math.abs(x - rightX) < margin && Math.abs(y - botY) < margin) return { type: 'frame-corner-br' };
            if (Math.abs(y - topY) < margin && x > activeX && x < rightX) return { type: 'frame-edge-top' };
            if (Math.abs(y - botY) < margin && x > activeX && x < rightX) return { type: 'frame-edge-bot' };
            
            // Side Edge Check
            let sideEdgeX = (this.side === 'left') ? activeX : rightX;
            if (Math.abs(x - sideEdgeX) < margin && y > topY && y < botY) return { type: 'frame-edge-side' };
        }

        if (this.isLoaded) {
            const lp = this.getInverseTransformedPoint(x, y);
            for (let i = this.stickers.length - 1; i >= 0; i--) {
                const s = this.stickers[i]; const sz = 100 * s.scale / 2;
                if (lp.x >= s.x - sz && lp.x <= s.x + sz && lp.y >= s.y - sz && lp.y <= s.y + sz) return { type: 'sticker', index: i };
            }
            const ch = this.getCropHandles(); for (let k in ch) if (Math.sqrt((x-ch[k].x)**2 + (y-ch[k].y)**2) < margin) return { type: 'crop-handle', side: k };
            const vc = this.getVisibleCorners(); for (let i=0; i<4; i++) if (Math.sqrt((x-vc[i].x)**2 + (y-vc[i].y)**2) < margin) return { type: 'image-corner', index: i, anchorIdx: (i+2)%4 };
            const w=this.img.width, h=this.img.height, c=this.crop;
            if (lp.x >= -w/2+c.l && lp.x <= w/2-c.r && lp.y >= -h/2+c.t && lp.y <= h/2-c.b) return { type: 'pan' };
        }
        return { type: 'none' };
    }

    initEvents(uId) {
        document.getElementById(uId).addEventListener('change', (e) => {
            const f = e.target.files[0]; if(!f) return;
            const r = new FileReader();
            r.onload = (ev) => {
                const i = new Image();
                i.onload = () => {
                    const max = 1920; let w=i.width, h=i.height; if(w>max||h>max) { if(w>h){h*=max/w;w=max}else{w*=max/h;h=max} }
                    const c = document.createElement('canvas'); c.width=w; c.height=h; c.getContext('2d').drawImage(i,0,0,w,h);
                    this.img.src = c.toDataURL('image/jpeg', 0.8);
                    
                    this.img.onload = () => { 
                        this.isLoaded=true; 
                        this.crop={t:0,b:0,l:0,r:0}; 
                        this.placeholder.style.display='none'; 
                        this.fitToScreen(); 
                        this.setActive(); 
                        saveHistory(); 
                        saveImagesToLocalStorage();
                        
                        // FIX: Tự động khóa khung sau khi upload
                        isFrameLocked = true;
                        updateLockUI();
                    }
                }; i.src = ev.target.result;
            }; r.readAsDataURL(f);
        });
        
        const sync = (val, type) => {
            let n = parseFloat(val); 
            if (type === 'rotate') { if(isNaN(n)) n=0; this.state.angle = n; }
            if (type === 'zoom') { if(isNaN(n) || n<=0) n=0.1; this.state.scale = n; }
            this.updateControls(); this.draw();
        };

        if(this.rotateRange) { this.rotateRange.addEventListener('input', (e)=>sync(e.target.value, 'rotate')); this.rotateRange.addEventListener('change', ()=>saveHistory()); }
        if(this.rotateInput) { this.rotateInput.addEventListener('input', (e)=>sync(e.target.value, 'rotate')); this.rotateInput.addEventListener('change', ()=>saveHistory()); }
        if(this.zoomRange) { this.zoomRange.addEventListener('input', (e)=>sync(e.target.value, 'zoom')); this.zoomRange.addEventListener('change', ()=>saveHistory()); }
        if(this.zoomInput) { this.zoomInput.addEventListener('input', (e)=>sync(e.target.value, 'zoom')); this.zoomInput.addEventListener('change', ()=>saveHistory()); }

        const start = (e) => {
            this.setActive(); if (e.cancelable && !this.isLoaded) return;
            const c = this.getCanvasCoords(e); const hit = this.checkHit(c.x, c.y);
            this.interaction.active = true; this.interaction.type = hit.type;
            this.drag.lastX = e.touches ? e.touches[0].clientX : e.clientX; this.drag.lastY = e.touches ? e.touches[0].clientY : e.clientY;
            
            if (hit.type.includes('frame-corner')) {
                dragStartRatio = frameWidth / frameHeight; 
                dragAnchorY = frameY + frameHeight; 
                if (hit.type.includes('bl') || hit.type.includes('br')) dragAnchorY = frameY; 
            }

            if (hit.type !== 'sticker' && hit.type !== 'sticker-resize') this.interaction.stickerIndex = -1;
            
            if (hit.type === 'sticker') { this.interaction.stickerIndex = hit.index; this.draw(); }
            else if (hit.type === 'sticker-resize') {
                this.interaction.stickerIndex = hit.index; this.interaction.stickerHandle = hit.handle; this.interaction.anchorLocal = hit.anchorLocal;
                const lp = this.getInverseTransformedPoint(c.x, c.y); const s = this.stickers[hit.index];
                this.interaction.startDist = Math.sqrt((lp.x - s.x)**2 + (lp.y - s.y)**2); this.interaction.startScale = s.scale;
                this.draw();
            }
            else if (hit.type === 'crop-handle') this.interaction.cropSide = hit.side;
            else if (hit.type === 'image-corner') {
                const vc = this.getVisibleCorners(); const anchor = vc[hit.anchorIdx];
                this.interaction.anchorCanvas = anchor; this.interaction.anchorIdx = hit.anchorIdx;
                this.interaction.startDist = Math.sqrt((c.x - anchor.x)**2 + (c.y - anchor.y)**2); this.interaction.startScale = this.state.scale;
            }
            if (hit.type !== 'none') { this.canvas.style.cursor = 'grabbing'; if(e.cancelable) e.preventDefault(); }
            this.draw();
        };

        const move = (e) => {
            const c = this.getCanvasCoords(e);
            if (!this.interaction.active) return;
            if (e.cancelable) e.preventDefault();
            const t = this.interaction.type;
            
            if (t === 'sticker') { const mp = this.getInverseTransformedPoint(c.x, c.y); this.stickers[this.interaction.stickerIndex].x = mp.x; this.stickers[this.interaction.stickerIndex].y = mp.y; this.draw(); }
            else if (t === 'sticker-resize') { const mp = this.getInverseTransformedPoint(c.x, c.y); const ap = this.interaction.anchorLocal; const dist = Math.sqrt((mp.x - ap.x)**2 + (mp.y - ap.y)**2); let sc = dist / (100 * Math.sqrt(2)); if(sc<0.1) sc=0.1; const s = this.stickers[this.interaction.stickerIndex]; s.scale = sc; s.x = (ap.x+mp.x)/2; s.y = (ap.y+mp.y)/2; this.draw(); }
            else if (t === 'crop-handle') { const lp = this.getInverseTransformedPoint(c.x, c.y); const w=this.img.width, h=this.img.height, min=50; if(this.interaction.cropSide==='top') { let v=lp.y+h/2; if(v<0)v=0; if(v>h-this.crop.b-min)v=h-this.crop.b-min; this.crop.t=v; } else if(this.interaction.cropSide==='bottom') { let v=h/2-lp.y; if(v<0)v=0; if(v>h-this.crop.t-min)v=h-this.crop.t-min; this.crop.b=v; } else if(this.interaction.cropSide==='left') { let v=lp.x+w/2; if(v<0)v=0; if(v>w-this.crop.r-min)v=w-this.crop.r-min; this.crop.l=v; } else if(this.interaction.cropSide==='right') { let v=w/2-lp.x; if(v<0)v=0; if(v>w-this.crop.l-min)v=w-this.crop.l-min; this.crop.r=v; } this.draw(); }
            else if (t === 'image-corner') { const dist = Math.sqrt((c.x - this.interaction.anchorCanvas.x)**2 + (c.y - this.interaction.anchorCanvas.y)**2); if (this.interaction.startDist > 0) { let s = (dist / this.interaction.startDist) * this.interaction.startScale; if(s<0.1)s=0.1; if(s>4)s=4; this.state.scale=s; } const vc = this.getVisibleCorners(); const anchor = vc[this.interaction.anchorIdx]; const rad = this.state.angle * Math.PI / 180; const cos = Math.cos(rad); const sin = Math.sin(rad); const w = this.img.width, h = this.img.height; const l = -w/2 + this.crop.l, r = w/2 - this.crop.r, t = -h/2 + this.crop.t, b = h/2 - this.crop.b; const cl = [{x:l,y:t},{x:r,y:t},{x:r,y:b},{x:l,y:b}]; const myLocal = cl[this.interaction.anchorIdx]; const rx = myLocal.x*this.state.scale*cos - myLocal.y*this.state.scale*sin; const ry = myLocal.x*this.state.scale*sin + myLocal.y*this.state.scale*cos; this.state.x = this.interaction.anchorCanvas.x - rx; this.state.y = this.interaction.anchorCanvas.y - ry; this.updateControls(); this.draw(); }
            else if (t === 'pan' && this.isLoaded) { const cx = e.touches?e.touches[0].clientX:e.clientX; const cy = e.touches?e.touches[0].clientY:e.clientY; const rect = this.canvas.getBoundingClientRect(); const sr = CANVAS_WIDTH/rect.width; this.state.x += (cx - this.drag.lastX) * sr; this.state.y += (cy - this.drag.lastY) * sr; this.drag.lastX = cx; this.drag.lastY = cy; this.draw(); }
            
            else if (t.startsWith('frame') && !isFrameLocked) {
                if (t === 'frame-edge-top') {
                    let dy = c.y - this.drag.lastY; let newY = frameY + dy;
                    if (newY < 0) newY = 0; if (newY + frameHeight > CANVAS_HEIGHT) newY = CANVAS_HEIGHT - frameHeight;
                    frameY = newY;
                }
                else if (t === 'frame-edge-bot') {
                    let newH = c.y - frameY; if (newH < MIN_H) newH = MIN_H;
                    if (frameY + newH > CANVAS_HEIGHT) newH = CANVAS_HEIGHT - frameY;
                    frameHeight = newH;
                }
                else if (t.includes('corner')) {
                    let newW = frameWidth;
                    if (this.side === 'left') newW = CANVAS_WIDTH - c.x; else newW = c.x;
                    if (newW > CANVAS_WIDTH) newW = CANVAS_WIDTH; if (newW < MIN_W) newW = MIN_W;

                    let newH = newW / dragStartRatio;
                    if (newH > CANVAS_HEIGHT) { newH = CANVAS_HEIGHT; newW = newH * dragStartRatio; }

                    frameWidth = newW; frameHeight = newH;

                    if (t.includes('tl') || t.includes('tr')) {
                        frameY = dragAnchorY - newH;
                        if (frameY < 0) { frameY = 0; frameHeight = dragAnchorY; frameWidth = frameHeight * dragStartRatio; }
                    } else {
                        frameY = dragAnchorY;
                    }
                }
                else if (t === 'frame-edge-side') {
                    let newW = frameWidth;
                    if (this.side === 'left') {
                        // Kéo cạnh trái (với Editor Left) thực chất là thay đổi khoảng cách từ center
                        // Tọa độ chuột c.x càng nhỏ -> width càng lớn
                        newW = CANVAS_WIDTH - c.x;
                    } else {
                        // Kéo cạnh phải (với Editor Right)
                        newW = c.x;
                    }
                    if (newW < MIN_W) newW = MIN_W;
                    if (newW > CANVAS_WIDTH) newW = CANVAS_WIDTH;
                    frameWidth = newW;
                }
                this.drag.lastX = c.x; this.drag.lastY = c.y;
                edit1.draw(); edit2.draw();
            }
        };
        const end = () => { if(this.interaction.active) saveHistory(); this.interaction.active = false; this.interaction.type = 'none'; this.canvas.style.cursor = 'grab'; };
        
        this.canvas.addEventListener('mousedown', start); window.addEventListener('mousemove', move); window.addEventListener('mouseup', end);
        this.canvas.addEventListener('touchstart', start, {passive:false}); window.addEventListener('touchmove', move, {passive:false}); window.addEventListener('touchend', end);
    }

    resetView() {
        let ax = (this.side === 'left') ? (CANVAS_WIDTH - frameWidth) : 0;
        this.state.x = ax + frameWidth/2; this.state.y = frameY + frameHeight/2;
        this.state.angle = 0;
        this.state.scale = Math.min(frameWidth/this.img.width, frameHeight/this.img.height);
        this.updateControls(); this.draw();
    }
    updateControls() { 
        if(this.rotateRange) this.rotateRange.value=this.state.angle; 
        if(this.rotateInput) this.rotateInput.value=this.state.angle.toFixed(1);
        if(this.zoomRange) this.zoomRange.value = this.state.scale; 
        if(this.zoomInput) this.zoomInput.value = this.state.scale.toFixed(2);
    }

    draw() {
        this.ctx.clearRect(0,0,CANVAS_WIDTH,CANVAS_HEIGHT);
        
        if(this.isLoaded) {
            this.ctx.save(); this.ctx.translate(this.state.x, this.state.y); this.ctx.rotate(this.state.angle*Math.PI/180); this.ctx.scale(this.state.scale, this.state.scale);
            const w=this.img.width, h=this.img.height, c=this.crop;
            this.ctx.drawImage(this.img, c.l, c.t, w-c.l-c.r, h-c.t-c.b, -w/2+c.l, -h/2+c.t, w-c.l-c.r, h-c.t-c.b);
            this.stickers.forEach(s => { this.ctx.save(); this.ctx.translate(s.x,s.y); this.ctx.font=`${100*s.scale}px sans-serif`; this.ctx.textAlign='center'; this.ctx.textBaseline='middle'; this.ctx.fillText(s.text,0,0); this.ctx.restore(); });
            this.ctx.restore();
            if(!isExporting) { this.drawImageHandles(); this.drawCropHandles(); }
        }
        if (isGhostMode && this.side === 'right' && edit1.isLoaded) { this.ctx.save(); this.ctx.globalAlpha = 0.4; this.ctx.drawImage(edit1.canvas, 0, 0); this.ctx.restore(); }
        if(showGrid && (!isExporting)) this.drawGrid();
        if(!isExporting) { this.drawFrameMask(); this.drawStickerControls(); if(showCenterAxis) this.drawCenterAxis(); }
        else if(includeCenterAxisInExport) this.drawCenterAxis();
    }

    drawStickerControls() { if(this.interaction.stickerIndex===-1)return; const s=this.stickers[this.interaction.stickerIndex]; const h=100*s.scale/2; const pts=[{x:s.x-h,y:s.y-h},{x:s.x+h,y:s.y-h},{x:s.x+h,y:s.y+h},{x:s.x-h,y:s.y+h}].map(p=>this.transformPoint(p.x,p.y,this.state.scale,this.state.angle,this.state.x,this.state.y)); this.ctx.save();this.ctx.strokeStyle="#fbbf24";this.ctx.lineWidth=2;this.ctx.setLineDash([5,5]);this.ctx.beginPath();this.ctx.moveTo(pts[0].x,pts[0].y);for(let i=1;i<4;i++)this.ctx.lineTo(pts[i].x,pts[i].y);this.ctx.closePath();this.ctx.stroke();this.ctx.setLineDash([]);this.ctx.fillStyle="#fff";pts.forEach(p=>{this.ctx.beginPath();this.ctx.arc(p.x,p.y,3,0,Math.PI*2);this.ctx.fill();this.ctx.stroke();});this.ctx.restore(); }
    drawCenterAxis() { let ax=(this.side==='left')?(CANVAS_WIDTH-frameWidth):0;const cx=ax+frameWidth/2;this.ctx.save();this.ctx.strokeStyle="rgba(251,113,133,0.8)";this.ctx.lineWidth=2;this.ctx.setLineDash([10,5]);this.ctx.beginPath();this.ctx.moveTo(cx,frameY);this.ctx.lineTo(cx,frameY+frameHeight);this.ctx.stroke();this.ctx.restore(); }
    drawImageHandles() { const c=this.getVisibleCorners();this.ctx.save();this.ctx.fillStyle="#3b82f6";this.ctx.strokeStyle="white";this.ctx.lineWidth=2;c.forEach(p=>{this.ctx.beginPath();this.ctx.arc(p.x,p.y,6,0,Math.PI*2);this.ctx.fill();this.ctx.stroke();});this.ctx.restore(); }
    drawCropHandles() { const h=this.getCropHandles();this.ctx.save();this.ctx.fillStyle="#ef4444";this.ctx.strokeStyle="white";this.ctx.lineWidth=2;for(let k in h){const p=h[k];this.ctx.beginPath();this.ctx.rect(p.x-4,p.y-4,8,8);this.ctx.fill();this.ctx.stroke();}this.ctx.restore(); }
    drawGrid() { let ax=(this.side==='left')?(CANVAS_WIDTH-frameWidth):0;this.ctx.save();this.ctx.beginPath();this.ctx.rect(ax,frameY,frameWidth,frameHeight);this.ctx.clip();this.ctx.translate(ax,frameY);this.ctx.strokeStyle=(gridColor==='light')?"rgba(255,255,255,0.6)":"rgba(0,0,0,0.2)";this.ctx.lineWidth=0.5;for(let i=30;i<frameWidth;i+=30){this.ctx.beginPath();this.ctx.moveTo(i,0);this.ctx.lineTo(i,frameHeight);this.ctx.stroke();}for(let i=30;i<frameHeight;i+=30){this.ctx.beginPath();this.ctx.moveTo(0,i);this.ctx.lineTo(frameWidth,i);this.ctx.stroke();}this.ctx.strokeStyle=(gridColor==='light')?"rgba(255,255,255,0.9)":"rgba(0,0,0,0.4)";this.ctx.lineWidth=1.5;this.ctx.beginPath();this.ctx.moveTo(frameWidth/3,0);this.ctx.lineTo(frameWidth/3,frameHeight);this.ctx.moveTo(frameWidth*2/3,0);this.ctx.lineTo(frameWidth*2/3,frameHeight);this.ctx.moveTo(0,frameHeight/3);this.ctx.lineTo(frameWidth,frameHeight/3);this.ctx.moveTo(0,frameHeight*2/3);this.ctx.lineTo(frameWidth,frameHeight*2/3);this.ctx.stroke();this.ctx.restore(); }

    drawFrameMask() {
        this.ctx.save();
        this.ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
        const topY = frameY; const bottomY = frameY + frameHeight;
        let activeX = (this.side === 'left') ? CANVAS_WIDTH - frameWidth : 0;

        if (topY > 0) this.ctx.fillRect(0, 0, CANVAS_WIDTH, topY);
        if (bottomY < CANVAS_HEIGHT) this.ctx.fillRect(0, bottomY, CANVAS_WIDTH, CANVAS_HEIGHT - bottomY);
        if (this.side === 'left') { if (activeX > 0) this.ctx.fillRect(0, topY, activeX, frameHeight); }
        else { const rmx = activeX + frameWidth; if (rmx < CANVAS_WIDTH) this.ctx.fillRect(rmx, topY, CANVAS_WIDTH - rmx, frameHeight); }

        const INSET = 5; 
        if (isFrameLocked) {
            this.ctx.strokeStyle = "#f43f5e"; this.ctx.lineWidth = 2; this.ctx.setLineDash([5, 5]);
            this.ctx.strokeRect(activeX + INSET, topY + INSET, frameWidth - INSET*2, frameHeight - INSET*2);
        } else {
            this.ctx.strokeStyle = "#3b82f6"; this.ctx.lineWidth = 3; this.ctx.setLineDash([5, 5]);
            this.ctx.strokeRect(activeX + INSET, topY + INSET, frameWidth - INSET*2, frameHeight - INSET*2);
            this.ctx.fillStyle = "#3b82f6"; this.ctx.setLineDash([]); const hs = 8;
            
            this.ctx.beginPath(); this.ctx.arc(activeX + frameWidth/2, topY + INSET, hs, 0, Math.PI*2); this.ctx.fill(); 
            this.ctx.beginPath(); this.ctx.arc(activeX + frameWidth/2, bottomY - INSET, hs, 0, Math.PI*2); this.ctx.fill(); 
            
            const visualCenterY = topY + frameHeight/2;
            if (this.side === 'left') {
                this.ctx.beginPath(); this.ctx.arc(activeX + frameWidth - INSET, topY + INSET, hs, 0, Math.PI*2); this.ctx.fill();
                this.ctx.beginPath(); this.ctx.arc(activeX + frameWidth - INSET, bottomY - INSET, hs, 0, Math.PI*2); this.ctx.fill();
                this.ctx.beginPath(); this.ctx.arc(activeX + INSET, visualCenterY, hs, 0, Math.PI*2); this.ctx.fill();
            } else {
                this.ctx.beginPath(); this.ctx.arc(activeX + INSET, topY + INSET, hs, 0, Math.PI*2); this.ctx.fill();
                this.ctx.beginPath(); this.ctx.arc(activeX + INSET, bottomY - INSET, hs, 0, Math.PI*2); this.ctx.fill();
                this.ctx.beginPath(); this.ctx.arc(activeX + frameWidth - INSET, visualCenterY, hs, 0, Math.PI*2); this.ctx.fill();
            }
        }
        this.ctx.restore();
    }
}

const edit1 = new Editor('canvas1', 'wrapper1', 'upload1', 'rotateRange1', 'rotateInput1', 'placeholder1', 'left');
const edit2 = new Editor('canvas2', 'wrapper2', 'upload2', 'rotateRange2', 'rotateInput2', 'placeholder2', 'right');

const modal = document.getElementById('previewModal');
const previewImg = document.getElementById('previewImage');
const exportGridCheck = document.getElementById('exportGridCheck'); // ĐÃ XÓA CHECKBOX LƯỚI Ở HTML NÊN BIẾN NÀY SẼ NULL, TUY NHIÊN TRONG CODE ĐÃ REMOVE LISTENER NÊN KO SAO. NHƯNG ĐỂ SẠCH HƠN NÊN XÓA DÒNG NÀY LUÔN.
const exportAxisCheck = document.getElementById('exportAxisCheck');
let currentDataUrl = '';

const lockBtn = document.getElementById('lockBtn');
const gridBtn = document.getElementById('gridBtn');
const gridColorBtn = document.getElementById('gridColorBtn');
const centerAxisBtn = document.getElementById('centerAxisBtn'); 
const emojiPicker = document.getElementById('emojiPicker');

window.toggleEmojiPicker = function() {
    const btn = document.getElementById('emojiBtn');
    if (emojiPicker.classList.contains('hidden')) {
        const rect = btn.getBoundingClientRect();
        emojiPicker.style.top = (rect.bottom + 10) + 'px';
        if (window.innerWidth < 300) { emojiPicker.style.left = '10px'; emojiPicker.style.right = 'auto'; }
        else { emojiPicker.style.right = (window.innerWidth - rect.right > 10 ? window.innerWidth - rect.right : 10) + 'px'; emojiPicker.style.left = 'auto'; }
        emojiPicker.classList.remove('hidden');
    } else emojiPicker.classList.add('hidden');
}
window.addEmoji = function(emoji) {
    if (activeEditor) { activeEditor.addSticker(emoji); emojiPicker.classList.add('hidden'); }
    else alert("Vui lòng chọn một khung ảnh!");
}
document.addEventListener('click', (e) => { if (!emojiPicker.contains(e.target) && !document.getElementById('emojiBtn').contains(e.target)) emojiPicker.classList.add('hidden'); });

function toggleFrameLock() { isFrameLocked = !isFrameLocked; updateLockUI(); saveHistory(); edit1.draw(); edit2.draw(); }
function updateGlobalFrame(w, h) {
    if (isFrameLocked) return;
    if (w !== null) frameWidth = parseInt(w);
    if (h !== null) { frameHeight = parseInt(h); frameY = CANVAS_HEIGHT - frameHeight; }
    edit1.draw(); edit2.draw();
}
function toggleGrid() { showGrid = !showGrid; if(showGrid){gridBtn.classList.add('text-pink-500','bg-pink-50');gridBtn.classList.remove('text-gray-400')}else{gridBtn.classList.remove('text-pink-500','bg-pink-50');gridBtn.classList.add('text-gray-400')} edit1.draw(); edit2.draw(); }
function toggleGridColor() {
    gridColor = (gridColor === 'light') ? 'dark' : 'light';
    const icon = gridColorBtn.querySelector('i');
    if (gridColor === 'dark') { icon.className = 'fa-solid fa-circle text-gray-800'; gridColorBtn.title="Tối"; }
    else { icon.className = 'fa-solid fa-circle-half-stroke'; gridColorBtn.title="Sáng"; }
    edit1.draw(); edit2.draw();
}
function toggleCenterAxis() { showCenterAxis = !showCenterAxis; if(showCenterAxis){centerAxisBtn.classList.add('text-red-400','bg-pink-50');centerAxisBtn.classList.remove('text-gray-400')}else{centerAxisBtn.classList.remove('text-red-400','bg-pink-50');centerAxisBtn.classList.add('text-gray-400')} edit1.draw(); edit2.draw(); }

function exportImage() {
    if(!edit1.isLoaded && !edit2.isLoaded) return alert("Chưa có ảnh nào!");
    // Đã xóa includeGridInExport
    includeCenterAxisInExport = false; exportAxisCheck.checked = false;
    const nameInput = document.getElementById('downloadFileName');
    if (!nameInput.value.trim()) { const t = new Date().toISOString().slice(0,19).replace(/[-T:]/g,""); nameInput.value = `Compare_${t}`; }
    updateResultImage(); modal.classList.remove('hidden');
}
// Đã xóa listener exportGridCheck
exportAxisCheck.addEventListener('change', (e) => { includeCenterAxisInExport = e.target.checked; updateResultImage(); });
document.getElementById('label1Input').addEventListener('input', updateResultImage);
document.getElementById('label2Input').addEventListener('input', updateResultImage);

function updateResultImage() {
    const fontSize = Math.max(24, frameWidth * 0.08); const labelH = fontSize * 1.8; 
    const c = document.createElement('canvas'); c.width = frameWidth * 2; c.height = frameHeight + labelH; 
    const ctx = c.getContext('2d'); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
    isExporting = true; edit1.draw(); edit2.draw();
    ctx.drawImage(edit1.canvas, CANVAS_WIDTH - frameWidth, frameY, frameWidth, frameHeight, 0, 0, frameWidth, frameHeight);
    ctx.drawImage(edit2.canvas, 0, frameY, frameWidth, frameHeight, frameWidth, 0, frameWidth, frameHeight);
    ctx.font = `bold ${fontSize}px sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillStyle = "#374151"; 
    const ly = frameHeight + (labelH / 2);
    ctx.fillText(document.getElementById('label1Input').value || "BEFORE", frameWidth / 2, ly);
    ctx.fillText(document.getElementById('label2Input').value || "AFTER", frameWidth + (frameWidth / 2), ly);
    ctx.beginPath(); ctx.moveTo(frameWidth, frameHeight + 5); ctx.lineTo(frameWidth, c.height - 5); ctx.strokeStyle = "#e5e7eb"; ctx.lineWidth = 1; ctx.stroke();
    isExporting = false; edit1.draw(); edit2.draw();
    currentDataUrl = c.toDataURL('image/jpeg', 0.95); previewImg.src = currentDataUrl;
}
function closePreview() { modal.classList.add('hidden'); previewImg.src = ''; }
function confirmDownload() {
    let fn = document.getElementById('downloadFileName').value.trim(); if (!fn) fn = `Compare_${Date.now()}`; if (!fn.toLowerCase().endsWith('.jpg')) fn += '.jpg';
    const l = document.createElement('a'); l.download = fn; l.href = currentDataUrl; document.body.appendChild(l); l.click(); document.body.removeChild(l);
}

window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey)) {
        if (e.shiftKey && e.key.toLowerCase() === 'z') { e.preventDefault(); redo(); return; }
        if (e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); return; }
    }
    if (!activeEditor || e.target.tagName === 'INPUT') return; 
    if (e.key === 'Delete' || e.key === 'Backspace') { activeEditor.deleteSelectedSticker(); e.preventDefault(); return; }
    
    // PHÍM TẮT ZOOM (ĐẢO NGƯỢC A/S)
    if (e.key.toLowerCase() === 'a') { 
        let newScale = activeEditor.state.scale - 0.01; 
        if (newScale < 0.1) newScale = 0.1; 
        activeEditor.state.scale = newScale; activeEditor.updateControls(); activeEditor.draw(); saveHistory();
    }
    if (e.key.toLowerCase() === 's') { 
        let newScale = activeEditor.state.scale + 0.01; 
        if (newScale > 4) newScale = 4; 
        activeEditor.state.scale = newScale; activeEditor.updateControls(); activeEditor.draw(); saveHistory();
    }

    // PHÍM TẮT XOAY (Q/W)
    if (e.key.toLowerCase() === 'q') {
        activeEditor.state.angle -= 0.1;
        activeEditor.updateControls(); activeEditor.draw(); saveHistory();
    }
    if (e.key.toLowerCase() === 'w') {
        activeEditor.state.angle += 0.1;
        activeEditor.updateControls(); activeEditor.draw(); saveHistory();
    }

    let s = e.shiftKey ? 10 : 1; let h = false;
    switch(e.key) {
        case 'ArrowUp': activeEditor.pan(0, -s); h = true; break;
        case 'ArrowDown': activeEditor.pan(0, s); h = true; break;
        case 'ArrowLeft': activeEditor.pan(-s, 0); h = true; break;
        case 'ArrowRight': activeEditor.pan(s, 0); h = true; break;
    }
    if (h) e.preventDefault();
});

edit1.draw(); edit2.draw(); loadFromLocalStorage();
const stageContainer = document.getElementById('stageContainer');
const controlsArea = document.getElementById('controlsArea');
if (stageContainer && controlsArea) {
    const ro = new ResizeObserver(entries => {
        window.requestAnimationFrame(() => { for (let e of entries) { const r = stageContainer.getBoundingClientRect(); controlsArea.style.width = `${r.width}px`; } });
    }); ro.observe(stageContainer);
}