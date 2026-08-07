// =====================================================
// app.js - 完整版（阶段卡片 + 防拖拽 + 进度记忆 + 分组考核）
// =====================================================

const SUPABASE_URL = 'https://sjgegoibummrvyuhehco.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_qnadIPVLPkAgIe5w_aR0lg_zy7VnqPC';
const STORAGE_BUCKET = 'avatars';
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

function hashPassword(pwd) { return CryptoJS.SHA256(pwd).toString(); }

const LEVELS = [
    { id: 'beginner', label: '入门商家', stages: [1,2], quizPass: 80, next: 'advanced' },
    { id: 'advanced', label: '进阶商家', stages: [3,4], quizPass: 85, next: 'senior' },
    { id: 'senior', label: '资深商家', stages: [5], quizPass: 90, next: 'elite' },
    { id: 'elite', label: '精英商家', stages: [6], quizPass: 90, next: null }
];
const TOTAL_STAGES = 6;

// 阶段标题映射
const STAGE_INFO = {
    1: { title: '第一阶段：认知破局' },
    2: { title: '第二阶段：方向定位' },
    3: { title: '第三阶段：资源深挖' },
    4: { title: '第四阶段：平台认知' },
    5: { title: '第五阶段：商家实操' },
    6: { title: '第六阶段：运营进阶' }
};

let currentUser = null;
let currentViewStage = 1;
let stageData = {};
let progressMap = {};
let timerIntervals = {};
let timerElapsed = {};
let activeResourceId = null;
let currentImageResources = [];
let currentImageIdx = 0;
let questionStates = [];
const thumbCache = {};

// DOM helpers
const $ = id => document.getElementById(id);
const authCard = $('authCard'), dashboard = $('dashboard');
const phoneInput = $('phoneInput'), passwordInput = $('passwordInput'), nameInput = $('nameInput');
const authBtn = $('authBtn'), authMsg = $('authMsg');
const shopNameDisplay = $('shopNameDisplay'), levelDisplay = $('levelDisplay');
const statusText = $('statusText'), progressFill = $('progressFill');
const stepLabel = $('stepLabel'), nextLevelLabel = $('nextLevelLabel');
const stageTitle = $('stageTitle'), stageDesc = $('stageDesc');
const resourcesContainer = $('resourcesContainer'), learnMsg = $('learnMsg');
const quizContainer = $('quizContainer'), submitQuizBtn = $('submitQuizBtn');
const quizResult = $('quizResult'), refreshBtn = $('refreshBtn');
const stageList = $('stageList'); // 新增
const avatarWrapper = $('avatarWrapper'), avatarCircle = $('avatarCircle');
const dropdownMenu = $('dropdownMenu'), changeAvatarBtn = $('changeAvatarBtn');
const changePasswordBtn = $('changePasswordBtn'), logoutBtn = $('logoutBtn');
const avatarModal = $('avatarModal'), avatarFileInput = $('avatarFileInput');
const modalAvatarPreview = $('modalAvatarPreview'), avatarModalMsg = $('avatarModalMsg');
const avatarSaveBtn = $('avatarSaveBtn'), avatarCancelBtn = $('avatarCancelBtn');
const passwordModal = $('passwordModal'), oldPasswordInput = $('oldPasswordInput');
const newPasswordInput = $('newPasswordInput'), confirmPasswordInput = $('confirmPasswordInput');
const passwordModalMsg = $('passwordModalMsg'), passwordSaveBtn = $('passwordSaveBtn');
const passwordCancelBtn = $('passwordCancelBtn');
const detailModal = $('detailModal'), detailTitle = $('detailTitle');
const detailBody = $('detailBody'), detailProgress = $('detailProgress');
const detailCloseBtn = $('detailCloseBtn');

// ========== Helper ==========
function getLevelFromStages(stages) {
    if (!stages || stages.length === 0) return LEVELS[0];
    const max = Math.max(...stages);
    if (max >= 6) return LEVELS[3];
    if (max >= 4) return LEVELS[2];
    if (max >= 3) return LEVELS[1];
    return LEVELS[0];
}
function getCurrentStage(stages) {
    if (!stages || stages.length === 0) return 1;
    const max = Math.max(...stages);
    if (max >= 6) return 6;
    return max + 1;
}
function getLevelById(id) { return LEVELS.find(l => l.id === id) || LEVELS[0]; }
function formatTime(sec) {
    const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
    return `${m}分${s}秒`;
}

// ========== Avatar ==========
function updateAvatar(user) {
    if (!user || !avatarCircle) return;
    const url = user.avatar_url;
    if (url) {
        avatarCircle.style.backgroundImage = `url(${url})`;
        avatarCircle.style.backgroundSize = 'cover';
        avatarCircle.style.backgroundPosition = 'center';
        avatarCircle.textContent = '';
        avatarCircle.classList.add('has-avatar');
    } else {
        avatarCircle.style.backgroundImage = '';
        avatarCircle.textContent = (user.name || '商').charAt(0).toUpperCase();
        avatarCircle.classList.remove('has-avatar');
    }
    if (modalAvatarPreview) {
        if (url) {
            modalAvatarPreview.style.backgroundImage = `url(${url})`;
            modalAvatarPreview.style.backgroundSize = 'cover';
            modalAvatarPreview.style.backgroundPosition = 'center';
            modalAvatarPreview.textContent = '';
        } else {
            modalAvatarPreview.style.backgroundImage = '';
            modalAvatarPreview.textContent = (user.name || '商').charAt(0).toUpperCase();
        }
    }
}

