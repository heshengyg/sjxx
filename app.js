// =====================================================
// app.js - 松鼠逛逛商家学堂
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
const EXAM_STAGES = [2, 4, 5, 6];

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
let isRenderingQuiz = false;
let isDataPreloaded = false;
let allStageData = {};
let isSwitching = false;

// ========== ★ 新增：权益数据 ==========
let benefitsData = null;
let benefitsLoaded = false;

async function loadBenefits() {
    if (benefitsLoaded) return benefitsData;
    try {
        const resp = await fetch('benefits.json');
        if (!resp.ok) throw new Error('加载权益数据失败');
        const data = await resp.json();
        benefitsData = data;
        benefitsLoaded = true;
        return data;
    } catch (e) {
        console.warn('权益数据加载失败，使用默认数据', e);
        // 默认数据（防止页面空白）
        benefitsData = {
            total_value: 2883,
            stages: [
                { stage: 1, title: '第一阶段：认知破局', benefit: '解锁专属课程', value: 199 },
                { stage: 2, title: '第二阶段：方向定位', benefit: '等级标识+流量扶持', value: 299 },
                { stage: 3, title: '第三阶段：资源深挖', benefit: '资源对接+专属社群', value: 399 },
                { stage: 4, title: '第四阶段：平台认知', benefit: '进阶标识+数据分析', value: 499 },
                { stage: 5, title: '第五阶段：商家实操', benefit: '实操工具包+运营指导', value: 599 },
                { stage: 6, title: '第六阶段：运营进阶', benefit: '精英标识+学习礼包', value: 888 }
            ]
        };
        benefitsLoaded = true;
        return benefitsData;
    }
}

