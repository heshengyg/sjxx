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
const EXAM_STAGES = [1, 2, 3, 4, 5, 6]; // 所有阶段都有考核

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

// ========== 返回键拦截相关 ==========
let isLoggingOut = false;
let isProcessingPopState = false;

// ========== 权益数据 ==========
let benefitsData = null;
let benefitsLoaded = false;

async function loadBenefits() {
    if (benefitsLoaded) return benefitsData;
    try {
        const resp = await fetch('benefits.json');
        if (!resp.ok) throw new Error('加载权益数据失败');
        const data = await resp.json();
        var total = 0;
        if (data.stages && Array.isArray(data.stages)) {
            data.stages.forEach(function(s) {
                total += (s.value || 0);
            });
        }
        data.total_value = total;
        benefitsData = data;
        benefitsLoaded = true;
        return data;
    } catch (e) {
        console.warn('权益数据加载失败，使用默认数据', e);
        var defaultStages = [
            { stage: 1, title: '第一阶段：认知破局', benefit: '解锁专属课程', value: 199 },
            { stage: 2, title: '第二阶段：方向定位', benefit: '等级标识+流量扶持', value: 299 },
            { stage: 3, title: '第三阶段：资源深挖', benefit: '资源对接+专属社群', value: 399 },
            { stage: 4, title: '第四阶段：平台认知', benefit: '进阶标识+数据分析', value: 499 },
            { stage: 5, title: '第五阶段：商家实操', benefit: '实操工具包+运营指导', value: 599 },
            { stage: 6, title: '第六阶段：运营进阶', benefit: '精英标识+学习礼包', value: 888 }
        ];
        var defaultTotal = 0;
        defaultStages.forEach(function(s) { defaultTotal += s.value; });
        benefitsData = {
            total_value: defaultTotal,
            stages: defaultStages
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
    var total = 0;
    data.stages.forEach(function(s) {
        total += (s.value || 0);
        var tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${s.title}</td>
            <td>${s.benefit}</td>
            <td class="benefit-value">¥${s.value}</td>
        `;
        tbody.appendChild(tr);
    });
    document.getElementById('totalValue').textContent = '¥' + total;
}

function showBenefitsPopup() {
    const modal = document.getElementById('benefitsModal');
    const body = document.getElementById('benefitsModalBody');
    if (!modal || !body) return;

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

function saveRememberMe(phone, password) {
    const rememberMe = document.getElementById('rememberMe');
    if (rememberMe && rememberMe.checked) {
        localStorage.setItem('squirrel_phone', phone);
        localStorage.setItem('squirrel_pass', btoa(password));
    } else {
        localStorage.removeItem('squirrel_phone');
        localStorage.removeItem('squirrel_pass');
    }
}

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
const changeShopNameBtn = $('changeShopNameBtn');

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

// ========== markResourceCompleted ==========
async function markResourceCompleted(resourceId) {
    if (!currentUser) {
        console.error('❌ currentUser 为空');
        return;
    }
    
    const isAlreadyCompleted = progressMap[resourceId] && progressMap[resourceId].completed;
    if (isAlreadyCompleted) {
        console.log(`⏭️ 资源 ${resourceId} 已完成，检查是否全部完成...`);
        const data = stageData[currentViewStage];
        if (data && data.resources) {
            const allCompleted = data.resources.every(r => progressMap[r.id] && progressMap[r.id].completed);
            console.log(`📊 资源完成情况: ${allCompleted ? '全部完成 ✅' : '未全部完成'}`);
            if (allCompleted) {
                await handleAllResourcesCompleted(data);
            }
        }
        return;
    }
    
    const curLastPos = progressMap[resourceId] ? progressMap[resourceId].last_position : 0;
    progressMap[resourceId] = { progress: 100, completed: true, last_position: curLastPos };
    console.log(`✅ 标记资源 ${resourceId} 为已完成`);
    
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
        console.log(`✅ 资源 ${resourceId} 已保存到 Supabase`);
    } catch (e) {
        console.warn('标记资源完成失败:', e);
    }
    
    const data = stageData[currentViewStage];
    if (data && data.resources) {
        const allCompleted = data.resources.every(r => progressMap[r.id] && progressMap[r.id].completed);
        console.log(`📊 资源完成情况: ${allCompleted ? '全部完成 ✅' : '未全部完成'}`);
        if (allCompleted) {
            await handleAllResourcesCompleted(data);
            return;
        }
    }
    
    renderCurrentStageResources();
    updateDetailProgress(resourceId);
}

// ========== handleAllResourcesCompleted ==========
async function handleAllResourcesCompleted(data) {
    console.log(`🎉 阶段 ${currentViewStage} 所有资源已完成！`);
    
    if (learnMsg) {
        learnMsg.classList.remove('hidden');
        learnMsg.textContent = '🎉 本阶段所有学习资源已完成！';
    }
    
    const isExamStage = EXAM_STAGES.includes(currentViewStage);
    console.log(`📌 阶段 ${currentViewStage}, 是否有考核: ${isExamStage}`);
    
    if (!isExamStage) {
        console.log(`🚀 触发自动晋级 (阶段 ${currentViewStage})...`);
        await autoAdvanceStage(currentViewStage);
    } else {
        const isPassed = currentUser.completed_stages && currentUser.completed_stages.includes(currentViewStage);
        if (isPassed) {
            console.log(`📌 阶段 ${currentViewStage} 已通过考核，自动晋级`);
            await autoAdvanceStage(currentViewStage);
        } else {
            if (learnMsg) {
                learnMsg.textContent = '🎉 本阶段所有学习资源已完成，请完成考核以晋级！';
            }
            renderCurrentStageResources();
        }
    }
}

// ========== autoAdvanceStage ==========
async function autoAdvanceStage(stageId) {
    if (!currentUser) {
        console.error('❌ currentUser 为空');
        return;
    }
    
    const stages = currentUser.completed_stages || [];
    console.log(`🔍 当前 completed_stages:`, stages);
    console.log(`🔍 要晋级的阶段: ${stageId}`);
    
    if (stages.includes(stageId)) {
        console.log(`⏭️ 阶段 ${stageId} 已通过，无需重复晋级`);
        return;
    }
    
    const newStages = [...stages, stageId];
    console.log(`🚀 准备更新 completed_stages 为:`, newStages);
    
    try {
        console.log('📤 发送更新请求到 Supabase...');
        
        const { error: updateError } = await supabaseClient
            .from('merchants')
            .update({ completed_stages: newStages })
            .eq('id', currentUser.id);
        
        if (updateError) {
            console.error('❌ 更新失败:', updateError);
            throw updateError;
        }
        console.log('✅ completed_stages 更新成功');
        
        const newLevel = getLevelFromStages(newStages);
        if (newLevel.id !== currentUser.level) {
            const { error: levelError } = await supabaseClient
                .from('merchants')
                .update({ level: newLevel.id })
                .eq('id', currentUser.id);
            if (levelError) {
                console.warn('更新等级失败:', levelError);
            } else {
                console.log(`✅ 等级更新为: ${newLevel.id}`);
            }
        }
        
        const { data: refreshedUser, error: refreshError } = await supabaseClient
            .from('merchants')
            .select('*')
            .eq('id', currentUser.id)
            .single();
        
        if (refreshError) {
            console.error('刷新用户数据失败:', refreshError);
            currentUser.completed_stages = newStages;
            currentUser.level = newLevel.id;
        } else {
            currentUser = refreshedUser;
            console.log('✅ 用户数据已刷新');
            console.log(`✅ completed_stages 现在为:`, currentUser.completed_stages);
        }
        
        const nextStage = getCurrentStage(currentUser.completed_stages || []);
        console.log(`📌 下一阶段: ${nextStage}`);
        
        if (nextStage > TOTAL_STAGES) {
            console.log('🎉 已完成全部阶段');
            if (learnMsg) {
                learnMsg.classList.remove('hidden');
                learnMsg.textContent = '🎉 恭喜您已完成全部阶段！';
            }
            await updateDashboard(currentUser);
            return;
        }
        
        currentViewStage = nextStage;
        console.log(`✅ 当前视图阶段更新为: ${nextStage}`);
        
        if (learnMsg) {
            learnMsg.classList.remove('hidden');
            learnMsg.textContent = `🎉 恭喜完成第${stageId}阶段，已自动晋级至第${nextStage}阶段！`;
            learnMsg.className = 'msg';
        }
        
        await loadUserProgress();
        await updateDashboard(currentUser);
        
        setTimeout(() => {
            if (learnMsg) {
                learnMsg.classList.add('hidden');
            }
        }, 3000);
        
        if (quizResult) {
            quizResult.classList.add('hidden');
        }
        
        console.log(`✅ 晋级完成！当前阶段: ${currentViewStage}`);
        
    } catch (e) {
        console.error('❌ 自动晋级失败:', e);
        if (learnMsg) {
            learnMsg.classList.remove('hidden');
            learnMsg.textContent = '❌ 晋级失败: ' + e.message;
            learnMsg.className = 'msg error';
        }
    }
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

// ========== updateSubmitButtonState ==========
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
    
    var hasHistory = false;
    if (currentUser && currentUser.quiz_results) {
        var stageKey = 'stage_' + currentViewStage;
        var stageData = currentUser.quiz_results[stageKey] || {};
        hasHistory = !!(stageData.best || stageData.last);
    }
    
    if (allConfirmed) {
        submitBtn.disabled = false;
        if (hasHistory) {
            submitBtn.textContent = '🔄 重新提交';
        } else {
            submitBtn.textContent = '✅ 提交考核';
        }
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
    if (currentUser && currentUser.id) {
        try {
            const { data, error } = await supabaseClient
                .from('merchants')
                .select('*')
                .eq('id', currentUser.id)
                .single();
            if (!error && data) {
                if (data.quiz_results) {
                    currentUser.quiz_results = data.quiz_results;
                }
                currentUser.completed_stages = data.completed_stages || [];
                currentUser.level = data.level || 'beginner';
                console.log('🔄 renderQuiz 刷新用户数据成功');
            }
        } catch (e) {
            console.warn('renderQuiz 刷新用户数据失败:', e);
        }
    }
    const isExamStage = EXAM_STAGES.includes(currentViewStage);
    const singleContainer = document.getElementById('singleContainer');
    const multipleContainer = document.getElementById('multipleContainer');
    const judgeContainer = document.getElementById('judgeContainer');
    const singleHeader = document.getElementById('singleHeader');
    const multipleHeader = document.getElementById('multipleHeader');
    const judgeHeader = document.getElementById('judgeHeader');
    const quizTitleHeader = document.getElementById('quizTitleHeader');
    const quizFooterGlobal = document.getElementById('quizFooterGlobal');
    const submitBtn = document.getElementById('submitQuizBtn');
    const singleScoreEl = document.getElementById('singleScore');
    const multipleScoreEl = document.getElementById('multipleScore');
    const judgeScoreEl = document.getElementById('judgeScore');

    const quizContentTitle = document.getElementById('quizContentTitle');
    const quizSingleTitle = document.getElementById('quizSingleTitle');
    const quizSingleScoreText = document.getElementById('quizSingleScoreText');
    const quizMultipleTitle = document.getElementById('quizMultipleTitle');
    const quizMultipleScoreText = document.getElementById('quizMultipleScoreText');
    const quizJudgeTitle = document.getElementById('quizJudgeTitle');
    const quizJudgeScoreText = document.getElementById('quizJudgeScoreText');

    [singleHeader, multipleHeader, judgeHeader, quizTitleHeader, quizFooterGlobal].forEach(el => {
        if (el) el.style.display = 'none';
    });
    [singleContainer, multipleContainer, judgeContainer].forEach(el => {
        if (el) { el.innerHTML = ''; el.style.display = 'none'; }
    });
    [quizContentTitle, quizSingleTitle, quizMultipleTitle, quizJudgeTitle].forEach(el => {
        if (el) el.style.display = 'none';
    });

    const stageId = currentViewStage;
    let historyData = null;
    if (currentUser && currentUser.quiz_results) {
        const results = currentUser.quiz_results || {};
        const stageKey = `stage_${stageId}`;
        historyData = results[stageKey] || null;
    }

    if (quizResult) {
        if (historyData) {
            var rawData = historyData;
            var best = rawData.best || rawData;
            var last = rawData.last || rawData;
            var bestPassed = best.passed;
            var passThreshold = Math.round(best.total * 0.8);
            
            var displayMsg = '';
            displayMsg += (bestPassed ? '✅ 已通过' : '❌ 未通过') + '<br>';
            displayMsg += '📊 最后一次成绩：' + last.correct + '/' + last.total + '（达标分 ' + passThreshold + '）<br>';
            displayMsg += '🏆 历史最好成绩：' + best.correct + '/' + best.total;
            
            quizResult.classList.remove('hidden');
            quizResult.innerHTML = displayMsg;
            quizResult.className = bestPassed ? 'msg' : 'msg error';
        } else {
            quizResult.classList.add('hidden');
            quizResult.innerHTML = '';
            quizResult.className = 'msg hidden';
        }
    }

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

    let totalQuizScore = 0;
    ['single', 'multiple', 'judge'].forEach(key => {
        totalQuizScore += groups[key].totalScore || 0;
    });
    const passScore = Math.round(totalQuizScore * 0.8);

    const hasAnyQuiz = groups.single.items.length > 0 || groups.multiple.items.length > 0 || groups.judge.items.length > 0;
    if (!hasAnyQuiz) return;

    if (quizContentTitle) {
        quizContentTitle.style.display = 'block';
        const titleTextEl = quizContentTitle.querySelector('.title-text') || quizContentTitle;
        if (titleTextEl) {
            if (!titleTextEl.textContent.includes('共')) {
                titleTextEl.textContent = `阶段考核  共${totalQuizScore}分/达标${passScore}分`;
            }
        }
    }

    let savedState = null;
    if (currentUser && isExamStage && quiz && quiz.length > 0) {
        savedState = await loadQuizStateFromSupabase(currentViewStage);
    }
    if (savedState && savedState.questionStates && savedState.questionStates.length === quiz.length) {
        questionStates = savedState.questionStates.map(s => ({
            selected: s.selected || [],
            confirmed: s.confirmed || false
        }));
    } else {
        questionStates = quiz.map(() => ({ confirmed: false, selected: [] }));
    }

    for (const [type, group] of Object.entries(groups)) {
        if (group.items.length === 0) continue;

        const perScore = group.totalScore / group.items.length;
        const scoreText = `（每题${perScore}分，共${group.totalScore}分）`;

        if (group.titleEl) {
            group.titleEl.style.display = 'block';
            if (group.scoreTextEl) {
                group.scoreTextEl.textContent = scoreText;
                group.scoreTextEl.style.textAlign = 'right';
                group.scoreTextEl.style.float = 'right';
            }
        }

        if (type === 'single' && singleScoreEl) {
            singleScoreEl.textContent = scoreText;
            singleScoreEl.style.textAlign = 'right';
            singleScoreEl.style.float = 'right';
        } else if (type === 'multiple' && multipleScoreEl) {
            multipleScoreEl.textContent = scoreText;
            multipleScoreEl.style.textAlign = 'right';
            multipleScoreEl.style.float = 'right';
        } else if (type === 'judge' && judgeScoreEl) {
            judgeScoreEl.textContent = scoreText;
            judgeScoreEl.style.textAlign = 'right';
            judgeScoreEl.style.float = 'right';
        }

        const container = group.container;
        if (!container) continue;
        container.style.display = 'block';

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

    [singleContainer, multipleContainer, judgeContainer].forEach(el => {
        if (el) el.style.display = 'block';
    });
    if (quizFooterGlobal) quizFooterGlobal.style.display = 'block';

    if (submitBtn) {
        var hasHistory = false;
        if (currentUser && currentUser.quiz_results) {
            var stageKey = 'stage_' + currentViewStage;
            var stageData = currentUser.quiz_results[stageKey] || {};
            hasHistory = !!(stageData.best || stageData.last);
        }
        if (hasHistory) {
            submitBtn.textContent = '🔄 重新提交';
        } else {
            submitBtn.textContent = '✅ 提交考核';
        }
        submitBtn.disabled = false;
        submitBtn.onclick = submitQuiz;
    }

    if (quizContentTitle) {
        let totalQuizScore = 0;
        ['single', 'multiple', 'judge'].forEach(key => {
            totalQuizScore += groups[key]?.totalScore || 0;
        });
        const passScore = Math.round(totalQuizScore * 0.8);
        
        quizContentTitle.style.display = 'block';
        quizContentTitle.style.display = 'flex';
        quizContentTitle.style.justifyContent = 'space-between';
        quizContentTitle.style.alignItems = 'center';
        quizContentTitle.style.width = '100%';
        quizContentTitle.innerHTML = `
            <span>📝 阶段考核</span>
            <span style="font-weight:normal; font-size:0.85em; color:#888;">
                （共${totalQuizScore}分/<span style="color:#22c55e;">达标${passScore}分</span>）
            </span>
        `;
    }
    if (groups.single.items.length > 0 && quizSingleTitle) quizSingleTitle.style.display = 'block';
    if (groups.multiple.items.length > 0 && quizMultipleTitle) quizMultipleTitle.style.display = 'block';
    if (groups.judge.items.length > 0 && quizJudgeTitle) quizJudgeTitle.style.display = 'block';
    
    [singleHeader, multipleHeader, judgeHeader, quizTitleHeader].forEach(el => {
        if (el) el.style.display = '';
    });

    updateSubmitButtonState();
}
// ============================================================
// 图片全屏查看器（修复版）
// ============================================================
let imageViewerState = {
    isFullscreen: false,
    isZoomed: false,
    scale: 1
};

function openImageFullscreen(resource, allResources) {
    closeImageFullscreen();
    
    // 清空之前的计时器
    if (activeResourceId) {
        stopTimer(activeResourceId);
        activeResourceId = null;
    }
    
    const viewer = document.createElement('div');
    viewer.id = 'imageFullscreenViewer';
    viewer.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        background: rgba(0, 0, 0, 0.95);
        z-index: 99999;
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        touch-action: none;
        user-select: none;
        -webkit-user-select: none;
        overflow: hidden;
    `;
    
    const imageWrapper = document.createElement('div');
    imageWrapper.id = 'imageViewerWrapper';
    imageWrapper.style.cssText = `
        width: 100%;
        height: 100%;
        display: flex;
        justify-content: center;
        align-items: center;
        overflow: hidden;
        position: relative;
        touch-action: none;
    `;
    
    const img = document.createElement('img');
    img.id = 'imageViewerImg';
    img.src = resource.file;
    img.alt = resource.title;
    img.draggable = false;
    img.style.cssText = `
        max-width: 100%;
        max-height: 100%;
        object-fit: contain;
        transition: none;
        display: block;
        touch-action: none;
        will-change: transform;
    `;
    
    imageWrapper.appendChild(img);
    viewer.appendChild(imageWrapper);
    
    // ===== 进度条（实时更新） =====
    const progressBar = document.createElement('div');
    progressBar.id = 'imageProgressBar';
    progressBar.style.cssText = `
        position: absolute;
        bottom: 30px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(0, 0, 0, 0.7);
        color: #fff;
        padding: 8px 20px;
        border-radius: 20px;
        font-size: 14px;
        font-family: system-ui, -apple-system, sans-serif;
        z-index: 10;
        pointer-events: none;
        backdrop-filter: blur(8px);
        border: 1px solid rgba(255,255,255,0.15);
        transition: opacity 0.3s ease;
    `;
    
    // 从进度Map获取初始进度
    const prog = progressMap[resource.id];
    let initialProgress = prog ? prog.progress : 0;
    progressBar.textContent = `学习进度：${initialProgress}%`;
    viewer.appendChild(progressBar);
    
    // ===== 在图片加载完成后启动计时器 =====
    let timerStarted = false;
    let imageLoaded = false;
    
    img.addEventListener('load', function() {
        imageLoaded = true;
        // 图片加载完成，开始计时
        if (!timerStarted && activeResourceId === resource.id) {
            timerStarted = true;
            // 启动计时器，并传入回调更新进度条
            startImageTimer(resource.id, resource.duration);
        }
    });
    
    // 如果图片已缓存，load事件可能不会触发
    if (img.complete) {
        imageLoaded = true;
        if (!timerStarted) {
            timerStarted = true;
            startImageTimer(resource.id, resource.duration);
        }
    }
    
    // ===== 图片计数 =====
    if (allResources && allResources.length > 1) {
        const counter = document.createElement('div');
        counter.id = 'imageCounter';
        counter.style.cssText = `
            position: absolute;
            top: 20px;
            right: 20px;
            color: rgba(255,255,255,0.6);
            font-size: 14px;
            font-family: system-ui, -apple-system, sans-serif;
            background: rgba(0,0,0,0.5);
            padding: 4px 12px;
            border-radius: 12px;
            z-index: 10;
            pointer-events: none;
        `;
        const idx = allResources.findIndex(r => r.id === resource.id);
        counter.textContent = `${idx + 1} / ${allResources.length}`;
        viewer.appendChild(counter);
    }
        
    // 上一张/下一张
    if (allResources && allResources.length > 1) {
        const navContainer = document.createElement('div');
        navContainer.style.cssText = `
            position: absolute;
            bottom: 80px;
            left: 0;
            right: 0;
            display: flex;
            justify-content: center;
            gap: 20px;
            z-index: 10;
            pointer-events: none;
        `;
        
        const prevBtn = document.createElement('button');
        prevBtn.textContent = '◀ 上一张';
        prevBtn.style.cssText = `
            padding: 8px 20px;
            border: 1px solid rgba(255,255,255,0.2);
            border-radius: 30px;
            background: rgba(0,0,0,0.5);
            color: #fff;
            cursor: pointer;
            font-size: 15px;
            pointer-events: auto;
            backdrop-filter: blur(8px);
            transition: background 0.2s;
        `;
        prevBtn.addEventListener('mouseenter', function() { this.style.background = 'rgba(255,255,255,0.2)'; });
        prevBtn.addEventListener('mouseleave', function() { this.style.background = 'rgba(0,0,0,0.5)'; });
        prevBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            const currentIdx = allResources.findIndex(r => r.id === resource.id);
            if (currentIdx > 0) {
                const prevResource = allResources[currentIdx - 1];
                // 停止当前计时器
                stopTimer(resource.id);
                // 切换图片
                img.src = prevResource.file;
                const counter = document.getElementById('imageCounter');
                if (counter) counter.textContent = `${currentIdx} / ${allResources.length}`;
                const newProg = progressMap[prevResource.id];
                const bar = document.getElementById('imageProgressBar');
                if (bar) bar.textContent = newProg ? `学习进度：${newProg.progress}%` : '学习进度：0%';
                resetImageViewerState();
                resource = prevResource;
                activeResourceId = prevResource.id;
                // 重新启动计时器
                timerStarted = false;
                imageLoaded = false;
                if (img.complete) {
                    imageLoaded = true;
                    if (!timerStarted) {
                        timerStarted = true;
                        startImageTimer(prevResource.id, prevResource.duration);
                    }
                } else {
                    img.addEventListener('load', function() {
                        imageLoaded = true;
                        if (!timerStarted && activeResourceId === prevResource.id) {
                            timerStarted = true;
                            startImageTimer(prevResource.id, prevResource.duration);
                        }
                    });
                }
            }
        });
        
        const nextBtn = document.createElement('button');
        nextBtn.textContent = '下一张 ▶';
        nextBtn.style.cssText = `
            padding: 8px 20px;
            border: 1px solid rgba(255,255,255,0.2);
            border-radius: 30px;
            background: rgba(0,0,0,0.5);
            color: #fff;
            cursor: pointer;
            font-size: 15px;
            pointer-events: auto;
            backdrop-filter: blur(8px);
            transition: background 0.2s;
        `;
        nextBtn.addEventListener('mouseenter', function() { this.style.background = 'rgba(255,255,255,0.2)'; });
        nextBtn.addEventListener('mouseleave', function() { this.style.background = 'rgba(0,0,0,0.5)'; });
        nextBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            const currentIdx = allResources.findIndex(r => r.id === resource.id);
            if (currentIdx < allResources.length - 1) {
                const nextResource = allResources[currentIdx + 1];
                stopTimer(resource.id);
                img.src = nextResource.file;
                const counter = document.getElementById('imageCounter');
                if (counter) counter.textContent = `${currentIdx + 2} / ${allResources.length}`;
                const newProg = progressMap[nextResource.id];
                const bar = document.getElementById('imageProgressBar');
                if (bar) bar.textContent = newProg ? `学习进度：${newProg.progress}%` : '学习进度：0%';
                resetImageViewerState();
                resource = nextResource;
                activeResourceId = nextResource.id;
                timerStarted = false;
                imageLoaded = false;
                if (img.complete) {
                    imageLoaded = true;
                    if (!timerStarted) {
                        timerStarted = true;
                        startImageTimer(nextResource.id, nextResource.duration);
                    }
                } else {
                    img.addEventListener('load', function() {
                        imageLoaded = true;
                        if (!timerStarted && activeResourceId === nextResource.id) {
                            timerStarted = true;
                            startImageTimer(nextResource.id, nextResource.duration);
                        }
                    });
                }
            }
        });
        
        navContainer.appendChild(prevBtn);
        navContainer.appendChild(nextBtn);
        viewer.appendChild(navContainer);
    }
    
    document.body.appendChild(viewer);
    document.body.style.overflow = 'hidden';
    
    // 设置 activeResourceId
    activeResourceId = resource.id;
    
    // ===== 状态管理 =====
    let state = {
        scale: 1,
        translateX: 0,
        translateY: 0,
        isZoomed: false,
        isDragging: false,
        isPinching: false,
        startX: 0,
        startY: 0,
        lastX: 0,
        lastY: 0,
        initialDistance: 0,
        initialScale: 1,
        hasMoved: false
    };
    
    let lastTapTime = 0;
    let tapTimeout = null;
    
    function resetImageViewerState() {
        state.scale = 1;
        state.translateX = 0;
        state.translateY = 0;
        state.isZoomed = false;
        state.isDragging = false;
        state.isPinching = false;
        state.hasMoved = false;
        if (tapTimeout) {
            clearTimeout(tapTimeout);
            tapTimeout = null;
        }
        img.style.transform = `translate(0px, 0px) scale(1)`;
        updateProgressBarVisibility();
    }
    
    function updateTransform() {
        img.style.transform = `translate(${state.translateX}px, ${state.translateY}px) scale(${state.scale})`;
        updateProgressBarVisibility();
    }
    
    function updateProgressBarVisibility() {
        const bar = document.getElementById('imageProgressBar');
        if (!bar) return;
        if (state.isZoomed || state.scale > 1.1) {
            bar.style.opacity = '0';
            bar.style.pointerEvents = 'none';
        } else {
            bar.style.opacity = '1';
            bar.style.pointerEvents = 'none';
        }
    }
    
    function getDistance(event) {
        const touch1 = event.touches[0];
        const touch2 = event.touches[1];
        const dx = touch1.clientX - touch2.clientX;
        const dy = touch1.clientY - touch2.clientY;
        return Math.sqrt(dx * dx + dy * dy);
    }
    
    function clearTapTimeout() {
        if (tapTimeout) {
            clearTimeout(tapTimeout);
            tapTimeout = null;
        }
    }
    
    // ===== 触摸事件 =====
    imageWrapper.addEventListener('touchstart', function(e) {
        if (e.touches.length === 1) {
            const touch = e.touches[0];
            state.isDragging = false;
            state.hasMoved = false;
            state.startX = touch.clientX;
            state.startY = touch.clientY;
            state.lastX = touch.clientX;
            state.lastY = touch.clientY;
            
            const now = Date.now();
            const timeDiff = now - lastTapTime;
            lastTapTime = now;
            
            if (timeDiff < 300 && timeDiff > 50) {
                clearTapTimeout();
                e.preventDefault();
                handleDoubleTap();
                return;
            }
            
            clearTapTimeout();
            tapTimeout = setTimeout(() => {
                tapTimeout = null;
                if (!state.hasMoved) {
                    handleSingleTap();
                }
            }, 300);
            
        } else if (e.touches.length === 2) {
            clearTapTimeout();
            e.preventDefault();
            state.isPinching = true;
            state.hasMoved = true;
            state.initialDistance = getDistance(e);
            state.initialScale = state.scale;
            state.isDragging = false;
        }
    }, { passive: false });
    
    imageWrapper.addEventListener('touchmove', function(e) {
        if (e.touches.length === 1 && !state.isPinching) {
            e.preventDefault();
            const touch = e.touches[0];
            const dx = touch.clientX - state.lastX;
            const dy = touch.clientY - state.lastY;
            
            if (!state.isDragging) {
                const dist = Math.sqrt(
                    Math.pow(touch.clientX - state.startX, 2) + 
                    Math.pow(touch.clientY - state.startY, 2)
                );
                if (dist > 10) {
                    state.isDragging = true;
                    state.hasMoved = true;
                    clearTapTimeout();
                }
            }
            
            if (state.isDragging) {
                state.translateX += dx;
                state.translateY += dy;
                state.lastX = touch.clientX;
                state.lastY = touch.clientY;
                updateTransform();
            }
            
        } else if (e.touches.length === 2 && state.isPinching) {
            e.preventDefault();
            const newDist = getDistance(e);
            const scaleChange = newDist / state.initialDistance;
            let newScale = state.initialScale * scaleChange;
            newScale = Math.max(0.5, Math.min(5, newScale));
            state.scale = newScale;
            state.hasMoved = true;
            updateTransform();
        }
    }, { passive: false });
    
    imageWrapper.addEventListener('touchend', function(e) {
        state.isDragging = false;
        state.isPinching = false;
    });
    
    // ===== 鼠标事件 =====
    let mouseDown = false;
    let mouseStartX = 0, mouseStartY = 0;
    let mouseLastX = 0, mouseLastY = 0;
    let isMouseDragging = false;
    let mouseHasMoved = false;
    
    imageWrapper.addEventListener('mousedown', function(e) {
        if (e.button !== 0) return;
        mouseDown = true;
        isMouseDragging = false;
        mouseHasMoved = false;
        mouseStartX = e.clientX;
        mouseStartY = e.clientY;
        mouseLastX = e.clientX;
        mouseLastY = e.clientY;
        imageWrapper.style.cursor = 'grabbing';
    });
    
    document.addEventListener('mousemove', function(e) {
        if (!mouseDown) return;
        const dx = e.clientX - mouseLastX;
        const dy = e.clientY - mouseLastY;
        
        const dist = Math.sqrt(
            Math.pow(e.clientX - mouseStartX, 2) + 
            Math.pow(e.clientY - mouseStartY, 2)
        );
        if (dist > 5) {
            isMouseDragging = true;
            mouseHasMoved = true;
            clearTapTimeout();
        }
        
        if (isMouseDragging) {
            state.translateX += dx;
            state.translateY += dy;
            mouseLastX = e.clientX;
            mouseLastY = e.clientY;
            updateTransform();
        }
    });
    
    document.addEventListener('mouseup', function(e) {
        if (mouseDown) {
            mouseDown = false;
            imageWrapper.style.cursor = '';
            if (!mouseHasMoved) {
                handleMouseClick(e);
            }
            isMouseDragging = false;
            mouseHasMoved = false;
        }
    });
    
    // 鼠标滚轮缩放
    imageWrapper.addEventListener('wheel', function(e) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -0.1 : 0.1;
        let newScale = state.scale + delta;
        newScale = Math.max(0.5, Math.min(5, newScale));
        state.scale = newScale;
        state.hasMoved = true;
        if (state.scale > 1.1 && !state.isZoomed) {
            state.isZoomed = true;
        } else if (state.scale <= 1.1 && state.isZoomed) {
            state.isZoomed = false;
        }
        updateTransform();
    }, { passive: false });
    
    let mouseLastClickTime = 0;
    function handleMouseClick(e) {
        const now = Date.now();
        const timeDiff = now - mouseLastClickTime;
        mouseLastClickTime = now;
        
        if (timeDiff < 300 && timeDiff > 50) {
            handleDoubleTap();
            return;
        }
        
        clearTapTimeout();
        tapTimeout = setTimeout(() => {
            tapTimeout = null;
            if (!mouseHasMoved) {
                handleSingleTap();
            }
        }, 300);
    }
    
    // ===== 核心操作 =====
    function handleDoubleTap() {
        clearTapTimeout();
        if (state.isZoomed) {
            state.isZoomed = false;
            state.scale = 1;
            state.translateX = 0;
            state.translateY = 0;
        } else {
            state.isZoomed = true;
            state.scale = 2;
            state.translateX = 0;
            state.translateY = 0;
        }
        state.hasMoved = false;
        updateTransform();
        updateProgressBarVisibility();
    }
    
    function handleSingleTap() {
        if (state.isZoomed || state.scale > 1.1) {
            state.isZoomed = false;
            state.scale = 1;
            state.translateX = 0;
            state.translateY = 0;
            state.hasMoved = false;
            updateTransform();
            updateProgressBarVisibility();
        } else {
            closeImageFullscreen();
        }
    }
    
    document.addEventListener('keydown', function keyHandler(e) {
        if (e.key === 'Escape') {
            closeImageFullscreen();
            document.removeEventListener('keydown', keyHandler);
        }
    });
    
    resetImageViewerState();
    
    // 如果图片已经加载完成但计时器还没启动（兜底）
    setTimeout(function() {
        if (img.complete && !timerStarted && activeResourceId === resource.id) {
            timerStarted = true;
            startImageTimer(resource.id, resource.duration);
        }
    }, 500);
}