// ========== 缩略图生成 ==========
function generateVideoThumbnail(videoSrc, callback) {
    if (thumbCache[videoSrc]) { callback(thumbCache[videoSrc]); return; }
    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.preload = 'metadata';
    video.muted = true;
    video.src = videoSrc;
    video.addEventListener('loadeddata', function() {
        video.currentTime = 0.1;
        video.addEventListener('seeked', function() {
            const canvas = document.createElement('canvas');
            canvas.width = 160;
            canvas.height = 120;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
            thumbCache[videoSrc] = dataUrl;
            callback(dataUrl);
            video.src = '';
            video.load();
        });
    });
    video.addEventListener('error', function(e) {
        console.warn('视频缩略图生成失败:', videoSrc, e);
        callback(null);
    });
    video.load();
}

// ========== Load JSON（增加资源ID前缀 + 动态时长） ==========
async function loadStageData(stage) {
    if (stageData[stage]) return stageData[stage];
    try {
        const resp = await fetch(`data/stage${stage}.json`);
        if (!resp.ok) throw new Error(`加载阶段 ${stage} 失败`);
        const data = await resp.json();
        
        // 为资源ID添加阶段前缀，使其全局唯一
        if (data.resources) {
            data.resources.forEach(r => {
                r.id = stage + '-' + r.id;
                // 重新计算时长（视频保留原值，图片固定300秒，文章按字数）
                if (r.type === 'image') {
                    r.duration = 300;
                } else if (r.type === 'article') {
                    let text = r.content || '';
                    let plainText = text.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ');
                    const charCount = plainText.replace(/\s/g, '').length;
                    const minutes = charCount / 300;
                    const seconds = Math.ceil(minutes * 60);
                    r.duration = seconds > 0 ? seconds : 10;
                } else if (r.type === 'video') {
                    r.duration = r.duration || 0;
                }
            });
        }
        // 如果 quiz 中也需要 ID（暂未使用），也加前缀
        if (data.quiz) {
            data.quiz.forEach(q => {
                q.id = stage + '-' + q.id;
            });
        }
        stageData[stage] = data;
        return data;
    } catch (e) {
        console.error('加载阶段数据失败:', e);
        return null;
    }
}

// ========== Load progress ==========
async function loadUserProgress(userId) {
    const { data, error } = await supabaseClient
        .from('user_learning_progress')
        .select('*')
        .eq('user_id', userId);
    if (error) throw error;
    progressMap = {};
    data.forEach(p => {
        progressMap[p.resource_id] = {
            progress: p.progress_percent || 0,
            completed: p.completed || false,
            last_position: p.last_position || 0
        };
    });
}

// ========== Render resources ==========
function renderResources(stage, resources) {
    if (!resourcesContainer) return;
    resourcesContainer.innerHTML = '';
    if (!resources || resources.length === 0) {
        resourcesContainer.innerHTML = '<p>📭 本阶段暂无学习资料。</p>';
        return;
    }
    resources.forEach(r => {
        const div = document.createElement('div');
        div.className = 'resource-item';
        const prog = progressMap[r.id];
        if (prog && prog.completed) div.classList.add('completed');

        const thumb = document.createElement('div');
        thumb.className = 'thumb';
        if (r.type === 'video') {
            thumb.textContent = '🎬';
            thumb.style.background = '#d0d9e2';
            thumb.style.display = 'flex';
            thumb.style.alignItems = 'center';
            thumb.style.justifyContent = 'center';
            thumb.style.fontSize = '32px';
                }
            });
        } else if (r.type === 'image') {
            thumb.style.backgroundImage = `url('${r.file}')`;
            thumb.style.backgroundSize = 'cover';
            thumb.style.backgroundPosition = 'center';
        } else {
            thumb.textContent = '📄';
            thumb.style.display = 'flex';
            thumb.style.alignItems = 'center';
            thumb.style.justifyContent = 'center';
            thumb.style.fontSize = '28px';
            thumb.style.background = '#d0d9e2';
        }
        div.appendChild(thumb);

        const info = document.createElement('div');
        info.className = 'info';
        const titleSpan = document.createElement('div');
        titleSpan.className = 'title';
        titleSpan.textContent = r.title;
        info.appendChild(titleSpan);
        const statusSpan = document.createElement('div');
        statusSpan.className = 'status';
        if (prog && prog.completed) {
            statusSpan.textContent = '✅ 已完成';
            statusSpan.classList.add('completed');
        } else {
            const pct = prog ? prog.progress : 0;
            statusSpan.textContent = `⏳ 进度 ${pct}%`;
            statusSpan.classList.add('incomplete');
        }
        info.appendChild(statusSpan);
        div.appendChild(info);

        const badge = document.createElement('span');
        badge.className = 'badge-type';
        const map = { video: '视频', image: '图片', article: '文章' };
        badge.textContent = map[r.type] || r.type;
        div.appendChild(badge);

        div.addEventListener('click', () => openResourceDetail(r, resources));
        resourcesContainer.appendChild(div);
    });
}