async function renderBenefitsTable() {
    const data = await loadBenefits();
    const tbody = document.getElementById('benefitsBody');
    if (!tbody) return;
    tbody.innerHTML = '';
    data.stages.forEach(s => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${s.title}</td>
            <td>${s.benefit}</td>
            <td class="benefit-value">¥${s.value}</td>
        `;
        tbody.appendChild(tr);
    });
    document.getElementById('totalValue').textContent = `¥${data.total_value}`;
}

function showBenefitsPopup() {
    const modal = document.getElementById('benefitsModal');
    const body = document.getElementById('benefitsModalBody');
    if (!modal || !body) return;

    // 若全部解锁，不再弹出（由调用处控制）
    const stages = currentUser ? currentUser.completed_stages || [] : [];
    const allUnlocked = stages.length >= TOTAL_STAGES;
    if (allUnlocked) {
        modal.classList.remove('open');
        return;
    }

    loadBenefits().then(data => {
        let html = '<div class="benefits-modal-body">';
        data.stages.forEach(s => {
            const unlocked = stages.includes(s.stage);
            const statusIcon = unlocked ? '✅' : '🔒';
            const statusClass = unlocked ? 'unlocked' : '';
            html += `
                <div class="benefits-modal-item ${statusClass}">
                    <div class="item-left">
                        <span class="item-status">${statusIcon}</span>
                        <span class="item-name">${s.title}</span>
                    </div>
                    <span class="item-value">${unlocked ? '已解锁' : '未解锁'} · ¥${s.value}</span>
                </div>
            `;
        });
        const progress = Math.round((stages.length / TOTAL_STAGES) * 100);
        html += `
            <div class="benefits-modal-progress">
                <div class="benefits-modal-progress-bar" style="width:${progress}%"></div>
            </div>
            <div class="benefits-modal-summary">
                <span>学习进度 ${stages.length}/${TOTAL_STAGES}</span>
                <span>当前等级：${currentUser ? getLevelFromStages(stages).label : '入门商家'}</span>
            </div>
        </div>
        `;
        body.innerHTML = html;
        modal.classList.add('open');
    });
}

function closeBenefitsPopup() {
    document.getElementById('benefitsModal').classList.remove('open');
}
// ========== ★ 新增结束 ==========

// DOM helpers
const $ = id => document.getElementById(id);
const authCard = $('authCard'), dashboard = $('dashboard');
const phoneInput = $('phoneInput'), passwordInput = $('passwordInput'), nameInput = $('nameInput');
const authBtn = $('authBtn'), authMsg = $('authMsg');
const shopNameDisplay = $('shopNameDisplay'), levelDisplay = $('levelDisplay');
const statusText = $('statusText'), progressFill = $('progressFill');
const stepLabel = $('stepLabel'), nextLevelLabel = $('nextLevelLabel');

const stageTitle = $('stageTitle'), stageDesc = $('stageDesc');

const studyHeaderTitle = $('studyHeaderTitle');
const studyHeaderDesc = $('studyHeaderDesc');
const studyHeaderProgress = $('studyHeaderProgress');
const studyContentTitle = $('studyContentTitle');
const studyContentDescription = $('studyContentDescription');
const studyContentProgress = $('studyContentProgress');

const resourcesContainer = $('resourcesContainer'), learnMsg = $('learnMsg');
const quizResult = $('quizResult'), refreshBtn = $('refreshBtn');
const stageList = $('stageList');
const stageListContent = $('stageListContent');
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
const loginProgressWrap = $('loginProgressWrap');
const loginProgressBar = $('loginProgressBar');
const loginProgressText = $('loginProgressText');

function getSubmitBtn() {
    return document.getElementById('submitQuizBtn');
}

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

// ========== 预加载所有阶段数据 ==========
async function preloadAllStages() {
    if (isDataPreloaded) return;
    console.log('🚀 开始预加载所有阶段数据...');
    const startTime = Date.now();
    const promises = [];
    for (let i = 1; i <= TOTAL_STAGES; i++) {
        promises.push(loadStageData(i, true));
    }
    await Promise.allSettled(promises);
    isDataPreloaded = true;
    console.log(`✅ 预加载完成，耗时 ${Date.now() - startTime}ms`);
}

// ========== Load JSON ==========
async function loadStageData(stage, isPreload = false) {
    if (stageData[stage]) return stageData[stage];
    try {
        const resp = await fetch(`data/stage${stage}.json`);
        if (!resp.ok) throw new Error(`加载阶段 ${stage} 失败`);
        const text = await resp.text();
        const data = JSON.parse(text);
        if (data.resources) {
            data.resources.forEach(r => {
                r.id = stage + '-' + r.id;
                if (r.type === 'image') {
                    r.duration = r.duration || 60;
                } else if (r.type === 'video') {
                    r.duration = 0;
                } else if (r.type === 'article') {
                    if (r.content) {
                        let text = r.content || '';
                        let plainText = text.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ');
                        const charCount = plainText.replace(/\s/g, '').length;
                        const minutes = charCount / 300;
                        const seconds = Math.ceil(minutes * 60);
                        r.duration = seconds > 0 ? seconds : 10;
                    } else {
                        r.duration = 60;
                    }
                }
            });
        }
        if (data.resources) {
            const videoPromises = data.resources
                .filter(r => r.type === 'video')
                .map(async (r) => {
                    r.duration = await getVideoDuration(r.file);
                });
            Promise.allSettled(videoPromises);
        }
        if (data.quiz) {
            data.quiz.forEach(q => {
                q.id = stage + '-' + q.id;
            });
        }
        stageData[stage] = data;
        allStageData[stage] = data;
        return data;
    } catch (e) {
        console.error('加载阶段数据失败:', e);
        return null;
    }
}

function getVideoDuration(url) {
    return new Promise((resolve) => {
        const video = document.createElement('video');
        video.preload = 'metadata';
        video.src = url;
        video.onloadedmetadata = function() {
            resolve(Math.round(video.duration));
            video.remove();
        };
        video.onerror = function() {
            resolve(120);
            video.remove();
        };
    });
}

// ========== 进度管理 ==========
function getProgressKey() {
    return 'progress_' + (currentUser ? currentUser.id : 'guest');
}

function loadProgressFromLocal() {
    const key = getProgressKey();
    try {
        const data = localStorage.getItem(key);
        if (data) {
            const parsed = JSON.parse(data);
            return parsed;
        }
    } catch (e) {
        console.warn('读取 localStorage 失败:', e);
    }
    return {};
}

function saveProgressToLocal(resourceId, progress, position, completed) {
    const key = getProgressKey();
    let data = loadProgressFromLocal();
    data[resourceId] = {
        progress_percent: Math.min(100, progress),
        completed: completed || false,
        last_position: position || 0
    };
    localStorage.setItem(key, JSON.stringify(data));
}

async function loadUserProgress() {
    progressMap = {};
    if (!currentUser) return;
    try {
        const { data, error } = await supabaseClient
            .from('user_learning_progress')
            .select('*')
            .eq('user_id', currentUser.id);
        if (!error && data) {
            data.forEach(p => {
                progressMap[p.resource_id] = {
                    progress: p.progress_percent || 0,
                    completed: p.completed || false,
                    last_position: p.last_position || 0
                };
            });
        }
    } catch (e) { console.warn('加载进度失败:', e); }
}
async function updateResourceProgress(resourceId, progress, position = 0) {
    if (!currentUser) return;
    if (!progressMap[resourceId]) {
        progressMap[resourceId] = { progress: 0, completed: false, last_position: 0 };
    }
    if (progress > progressMap[resourceId].progress) {
        progressMap[resourceId].progress = Math.min(100, progress);
    }
    // ★ 确保 position 为整数
    const intPos = Math.floor(position);
    if (intPos > progressMap[resourceId].last_position) {
        progressMap[resourceId].last_position = intPos;
    }
    if (progressMap[resourceId].progress >= 100) {
        progressMap[resourceId].completed = true;
        progressMap[resourceId].progress = 100;
    }
    try {
        await supabaseClient
            .from('user_learning_progress')
            .upsert({
                user_id: currentUser.id,
                resource_id: resourceId,
                progress_percent: progressMap[resourceId].progress,
                completed: progressMap[resourceId].completed,
                last_position: progressMap[resourceId].last_position,
                last_updated: new Date().toISOString()
            }, { onConflict: 'user_id, resource_id' });
    } catch (e) { console.warn('保存进度失败:', e); }
    renderCurrentStageResources();
    updateDetailProgress(resourceId);
}
async function markResourceCompleted(resourceId) {
    if (!currentUser) return;
    if (progressMap[resourceId] && progressMap[resourceId].completed) return;
    const curLastPos = progressMap[resourceId] ? progressMap[resourceId].last_position : 0;
    progressMap[resourceId] = { progress: 100, completed: true, last_position: curLastPos };
    // ★ 只保存到 Supabase
    try {
        await supabaseClient
            .from('user_learning_progress')
            .upsert({
                user_id: currentUser.id,
                resource_id: resourceId,
                progress_percent: 100,
                completed: true,
                last_position: curLastPos,
                last_updated: new Date().toISOString()
            }, { onConflict: 'user_id, resource_id' });
    } catch (e) {
        console.warn('标记资源完成失败:', e);
    }
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
        } else if (r.type === 'image') {
            thumb.innerHTML = '🖼️';
            thumb.style.display = 'flex';
            thumb.style.alignItems = 'center';
            thumb.style.justifyContent = 'center';
            thumb.style.fontSize = '36px';
            thumb.style.background = '#e8f0fe';
            thumb.style.color = '#4285f4';
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

// ========== 控制考核区域显示 ==========
function controlQuizAreaVisibility(stageId) {
    const isExamStage = EXAM_STAGES.includes(stageId);
    if (!isExamStage) {
        const quizHeaders = ['quizTitleHeader', 'singleHeader', 'multipleHeader', 'judgeHeader'];
        const quizBodies = ['singleContainer', 'multipleContainer', 'judgeContainer'];
        const footer = document.getElementById('quizFooterGlobal');
        quizHeaders.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = 'none';
        });
        quizBodies.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = 'none';
        });
        if (footer) footer.style.display = 'none';
    }
}

// ========== 更新提交按钮状态 ==========
function updateSubmitButtonState() {
    const submitBtn = document.getElementById('submitQuizBtn');
    if (!submitBtn) return;
    const isExamStage = EXAM_STAGES.includes(currentViewStage);
    if (!isExamStage || questionStates.length === 0) {
        submitBtn.style.display = 'none';
        return;
    }
    submitBtn.style.display = '';
    const allConfirmed = questionStates.every(s => s && s.confirmed === true);
    if (allConfirmed) {
        submitBtn.disabled = false;
        submitBtn.textContent = '✅ 提交考核';
    } else {
        submitBtn.disabled = true;
        submitBtn.textContent = '📝 请先确认所有答案';
    }
}

// ========== 保存答题状态 ==========
async function saveQuizStateToSupabase() {
    if (!currentUser) return;
    if (questionStates.length === 0) return;
    try {
        const stateToSave = questionStates.map(s => ({
            confirmed: s.confirmed || false,
            selected: s.selected ? [...s.selected] : []
        }));
        const { error } = await supabaseClient
            .from('user_quiz_state')
            .upsert({
                user_id: currentUser.id,
                stage_id: currentViewStage,
                quiz_state: { questionStates: stateToSave },
                updated_at: new Date().toISOString()
            }, { onConflict: 'user_id, stage_id' });
        if (error) console.warn('保存答题状态失败:', error);
    } catch (e) {
        console.warn('保存答题状态异常:', e);
    }
}

async function loadQuizStateFromSupabase(stageId) {
    if (!currentUser) return null;
    try {
        const { data, error } = await supabaseClient
            .from('user_quiz_state')
            .select('quiz_state')
            .eq('user_id', currentUser.id)
            .eq('stage_id', stageId)
            .maybeSingle();
        if (!error && data && data.quiz_state) {
            return data.quiz_state;
        }
    } catch (e) {
        console.warn('加载答题状态异常:', e);
    }
    return null;
}

// ========== renderQuiz ==========
async function renderQuiz(quiz) {
    const isExamStage = EXAM_STAGES.includes(currentViewStage);

    // DOM 元素
    const singleContainer = document.getElementById('singleContainer');
    const multipleContainer = document.getElementById('multipleContainer');
    const judgeContainer = document.getElementById('judgeContainer');
    const singleHeader = document.getElementById('singleHeader');
    const multipleHeader = document.getElementById('multipleHeader');
    const judgeHeader = document.getElementById('judgeHeader');
    const quizTitleHeader = document.getElementById('quizTitleHeader');
    const quizFooterGlobal = document.getElementById('quizFooterGlobal');
    const submitBtn = document.getElementById('submitQuizBtn');
// 获取帘头中的分数显示元素（用于设置分数）
const singleScoreEl = document.getElementById('singleScore');
const multipleScoreEl = document.getElementById('multipleScore');
const judgeScoreEl = document.getElementById('judgeScore');

    // 内容标题元素
    const quizContentTitle = document.getElementById('quizContentTitle');
    const quizSingleTitle = document.getElementById('quizSingleTitle');
    const quizSingleScoreText = document.getElementById('quizSingleScoreText');
    const quizMultipleTitle = document.getElementById('quizMultipleTitle');
    const quizMultipleScoreText = document.getElementById('quizMultipleScoreText');
    const quizJudgeTitle = document.getElementById('quizJudgeTitle');
    const quizJudgeScoreText = document.getElementById('quizJudgeScoreText');

    // 先全部隐藏（包括内容标题和帘头）
    [singleHeader, multipleHeader, judgeHeader, quizTitleHeader, quizFooterGlobal].forEach(el => {
        if (el) el.style.display = 'none';
    });
    [singleContainer, multipleContainer, judgeContainer].forEach(el => {
        if (el) { el.innerHTML = ''; el.style.display = 'none'; }
    });
    // 隐藏内容标题
    [quizContentTitle, quizSingleTitle, quizMultipleTitle, quizJudgeTitle].forEach(el => {
        if (el) el.style.display = 'none';
    });

    if (!isExamStage || !quiz || quiz.length === 0) {
        return;
    }

    const groups = {
        single: { label: '一、单选题', items: [], totalScore: 0, container: singleContainer, header: singleHeader, titleEl: quizSingleTitle, scoreTextEl: quizSingleScoreText },
        multiple: { label: '二、多选题', items: [], totalScore: 0, container: multipleContainer, header: multipleHeader, titleEl: quizMultipleTitle, scoreTextEl: quizMultipleScoreText },
        judge: { label: '三、判断题', items: [], totalScore: 0, container: judgeContainer, header: judgeHeader, titleEl: quizJudgeTitle, scoreTextEl: quizJudgeScoreText }
    };

    quiz.forEach(q => {
        const type = q.type || 'single';
        if (groups[type]) {
            groups[type].items.push(q);
            groups[type].totalScore += (q.score || 0);
        } else {
            groups.single.items.push(q);
            groups.single.totalScore += (q.score || 0);
        }
    });

    const hasAnyQuiz = groups.single.items.length > 0 || groups.multiple.items.length > 0 || groups.judge.items.length > 0;
    if (!hasAnyQuiz) return;

    // ★ 只显示考核总标题（内容标题，不是帘头）
    if (quizContentTitle) quizContentTitle.style.display = 'block';

        // 初始化 questionStates：优先从 Supabase 加载已保存状态
    let savedState = null;
    if (currentUser && isExamStage && quiz && quiz.length > 0) {
        savedState = await loadQuizStateFromSupabase(currentViewStage);
    }
    if (savedState && savedState.questionStates && savedState.questionStates.length === quiz.length) {
        // 确保每个状态都有 selected 和 confirmed 字段
        questionStates = savedState.questionStates.map(s => ({
            selected: s.selected || [],
            confirmed: s.confirmed || false
        }));
    } else {
        questionStates = quiz.map(() => ({ confirmed: false, selected: [] }));
    }


    // 渲染各题型
    for (const [type, group] of Object.entries(groups)) {
    if (group.items.length === 0) continue;

    // 计算分数文本（内容标题和帘头共用）
    const perScore = group.totalScore / group.items.length;
    const scoreText = `每题${perScore}分，共${group.totalScore}分`;

    // 显示内容标题
    if (group.titleEl) {
        group.titleEl.style.display = 'block';
        if (group.scoreTextEl) {
            group.scoreTextEl.textContent = scoreText;
        }
    }

    // ★ 更新对应的帘头分数（关键新增）
    if (type === 'single' && singleScoreEl) {
        singleScoreEl.textContent = scoreText;
    } else if (type === 'multiple' && multipleScoreEl) {
        multipleScoreEl.textContent = scoreText;
    } else if (type === 'judge' && judgeScoreEl) {
        judgeScoreEl.textContent = scoreText;
    }

    // 显示题型容器
    const container = group.container;
    if (!container) continue;
    container.style.display = 'block';

        // 渲染题目（保持原有逻辑不变）
        group.items.forEach((q, localIdx) => {
            const globalIdx = quiz.indexOf(q);
            const wrapper = document.createElement('div');
            wrapper.className = 'quiz-item';
            wrapper.dataset.idx = globalIdx;

            const state = questionStates[globalIdx] || { confirmed: false, selected: [] };
            const isConfirmed = state.confirmed || false;
            const selectedValues = state.selected || [];

            if (isConfirmed) {
                wrapper.classList.add('confirmed');
            }

            const qText = document.createElement('div');
            qText.className = 'q-text';
            qText.textContent = `${localIdx + 1}. ${q.question}`;
            wrapper.appendChild(qText);

            const optionsDiv = document.createElement('div');
            optionsDiv.className = 'options';
            const isMultiple = (q.type === 'multiple');

            q.options.forEach((optText, optIdx) => {
                const label = document.createElement('label');
                label.className = 'option-item';
                const input = document.createElement('input');
                input.type = isMultiple ? 'checkbox' : 'radio';
                input.name = `q${globalIdx}`;
                input.value = optIdx;
                if (selectedValues.includes(optIdx)) {
                    input.checked = true;
                }
                if (isConfirmed) {
                    input.disabled = true;
                }
                const span = document.createElement('span');
                span.textContent = optText;
                label.appendChild(input);
                label.appendChild(span);
                optionsDiv.appendChild(label);

                input.addEventListener('change', function() {
                    if (questionStates[globalIdx].confirmed) { this.checked = false; return; }
                    const sel = questionStates[globalIdx].selected;
                    if (isMultiple) {
                        if (this.checked) { if (!sel.includes(optIdx)) sel.push(optIdx); }
                        else { const pos = sel.indexOf(optIdx); if (pos !== -1) sel.splice(pos, 1); }
                    } else {
                        if (this.checked) { sel.length = 0; sel.push(optIdx); }
                        else { const pos = sel.indexOf(optIdx); if (pos !== -1) sel.splice(pos, 1); }
                    }
                    saveQuizStateToSupabase();
                    updateSubmitButtonState();
                });
            });
            wrapper.appendChild(optionsDiv);

            const btnDiv = document.createElement('div');
            const confirmBtn = document.createElement('button');
            confirmBtn.className = 'confirm-btn';
            confirmBtn.textContent = isConfirmed ? '修改答案' : '确认答案';
            if (isConfirmed) {
                confirmBtn.classList.add('modify');
                const badge = document.createElement('span');
                badge.className = 'status-badge';
                badge.textContent = '✅ 已确认';
                btnDiv.appendChild(badge);
            }
            confirmBtn.addEventListener('click', async function() {
                const state = questionStates[globalIdx];
                if (!state) {
                    questionStates[globalIdx] = { confirmed: false, selected: [] };
                }
                const currentState = questionStates[globalIdx];

                if (!currentState.confirmed) {
                    if (currentState.selected.length === 0) { alert('请选择选项'); return; }
                    currentState.confirmed = true;
                    wrapper.querySelectorAll('input').forEach(inp => inp.disabled = true);
                    wrapper.classList.add('confirmed');
                    this.textContent = '修改答案';
                    this.classList.add('modify');
                    const badge = document.createElement('span');
                    badge.className = 'status-badge';
                    badge.textContent = '✅ 已确认';
                    this.parentNode.appendChild(badge);
                } else {
                    currentState.confirmed = false;
                    wrapper.querySelectorAll('input').forEach(inp => inp.disabled = false);
                    wrapper.classList.remove('confirmed');
                    this.textContent = '确认答案';
                    this.classList.remove('modify');
                    const badge = wrapper.querySelector('.status-badge');
                    if (badge) badge.remove();
                }
                await saveQuizStateToSupabase();
                updateSubmitButtonState();
            });
            btnDiv.appendChild(confirmBtn);
            wrapper.appendChild(btnDiv);

            container.appendChild(wrapper);
        });
    }

    // 强制显示容器（不操作帘头）
    [singleContainer, multipleContainer, judgeContainer].forEach(el => {
        if (el) el.style.display = 'block';
    });
    if (quizFooterGlobal) quizFooterGlobal.style.display = 'block';
    if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = '✅ 提交考核';
    }

    // ★ 确保内容标题重新显示
    if (quizContentTitle) quizContentTitle.style.display = 'block';
    if (groups.single.items.length > 0 && quizSingleTitle) quizSingleTitle.style.display = 'block';
    if (groups.multiple.items.length > 0 && quizMultipleTitle) quizMultipleTitle.style.display = 'block';
    if (groups.judge.items.length > 0 && quizJudgeTitle) quizJudgeTitle.style.display = 'block';

    // ★ 重置帘头内联样式，让 CSS 控制显示
    [singleHeader, multipleHeader, judgeHeader, quizTitleHeader].forEach(el => {
        if (el) el.style.display = '';
    });

    updateSubmitButtonState();
}

// ========== Resource Detail Modal ==========
let currentVideoElement = null;

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
    video.preload = 'metadata';

    let savedPosition = 0;
    const prog = progressMap[resource.id];
    if (prog && prog.last_position && !prog.completed) {
        savedPosition = prog.last_position;
    }

    let lastValidTime = savedPosition; // 最大可观看时间
    let initialSeek = false;

    // 加载完成后定位
    video.addEventListener('loadedmetadata', function() {
        if (savedPosition > 0 && savedPosition < video.duration - 0.5) {
            initialSeek = true;
            video.currentTime = savedPosition;
            const onSeeked = function() {
                initialSeek = false;
                video.removeEventListener('seeked', onSeeked);
            };
            video.addEventListener('seeked', onSeeked);
            lastValidTime = savedPosition;
            this._lastValidTime = savedPosition;
        }
        updateDetailProgress(resource.id);
    });

    let saveTimer = null;
    function updateAndSave() {
        if (!video.duration) return;
        const pos = lastValidTime;
        const pct = Math.round((pos / video.duration) * 100);
        updateResourceProgress(resource.id, pct, pos);
        updateDetailProgress(resource.id);
    }

    // timeupdate：只增加最大时间
    video.addEventListener('timeupdate', function() {
        if (!initialSeek) {
            if (video.currentTime > lastValidTime) {
                lastValidTime = video.currentTime;
            }
            this._lastValidTime = lastValidTime;
        }
        const pct = Math.round((video.currentTime / video.duration) * 100);
        if (detailProgress) detailProgress.textContent = `学习进度：${pct}%`;

        if (!saveTimer) {
            saveTimer = setTimeout(() => {
                updateAndSave();
                saveTimer = null;
            }, 3000);
        }

        // 播放中越界立即修正（防止意外）
        if (!initialSeek && lastValidTime > 0) {
            if (video.currentTime > lastValidTime + 0.5) {
                video.currentTime = lastValidTime;
                video.pause();
            }
        }
    });

    // ★ 处理 seeking：提前拦截越界
    video.addEventListener('seeking', function() {
        if (initialSeek) return;

        if (progressMap[resource.id] && progressMap[resource.id].completed) {
            lastValidTime = video.duration;
            this._lastValidTime = video.duration;
            return;
        }

        const targetTime = video.currentTime;
        if (targetTime > lastValidTime + 0.5) {
            // 直接修正，并设置一个标志告诉 seeked 不要重复修正
            video.currentTime = lastValidTime;
            video.pause();
        }
    });

    // ★ 核心：seeked 最终检查（无论何种方式都强制执行）
    video.addEventListener('seeked', function() {
        if (initialSeek) return;

        if (progressMap[resource.id] && progressMap[resource.id].completed) {
            lastValidTime = video.duration;
            this._lastValidTime = video.duration;
            return;
        }

        // ★ 最终修正：如果当前位置仍然越界，强制拉回
        if (video.currentTime > lastValidTime + 0.5) {
            video.currentTime = lastValidTime;
            video.pause();
        }
    });

    video.addEventListener('ended', function() {
        if (this._lastValidTime < video.duration - 1) {
            video.currentTime = this._lastValidTime;
            video.pause();
            return;
        }
        this._lastValidTime = video.duration;
        lastValidTime = video.duration;
        if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
        markResourceCompleted(resource.id);
    });

    video.addEventListener('click', function() {
        if (video.paused) {
            video.play();
        } else {
            video.pause();
        }
    });

    detailBody.appendChild(video);
    currentVideoElement = video;
    video.play().catch(e => {
        if (e.name !== 'AbortError') console.warn('视频自动播放被阻止:', e);
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
        updateDetailProgress(resource.id); // ★ 立即显示当前进度
    } else if (resource.type === 'article') {
        const div = document.createElement('div');
        div.className = 'article-content';
        div.innerHTML = resource.content || '暂无内容';
        detailBody.appendChild(div);
        activeResourceId = resource.id;
        startTimer(resource.id, resource.duration);
        updateDetailProgress(resource.id); // ★ 立即显示当前进度
    }

    detailModal.classList.add('open');
    updateDetailProgress(resource.id);
}

function closeDetailModal() {
    if (!detailModal) return;
    detailModal.classList.remove('open');

    if (currentVideoElement) {
        const safePos = Math.floor(currentVideoElement._lastValidTime || 0);
        currentVideoElement.pause();
        if (currentVideoElement.duration) {
            const pct = Math.round((safePos / currentVideoElement.duration) * 100);
            updateResourceProgress(activeResourceId, pct, safePos);
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
    // 已有计时器或已完成，直接返回
    if (timerIntervals[resourceId]) {
        console.log(`⏱️ 计时器已存在，跳过: ${resourceId}`);
        return;
    }
    const prog = progressMap[resourceId];
    if (prog && prog.completed) {
        console.log(`✅ 资源已完成，跳过: ${resourceId}`);
        return;
    }

    // 确保 duration 为正数
    if (typeof duration !== 'number' || duration <= 0 || isNaN(duration)) {
        console.warn(`⚠️ duration 无效 (${duration})，强制设为 60 秒，资源: ${resourceId}`);
        duration = 60;
    }

    // ★ 从已有进度计算已用时间（若进度为0则从0开始）
    let elapsed = 0;
    if (prog && prog.progress > 0 && prog.progress < 100) {
        elapsed = Math.floor((prog.progress / 100) * duration);
    }
    timerElapsed[resourceId] = elapsed;

    console.log(`▶️ 启动计时器: ${resourceId}，总时长 ${duration} 秒，起始进度 ${prog ? prog.progress : 0}%`);

    const interval = setInterval(() => {
        timerElapsed[resourceId] += 1;
        const elapsedNow = timerElapsed[resourceId];
        const progress = Math.min(100, Math.round((elapsedNow / duration) * 100));
        console.log(`📈 进度更新: ${resourceId}，已过 ${elapsedNow}s，进度 ${progress}%`);
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

// ========== 阶段进度 ==========
function renderCurrentStageResources() {
    const data = stageData[currentViewStage];
    if (data) {
        renderResources(currentViewStage, data.resources);
        updateStageProgress(currentViewStage, data.resources);
    }
}

function updateStageProgress(stage, resources) {
    if (!studyHeaderProgress) return;
    if (!resources) {
        if (studyHeaderProgress) studyHeaderProgress.innerHTML = '';
        if (studyContentProgress) studyContentProgress.innerHTML = '';
        if (stageDesc) stageDesc.innerHTML = '';
        return;
    }
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
    const progressText = `资源完成：${completedCount}/${total}  |  已学 ${formatTime(elapsed)}  /  总需 ${formatTime(totalDuration)}  |  剩余 ${formatTime(remaining)}`;

    if (studyHeaderProgress) studyHeaderProgress.innerHTML = progressText;
    if (studyContentProgress) studyContentProgress.innerHTML = progressText;
    if (stageDesc) stageDesc.innerHTML = progressText;
}

// ========== submitQuiz ==========
async function submitQuiz() {
    if (!currentUser) return;
    const stages = currentUser.completed_stages || [];
    const actualStage = getCurrentStage(stages);

    if (currentViewStage !== actualStage || actualStage > TOTAL_STAGES) {
        if (quizResult) {
            quizResult.classList.remove('hidden');
            quizResult.textContent = '⚠️ 只能提交当前阶段的考核。';
            quizResult.className = 'msg error';
        }
        return;
    }

    const data = stageData[actualStage];
    if (!data || !data.quiz || data.quiz.length === 0) {
        if (quizResult) {
            quizResult.classList.remove('hidden');
            quizResult.textContent = '本阶段无考核，无需提交。';
            quizResult.className = 'msg error';
        }
        return;
    }

    const resources = data.resources || [];
    const allCompleted = resources.every(r => progressMap[r.id] && progressMap[r.id].completed);
    if (!allCompleted) {
        if (quizResult) {
            quizResult.classList.remove('hidden');
            quizResult.textContent = '⚠️ 请先完成本阶段所有学习资源再提交考核。';
            quizResult.className = 'msg error';
        }
        return;
    }

    const allConfirmed = questionStates.every(s => s && s.confirmed === true);
    if (!allConfirmed) {
        if (quizResult) {
            quizResult.classList.remove('hidden');
            quizResult.textContent = '⚠️ 请先确认每道题的答案。';
            quizResult.className = 'msg error';
        }
        return;
    }

    let totalScore = 0;
    let earnedScore = 0;
    data.quiz.forEach((q, idx) => {
        totalScore += (q.score || 0);
        const selected = questionStates[idx] ? questionStates[idx].selected || [] : [];
        const sortedSelected = [...selected].sort();
        const sortedCorrect = (q.correct || []).sort();
        if (JSON.stringify(sortedSelected) === JSON.stringify(sortedCorrect)) {
            earnedScore += (q.score || 0);
        }
    });

    const scorePercent = Math.round((earnedScore / totalScore) * 100);
    const passThreshold = Math.round(totalScore * 0.8);
    const passed = earnedScore >= passThreshold;

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
                
                // 刷新仪表盘
                await updateDashboard(currentUser);
                // 显示晋级消息（延迟确保 updateDashboard 已完成）
                setTimeout(() => {
                    if (quizResult) {
                        quizResult.classList.remove('hidden');
                        quizResult.textContent = `🎉 考核通过！得分 ${earnedScore}/${totalScore}，已晋级！${nextStage <= TOTAL_STAGES ? '进入下一阶段' : '全部完成！'}`;
                        quizResult.className = 'msg';
                    }
                }, 100);
                return;
            } else {
                // 已标记过，仍显示通过
                await updateDashboard(currentUser);
                setTimeout(() => {
                    if (quizResult) {
                        quizResult.classList.remove('hidden');
                        quizResult.textContent = `✅ 考核通过！得分 ${earnedScore}/${totalScore}，阶段已标记完成。`;
                        quizResult.className = 'msg';
                    }
                }, 100);
                return;
            }
        } else {
            // 未通过
            await updateDashboard(currentUser);
            setTimeout(() => {
                if (quizResult) {
                    quizResult.classList.remove('hidden');
                    quizResult.textContent = `目前答卷${earnedScore}分，未满足晋级条件，请修改答卷！\n满分${totalScore}分，及格${passThreshold}分`;
                    quizResult.className = 'msg error';
                }
            }, 100);
            return;
        }
    } catch (e) {
        if (quizResult) {
            quizResult.classList.remove('hidden');
            quizResult.textContent = '❌ ' + e.message;
            quizResult.className = 'msg error';
        }
    }
}

// ========== 生成阶段卡片 ==========
function buildStageCards(container, currentStage, maxUnlocked) {
    if (!container) return;
    container.innerHTML = '';
    for (let i = 1; i <= TOTAL_STAGES; i++) {
        const card = document.createElement('div');
        card.className = 'stage-card';
        if (i === currentStage) card.classList.add('active');
        const isUnlocked = (i <= maxUnlocked + 1);
        if (!isUnlocked) {
            card.classList.add('locked');
            card.style.cursor = 'not-allowed';
        } else {
            card.addEventListener('click', function() {
                if (i !== currentViewStage) {
                    if (allStageData[i] || stageData[i]) {
                        switchStageSync(i);
                    } else {
                        currentViewStage = i;
                        (async () => {
                            const d = await loadStageData(currentViewStage);
                            if (d) {
                                updateStageUI(d);
                                document.querySelectorAll('.stage-card').forEach(c => c.classList.remove('active'));
                                card.classList.add('active');
                            }
                        })();
                    }
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

        container.appendChild(card);
    }
}

// ========== 更新阶段 UI ==========
async function updateStageUI(data) {
    if (!data) return;
    if (studyHeaderTitle) studyHeaderTitle.textContent = `📘 ${data.title}`;
    if (studyHeaderDesc) studyHeaderDesc.textContent = data.description || '';
    if (studyContentTitle) studyContentTitle.textContent = `📘 ${data.title}`;
    if (studyContentDescription) studyContentDescription.textContent = data.description || '';
    if (stageTitle) stageTitle.textContent = `📘 ${data.title}`;
    if (stageDesc) stageDesc.textContent = data.description || '';
    renderResources(currentViewStage, data.resources);
    controlQuizAreaVisibility(currentViewStage);
    await renderQuiz(data.quiz);
    updateStageProgress(currentViewStage, data.resources);
}
// ========== 快速切换阶段 ==========
async function switchStageSync(stageId) {
    if (isSwitching) return;
    isSwitching = true;

    let data = allStageData[stageId] || stageData[stageId];
    if (!data) {
        // 尝试重新加载该阶段数据
        console.warn(`阶段 ${stageId} 数据不存在，尝试重新加载...`);
        data = await loadStageData(stageId);
        if (!data) {
            isSwitching = false;
            alert(`阶段 ${stageId} 数据加载失败，请检查网络或刷新页面重试。`);
            return;
        }
    }

    currentViewStage = stageId;
    await updateStageUI(data);

    // 更新所有阶段卡片的激活状态（帘头和内容区）
    document.querySelectorAll('.stage-card').forEach(c => c.classList.remove('active'));
    const cards = document.querySelectorAll('.stage-card');
    if (cards[stageId - 1]) cards[stageId - 1].classList.add('active');
    const contentCards = document.querySelectorAll('#stageListContent .stage-card');
    if (contentCards[stageId - 1]) contentCards[stageId - 1].classList.add('active');

    isSwitching = false;

    // 重置帘头滚动控制
    setTimeout(() => {
        isHeaderInitialized = false;
        initStickyHeaders();
    }, 100);
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

    await loadUserProgress();

    const data = await loadStageData(currentViewStage);
    if (data) {
        await updateStageUI(data);
    } else {
        if (stageTitle) stageTitle.textContent = `📘 第${currentViewStage}阶段`;
        if (stageDesc) stageDesc.textContent = '数据加载失败，请检查网络或JSON文件。';
        if (resourcesContainer) resourcesContainer.innerHTML = '<p>❌ 无法加载阶段数据。</p>';
    }

    const maxUnlocked = stages.length > 0 ? Math.max(...stages) : 0;
    buildStageCards(stageList, currentViewStage, maxUnlocked);
    buildStageCards(stageListContent, currentViewStage, maxUnlocked);

    updateAvatar(user);
    if (avatarWrapper) avatarWrapper.classList.add('visible');
    if (learnMsg) learnMsg.classList.add('hidden');
    if (quizResult) quizResult.classList.add('hidden');

    if (!isDataPreloaded) {
        setTimeout(preloadAllStages, 800);
    }

    initStickyControl();

    // ========== ★ 新增：权益弹窗逻辑 ==========
    // 仅在未全部解锁时弹出（每次登录都弹出）
    if (stages.length < TOTAL_STAGES) {
        setTimeout(() => {
            showBenefitsPopup();
        }, 800);
    }
}

// ========== Auth ==========
async function handleAuth() {
    if (!phoneInput || !passwordInput || !nameInput) return;
    const phone = phoneInput.value.trim();
    const password = passwordInput.value.trim();
    const name = nameInput.value.trim();
    if (!phone) { showAuthMsg('请输入手机号'); return; }
    if (!password || password.length < 6) { showAuthMsg('密码至少6位'); return; }

    if (loginProgressWrap) {
        loginProgressWrap.classList.remove('hidden');
        loginProgressWrap.style.display = 'block';
    }
    if (authBtn) {
        authBtn.disabled = true;
        authBtn.textContent = '⏳ 登录中...';
        authBtn.style.opacity = '0.7';
    }

    let progress = 0;
    const progressInterval = setInterval(() => {
        if (progress < 90) {
            progress += Math.random() * 8 + 2;
            if (progress > 90) progress = 90;
            updateLoginProgress(progress);
        }
    }, 200);

    const hashed = hashPassword(password);
    try {
        let { data: existing, error } = await supabaseClient
            .from('merchants')
            .select('*')
            .eq('phone', phone)
            .maybeSingle();
        if (error && error.code !== 'PGRST116') throw error;

        updateLoginProgress(95);

        if (existing) {
            if (existing.password !== hashed) {
                showAuthMsg('❌ 密码错误');
                clearInterval(progressInterval);
                resetLoginButton();
                return;
            }
            currentUser = existing;
            if (authCard) authCard.classList.add('hidden');
            if (dashboard) dashboard.classList.remove('hidden');
            const stages = existing.completed_stages || [];
            currentViewStage = getCurrentStage(stages);
            if (currentViewStage > TOTAL_STAGES) currentViewStage = TOTAL_STAGES;
            await updateDashboard(currentUser);
            showAuthMsg(`欢迎回来，${existing.name}`, false);

            setTimeout(preloadAllStages, 500);

            updateLoginProgress(100);
            setTimeout(() => {
                resetLoginButton();
                if (loginProgressWrap) loginProgressWrap.classList.add('hidden');
            }, 500);

        } else {
            if (!name) {
                showAuthMsg('请填写店铺名称');
                clearInterval(progressInterval);
                resetLoginButton();
                return;
            }
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

            setTimeout(preloadAllStages, 500);

            updateLoginProgress(100);
            setTimeout(() => {
                resetLoginButton();
                if (loginProgressWrap) loginProgressWrap.classList.add('hidden');
            }, 500);
        }
        clearInterval(progressInterval);
    } catch (e) {
        showAuthMsg('❌ ' + e.message);
        console.error(e);
        clearInterval(progressInterval);
        resetLoginButton();
    }
}

function updateLoginProgress(value) {
    const val = Math.min(100, Math.round(value));
    if (loginProgressBar) loginProgressBar.style.width = val + '%';
    if (loginProgressText) loginProgressText.textContent = val + '%';
}

function resetLoginButton() {
    if (authBtn) {
        authBtn.disabled = false;
        authBtn.textContent = '注册 / 登录';
        authBtn.style.opacity = '1';
    }
    if (loginProgressWrap) {
        loginProgressWrap.style.display = 'none';
        loginProgressWrap.classList.add('hidden');
    }
    if (loginProgressBar) loginProgressBar.style.width = '0%';
    if (loginProgressText) loginProgressText.textContent = '0%';
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
        isDataPreloaded = false;
        allStageData = {};
    }
}

// ========== 帘头滚动切换 ==========
let headerSections = [];
let isHeaderInitialized = false;

function initStickyHeaders() {
    if (isHeaderInitialized) return;

    const headers = document.querySelectorAll('.sticky-header');
    const dashboard = document.getElementById('dashboard');
    if (!dashboard || headers.length === 0) return;

    headers.forEach(h => h.classList.remove('active'));

    const triggerMap = {
        'stageNavHeader': '.content-stage-nav .stage-nav label',
        'studyHeader': '#studyContent .study-content-header',
        'quizTitleHeader': '#quizContentTitle',
        'singleHeader': '#quizSingleTitle',
        'multipleHeader': '#quizMultipleTitle',
        'judgeHeader': '#quizJudgeTitle'
    };

    const scrollY = window.pageYOffset || document.documentElement.scrollTop;
    const headerList = [];

    // 收集每个帘头及其对应的触发元素（不检查可见性）
    const items = [];
    headers.forEach(header => {
        const selector = triggerMap[header.id];
        let triggerEl = null;
        if (selector) {
            triggerEl = document.querySelector(selector);
        }
        items.push({ header, triggerEl });
    });

    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (!item.triggerEl) {
            // 没有触发元素，永不触发
            headerList.push({
                el: item.header,
                start: Infinity,
                end: Infinity,
                id: item.header.id
            });
            continue;
        }

        const rect = item.triggerEl.getBoundingClientRect();
        // 提前量：标题高度 + 50px 余量（可根据需要调整）
        const start = rect.top + scrollY - rect.height ;

        // 结束位置：下一个触发元素的顶部，或 dashboard 底部
        let end = dashboard.scrollHeight;
        for (let j = i + 1; j < items.length; j++) {
            const next = items[j];
            if (next.triggerEl) {
                const nextRect = next.triggerEl.getBoundingClientRect();
                end = nextRect.top + scrollY;
                break;
            }
        }

        headerList.push({
            el: item.header,
            start: start,
            end: end,
            id: item.header.id
        });
    }

    headerSections = headerList;
    isHeaderInitialized = true;
    handleScroll();
}

function handleScroll() {
    if (!isHeaderInitialized || headerSections.length === 0) return;

    const scrollY = window.pageYOffset || document.documentElement.scrollTop;

    if (scrollY < 30) {
        headerSections.forEach(section => section.el.classList.remove('active'));
        return;
    }

    let activeIndex = -1;
    for (let i = 0; i < headerSections.length; i++) {
        const section = headerSections[i];
        if (scrollY >= section.start && scrollY < section.end) {
            activeIndex = i;
            break;
        }
    }

    if (activeIndex === -1) {
        const visibleSections = headerSections.filter(s => s.start !== Infinity);
        if (visibleSections.length > 0) {
            const last = visibleSections[visibleSections.length - 1];
            if (scrollY >= last.start) {
                activeIndex = headerSections.indexOf(last);
            }
        }
    }

    headerSections.forEach((section, index) => {
        if (index === activeIndex) {
            section.el.classList.add('active');
        } else {
            section.el.classList.remove('active');
        }
    });
}
function initStickyControl() {
    setTimeout(() => {
        initStickyHeaders();
        window.addEventListener('scroll', handleScroll);
        window.addEventListener('resize', () => {
            isHeaderInitialized = false;
            setTimeout(initStickyHeaders, 100);
        });
    }, 200);
}

// ========== Event Bindings ==========
if (authBtn) authBtn.addEventListener('click', handleAuth);
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

// ★ 提交考核按钮事件绑定
document.getElementById('submitQuizBtn').addEventListener('click', submitQuiz);

console.log('🐿️ 松鼠逛逛商家学堂');

// ========== ★ 新增：权益弹窗关闭事件绑定 ==========
document.getElementById('benefitsModalCloseBtn').addEventListener('click', closeBenefitsPopup);
document.getElementById('benefitsModal').addEventListener('click', function(e) {
    if (e.target === this) closeBenefitsPopup();
});

// ========== 浮动导航按钮控制 ==========
function initFloatNav() {
    const floatNav = document.getElementById('floatNav');
    const goTopBtn = document.getElementById('goTopBtn');
    const goBottomBtn = document.getElementById('goBottomBtn');
    const dashboard = document.getElementById('dashboard');

    if (!floatNav || !goTopBtn || !goBottomBtn || !dashboard) return;

    let isVisible = false;
    let hideTimeout = null;

    function handleScroll() {
        if (dashboard.classList.contains('hidden')) {
            floatNav.classList.remove('visible');
            return;
        }

        const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
        const windowHeight = window.innerHeight;

        if (scrollTop > windowHeight * 0.5) {
            floatNav.classList.add('visible');
            isVisible = true;
        } else {
            floatNav.classList.remove('visible');
            isVisible = false;
        }

        if (hideTimeout) clearTimeout(hideTimeout);
        hideTimeout = setTimeout(() => {
            if (isVisible) {
                floatNav.classList.remove('visible');
            }
        }, 4000);
    }

    window.addEventListener('scroll', handleScroll, { passive: true });

    goTopBtn.addEventListener('click', function() {
        window.scrollTo({ top: 0, behavior: 'smooth' });
        setTimeout(() => floatNav.classList.remove('visible'), 600);
    });

    goBottomBtn.addEventListener('click', function() {
        window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' });
        setTimeout(() => floatNav.classList.remove('visible'), 600);
    });
}

document.addEventListener('DOMContentLoaded', function() {
    // ★ 清除所有进度缓存（仅执行一次，之后不会再产生新缓存）
    Object.keys(localStorage).forEach(key => {
        if (key.startsWith('progress_')) {
            localStorage.removeItem(key);
            console.log('已清除缓存:', key);
        }
    });
    initFloatNav();
    renderBenefitsTable();

    // ========== ★ 新增：权益表格折叠切换 ==========
    const toggleBtn = document.getElementById('benefitsToggleBtn');
    const tableWrap = document.getElementById('benefitsTableWrap');
    if (toggleBtn && tableWrap) {
        let expanded = false;
        toggleBtn.addEventListener('click', function() {
            expanded = !expanded;
            tableWrap.classList.toggle('expanded', expanded);
            toggleBtn.textContent = expanded ? '▼ 收起权益详情' : '▶ 展开权益详情';

            // ★ 重新计算帘头位置（页面高度变化）
            isHeaderInitialized = false;
            setTimeout(function() {
                initStickyHeaders();
                handleScroll();
            }, 50);
        });
    }
});