function closeImageFullscreen() {
    const viewer = document.getElementById('imageFullscreenViewer');
    if (viewer) {
        viewer.remove();
        document.body.style.overflow = '';
    }
    // ★★★ 关键修复：退出全屏时停止计时器 ★★★
    if (activeResourceId) {
        stopTimer(activeResourceId);
        activeResourceId = null;
    }
    imageViewerState.isFullscreen = false;
    imageViewerState.isZoomed = false;
    imageViewerState.scale = 1;
}

// ===== 图片专用计时器（带进度条实时更新） =====
function startImageTimer(resourceId, duration) {
    // 检查是否已有计时器
    if (timerIntervals[resourceId]) {
        console.log(`⏱️ 图片计时器已存在，跳过: ${resourceId}`);
        return;
    }
    
    const prog = progressMap[resourceId];
    if (prog && prog.completed) {
        console.log(`✅ 图片资源已完成，跳过: ${resourceId}`);
        return;
    }

    if (typeof duration !== 'number' || duration <= 0 || isNaN(duration)) {
        console.warn(`⚠️ duration 无效 (${duration})，强制设为 60 秒，资源: ${resourceId}`);
        duration = 60;
    }

    let elapsed = 0;
    if (prog && prog.progress > 0 && prog.progress < 100) {
        elapsed = Math.floor((prog.progress / 100) * duration);
    }
    timerElapsed[resourceId] = elapsed;

    console.log(`▶️ 启动图片计时器: ${resourceId}，总时长 ${duration} 秒，当前进度 ${prog ? prog.progress : 0}%`);

    const interval = setInterval(async () => {
        timerElapsed[resourceId] += 1;
        const elapsedNow = timerElapsed[resourceId];
        const progress = Math.min(100, Math.round((elapsedNow / duration) * 100));
        
        // ★★★ 更新进度到 Supabase ★★★
        await updateResourceProgress(resourceId, progress, 0);
        
        // ★★★ 实时更新图片查看器中的进度条 ★★★
        const progressBar = document.getElementById('imageProgressBar');
        if (progressBar) {
            progressBar.textContent = `学习进度：${progress}%`;
        }
        
        // 更新 detailProgress（兼容旧逻辑）
        updateDetailProgress(resourceId);
        
        if (progress >= 100) {
            stopTimer(resourceId);
            await markResourceCompleted(resourceId);
            
            // 更新进度条为完成状态
            const bar = document.getElementById('imageProgressBar');
            if (bar) {
                bar.textContent = '✅ 学习完成！';
            }
            
            const data = stageData[currentViewStage];
            if (data && data.resources) {
                const allCompleted = data.resources.every(r => progressMap[r.id] && progressMap[r.id].completed);
                console.log(`📊 图片资源 ${resourceId} 完成，全部完成: ${allCompleted}`);
                
                if (allCompleted) {
                    const isExamStage = EXAM_STAGES.includes(currentViewStage);
                    console.log(`📌 阶段 ${currentViewStage}, 有考核: ${isExamStage}`);
                    
                    if (!isExamStage) {
                        console.log(`🚀 无考核，自动晋级...`);
                        await autoAdvanceStage(currentViewStage);
                    } else {
                        const isPassed = currentUser.completed_stages && currentUser.completed_stages.includes(currentViewStage);
                        if (isPassed) {
                            console.log(`✅ 考核已通过，自动晋级...`);
                            await autoAdvanceStage(currentViewStage);
                        } else {
                            console.log(`📝 请完成考核后晋级`);
                            if (learnMsg) {
                                learnMsg.classList.remove('hidden');
                                learnMsg.textContent = '🎉 本阶段所有学习资源已完成，请完成考核以晋级！';
                            }
                            renderCurrentStageResources();
                        }
                    }
                }
            }
            
            // 完成后延迟关闭查看器
            setTimeout(() => {
                if (document.getElementById('imageFullscreenViewer')) {
                    closeImageFullscreen();
                }
            }, 1500);
        }
    }, 1000);
    
    timerIntervals[resourceId] = interval;
}
// ============================================================
// 视频全屏播放器（修复版 - 播放/暂停控制按钮显示）
// ============================================================
let videoViewerActive = false;
let videoHideTimeout = null;
let videoButtonVisible = true;