// ==================== 修改后的 renderQuiz ====================
function renderQuiz(quiz) {
    if (!quizContainer) return;
    quizContainer.innerHTML = '';
    if (!quiz || quiz.length === 0) {
        quizContainer.innerHTML = '<p style="color:#5e6f7d;">📭 本阶段暂无考核。</p>';
        if (submitQuizBtn) submitQuizBtn.disabled = true;
        return;
    }
    if (submitQuizBtn) submitQuizBtn.disabled = false;

    // 按题型分组
    const groups = {
        single: { label: '一、单选题', items: [], totalScore: 0 },
        multiple: { label: '二、多选题', items: [], totalScore: 0 },
        judge: { label: '三、判断题', items: [], totalScore: 0 }
    };

    quiz.forEach(q => {
        const type = q.type || 'single';
        if (groups[type]) {
            groups[type].items.push(q);
            groups[type].totalScore += (q.score || 0);
        } else {
            // 未知类型归入单选
            groups.single.items.push(q);
            groups.single.totalScore += (q.score || 0);
        }
    });

    // 存储题目状态（全局）
    questionStates = quiz.map(() => ({ confirmed: false, selected: [] }));

    // 渲染每个分组
    for (const [type, group] of Object.entries(groups)) {
        if (group.items.length === 0) continue;

        // 分组标题
        const titleDiv = document.createElement('div');
        titleDiv.className = 'group-title';
        const perScore = group.items.length > 0 ? (group.totalScore / group.items.length) : 0;
        titleDiv.textContent = `${group.label}（每题${perScore}分，共${group.totalScore}分）`;
        quizContainer.appendChild(titleDiv);

        // 渲染该组所有题目
        group.items.forEach(q => {
            const wrapper = document.createElement('div');
            wrapper.className = 'quiz-item';
            const idx = quiz.indexOf(q); // 获取全局索引
            wrapper.dataset.idx = idx;

            const qText = document.createElement('div');
            qText.className = 'q-text';
            // 显示该组内的序号
            const localIdx = group.items.indexOf(q) + 1;
            qText.textContent = `${localIdx}. ${q.question}`;
            wrapper.appendChild(qText);

            const optionsDiv = document.createElement('div');
            optionsDiv.className = 'options';
            const isMultiple = (q.type === 'multiple');
            q.options.forEach((optText, optIdx) => {
                const label = document.createElement('label');
                label.className = 'option-item';
                const input = document.createElement('input');
                input.type = isMultiple ? 'checkbox' : 'radio';
                input.name = `q${idx}`;
                input.value = optIdx;
                const span = document.createElement('span');
                span.textContent = optText;
                label.appendChild(input);
                label.appendChild(span);
                optionsDiv.appendChild(label);

                input.addEventListener('change', function() {
                    if (questionStates[idx].confirmed) { this.checked = false; return; }
                    const sel = questionStates[idx].selected;
                    if (isMultiple) {
                        if (this.checked) { if (!sel.includes(optIdx)) sel.push(optIdx); }
                        else { const pos = sel.indexOf(optIdx); if (pos!==-1) sel.splice(pos,1); }
                    } else {
                        if (this.checked) { sel.length=0; sel.push(optIdx); }
                        else { const pos = sel.indexOf(optIdx); if (pos!==-1) sel.splice(pos,1); }
                    }
                });
            });
            wrapper.appendChild(optionsDiv);

            const btnDiv = document.createElement('div');
            const confirmBtn = document.createElement('button');
            confirmBtn.className = 'confirm-btn';
            confirmBtn.textContent = '确认答案';
            confirmBtn.addEventListener('click', function() {
                const state = questionStates[idx];
                if (!state.confirmed) {
                    if (state.selected.length === 0) { alert('请选择选项'); return; }
                    state.confirmed = true;
                    wrapper.querySelectorAll('input').forEach(inp => inp.disabled = true);
                    wrapper.classList.add('confirmed');
                    this.textContent = '修改答案';
                    this.classList.add('modify');
                    const badge = document.createElement('span');
                    badge.className = 'status-badge';
                    badge.textContent = '✅ 已确认';
                    this.parentNode.appendChild(badge);
                } else {
                    state.confirmed = false;
                    wrapper.querySelectorAll('input').forEach(inp => inp.disabled = false);
                    wrapper.classList.remove('confirmed');
                    this.textContent = '确认答案';
                    this.classList.remove('modify');
                    const badge = wrapper.querySelector('.status-badge');
                    if (badge) badge.remove();
                }
            });
            btnDiv.appendChild(confirmBtn);
            wrapper.appendChild(btnDiv);

            quizContainer.appendChild(wrapper);
        });
    }
}

// ========== Resource Detail Modal ==========
let currentVideoElement = null;
let isSeekingLock = false;

function openResourceDetail(resource, allResources) {
    if (!detailModal || !detailTitle || !detailBody || !detailProgress) return;
    currentImageResources = allResources.filter(r => r.type === resource.type);
    currentImageIdx = currentImageResources.findIndex(r => r.id === resource.id);

    detailTitle.textContent = resource.title;
    detailBody.innerHTML = '';
    detailProgress.textContent = '';

    if (resource.type === 'video') {
    const video = document.createElement('video');
    video.src = resource.file;
    video.controls = true;
    video.playsInline = true;
    video.style.width = '100%';
    video.style.borderRadius = '12px';
    
    let savedPosition = 0;
    const prog = progressMap[resource.id];
    if (prog && prog.last_position) {
        savedPosition = prog.last_position;
    }

    // 初始化合法位置
    let lastValidTime = savedPosition;
    video._lastValidTime = savedPosition; // 挂载到元素便于关闭时读取

    video.addEventListener('loadedmetadata', function() {
        if (savedPosition > 0 && savedPosition < video.duration) {
            video.currentTime = savedPosition;
            lastValidTime = savedPosition;
            this._lastValidTime = savedPosition;
        }
        updateDetailProgress(resource.id);
    });

    let saveTimer = null;
    function updateAndSave() {
        if (!video.duration) return;
        const pos = video._lastValidTime;
        const pct = Math.round((pos / video.duration) * 100);
        updateResourceProgress(resource.id, pct, pos);
        updateDetailProgress(resource.id);
        if (pct >= 100) markResourceCompleted(resource.id);
    }

    video.addEventListener('timeupdate', function() {
        // 只有不在 seeking 状态时才更新合法位置
        if (!this._seeking) {
            lastValidTime = video.currentTime;
            this._lastValidTime = video.currentTime;
        }
        const pct = Math.round((video.currentTime / video.duration) * 100);
        if (detailProgress) detailProgress.textContent = `学习进度：${pct}%`;
        if (!saveTimer) {
            saveTimer = setTimeout(() => {
                updateAndSave();
                saveTimer = null;
            }, 5000);
        }
    });

    video.addEventListener('seeking', function() {
        // 标记正在 seeking
        this._seeking = true;
        // 强制回退到合法位置
        this.currentTime = this._lastValidTime;
        // 等待 seeking 完成后清除标志
        setTimeout(() => {
            this._seeking = false;
        }, 100);
    });

    video.addEventListener('ended', function() {
        markResourceCompleted(resource.id);
        if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
        this._lastValidTime = video.duration;
        updateAndSave();
    });

    detailBody.appendChild(video);
    currentVideoElement = video;
    // 尝试播放
    video.play().catch(e => {
        if (e.name !== 'AbortError') {
            console.warn('视频自动播放被阻止:', e);
        }
    });
    activeResourceId = resource.id;
}
else if (resource.type === 'image') {
        const img = document.createElement('img');
        img.src = resource.file;
        img.style.width = '100%';
        img.style.borderRadius = '12px';
        detailBody.appendChild(img);
        if (currentImageResources.length > 1) {
            const nav = document.createElement('div');
            nav.className = 'img-nav';
            const prev = document.createElement('button');
            prev.textContent = '◀ 上一张';
            prev.addEventListener('click', () => navigateImage(-1));
            const next = document.createElement('button');
            next.textContent = '下一张 ▶';
            next.addEventListener('click', () => navigateImage(1));
            nav.appendChild(prev);
            nav.appendChild(next);
            detailBody.appendChild(nav);
        }
        activeResourceId = resource.id;
        startTimer(resource.id, resource.duration);
    } else if (resource.type === 'article') {
        const div = document.createElement('div');
        div.className = 'article-content';
        div.innerHTML = resource.content || '暂无内容';
        detailBody.appendChild(div);
        activeResourceId = resource.id;
        startTimer(resource.id, resource.duration);
    }

    detailModal.classList.add('open');
    updateDetailProgress(resource.id);
}

function closeDetailModal() {
    if (!detailModal) return;
    detailModal.classList.remove('open');
    if (currentVideoElement) {
    currentVideoElement.pause();
    if (currentVideoElement.duration) {
        const pos = currentVideoElement._lastValidTime || 0;
        const pct = Math.round((pos / currentVideoElement.duration) * 100);
        updateResourceProgress(activeResourceId, pct, pos);
    }
    currentVideoElement = null;
}
    if (activeResourceId) {
        stopTimer(activeResourceId);
        activeResourceId = null;
    }
}

function navigateImage(delta) {
    const newIdx = currentImageIdx + delta;
    if (newIdx < 0 || newIdx >= currentImageResources.length) return;
    currentImageIdx = newIdx;
    const newRes = currentImageResources[newIdx];
    if (detailTitle) detailTitle.textContent = newRes.title;
    const img = detailBody ? detailBody.querySelector('img') : null;
    if (img) img.src = newRes.file;
    if (activeResourceId) stopTimer(activeResourceId);
    activeResourceId = newRes.id;
    startTimer(newRes.id, newRes.duration);
    updateDetailProgress(newRes.id);
}

// ========== Timer ==========
function startTimer(resourceId, duration) {
    if (timerIntervals[resourceId]) return;
    if (progressMap[resourceId] && progressMap[resourceId].completed) return;
    if (!timerElapsed[resourceId]) timerElapsed[resourceId] = 0;
    const interval = setInterval(() => {
        timerElapsed[resourceId] += 1;
        const elapsed = timerElapsed[resourceId];
        const progress = Math.min(100, Math.round((elapsed / duration) * 100));
        updateResourceProgress(resourceId, progress, 0);
        updateDetailProgress(resourceId);
        if (progress >= 100) {
            stopTimer(resourceId);
            markResourceCompleted(resourceId);
        }
    }, 1000);
    timerIntervals[resourceId] = interval;
}

function stopTimer(resourceId) {
    if (timerIntervals[resourceId]) {
        clearInterval(timerIntervals[resourceId]);
        delete timerIntervals[resourceId];
    }
}

function updateDetailProgress(resourceId) {
    if (!detailProgress) return;
    const p = progressMap[resourceId];
    if (p) {
        detailProgress.textContent = `学习进度：${p.progress}% ${p.completed ? '✅ 已完成' : ''}`;
    } else {
        detailProgress.textContent = '学习进度：0%';
    }
}