function openVideoFullscreen(resource) {
    closeVideoFullscreen();
    
    const viewer = document.createElement('div');
    viewer.id = 'videoFullscreenViewer';
    viewer.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        background: rgba(0, 0, 0, 0.95);
        z-index: 99999;
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        touch-action: none;
        user-select: none;
        -webkit-user-select: none;
        overflow: hidden;
    `;
    
    const videoWrapper = document.createElement('div');
    videoWrapper.id = 'videoWrapper';
    videoWrapper.style.cssText = `
        width: 100%;
        height: 100%;
        display: flex;
        justify-content: center;
        align-items: center;
        background: #000;
        position: relative;
    `;
    
    const video = document.createElement('video');
    video.src = resource.file;
    video.controls = true;
    video.playsInline = true;
    video.style.cssText = `
        width: 100%;
        height: 100%;
        max-height: 100%;
        object-fit: contain;
        display: block;
    `;
    video.preload = 'metadata';
    
    videoWrapper.appendChild(video);
    viewer.appendChild(videoWrapper);
    
    // 进度信息
    const progressInfo = document.createElement('div');
    progressInfo.id = 'videoProgressInfo';
    progressInfo.style.cssText = `
        position: absolute;
        bottom: 60px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(0, 0, 0, 0.7);
        color: #fff;
        padding: 6px 16px;
        border-radius: 16px;
        font-size: 13px;
        font-family: system-ui, -apple-system, sans-serif;
        z-index: 10;
        pointer-events: none;
        backdrop-filter: blur(8px);
        border: 1px solid rgba(255,255,255,0.1);
        transition: opacity 0.3s ease;
    `;
    const prog = progressMap[resource.id];
    progressInfo.textContent = prog ? `学习进度：${prog.progress}%` : '学习进度：0%';
    viewer.appendChild(progressInfo);
    
    // ===== 退出按钮 =====
    const exitBtn = document.createElement('button');
    exitBtn.id = 'videoExitBtn';
    exitBtn.textContent = '退出';
    exitBtn.style.cssText = `
        position: absolute;
        bottom: 30%;
        right: 20px;
        padding: 10px 20px;
        background: rgba(255, 255, 255, 0.2);
        color: #fff;
        border: 1px solid rgba(255,255,255,0.3);
        border-radius: 30px;
        font-size: 16px;
        font-weight: 500;
        cursor: pointer;
        z-index: 20;
        backdrop-filter: blur(8px);
        transition: all 0.3s ease;
        font-family: system-ui, -apple-system, sans-serif;
        letter-spacing: 0.5px;
    `;
    exitBtn.addEventListener('mouseenter', function() {
        this.style.background = 'rgba(255, 255, 255, 0.35)';
    });
    exitBtn.addEventListener('mouseleave', function() {
        this.style.background = 'rgba(255, 255, 255, 0.2)';
    });
    exitBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        closeVideoFullscreen();
    });
    viewer.appendChild(exitBtn);
    
    // ===== ★★★ 按钮状态管理 ★★★ =====
    let isButtonExpanded = true;
    let isVideoPaused = false;  // 记录视频是否暂停
    let hideTimer = null;
    
    function collapseButton() {
        if (!videoButtonVisible) return;
        // ★★★ 暂停状态下不收缩 ★★★
        if (isVideoPaused) return;
        isButtonExpanded = false;
        exitBtn.style.transform = 'translateX(calc(100% - 20px))';
        exitBtn.style.opacity = '0.4';
        exitBtn.style.padding = '8px 12px';
        exitBtn.textContent = '◀';
        exitBtn.style.fontSize = '14px';
        exitBtn.style.borderRadius = '30px';
        exitBtn.style.background = 'rgba(255,255,255,0.15)';
    }
    
    function expandButton() {
        if (!videoButtonVisible) return;
        isButtonExpanded = true;
        exitBtn.style.transform = 'translateX(0)';
        exitBtn.style.opacity = '1';
        exitBtn.style.padding = '10px 20px';
        exitBtn.textContent = '退出';
        exitBtn.style.fontSize = '16px';
        exitBtn.style.borderRadius = '30px';
        exitBtn.style.background = 'rgba(255, 255, 255, 0.25)';
    }
    
    function clearHideTimer() {
        if (hideTimer) {
            clearTimeout(hideTimer);
            hideTimer = null;
        }
    }
    
    function startHideTimer() {
        clearHideTimer();
        // ★★★ 只有播放状态下才自动收缩 ★★★
        if (!isVideoPaused) {
            hideTimer = setTimeout(function() {
                collapseButton();
                hideTimer = null;
            }, 1000);
        }
    }
    
    // 初始：假设视频自动播放，1秒后收缩
    // 但先展开，等视频状态确定后再决定
    expandButton();
    
    // ★★★ 监听视频播放/暂停状态 ★★★
    video.addEventListener('pause', function() {
        isVideoPaused = true;
        clearHideTimer();
        expandButton();  // 暂停时立即展开
        console.log('🎬 视频暂停，按钮展开');
    });
    
    video.addEventListener('play', function() {
        isVideoPaused = false;
        expandButton();
        startHideTimer();  // 播放时1秒后收缩
        console.log('🎬 视频播放，1秒后收缩');
    });
    
    // ★★★ 点击屏幕展开按钮（播放时重置计时器，暂停时保持展开）★★★
    viewer.addEventListener('click', function(e) {
        if (e.target === exitBtn) return;
        expandButton();
        if (!isVideoPaused) {
            startHideTimer();
        }
        // 暂停状态：保持展开，不启动计时器
    });
    
    // 触摸事件
    viewer.addEventListener('touchstart', function(e) {
        if (e.target === exitBtn) return;
        expandButton();
        if (!isVideoPaused) {
            startHideTimer();
        }
    }, { passive: true });
    
    document.body.appendChild(viewer);
    document.body.style.overflow = 'hidden';
    videoViewerActive = true;
    
    // ===== 视频状态 =====
    let savedPosition = 0;
    const savedProg = progressMap[resource.id];
    let maxWatchedTime = 0;
    
    if (savedProg && savedProg.last_position !== undefined) {
        savedPosition = savedProg.last_position;
        maxWatchedTime = savedProg.last_position;
    }
    
    let lastValidTime = savedPosition;
    let isInitialSeek = false;
    let saveTimer = null;
    let isVideoEnded = false;
    let toastTimer = null;
    
    // ===== 限制拖拽到已观看区域 =====
    function handleSeeking() {
        if (isInitialSeek) return;
        if (isVideoEnded) return;
        if (savedProg && savedProg.completed) return;
        
        const currentTime = video.currentTime;
        const maxAllowed = maxWatchedTime;
        
        if (currentTime > maxAllowed + 0.5) {
            video.currentTime = maxAllowed;
            video.pause();
            showVideoToast('⛔ 请先观看前面的内容');
            return;
        }
        
        if (currentTime > 0) {
            lastValidTime = currentTime;
        }
    }
    
    function handleTimeUpdate() {
        if (isInitialSeek) return;
        if (isVideoEnded) return;
        if (savedProg && savedProg.completed) {
            return;
        }
        
        const currentTime = video.currentTime;
        const duration = video.duration;
        
        if (currentTime > maxWatchedTime) {
            maxWatchedTime = currentTime;
            lastValidTime = currentTime;
        }
        
        const pct = Math.round((maxWatchedTime / duration) * 100);
        const infoEl = document.getElementById('videoProgressInfo');
        if (infoEl) {
            infoEl.textContent = `学习进度：${Math.min(100, pct)}%`;
        }
        
        if (!saveTimer) {
            saveTimer = setTimeout(() => {
                const pct = Math.round((maxWatchedTime / duration) * 100);
                updateResourceProgress(resource.id, Math.min(100, pct), maxWatchedTime);
                saveTimer = null;
            }, 3000);
        }
        
        if (maxWatchedTime >= duration * 0.95 && duration > 0) {
            isVideoEnded = true;
            if (saveTimer) {
                clearTimeout(saveTimer);
                saveTimer = null;
            }
            markResourceCompleted(resource.id);
            showVideoToast('✅ 视频学习完成！');
            setTimeout(() => {
                closeVideoFullscreen();
            }, 1500);
        }
    }
    
    function handleLoadedMetadata() {
        const duration = video.duration;
        if (savedPosition > 0 && savedPosition < duration - 0.5) {
            isInitialSeek = true;
            video.currentTime = savedPosition;
            maxWatchedTime = savedPosition;
            lastValidTime = savedPosition;
            setTimeout(() => {
                isInitialSeek = false;
            }, 500);
        }
        const pct = Math.round((maxWatchedTime / duration) * 100);
        const infoEl = document.getElementById('videoProgressInfo');
        if (infoEl) {
            infoEl.textContent = `学习进度：${Math.min(100, pct)}%`;
        }
    }
    
    function checkIfCompleted() {
        if (savedProg && savedProg.completed) {
            const infoEl = document.getElementById('videoProgressInfo');
            if (infoEl) {
                infoEl.textContent = '✅ 已完成';
            }
            return true;
        }
        return false;
    }
    
    // ===== Toast提示 =====
    function showVideoToast(msg) {
        if (toastTimer) {
            clearTimeout(toastTimer);
            toastTimer = null;
        }
        const oldToast = document.getElementById('videoToast');
        if (oldToast) oldToast.remove();
        const toast = document.createElement('div');
        toast.id = 'videoToast';
        toast.style.cssText = `
            position: fixed;
            bottom: 120px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(0, 0, 0, 0.8);
            color: #fff;
            padding: 10px 24px;
            border-radius: 20px;
            font-size: 15px;
            z-index: 999999;
            font-family: system-ui, sans-serif;
            backdrop-filter: blur(8px);
            border: 1px solid rgba(255,255,255,0.1);
            pointer-events: none;
            transition: opacity 0.3s ease;
        `;
        toast.textContent = msg;
        document.body.appendChild(toast);
        toastTimer = setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 400);
            toastTimer = null;
        }, 2000);
    }
    
    // ===== 绑定事件 =====
    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('seeking', handleSeeking);
    
    video.addEventListener('play', function() {
        if (isVideoEnded) {
            this.pause();
            return;
        }
    });
    
    video.addEventListener('ended', function() {
        if (savedProg && savedProg.completed) return;
        isVideoEnded = true;
        if (saveTimer) {
            clearTimeout(saveTimer);
            saveTimer = null;
        }
        markResourceCompleted(resource.id);
        showVideoToast('✅ 视频学习完成！');
        setTimeout(() => {
            closeVideoFullscreen();
        }, 1500);
    });
    
    const isCompleted = checkIfCompleted();
    if (!isCompleted) {
        video.play().catch(e => {
            if (e.name !== 'AbortError') console.warn('视频自动播放被阻止:', e);
        });
    } else {
        video.load();
    }
    
    // 双击全屏切换
    videoWrapper.addEventListener('dblclick', function() {
        if (!document.fullscreenElement) {
            viewer.requestFullscreen?.().catch(() => {});
        } else {
            document.exitFullscreen?.().catch(() => {});
        }
    });
}

function closeVideoFullscreen() {
    const viewer = document.getElementById('videoFullscreenViewer');
    if (viewer) {
        const video = viewer.querySelector('video');
        if (video && activeResourceId) {
            const duration = video.duration;
            const maxWatched = video._maxWatchedTime || 0;
            if (duration > 0 && maxWatched > 0) {
                const pct = Math.round((maxWatched / duration) * 100);
                updateResourceProgress(activeResourceId, Math.min(100, pct), maxWatched);
            }
        }
        viewer.remove();
        document.body.style.overflow = '';
    }
    if (videoHideTimeout) {
        clearTimeout(videoHideTimeout);
        videoHideTimeout = null;
    }
    videoViewerActive = false;
}
// ============================================================
// 文章全屏阅读器（修复版 - 本次学习 + 已保存进度）
// ============================================================
let articleViewerActive = false;

function openArticleFullscreen(resource) {
    closeArticleFullscreen();
    
    const viewer = document.createElement('div');
    viewer.id = 'articleFullscreenViewer';
    viewer.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        background: rgba(255, 255, 255, 0.98);
        z-index: 99999;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        font-family: system-ui, -apple-system, sans-serif;
    `;
    
    // ===== 顶部工具栏 =====
    const toolbar = document.createElement('div');
    toolbar.style.cssText = `
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 12px 20px;
        background: rgba(255,255,255,0.95);
        border-bottom: 1px solid #eee;
        flex-shrink: 0;
        z-index: 10;
    `;
    
    // 文章标题
    const titleEl = document.createElement('span');
    titleEl.textContent = resource.title;
    titleEl.style.cssText = `
        font-size: 16px;
        font-weight: 600;
        color: #333;
        flex: 1;
        margin: 0 16px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    `;
    toolbar.appendChild(titleEl);
    
    // ===== ★★★ 双进度显示 ★★★ =====
    const progressContainer = document.createElement('div');
    progressContainer.style.cssText = `
        display: flex;
        gap: 12px;
        align-items: center;
        font-size: 13px;
        color: #666;
        font-family: system-ui, -apple-system, sans-serif;
        flex-shrink: 0;
    `;
    
    // ★★★ 本次学习进度（本次打开的综合进度） ★★★
    const currentProgressSpan = document.createElement('span');
    currentProgressSpan.id = 'currentProgressDisplay';
    currentProgressSpan.textContent = '📖 本次：0%';
    currentProgressSpan.style.cssText = `
        color: #4285f4;
        font-weight: 500;
        min-width: 75px;
    `;
    progressContainer.appendChild(currentProgressSpan);
    
    // ★★★ 已保存进度（数据库中的最大进度） ★★★
    const savedProgressSpan = document.createElement('span');
    savedProgressSpan.id = 'savedProgressDisplay';
    // 从 progressMap 获取已保存的进度
    const savedProg = progressMap[resource.id];
    const savedProgress = savedProg ? savedProg.progress : 0;
    savedProgressSpan.textContent = `💾 已保存：${savedProgress}%`;
    savedProgressSpan.style.cssText = `
        color: #22c55e;
        font-weight: 500;
        min-width: 75px;
    `;
    progressContainer.appendChild(savedProgressSpan);
    
    // 字号控制
    const fontSizeControls = document.createElement('div');
    fontSizeControls.style.cssText = `
        display: flex;
        gap: 8px;
        align-items: center;
        margin-left: 8px;
    `;
    const fontSizes = [14, 16, 18, 20, 22];
    let currentFontSize = 17;
    let fontSizeIndex = 2;
    
    const fontSizeBtn = document.createElement('button');
    fontSizeBtn.textContent = 'Aa';
    fontSizeBtn.style.cssText = `
        padding: 4px 12px;
        border: 1px solid #ddd;
        border-radius: 16px;
        background: #fff;
        cursor: pointer;
        font-size: 14px;
        transition: all 0.2s;
    `;
    fontSizeBtn.addEventListener('mouseenter', function() { this.style.borderColor = '#999'; });
    fontSizeBtn.addEventListener('mouseleave', function() { this.style.borderColor = '#ddd'; });
    fontSizeBtn.addEventListener('click', function() {
        fontSizeIndex = (fontSizeIndex + 1) % fontSizes.length;
        currentFontSize = fontSizes[fontSizeIndex];
        contentEl.style.fontSize = currentFontSize + 'px';
        updateArticleProgress();
    });
    fontSizeControls.appendChild(fontSizeBtn);
    progressContainer.appendChild(fontSizeControls);
    
    toolbar.appendChild(progressContainer);
    viewer.appendChild(toolbar);
    
    // ===== 文章内容 =====
    const contentWrapper = document.createElement('div');
    contentWrapper.style.cssText = `
        flex: 1;
        overflow-y: auto;
        padding: 20px 24px 40px;
        background: #fff;
        position: relative;
    `;
    
    const contentEl = document.createElement('div');
    contentEl.style.cssText = `
        max-width: 720px;
        margin: 0 auto;
        font-size: 17px;
        line-height: 1.9;
        color: #222;
        word-wrap: break-word;
    `;
    contentEl.innerHTML = resource.content || '暂无内容';
    contentWrapper.appendChild(contentEl);
    viewer.appendChild(contentWrapper);
    
    // ===== 退出按钮（右下1/3处，始终显示） =====
    const exitBtn = document.createElement('button');
    exitBtn.id = 'articleExitBtn';
    exitBtn.textContent = '退出';
    exitBtn.style.cssText = `
        position: absolute;
        bottom: 30%;
        right: 20px;
        padding: 10px 20px;
        background: rgba(0, 0, 0, 0.15);
        color: #333;
        border: 1px solid rgba(0,0,0,0.1);
        border-radius: 30px;
        font-size: 16px;
        font-weight: 500;
        cursor: pointer;
        z-index: 20;
        backdrop-filter: blur(8px);
        transition: all 0.3s ease;
        font-family: system-ui, -apple-system, sans-serif;
        letter-spacing: 0.5px;
    `;
    exitBtn.addEventListener('mouseenter', function() {
        this.style.background = 'rgba(0, 0, 0, 0.25)';
    });
    exitBtn.addEventListener('mouseleave', function() {
        this.style.background = 'rgba(0, 0, 0, 0.15)';
    });
    exitBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        closeArticleFullscreen();
    });
    viewer.appendChild(exitBtn);
    
    document.body.appendChild(viewer);
    document.body.style.overflow = 'hidden';
    articleViewerActive = true;
    
    // ===== 阅读追踪 =====
    let currentProgress = 0;        // 本次学习的综合进度（从0开始）
    let scrollProgress = 0;         // 滚动进度
    let readTime = 0;              // 阅读时间（秒）
    let isCompleted = false;
    let timeInterval = null;
    let estimatedTime = resource.duration || 60;
    let updateTimer = null;
    let hasMarkedComplete = false;
    let lastSavedProgress = savedProgress;  // 数据库中的最大进度
    
    // ★★★ 初始显示已保存进度 ★★★
    const savedDisplay = document.getElementById('savedProgressDisplay');
    if (savedDisplay) {
        savedDisplay.textContent = `💾 已保存：${lastSavedProgress}%`;
    }
    
    // 恢复滚动位置（从已保存进度恢复）
    if (savedProg && savedProg.progress > 0) {
        scrollProgress = savedProg.progress || 0;
        setTimeout(() => {
            const totalHeight = contentWrapper.scrollHeight - contentWrapper.clientHeight;
            contentWrapper.scrollTop = (scrollProgress / 100) * totalHeight;
        }, 100);
    }
    
    function updateArticleProgress() {
        if (isCompleted || hasMarkedComplete) return;
        
        // 计算滚动进度
        const totalHeight = contentWrapper.scrollHeight - contentWrapper.clientHeight;
        const currentScroll = contentWrapper.scrollTop;
        const scrollPct = totalHeight > 0 ? (currentScroll / totalHeight) * 100 : 0;
        scrollProgress = Math.min(100, scrollPct);
        
        // 计算时间进度
        const timePct = Math.min(100, (readTime / estimatedTime) * 100);
        
        // ★★★ 本次学习综合进度 = 滚动×60% + 时间×40% ★★★
        const combinedProgress = Math.min(100, Math.round(scrollPct * 0.6 + timePct * 0.4));
        currentProgress = Math.min(100, combinedProgress);
        
        // ===== ★★★ 更新两个进度显示 ★★★ =====
        const currentDisplay = document.getElementById('currentProgressDisplay');
        if (currentDisplay) {
            currentDisplay.textContent = `📖 本次：${currentProgress}%`;
        }
        
        // ★★★ 已保存进度 = max(数据库进度, 本次进度) ★★★
        const newSavedProgress = Math.max(lastSavedProgress, currentProgress);
        const savedDisplay = document.getElementById('savedProgressDisplay');
        if (savedDisplay) {
            savedDisplay.textContent = `💾 已保存：${newSavedProgress}%`;
        }
        
        // ★★★ 如果本次进度超过已保存进度，更新数据库 ★★★
        if (currentProgress > lastSavedProgress) {
            lastSavedProgress = currentProgress;
            // 更新数据库
            updateResourceProgress(resource.id, lastSavedProgress, 0);
            // 刷新缩微图列表
            renderCurrentStageResources();
            updateDetailProgress(resource.id);
        }
        
        // ★★★ 完成条件：本次学习 >= 100% ★★★
        if (currentProgress >= 100 && !hasMarkedComplete) {
            hasMarkedComplete = true;
            isCompleted = true;
            if (timeInterval) {
                clearInterval(timeInterval);
                timeInterval = null;
            }
            // 更新为完成状态
            if (currentDisplay) currentDisplay.textContent = '📖 本次：100% ✅';
            if (savedDisplay) savedDisplay.textContent = '💾 已保存：100% ✅';
            updateResourceProgress(resource.id, 100, 0);
            markResourceCompleted(resource.id);
            renderCurrentStageResources();
            showArticleToast('✅ 文章学习完成！');
            setTimeout(() => {
                closeArticleFullscreen();
            }, 1500);
        }
    }
    
    // 滚动事件
    contentWrapper.addEventListener('scroll', function() {
        if (isCompleted || hasMarkedComplete) return;
        if (updateTimer) {
            clearTimeout(updateTimer);
        }
        updateTimer = setTimeout(() => {
            updateArticleProgress();
            updateTimer = null;
        }, 200);
    });
    
    // 阅读计时（每秒增加，每3秒更新一次进度）
    timeInterval = setInterval(() => {
        if (isCompleted || hasMarkedComplete) return;
        readTime += 1;
        if (readTime % 3 === 0) {
            updateArticleProgress();
        }
    }, 1000);
    
    // 窗口调整
    window.addEventListener('resize', function() {
        if (isCompleted || hasMarkedComplete) return;
        updateArticleProgress();
    });
    
    function showArticleToast(msg) {
        const oldToast = document.getElementById('articleToast');
        if (oldToast) oldToast.remove();
        const toast = document.createElement('div');
        toast.id = 'articleToast';
        toast.style.cssText = `
            position: fixed;
            bottom: 120px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(0, 0, 0, 0.8);
            color: #fff;
            padding: 10px 24px;
            border-radius: 20px;
            font-size: 15px;
            z-index: 999999;
            font-family: system-ui, sans-serif;
            backdrop-filter: blur(8px);
            border: 1px solid rgba(255,255,255,0.1);
            pointer-events: none;
            transition: opacity 0.3s ease;
        `;
        toast.textContent = msg;
        document.body.appendChild(toast);
        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 400);
        }, 2000);
    }
    
    document.addEventListener('keydown', function keyHandler(e) {
        if (e.key === 'Escape') {
            closeArticleFullscreen();
            document.removeEventListener('keydown', keyHandler);
        }
    });
    
    setTimeout(updateArticleProgress, 500);
}