// ========== Progress Update ==========
async function updateResourceProgress(resourceId, progress, position = 0) {
    if (!currentUser) return;
    if (!progressMap[resourceId]) progressMap[resourceId] = { progress: 0, completed: false, last_position: 0 };
    if (progress > progressMap[resourceId].progress) {
        progressMap[resourceId].progress = Math.min(100, progress);
    }
    if (position > progressMap[resourceId].last_position) {
        progressMap[resourceId].last_position = position;
    }
    if (progressMap[resourceId].progress >= 100) {
        progressMap[resourceId].completed = true;
        progressMap[resourceId].progress = 100;
    }
    const payload = {
        user_id: currentUser.id,
        resource_id: resourceId,
        progress_percent: progressMap[resourceId].progress,
        completed: progressMap[resourceId].completed || false,
        last_position: progressMap[resourceId].last_position || 0,
        last_updated: new Date().toISOString()
    };
    try {
        const { error } = await supabaseClient
            .from('user_learning_progress')
            .upsert(payload, { onConflict: 'user_id, resource_id' });
        if (error) console.error('Upsert error:', error);
    } catch (e) {
        console.error('Progress update error:', e);
    }
    renderCurrentStageResources();
    updateDetailProgress(resourceId);
}

async function markResourceCompleted(resourceId) {
    if (!currentUser) return;
    if (progressMap[resourceId] && progressMap[resourceId].completed) return;
    progressMap[resourceId] = { progress: 100, completed: true, last_position: 0 };
    await supabaseClient
        .from('user_learning_progress')
        .upsert({
            user_id: currentUser.id,
            resource_id: resourceId,
            progress_percent: 100,
            completed: true,
            last_position: 0,
            last_updated: new Date().toISOString()
        }, { onConflict: 'user_id, resource_id' });
    const data = stageData[currentViewStage];
    if (data && data.resources) {
        const allCompleted = data.resources.every(r => progressMap[r.id] && progressMap[r.id].completed);
        if (allCompleted && learnMsg) {
            learnMsg.classList.remove('hidden');
            learnMsg.textContent = '🎉 本阶段所有学习资源已完成，请完成考核以晋级！';
        }
    }
    renderCurrentStageResources();
    updateDetailProgress(resourceId);
}

function renderCurrentStageResources() {
    const data = stageData[currentViewStage];
    if (data) {
        renderResources(currentViewStage, data.resources);
        updateStageProgress(currentViewStage, data.resources);
    }
}

// ========== 阶段进度统计 ==========
function updateStageProgress(stage, resources) {
    if (!stageDesc) return;
    if (!resources) { stageDesc.innerHTML = ''; return; }
    const total = resources.length;
    let completedCount = 0;
    let totalDuration = 0, elapsed = 0;

    resources.forEach(r => {
        const prog = progressMap[r.id];
        const dur = r.duration || 0;
        totalDuration += dur;
        if (prog && prog.completed) {
            elapsed += dur;
            completedCount++;
        } else if (prog) {
            elapsed += (prog.progress / 100) * dur;
        }
    });

    const remaining = Math.max(0, totalDuration - elapsed);
    stageDesc.innerHTML = `资源完成：${completedCount}/${total}  |  已学 ${formatTime(elapsed)}  /  总需 ${formatTime(totalDuration)}  |  剩余 ${formatTime(remaining)}`;
}

// ==================== 修改后的 submitQuiz ====================
async function submitQuiz() {
    if (!currentUser) return;
    const stages = currentUser.completed_stages || [];
    const actualStage = getCurrentStage(stages);
    if (currentViewStage !== actualStage || actualStage > TOTAL_STAGES) {
        if (quizResult) { quizResult.classList.remove('hidden'); quizResult.textContent = '⚠️ 只能提交当前阶段的考核。'; }
        return;
    }
    const data = stageData[actualStage];
    if (!data || !data.quiz || data.quiz.length === 0) {
        if (quizResult) { quizResult.classList.remove('hidden'); quizResult.textContent = '本阶段无考核，无需提交。'; }
        return;
    }
    const resources = data.resources || [];
    const allCompleted = resources.every(r => progressMap[r.id] && progressMap[r.id].completed);
    if (!allCompleted) {
        if (quizResult) { quizResult.classList.remove('hidden'); quizResult.textContent = '⚠️ 请先完成本阶段所有学习资源再提交考核。'; }
        return;
    }
    const allConfirmed = questionStates.every(s => s.confirmed);
    if (!allConfirmed) {
        if (quizResult) { quizResult.classList.remove('hidden'); quizResult.textContent = '⚠️ 请先确认每道题的答案。'; }
        return;
    }

    // 计算总分和得分
    let totalScore = 0;
    let earnedScore = 0;
    data.quiz.forEach((q, idx) => {
        totalScore += (q.score || 0);
        const selected = questionStates[idx].selected || [];
        const sortedSelected = [...selected].sort();
        const sortedCorrect = (q.correct || []).sort();
        if (JSON.stringify(sortedSelected) === JSON.stringify(sortedCorrect)) {
            earnedScore += (q.score || 0);
        }
    });

    const scorePercent = Math.round((earnedScore / totalScore) * 100);
    const passThreshold = 80; // 固定80分及格
    const passed = earnedScore >= (totalScore * 0.8);

    const results = currentUser.quiz_results || {};
    results[`stage_${actualStage}`] = {
        correct: earnedScore,
        total: totalScore,
        passRate: scorePercent,
        passed: passed,
        date: new Date().toISOString()
    };
    try {
        await supabaseClient.from('merchants').update({ quiz_results: results }).eq('id', currentUser.id);
        currentUser.quiz_results = results;
        if (passed) {
            if (!stages.includes(actualStage)) {
                const newStages = [...stages, actualStage];
                await supabaseClient.from('merchants').update({ completed_stages: newStages }).eq('id', currentUser.id);
                currentUser.completed_stages = newStages;
                const newLevel = getLevelFromStages(newStages);
                if (newLevel.id !== currentUser.level) {
                    await supabaseClient.from('merchants').update({ level: newLevel.id }).eq('id', currentUser.id);
                    currentUser.level = newLevel.id;
                }
                const nextStage = getCurrentStage(newStages);
                if (nextStage <= TOTAL_STAGES) currentViewStage = nextStage;
                if (quizResult) { quizResult.classList.remove('hidden'); quizResult.textContent = `🎉 考核通过 (${earnedScore}/${totalScore}，得分率${scorePercent}%)，已晋级！${nextStage <= TOTAL_STAGES ? '进入下一阶段' : '全部完成！'}`; }
                await updateDashboard(currentUser);
                return;
            } else {
                if (quizResult) { quizResult.classList.remove('hidden'); quizResult.textContent = `✅ 考核通过 (${earnedScore}/${totalScore}，得分率${scorePercent}%)，但阶段已标记完成。`; }
            }
        } else {
            if (quizResult) { quizResult.classList.remove('hidden'); quizResult.textContent = `❌ 考核未通过 (${earnedScore}/${totalScore}，得分率${scorePercent}%，需≥${Math.round(totalScore*0.8)}分)，请复习后重试。`; }
        }
        await updateDashboard(currentUser);
    } catch (e) {
        if (quizResult) { quizResult.classList.remove('hidden'); quizResult.textContent = '❌ ' + e.message; }
    }
}

// ========== Dashboard ==========
async function updateDashboard(user) {
    if (!user) return;
    currentUser = user;
    const stages = user.completed_stages || [];
    const level = getLevelFromStages(stages);
    const actualStage = getCurrentStage(stages);
    if (!currentViewStage || currentViewStage < 1 || currentViewStage > TOTAL_STAGES) {
        currentViewStage = actualStage > TOTAL_STAGES ? TOTAL_STAGES : actualStage;
    }
    if (shopNameDisplay) shopNameDisplay.textContent = user.name || '商家';
    if (levelDisplay) levelDisplay.textContent = level.label;
    const done = Math.min(stages.length, TOTAL_STAGES);
    const pct = Math.round((done / TOTAL_STAGES) * 100);
    if (progressFill) progressFill.style.width = pct + '%';
    if (stepLabel) stepLabel.textContent = `学习进度 ${pct}% (${done}/${TOTAL_STAGES})`;
    const nextLevel = level.next ? getLevelById(level.next) : null;
    if (nextLevelLabel) nextLevelLabel.textContent = nextLevel ? `下一等级：${nextLevel.label}` : '🏆 已达最高等级';
    const stageStatus = (actualStage > TOTAL_STAGES) ? '已完成全部阶段' : `当前阶段：${actualStage}`;
    if (statusText) statusText.textContent = `📖 ${stageStatus} · 等级 ${level.label}`;

    await loadUserProgress(user.id);

    const data = await loadStageData(currentViewStage);
    if (data) {
        if (stageTitle) stageTitle.textContent = `📘 ${data.title}`;
        if (stageDesc) stageDesc.textContent = data.description;
        renderResources(currentViewStage, data.resources);
        renderQuiz(data.quiz);
        updateStageProgress(currentViewStage, data.resources);
    } else {
        if (stageTitle) stageTitle.textContent = `📘 第${currentViewStage}阶段`;
        if (stageDesc) stageDesc.textContent = '数据加载失败，请检查网络或JSON文件。';
        if (resourcesContainer) resourcesContainer.innerHTML = '<p>❌ 无法加载阶段数据。</p>';
        if (quizContainer) quizContainer.innerHTML = '';
    }

    // ========== 渲染阶段卡片（新） ==========
    const maxUnlocked = stages.length > 0 ? Math.max(...stages) : 0;
    if (stageList) {
        stageList.innerHTML = '';
        for (let i = 1; i <= TOTAL_STAGES; i++) {
            const card = document.createElement('div');
            card.className = 'stage-card';
            if (i === currentViewStage) card.classList.add('active');
            const isUnlocked = (i <= maxUnlocked + 1);
            if (!isUnlocked) {
                card.classList.add('locked');
                card.style.cursor = 'not-allowed';
            } else {
                card.addEventListener('click', function() {
                    if (i !== currentViewStage) {
                        currentViewStage = i;
                        (async () => {
                            const d = await loadStageData(currentViewStage);
                            if (d) {
                                if (stageTitle) stageTitle.textContent = `📘 ${d.title}`;
                                if (stageDesc) stageDesc.textContent = d.description;
                                renderResources(currentViewStage, d.resources);
                                renderQuiz(d.quiz);
                                updateStageProgress(currentViewStage, d.resources);
                                document.querySelectorAll('.stage-card').forEach(c => c.classList.remove('active'));
                                card.classList.add('active');
                            }
                        })();
                    }
                });
            }
            const labelSpan = document.createElement('span');
            labelSpan.className = 'stage-label';
            const info = STAGE_INFO[i] || { title: `第${i}阶段` };
            labelSpan.textContent = info.title;
            card.appendChild(labelSpan);

            const statusSpan = document.createElement('span');
            statusSpan.className = 'stage-status';
            statusSpan.textContent = isUnlocked ? (i <= maxUnlocked ? '✅ 已解锁' : '🔓 可学习') : '🔒 未解锁';
            card.appendChild(statusSpan);

            stageList.appendChild(card);
        }
    }

    const isCurrent = (currentViewStage === actualStage && actualStage <= TOTAL_STAGES);
    if (submitQuizBtn) submitQuizBtn.disabled = !isCurrent;

    updateAvatar(user);
    if (avatarWrapper) avatarWrapper.classList.add('visible');
    if (learnMsg) learnMsg.classList.add('hidden');
    if (quizResult) quizResult.classList.add('hidden');
}