function closeArticleFullscreen() {
    const viewer = document.getElementById('articleFullscreenViewer');
    if (viewer) {
        viewer.remove();
        document.body.style.overflow = '';
    }
    articleViewerActive = false;
}
// ============================================================
// Resource Detail Modal（仅用于视频和文章，图片已独立处理）
// ============================================================
let currentVideoElement = null;

function openResourceDetail(resource, allResources) {
    // 图片资源直接全屏显示
    if (resource.type === 'image') {
        currentImageResources = allResources.filter(r => r.type === 'image');
        currentImageIdx = currentImageResources.findIndex(r => r.id === resource.id);
        // ★★★ 注意：不再调用 startTimer，计时器在图片加载完成后启动 ★★★
        openImageFullscreen(resource, currentImageResources);
        // 更新详情进度（但图片查看器有自己的进度条）
        updateDetailProgress(resource.id);
        return;
    }
    
    // 视频资源使用全屏播放器
    if (resource.type === 'video') {
        openVideoFullscreen(resource);
        activeResourceId = resource.id;
        return;
    }
    
    // 文章资源使用全屏阅读器
    if (resource.type === 'article') {
        openArticleFullscreen(resource);
        activeResourceId = resource.id;
        return;
    }
}
// ========== Timer ==========
function startTimer(resourceId, duration) {
    if (timerIntervals[resourceId]) {
        console.log(`⏱️ 计时器已存在，跳过: ${resourceId}`);
        return;
    }
    const prog = progressMap[resourceId];
    if (prog && prog.completed) {
        console.log(`✅ 资源已完成，跳过: ${resourceId}`);
        return;
    }

    if (typeof duration !== 'number' || duration <= 0 || isNaN(duration)) {
        console.warn(`⚠️ duration 无效 (${duration})，强制设为 60 秒，资源: ${resourceId}`);
        duration = 60;
    }

    let elapsed = 0;
    if (prog && prog.progress > 0 && prog.progress < 100) {
        elapsed = Math.floor((prog.progress / 100) * duration);
    }
    timerElapsed[resourceId] = elapsed;

    console.log(`▶️ 启动计时器: ${resourceId}，总时长 ${duration} 秒`);

    const interval = setInterval(async () => {
        timerElapsed[resourceId] += 1;
        const elapsedNow = timerElapsed[resourceId];
        const progress = Math.min(100, Math.round((elapsedNow / duration) * 100));
        await updateResourceProgress(resourceId, progress, 0);
        updateDetailProgress(resourceId);
        
        if (progress >= 100) {
            stopTimer(resourceId);
            await markResourceCompleted(resourceId);
            
            const data = stageData[currentViewStage];
            if (data && data.resources) {
                const allCompleted = data.resources.every(r => progressMap[r.id] && progressMap[r.id].completed);
                console.log(`📊 资源 ${resourceId} 完成，全部完成: ${allCompleted}`);
                
                if (allCompleted) {
                    const isExamStage = EXAM_STAGES.includes(currentViewStage);
                    console.log(`📌 阶段 ${currentViewStage}, 有考核: ${isExamStage}`);
                    
                    if (!isExamStage) {
                        console.log(`🚀 无考核，自动晋级...`);
                        await autoAdvanceStage(currentViewStage);
                    } else {
                        const isPassed = currentUser.completed_stages && currentUser.completed_stages.includes(currentViewStage);
                        if (isPassed) {
                            console.log(`✅ 考核已通过，自动晋级...`);
                            await autoAdvanceStage(currentViewStage);
                        } else {
                            console.log(`📝 请完成考核后晋级`);
                            if (learnMsg) {
                                learnMsg.classList.remove('hidden');
                                learnMsg.textContent = '🎉 本阶段所有学习资源已完成，请完成考核以晋级！';
                            }
                            renderCurrentStageResources();
                        }
                    }
                }
            }
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

    var targetStage = currentViewStage;
    var data = stageData[targetStage];
    if (!data || !data.quiz || data.quiz.length === 0) {
        if (quizResult) {
            quizResult.classList.remove('hidden');
            quizResult.textContent = '本阶段无考核，无需提交。';
            quizResult.className = 'msg error';
        }
        return;
    }

    var isStagePassed = currentUser.completed_stages && currentUser.completed_stages.indexOf(targetStage) !== -1;

    if (!isStagePassed) {
        var resources = data.resources || [];
        var allCompleted = resources.every(function(r) { return progressMap[r.id] && progressMap[r.id].completed; });
        if (!allCompleted) {
            if (quizResult) {
                quizResult.classList.remove('hidden');
                quizResult.textContent = '⚠️ 请先完成本阶段所有学习资源再提交考核。';
                quizResult.className = 'msg error';
            }
            return;
        }
    }

    var allConfirmed = questionStates.every(function(s) { return s && s.confirmed === true; });
    if (!allConfirmed) {
        if (quizResult) {
            quizResult.classList.remove('hidden');
            quizResult.textContent = '⚠️ 请先确认每道题的答案。';
            quizResult.className = 'msg error';
        }
        return;
    }

    await saveQuizStateToSupabase();

    var totalScore = 0;
    var earnedScore = 0;
    data.quiz.forEach(function(q, idx) {
        totalScore += (q.score || 0);
        var selected = questionStates[idx] ? questionStates[idx].selected || [] : [];
        var sortedSelected = selected.slice().sort();
        var sortedCorrect = (q.correct || []).slice().sort();
        if (JSON.stringify(sortedSelected) === JSON.stringify(sortedCorrect)) {
            earnedScore += (q.score || 0);
        }
    });

    var passThreshold = Math.round(totalScore * 0.8);
    var passed = earnedScore >= passThreshold;

    var results = currentUser.quiz_results || {};
    var stageKey = 'stage_' + targetStage;
    var stageDataObj = results[stageKey] || {};

    var currentResult = {
        correct: earnedScore,
        total: totalScore,
        passed: passed,
        date: new Date().toISOString()
    };

    var hasHistory = !!(stageDataObj.best || stageDataObj.last);

    stageDataObj.last = currentResult;

    var best = stageDataObj.best || null;
    if (!best || earnedScore > best.correct) {
        stageDataObj.best = {
            correct: earnedScore,
            total: totalScore,
            passed: passed,
            date: new Date().toISOString()
        };
    }

    results[stageKey] = stageDataObj;
    try {
        await supabaseClient.from('merchants').update({ quiz_results: results }).eq('id', currentUser.id);
        currentUser.quiz_results = results;
    } catch (e) {
        if (quizResult) {
            quizResult.classList.remove('hidden');
            quizResult.textContent = '❌ 保存成绩失败：' + e.message;
            quizResult.className = 'msg error';
        }
        return;
    }

    var bestData = stageDataObj.best;
    var lastData = stageDataObj.last;
    var bestPassed = bestData.passed;

    var displayMsg = '';
    displayMsg += (bestPassed ? '✅ 已通过' : '❌ 未通过') + '<br>';
    
    if (hasHistory) {
        displayMsg += '📊 本次成绩：' + lastData.correct + '/' + lastData.total + '（达标分 ' + passThreshold + '）<br>';
        displayMsg += '🏆 历史最好成绩：' + bestData.correct + '/' + bestData.total;
    } else {
        displayMsg += '📊 成绩：' + lastData.correct + '/' + lastData.total + '（达标分 ' + passThreshold + '）';
    }

    if (quizResult) {
        quizResult.classList.remove('hidden');
        quizResult.innerHTML = displayMsg;
        quizResult.className = bestPassed ? 'msg' : 'msg error';
    }

    var submitBtn = document.getElementById('submitQuizBtn');
    if (submitBtn) {
        if (hasHistory) {
            submitBtn.textContent = '🔄 重新提交';
        } else {
            submitBtn.textContent = '✅ 提交考核';
        }
        submitBtn.onclick = submitQuiz;
    }

    var refreshBtn = document.getElementById('refreshBtn');
    if (refreshBtn) {
        refreshBtn.disabled = false;
        refreshBtn.style.opacity = '1';
        refreshBtn.textContent = '🚀 进入最新阶段';
        refreshBtn.onclick = goToLatestStage;
    }

    if (!passed) {
        console.log('📝 本次未通过，停留在当前页面');
        if (quizResult) {
            quizResult.innerHTML = displayMsg + '<br>❌ 未达标，请重新作答后提交';
            quizResult.className = 'msg error';
        }
        return;
    }

    var isFirstPass = passed && !isStagePassed;
    var bestScore = best ? best.correct : 0;
    var isRetakePass = passed && isStagePassed && (earnedScore > bestScore);

    if (isFirstPass) {
        var newStages = (currentUser.completed_stages || []).concat([targetStage]);
        await supabaseClient.from('merchants').update({ completed_stages: newStages }).eq('id', currentUser.id);
        currentUser.completed_stages = newStages;

        var newLevel = getLevelFromStages(newStages);
        if (newLevel.id !== currentUser.level) {
            await supabaseClient.from('merchants').update({ level: newLevel.id }).eq('id', currentUser.id);
            currentUser.level = newLevel.id;
        }

        var maxUnlocked = currentUser.completed_stages.length > 0 ? Math.max.apply(null, currentUser.completed_stages) : 0;
        buildStageCards(stageList, currentViewStage, maxUnlocked);
        buildStageCards(stageListContent, currentViewStage, maxUnlocked);
        var done = Math.min(currentUser.completed_stages.length, TOTAL_STAGES);
        var pct = Math.round((done / TOTAL_STAGES) * 100);
        if (progressFill) progressFill.style.width = pct + '%';
        if (stepLabel) stepLabel.textContent = '学习进度 ' + pct + '% (' + done + '/' + TOTAL_STAGES + ')';
        var level = getLevelFromStages(currentUser.completed_stages);
        if (levelDisplay) levelDisplay.textContent = level.label;
        var nextLevel = level.next ? getLevelById(level.next) : null;
        if (nextLevelLabel) nextLevelLabel.textContent = nextLevel ? '下一等级：' + nextLevel.label : '🏆 已达最高等级';
        if (statusText) statusText.textContent = '📖 ' + (done >= TOTAL_STAGES ? '已完成全部阶段' : '当前阶段：' + currentViewStage) + ' · 等级 ' + level.label;

        if (quizResult) {
            quizResult.innerHTML = displayMsg + '<br>⏳ 5秒后自动进入最新阶段...';
            quizResult.className = 'msg';
        }

        var latestStage = getCurrentStage(currentUser.completed_stages || []);
        if (latestStage > TOTAL_STAGES) latestStage = TOTAL_STAGES;

        setTimeout(function() {
            if (currentViewStage !== latestStage) {
                switchStageSync(latestStage);
            } else {
                updateDashboard(currentUser);
            }
            if (quizResult) {
                quizResult.classList.add('hidden');
            }
        }, 5000);

    } else if (isRetakePass) {
        if (quizResult) {
            quizResult.innerHTML = displayMsg + '<br>⏳ 5秒后自动进入下一阶段...';
            quizResult.className = 'msg';
        }

        var nextStageRetake = targetStage + 1;
        if (nextStageRetake > TOTAL_STAGES) nextStageRetake = TOTAL_STAGES;

        setTimeout(function() {
            if (currentViewStage !== nextStageRetake) {
                switchStageSync(nextStageRetake);
            } else {
                updateDashboard(currentUser);
            }
            if (quizResult) {
                quizResult.classList.add('hidden');
            }
        }, 5000);
    } else {
        console.log('📝 重考通过但未超过历史最好成绩，停留在当前页面');
        if (quizResult) {
            quizResult.innerHTML = displayMsg + '<br>✅ 已通过（未超过历史最好成绩，可继续挑战更高分）';
            quizResult.className = 'msg';
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

    document.querySelectorAll('.stage-card').forEach(c => c.classList.remove('active'));
    const cards = document.querySelectorAll('.stage-card');
    if (cards[stageId - 1]) cards[stageId - 1].classList.add('active');
    const contentCards = document.querySelectorAll('#stageListContent .stage-card');
    if (contentCards[stageId - 1]) contentCards[stageId - 1].classList.add('active');

    isSwitching = false;

    isProcessingPopState = false;
    sessionStorage.removeItem('backGuardState');

    const toast = document.getElementById('backToast');
    if (toast) toast.remove();

    setupBackButtonGuard();

    setTimeout(() => {
        isHeaderInitialized = false;
        initStickyHeaders();
    }, 100);
}

// ========== Dashboard ==========
async function updateDashboard(user) {
    if (!user) return;
    
    if (user.id) {
        try {
            const { data, error } = await supabaseClient
                .from('merchants')
                .select('*')
                .eq('id', user.id)
                .single();
            if (!error && data) {
                currentUser = data;
                user = data;
                console.log('🔄 updateDashboard 刷新用户数据成功');
            }
        } catch (e) {
            console.warn('刷新用户数据失败，使用缓存数据', e);
            currentUser = user;
        }
    } else {
        currentUser = user;
    }
    
    const stages = currentUser.completed_stages || [];
    const level = getLevelFromStages(stages);
    
    if (level.id !== currentUser.level) {
        await supabaseClient
            .from('merchants')
            .update({ level: level.id })
            .eq('id', currentUser.id);
        currentUser.level = level.id;
    }

    const actualStage = getCurrentStage(stages);
    currentViewStage = actualStage > TOTAL_STAGES ? TOTAL_STAGES : actualStage;
    if (shopNameDisplay) shopNameDisplay.textContent = '🏪 ' + (currentUser.name || '商家');
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
        if (data.quiz && data.quiz.length > 0) {
            await renderQuiz(data.quiz);
            console.log(`✅ 二次渲染考核完成，阶段 ${currentViewStage}`);
        }
    } else {
        if (stageTitle) stageTitle.textContent = `📘 第${currentViewStage}阶段`;
        if (stageDesc) stageDesc.textContent = '数据加载失败，请检查网络或JSON文件。';
        if (resourcesContainer) resourcesContainer.innerHTML = '<p>❌ 无法加载阶段数据。</p>';
    }

    const maxUnlocked = stages.length > 0 ? Math.max(...stages) : 0;
    buildStageCards(stageList, currentViewStage, maxUnlocked);
    buildStageCards(stageListContent, currentViewStage, maxUnlocked);

    updateAvatar(currentUser);
    if (avatarWrapper) avatarWrapper.classList.add('visible');
    if (learnMsg) learnMsg.classList.add('hidden');
    if (quizResult) quizResult.classList.add('hidden');

    if (!isDataPreloaded) {
        setTimeout(preloadAllStages, 800);
    }

    initStickyControl();

    if (stages.length < TOTAL_STAGES) {
        setTimeout(() => {
            showBenefitsPopup();
        }, 800);
    }
}

// ========== 返回键拦截 ==========
const isWechat = /MicroMessenger/i.test(navigator.userAgent);
console.log('📱 是否微信环境:', isWechat);

function setupBackButtonGuard() {
    if (isLoggingOut) return;
    
    sessionStorage.removeItem('backGuardState');
    
    try {
        history.replaceState(null, '', window.location.href);
        
        const count = isWechat ? 10 : 3;
        for (let i = 0; i < count; i++) {
            history.pushState({ guard: true }, '');
        }
        console.log(`🛡️ 返回键拦截已启动（${isWechat ? '微信' : '普通'}环境，推入${count}个拦截状态）`);
    } catch(e) {
        console.warn('推入历史记录失败:', e);
        try { history.pushState({ guard: true }, ''); } catch(e2) {}
    }
    
    window.removeEventListener('popstate', handlePopState);
    window.addEventListener('popstate', handlePopState);
}

function handlePopState(event) {
    if (isProcessingPopState) {
        try {
            if (!history.state || !history.state.guard) {
                history.pushState({ guard: true }, '');
            }
        } catch(e) {}
        return;
    }
    isProcessingPopState = true;

    try {
        if (!event.state || !event.state.guard) {
            history.replaceState(null, '', window.location.href);
            const count = isWechat ? 10 : 3;
            for (let i = 0; i < count; i++) {
                history.pushState({ guard: true }, '');
            }
            isProcessingPopState = false;
            return;
        }
    } catch(e) {
        isProcessingPopState = false;
        return;
    }
    
    if (isLoggingOut) {
        try { history.pushState({ guard: true }, ''); } catch(e) {}
        isProcessingPopState = false;
        return;
    }
    
    showBackToast('⚠️ 请勿使用返回键，否则将退出此程序！');
    
    sessionStorage.removeItem('backGuardState');
    
    try {
        const count = isWechat ? 3 : 1;
        for (let i = 0; i < count; i++) {
            history.pushState({ guard: true }, '');
        }
    } catch(e) {}
    
    console.log('📱 返回键已处理');
    
    setTimeout(function() {
        isProcessingPopState = false;
    }, 200);
}

function showBackToast() {
    const oldToast = document.getElementById('backToast');
    if (oldToast) oldToast.remove();
    
    const styleId = 'backToastStyle';
    if (!document.getElementById(styleId)) {
        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = `
            @keyframes warningPulse {
                0%, 100% { transform: translateX(-50%) scale(1); background: rgba(200, 50, 50, 0.92); }
                50% { transform: translateX(-50%) scale(1.05); background: rgba(220, 30, 30, 0.98); }
            }
            .toast-warning {
                animation: warningPulse 0.6s ease 4 !important;
            }
        `;
        document.head.appendChild(style);
    }
    
    const toast = document.createElement('div');
    toast.id = 'backToast';
    toast.className = 'toast-warning';
    toast.innerHTML = '⚠️ 请勿使用返回键，否则将退出此程序！';
    
    toast.style.cssText = `
        position: fixed !important;
        bottom: 120px !important;
        left: 50% !important;
        transform: translateX(-50%) !important;
        background: rgba(200, 50, 50, 0.92) !important;
        color: #ffffff !important;
        padding: 14px 28px !important;
        border-radius: 30px !important;
        font-size: 17px !important;
        font-weight: 600 !important;
        z-index: 9999999 !important;
        box-shadow: 0 8px 32px rgba(200, 50, 50, 0.5) !important;
        font-family: system-ui, -apple-system, sans-serif !important;
        letter-spacing: 0.5px !important;
        max-width: 90% !important;
        text-align: center !important;
        white-space: nowrap !important;
        pointer-events: none !important;
        border: 2px solid rgba(255, 255, 255, 0.25) !important;
        user-select: none !important;
        -webkit-user-select: none !important;
    `;
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transition = 'opacity 0.3s ease';
        setTimeout(() => {
            if (toast.parentNode) toast.remove();
        }, 400);
    }, 4000);
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
            const loginStageData = stageData[currentViewStage];
            if (loginStageData) {
                await updateStageUI(loginStageData);
                if (loginStageData.quiz && loginStageData.quiz.length > 0) {
                    await renderQuiz(loginStageData.quiz);
                }
                console.log('✅ 登录后强制刷新阶段UI完成');
            }
            setupBackButtonGuard();
            saveRememberMe(phone, password);
            showAuthMsg(`欢迎回来，${existing.name}`, false);

            await supabaseClient
                .from('merchants')
                .update({ last_login: new Date().toISOString() })
                .eq('id', currentUser.id);

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
            setupBackButtonGuard();
            saveRememberMe(phone, password);
            showAuthMsg(`🎉 注册成功，${name}！`, false);

            await supabaseClient
                .from('merchants')
                .update({ last_login: new Date().toISOString() })
                .eq('id', currentUser.id);

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

// 跳转到最新阶段
async function goToLatestStage() {
    if (!currentUser) return;
    try {
        const { data, error } = await supabaseClient
            .from('merchants')
            .select('*')
            .eq('id', currentUser.id)
            .single();
        if (error) throw error;
        
        currentUser = data;
        
        const stages = currentUser.completed_stages || [];
        const nextStage = getCurrentStage(stages);
        if (nextStage > TOTAL_STAGES) {
            alert('🎉 您已完成全部阶段！');
            return;
        }
        
        currentViewStage = nextStage;
        
        await updateDashboard(currentUser);
        
        const stageDataForRefresh = stageData[currentViewStage];
        if (stageDataForRefresh) {
            if (quizResult) {
                quizResult.classList.add('hidden');
                quizResult.innerHTML = '';
            }
            await updateStageUI(stageDataForRefresh);
            if (stageDataForRefresh.quiz && stageDataForRefresh.quiz.length > 0) {
                await renderQuiz(stageDataForRefresh.quiz);
            }
            console.log(`✅ 强制刷新阶段 ${currentViewStage} UI 完成`);
        }
        
        document.querySelectorAll('.stage-card').forEach(c => c.classList.remove('active'));
        const cards = document.querySelectorAll('.stage-card');
        if (cards[nextStage - 1]) cards[nextStage - 1].classList.add('active');
        const contentCards = document.querySelectorAll('#stageListContent .stage-card');
        if (contentCards[nextStage - 1]) contentCards[nextStage - 1].classList.add('active');
        
        console.log(`✅ 已进入最新阶段: ${nextStage}`);
    } catch (e) {
        alert('跳转失败: ' + e.message);
        console.error('goToLatestStage 错误:', e);
    }
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

// ========== 更改店铺名 ==========
function openShopNameModal() {
    if (!currentUser) return;
    const newName = prompt('请输入新的店铺名称：', currentUser.name);
    if (newName === null) return;
    const trimmed = newName.trim();
    if (!trimmed) {
        alert('店铺名不能为空');
        return;
    }
    if (trimmed === currentUser.name) {
        alert('新名称与当前名称相同');
        return;
    }
    supabaseClient
        .from('merchants')
        .update({ name: trimmed })
        .eq('id', currentUser.id)
        .then(({ error }) => {
            if (error) {
                alert('更新失败：' + error.message);
                return;
            }
            currentUser.name = trimmed;
            shopNameDisplay.textContent = trimmed;
            alert('✅ 店铺名已更新！');
        })
        .catch(e => alert('错误：' + e.message));
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
        
        sessionStorage.removeItem('backGuardState');
        
        isLoggingOut = false;
        isProcessingPopState = false;
        
        window.removeEventListener('popstate', handlePopState);
        history.replaceState(null, '', window.location.href);
        
        const toast = document.getElementById('backToast');
        if (toast) toast.remove();
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
            headerList.push({
                el: item.header,
                start: Infinity,
                end: Infinity,
                id: item.header.id
            });
            continue;
        }

        const rect = item.triggerEl.getBoundingClientRect();
        const start = rect.top + scrollY - rect.height;

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
if (refreshBtn) refreshBtn.addEventListener('click', goToLatestStage);

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

if (changeShopNameBtn) {
    changeShopNameBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        if (dropdownMenu) dropdownMenu.classList.remove('open');
        openShopNameModal();
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

if (phoneInput) phoneInput.addEventListener('keyup', (e) => { if (e.key === 'Enter') handleAuth(); });
if (passwordInput) passwordInput.addEventListener('keyup', (e) => { if (e.key === 'Enter') handleAuth(); });
if (nameInput) nameInput.addEventListener('keyup', (e) => { if (e.key === 'Enter') handleAuth(); });

document.getElementById('submitQuizBtn').addEventListener('click', submitQuiz);

console.log('🐿️ 松鼠逛逛商家学堂');

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
    Object.keys(localStorage).forEach(key => {
        if (key.startsWith('progress_')) {
            localStorage.removeItem(key);
            console.log('已清除缓存:', key);
        }
    });
    const savedPhone = localStorage.getItem('squirrel_phone');
    const savedPass = localStorage.getItem('squirrel_pass');
    if (savedPhone && savedPass && phoneInput && passwordInput) {
        phoneInput.value = savedPhone;
        passwordInput.value = atob(savedPass);
        document.getElementById('rememberMe').checked = true;
    }

    initFloatNav();
    renderBenefitsTable();
    const togglePassword = document.getElementById('togglePassword');
    if (togglePassword && passwordInput) {
        togglePassword.addEventListener('click', function() {
            const isPassword = passwordInput.type === 'password';
            passwordInput.type = isPassword ? 'text' : 'password';
            this.textContent = isPassword ? '🙈' : '👁️';
        });
    }
    const toggleBtn = document.getElementById('benefitsToggleBtn');
    const tableWrap = document.getElementById('benefitsTableWrap');
    if (toggleBtn && tableWrap) {
        let expanded = false;
        toggleBtn.addEventListener('click', function() {
            expanded = !expanded;
            tableWrap.classList.toggle('expanded', expanded);
            toggleBtn.textContent = expanded ? '▼ 收起权益详情' : '▶ 展开权益详情';

            isHeaderInitialized = false;
            setTimeout(function() {
                initStickyHeaders();
                handleScroll();
            }, 50);
        });
    }
});