// ========== Auth ==========
async function handleAuth() {
    if (!phoneInput || !passwordInput || !nameInput) return;
    const phone = phoneInput.value.trim();
    const password = passwordInput.value.trim();
    const name = nameInput.value.trim();
    if (!phone) { showAuthMsg('请输入手机号'); return; }
    if (!password || password.length < 6) { showAuthMsg('密码至少6位'); return; }
    const hashed = hashPassword(password);
    try {
        let { data: existing, error } = await supabaseClient
            .from('merchants')
            .select('*')
            .eq('phone', phone)
            .maybeSingle();
        if (error && error.code !== 'PGRST116') throw error;
        if (existing) {
            if (existing.password !== hashed) { showAuthMsg('❌ 密码错误'); return; }
            currentUser = existing;
            if (authCard) authCard.classList.add('hidden');
            if (dashboard) dashboard.classList.remove('hidden');
            const stages = existing.completed_stages || [];
            currentViewStage = getCurrentStage(stages);
            if (currentViewStage > TOTAL_STAGES) currentViewStage = TOTAL_STAGES;
            await updateDashboard(currentUser);
            showAuthMsg(`欢迎回来，${existing.name}`, false);
        } else {
            if (!name) { showAuthMsg('请填写店铺名称'); return; }
            const newUser = {
                phone, name,
                password: hashed,
                level: 'beginner',
                completed_stages: [],
                quiz_results: {},
                avatar_url: null,
                created_at: new Date().toISOString()
            };
            const { data: inserted, error: insertErr } = await supabaseClient
                .from('merchants')
                .insert([newUser])
                .select()
                .single();
            if (insertErr) throw insertErr;
            currentUser = inserted;
            if (authCard) authCard.classList.add('hidden');
            if (dashboard) dashboard.classList.remove('hidden');
            currentViewStage = 1;
            await updateDashboard(currentUser);
            showAuthMsg(`🎉 注册成功，${name}！`, false);
        }
    } catch (e) {
        showAuthMsg('❌ ' + e.message);
        console.error(e);
    }
}

function showAuthMsg(text, isError = true) {
    if (!authMsg) return;
    authMsg.classList.remove('hidden');
    authMsg.textContent = text;
    authMsg.className = 'msg' + (isError ? ' error' : '');
}

async function refreshUser() {
    if (!currentUser) return;
    try {
        const { data, error } = await supabaseClient.from('merchants').select('*').eq('id', currentUser.id).single();
        if (error) throw error;
        currentUser = data;
        const stages = currentUser.completed_stages || [];
        currentViewStage = getCurrentStage(stages);
        if (currentViewStage > TOTAL_STAGES) currentViewStage = TOTAL_STAGES;
        await updateDashboard(currentUser);
    } catch (e) { alert('刷新失败: ' + e.message); }
}

// ========== Avatar Upload ==========
let selectedFile = null;
function openAvatarModal() {
    if (!avatarModal) return;
    selectedFile = null;
    if (avatarFileInput) avatarFileInput.value = '';
    if (avatarModalMsg) { avatarModalMsg.classList.add('hidden'); avatarModalMsg.textContent = ''; }
    updateAvatar(currentUser);
    avatarModal.classList.add('open');
}
if (avatarFileInput) {
    avatarFileInput.addEventListener('change', function(e) {
        const file = e.target.files[0];
        if (!file) return;
        if (file.size > 50 * 1024) {
            if (avatarModalMsg) {
                avatarModalMsg.classList.remove('hidden');
                avatarModalMsg.textContent = '❌ 图片不能超过50KB';
                avatarModalMsg.className = 'msg error';
            }
            this.value = '';
            return;
        }
        const reader = new FileReader();
        reader.onload = function(ev) {
            if (modalAvatarPreview) {
                modalAvatarPreview.style.backgroundImage = `url(${ev.target.result})`;
                modalAvatarPreview.style.backgroundSize = 'cover';
                modalAvatarPreview.style.backgroundPosition = 'center';
                modalAvatarPreview.textContent = '';
            }
        };
        reader.readAsDataURL(file);
        selectedFile = file;
        if (avatarModalMsg) avatarModalMsg.classList.add('hidden');
    });
}
async function saveAvatar() {
    if (!selectedFile) { if (avatarModalMsg) { avatarModalMsg.classList.remove('hidden'); avatarModalMsg.textContent = '请选择图片'; } return; }
    if (!currentUser) return;
    const fileExt = selectedFile.name.split('.').pop();
    const fileName = `${currentUser.id}_${Date.now()}.${fileExt}`;
    const filePath = `public/${fileName}`;
    try {
        const { error } = await supabaseClient.storage.from(STORAGE_BUCKET).upload(filePath, selectedFile, { cacheControl: '3600' });
        if (error) throw error;
        const { data: urlData } = supabaseClient.storage.from(STORAGE_BUCKET).getPublicUrl(filePath);
        const avatarUrl = urlData.publicUrl;
        await supabaseClient.from('merchants').update({ avatar_url: avatarUrl }).eq('id', currentUser.id);
        currentUser.avatar_url = avatarUrl;
        updateAvatar(currentUser);
        if (avatarModalMsg) { avatarModalMsg.classList.remove('hidden'); avatarModalMsg.textContent = '✅ 头像已更新！'; avatarModalMsg.className = 'msg'; }
        setTimeout(() => { if (avatarModal) avatarModal.classList.remove('open'); }, 1000);
    } catch (e) {
        if (avatarModalMsg) { avatarModalMsg.classList.remove('hidden'); avatarModalMsg.textContent = '❌ ' + e.message; avatarModalMsg.className = 'msg error'; }
    }
}

// ========== Change Password ==========
function openPasswordModal() {
    if (!passwordModal) return;
    if (oldPasswordInput) oldPasswordInput.value = '';
    if (newPasswordInput) newPasswordInput.value = '';
    if (confirmPasswordInput) confirmPasswordInput.value = '';
    if (passwordModalMsg) { passwordModalMsg.classList.add('hidden'); passwordModalMsg.textContent = ''; }
    passwordModal.classList.add('open');
}
async function savePassword() {
    if (!oldPasswordInput || !newPasswordInput || !confirmPasswordInput) return;
    const old = oldPasswordInput.value.trim();
    const newPwd = newPasswordInput.value.trim();
    const confirm = confirmPasswordInput.value.trim();
    if (!old || !newPwd || !confirm) { if (passwordModalMsg) { passwordModalMsg.classList.remove('hidden'); passwordModalMsg.textContent = '请填写所有字段'; } return; }
    if (newPwd.length < 6) { if (passwordModalMsg) { passwordModalMsg.classList.remove('hidden'); passwordModalMsg.textContent = '新密码至少6位'; } return; }
    if (newPwd !== confirm) { if (passwordModalMsg) { passwordModalMsg.classList.remove('hidden'); passwordModalMsg.textContent = '两次密码不一致'; } return; }
    const hashedOld = hashPassword(old);
    if (hashedOld !== currentUser.password) { if (passwordModalMsg) { passwordModalMsg.classList.remove('hidden'); passwordModalMsg.textContent = '❌ 旧密码错误'; } return; }
    const hashedNew = hashPassword(newPwd);
    try {
        await supabaseClient.from('merchants').update({ password: hashedNew }).eq('id', currentUser.id);
        currentUser.password = hashedNew;
        if (passwordModalMsg) { passwordModalMsg.classList.remove('hidden'); passwordModalMsg.textContent = '✅ 密码已更改！'; passwordModalMsg.className = 'msg'; }
        setTimeout(() => { if (passwordModal) passwordModal.classList.remove('open'); }, 1000);
    } catch (e) {
        if (passwordModalMsg) { passwordModalMsg.classList.remove('hidden'); passwordModalMsg.textContent = '❌ ' + e.message; passwordModalMsg.className = 'msg error'; }
    }
}

function logout() {
    if (confirm('确定退出？')) {
        currentUser = null;
        if (dashboard) dashboard.classList.add('hidden');
        if (authCard) authCard.classList.remove('hidden');
        if (avatarWrapper) avatarWrapper.classList.remove('visible');
        if (phoneInput) phoneInput.value = '';
        if (passwordInput) passwordInput.value = '';
        if (nameInput) nameInput.value = '';
        if (authMsg) authMsg.classList.add('hidden');
        if (dropdownMenu) dropdownMenu.classList.remove('open');
        stageData = {};
        progressMap = {};
        timerIntervals = {};
        timerElapsed = {};
    }
}

// ========== Event Bindings ==========
if (authBtn) authBtn.addEventListener('click', handleAuth);
if (submitQuizBtn) submitQuizBtn.addEventListener('click', submitQuiz);
if (refreshBtn) refreshBtn.addEventListener('click', refreshUser);
if (avatarWrapper) {
    avatarWrapper.addEventListener('click', function(e) {
        e.stopPropagation();
        if (dropdownMenu) dropdownMenu.classList.toggle('open');
    });
}
document.addEventListener('click', function(e) {
    if (avatarWrapper && !avatarWrapper.contains(e.target)) {
        if (dropdownMenu) dropdownMenu.classList.remove('open');
    }
});
if (changeAvatarBtn) {
    changeAvatarBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        if (dropdownMenu) dropdownMenu.classList.remove('open');
        openAvatarModal();
    });
}
if (avatarCancelBtn) avatarCancelBtn.addEventListener('click', function() { if (avatarModal) avatarModal.classList.remove('open'); });
if (avatarSaveBtn) avatarSaveBtn.addEventListener('click', saveAvatar);
if (changePasswordBtn) {
    changePasswordBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        if (dropdownMenu) dropdownMenu.classList.remove('open');
        openPasswordModal();
    });
}
if (passwordCancelBtn) passwordCancelBtn.addEventListener('click', function() { if (passwordModal) passwordModal.classList.remove('open'); });
if (passwordSaveBtn) passwordSaveBtn.addEventListener('click', savePassword);
if (logoutBtn) {
    logoutBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        if (dropdownMenu) dropdownMenu.classList.remove('open');
        logout();
    });
}
if (detailCloseBtn) detailCloseBtn.addEventListener('click', closeDetailModal);
if (detailModal) {
    detailModal.addEventListener('click', function(e) {
        if (e.target === this) closeDetailModal();
    });
}
if (phoneInput) phoneInput.addEventListener('keyup', (e) => { if (e.key === 'Enter') handleAuth(); });
if (passwordInput) passwordInput.addEventListener('keyup', (e) => { if (e.key === 'Enter') handleAuth(); });
if (nameInput) nameInput.addEventListener('keyup', (e) => { if (e.key === 'Enter') handleAuth(); });

console.log('🐿️ 松鼠逛逛商家学堂 (最终稳定版)');