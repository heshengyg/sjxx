// =====================================================
// app.js - 完整重构版（含学习资源、计时、自动晋级）
// 保留原登录/头像/密码功能，新增学习进度体系
// =====================================================

// ========== 配置 ==========
const SUPABASE_URL = 'https://sjgegoibummrvyuhehco.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_qnadIPVLPkAgIe5w_aR0lg_zy7VnqPC';
const STORAGE_BUCKET = 'avatars';

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ========== 哈希 ==========
function hashPassword(password) {
    return CryptoJS.SHA256(password).toString();
}

// ========== 等级定义 ==========
const LEVELS = [
    { id: 'beginner', label: '入门商家', stages: [1,2], quizPass: 80, next: 'advanced' },
    { id: 'advanced', label: '进阶商家', stages: [3,4], quizPass: 85, next: 'senior' },
    { id: 'senior', label: '资深商家', stages: [5], quizPass: 90, next: 'elite' },
    { id: 'elite', label: '精英商家', stages: [6], quizPass: 90, next: null }
];
const TOTAL_STAGES = 6;

// ========== 全局状态 ==========
let currentUser = null;
let currentViewStage = 1;                 // 当前查看的阶段（1-6）
let allResources = {};                   // { stage: [resource] }
let allQuizzes = {};                     // { stage: [question] }
let progressMap = {};                    // { resourceId: { progress: 0, completed: false } }
let timerIntervals = {};                 // { resourceId: intervalId }
let timerElapsed = {};                   // { resourceId: 已累计秒数 }
let activeResourceId = null;             // 当前模态框打开的 resource id
let currentImageResources = [];          // 用于图片切换
let currentImageIdx = 0;
let questionStates = [];                 // 考核题目状态

// ========== DOM 引用（与原有保持一致） ==========
const authCard = document.getElementById('authCard');
const dashboard = document.getElementById('dashboard');
const phoneInput = document.getElementById('phoneInput');
const passwordInput = document.getElementById('passwordInput');
const nameInput = document.getElementById('nameInput');
const authBtn = document.getElementById('authBtn');
const authMsg = document.getElementById('authMsg');
const shopNameDisplay = document.getElementById('shopNameDisplay');
const levelDisplay = document.getElementById('levelDisplay');
const statusText = document.getElementById('statusText');
const progressFill = document.getElementById('progressFill');
const stepLabel = document.getElementById('stepLabel');
const nextLevelLabel = document.getElementById('nextLevelLabel');
const stageTitle = document.getElementById('stageTitle');
const stageDesc = document.getElementById('stageDesc');
const resourcesContainer = document.getElementById('resourcesContainer'); // 新容器
const markLearnBtn = document.getElementById('markLearnBtn');
const learnMsg = document.getElementById('learnMsg');
const quizContainer = document.getElementById('quizContainer');
const submitQuizBtn = document.getElementById('submitQuizBtn');
const quizResult = document.getElementById('quizResult');
const refreshBtn = document.getElementById('refreshBtn');
const stageSelector = document.getElementById('stageSelector');

// 头像相关
const avatarWrapper = document.getElementById('avatarWrapper');
const avatarCircle = document.getElementById('avatarCircle');
const dropdownMenu = document.getElementById('dropdownMenu');
const changeAvatarBtn = document.getElementById('changeAvatarBtn');
const changePasswordBtn = document.getElementById('changePasswordBtn');
const logoutBtn = document.getElementById('logoutBtn');

// 模态框
const avatarModal = document.getElementById('avatarModal');
const avatarFileInput = document.getElementById('avatarFileInput');
const modalAvatarPreview = document.getElementById('modalAvatarPreview');
const avatarModalMsg = document.getElementById('avatarModalMsg');
const avatarSaveBtn = document.getElementById('avatarSaveBtn');
const avatarCancelBtn = document.getElementById('avatarCancelBtn');

const passwordModal = document.getElementById('passwordModal');
const oldPasswordInput = document.getElementById('oldPasswordInput');
const newPasswordInput = document.getElementById('newPasswordInput');
const confirmPasswordInput = document.getElementById('confirmPasswordInput');
const passwordModalMsg = document.getElementById('passwordModalMsg');
const passwordSaveBtn = document.getElementById('passwordSaveBtn');
const passwordCancelBtn = document.getElementById('passwordCancelBtn');

// 详情模态框（需要新增，若不存在请添加）
const detailModal = document.getElementById('detailModal');
const detailTitle = document.getElementById('detailTitle');
const detailBody = document.getElementById('detailBody');
const detailProgress = document.getElementById('detailProgress');
const detailCloseBtn = document.getElementById('detailCloseBtn');

// ========== 辅助函数 ==========
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
function getLevelById(id) {
    return LEVELS.find(l => l.id === id) || LEVELS[0];
}
function formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}分${s}秒`;
}

// ========== 更新头像（原样保留） ==========
function updateAvatar(user) {
    if (!user) return;
    const avatarUrl = user.avatar_url;
    if (avatarUrl) {
        avatarCircle.style.backgroundImage = `url(${avatarUrl})`;
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
        if (avatarUrl) {
            modalAvatarPreview.style.backgroundImage = `url(${avatarUrl})`;
            modalAvatarPreview.style.backgroundSize = 'cover';
            modalAvatarPreview.style.backgroundPosition = 'center';
            modalAvatarPreview.textContent = '';
        } else {
            modalAvatarPreview.style.backgroundImage = '';
            modalAvatarPreview.textContent = (user.name || '商').charAt(0).toUpperCase();
        }
    }
}

// ==================== 数据加载 ====================
async function loadAllData() {
    // 加载所有资源
    const { data: resources, error: rErr } = await supabaseClient
        .from('learning_resources')
        .select('*')
        .order('stage', { ascending: true })
        .order('sort_order', { ascending: true });
    if (rErr) throw rErr;
    allResources = {};
    resources.forEach(r => {
        if (!allResources[r.stage]) allResources[r.stage] = [];
        allResources[r.stage].push(r);
    });

    // 加载所有考核
    const { data: quizzes, error: qErr } = await supabaseClient
        .from('quiz_questions')
        .select('*')
        .order('stage', { ascending: true })
        .order('sort_order', { ascending: true });
    if (qErr) throw qErr;
    allQuizzes = {};
    quizzes.forEach(q => {
        if (!allQuizzes[q.stage]) allQuizzes[q.stage] = [];
        allQuizzes[q.stage].push(q);
    });

    // 加载用户进度
    if (currentUser) {
        const { data: prog, error: pErr } = await supabaseClient
            .from('user_learning_progress')
            .select('*')
            .eq('user_id', currentUser.id);
        if (pErr) throw pErr;
        progressMap = {};
        prog.forEach(p => {
            progressMap[p.resource_id] = { progress: p.progress_percent, completed: p.completed };
        });
    }
}

// ==================== 渲染阶段内容 ====================
function renderStageContent(stage) {
    // 解锁检查
    const completed = currentUser.completed_stages || [];
    const maxUnlocked = completed.length > 0 ? Math.max(...completed) : 0;
    if (stage > maxUnlocked + 1) {
        resourcesContainer.innerHTML = '<p style="color:#b33;">🔒 该阶段尚未解锁，请先完成前面阶段。</p>';
        quizContainer.innerHTML = '';
        return;
    }

    // 渲染资源
    const resources = allResources[stage] || [];
    resourcesContainer.innerHTML = '';
    if (resources.length === 0) {
        resourcesContainer.innerHTML = '<p>📭 本阶段暂无学习资料。</p>';
    } else {
        resources.forEach(r => {
            const div = document.createElement('div');
            div.className = 'resource-item';
            if (progressMap[r.id] && progressMap[r.id].completed) div.classList.add('completed');

            // 缩略图
            const thumb = document.createElement('div');
            thumb.className = 'thumb';
            if (r.type === 'video' && r.file_path) {
                thumb.style.backgroundImage = `url('${r.file_path.replace(/\.\w+$/, '.jpg')}')`; // 假设有同名封面
            } else if (r.type === 'image' && r.file_path) {
                thumb.style.backgroundImage = `url('${r.file_path}')`;
            } else {
                thumb.style.background = '#d0d9e2';
                thumb.textContent = r.type === 'article' ? '📄' : '🎬';
                thumb.style.display = 'flex';
                thumb.style.alignItems = 'center';
                thumb.style.justifyContent = 'center';
                thumb.style.fontSize = '28px';
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
            const prog = progressMap[r.id];
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
            const typeMap = { 'video': '视频', 'image': '图片', 'article': '文章' };
            badge.textContent = typeMap[r.type] || r.type;
            div.appendChild(badge);

            div.addEventListener('click', function() {
                openResourceDetail(r.id);
            });
            resourcesContainer.appendChild(div);
        });
    }

    // 渲染考核
    renderQuiz(stage);
    updateStageProgress(stage);
}

// ========== 渲染考核 ==========
function renderQuiz(stage) {
    const questions = allQuizzes[stage] || [];
    quizContainer.innerHTML = '';
    if (questions.length === 0) {
        quizContainer.innerHTML = '<p style="color:#5e6f7d;">📭 本阶段暂无考核。</p>';
        submitQuizBtn.disabled = true;
        return;
    }
    submitQuizBtn.disabled = false;
    questionStates = questions.map(() => ({ confirmed: false, selected: [] }));

    questions.forEach((q, idx) => {
        const wrapper = document.createElement('div');
        wrapper.className = 'quiz-item';
        wrapper.dataset.idx = idx;
        const isMultiple = q.type === 'multiple';
        const options = q.options || [];

        const qText = document.createElement('div');
        qText.className = 'q-text';
        qText.textContent = `${idx+1}. ${q.question}`;
        wrapper.appendChild(qText);

        const optionsDiv = document.createElement('div');
        optionsDiv.className = 'options';
        options.forEach((optText, optIdx) => {
            const label = document.createElement('label');
            label.className = 'option-item';
            const input = document.createElement('input');
            input.type = isMultiple ? 'checkbox' : 'radio';
            input.name = `q${idx}`;
            input.value = optIdx;
            input.disabled = false;
            const span = document.createElement('span');
            span.textContent = optText;
            label.appendChild(input);
            label.appendChild(span);
            optionsDiv.appendChild(label);

            input.addEventListener('change', function() {
                if (questionStates[idx].confirmed) { this.checked = false; return; }
                const selected = questionStates[idx].selected;
                if (isMultiple) {
                    if (this.checked) {
                        if (!selected.includes(optIdx)) selected.push(optIdx);
                    } else {
                        const pos = selected.indexOf(optIdx);
                        if (pos !== -1) selected.splice(pos, 1);
                    }
                } else {
                    if (this.checked) {
                        selected.length = 0;
                        selected.push(optIdx);
                        const siblings = this.closest('.options').querySelectorAll('input[type="radio"]');
                        siblings.forEach(sib => { if (sib !== this) sib.checked = false; });
                    } else {
                        const pos = selected.indexOf(optIdx);
                        if (pos !== -1) selected.splice(pos, 1);
                    }
                }
            });
        });
        wrapper.appendChild(optionsDiv);

        const btnDiv = document.createElement('div');
        const confirmBtn = document.createElement('button');
        confirmBtn.className = 'confirm-btn';
        confirmBtn.textContent = '确认答案';
        confirmBtn.dataset.idx = idx;
        confirmBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            const i = parseInt(this.dataset.idx);
            const state = questionStates[i];
            if (!state.confirmed) {
                if (state.selected.length === 0) { alert('请先选择一个选项'); return; }
                state.confirmed = true;
                const item = this.closest('.quiz-item');
                const inputs = item.querySelectorAll('input');
                inputs.forEach(inp => inp.disabled = true);
                item.classList.add('confirmed');
                this.textContent = '修改答案';
                this.classList.add('modify');
                const badge = document.createElement('span');
                badge.className = 'status-badge';
                badge.textContent = '✅ 已确认';
                const existing = item.querySelector('.status-badge');
                if (existing) existing.remove();
                this.parentNode.appendChild(badge);
            } else {
                state.confirmed = false;
                const item = this.closest('.quiz-item');
                const inputs = item.querySelectorAll('input');
                inputs.forEach(inp => inp.disabled = false);
                item.classList.remove('confirmed');
                this.textContent = '确认答案';
                this.classList.remove('modify');
                const badge = item.querySelector('.status-badge');
                if (badge) badge.remove();
            }
        });
        btnDiv.appendChild(confirmBtn);
        wrapper.appendChild(btnDiv);
        quizContainer.appendChild(wrapper);
    });
}

// ========== 阶段进度汇总 ==========
function updateStageProgress(stage) {
    const resources = allResources[stage] || [];
    const total = resources.length;
    const completed = resources.filter(r => progressMap[r.id] && progressMap[r.id].completed).length;
    let totalDuration = 0, elapsed = 0;
    resources.forEach(r => {
        totalDuration += r.duration_seconds;
        const prog = progressMap[r.id];
        if (prog) elapsed += (prog.progress / 100) * r.duration_seconds;
    });
    const remaining = Math.max(0, totalDuration - elapsed);
    stageDesc.innerHTML = `资源完成：${completed}/${total}  |  已学 ${formatTime(elapsed)}  /  总需 ${formatTime(totalDuration)}  |  剩余 ${formatTime(remaining)}`;
}

// ==================== 资源详情模态框 ====================
function openResourceDetail(resourceId) {
    // 查找资源
    let resource = null, stage = 1;
    for (let s in allResources) {
        const found = allResources[s].find(r => r.id === resourceId);
        if (found) { resource = found; stage = parseInt(s); break; }
    }
    if (!resource) return;

    // 收集同阶段同类型资源（用于图片切换）
    const stageResources = allResources[stage] || [];
    currentImageResources = stageResources.filter(r => r.type === resource.type);
    currentImageIdx = currentImageResources.findIndex(r => r.id === resourceId);

    detailTitle.textContent = resource.title;
    detailBody.innerHTML = '';
    detailProgress.textContent = '';

    if (resource.type === 'video') {
        const video = document.createElement('video');
        video.src = resource.file_path;
        video.controls = true;
        video.playsInline = true;
        video.style.width = '100%';
        video.style.borderRadius = '12px';
        // 防拖拽：监听 seeking，强制回到记录位置
        let lastTime = 0;
        video.addEventListener('timeupdate', function() {
            lastTime = video.currentTime;
            const pct = Math.round((video.currentTime / video.duration) * 100);
            updateResourceProgress(resource.id, pct);
            if (pct >= 100) markResourceCompleted(resource.id);
        });
        video.addEventListener('seeking', function() {
            // 如果用户拖动导致时间变化超过1秒，强制回退
            if (Math.abs(video.currentTime - lastTime) > 1) {
                video.currentTime = lastTime;
            }
        });
        video.addEventListener('ended', function() {
            markResourceCompleted(resource.id);
        });
        detailBody.appendChild(video);
        video.play();
        activeResourceId = resource.id;
        // 开始计时（视频由 timeupdate 驱动，无需额外计时器）
    } else if (resource.type === 'image') {
        const img = document.createElement('img');
        img.src = resource.file_path;
        img.style.width = '100%';
        img.style.borderRadius = '12px';
        detailBody.appendChild(img);
        // 图片导航
        if (currentImageResources.length > 1) {
            const nav = document.createElement('div');
            nav.className = 'img-nav';
            const prevBtn = document.createElement('button');
            prevBtn.textContent = '◀ 上一张';
            prevBtn.addEventListener('click', function() { navigateImage(-1); });
            const nextBtn = document.createElement('button');
            nextBtn.textContent = '下一张 ▶';
            nextBtn.addEventListener('click', function() { navigateImage(1); });
            nav.appendChild(prevBtn);
            nav.appendChild(nextBtn);
            detailBody.appendChild(nav);
        }
        activeResourceId = resource.id;
        startTimer(resource.id, resource.duration_seconds);
    } else if (resource.type === 'article') {
        const div = document.createElement('div');
        div.className = 'article-content';
        div.innerHTML = resource.content || '暂无内容';
        detailBody.appendChild(div);
        activeResourceId = resource.id;
        startTimer(resource.id, resource.duration_seconds);
    }

    detailModal.classList.add('open');
    updateDetailProgress(resource.id);
}

function closeDetailModal() {
    detailModal.classList.remove('open');
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
    detailTitle.textContent = newRes.title;
    const img = detailBody.querySelector('img');
    if (img) img.src = newRes.file_path;
    // 重置计时器
    if (activeResourceId) stopTimer(activeResourceId);
    activeResourceId = newRes.id;
    startTimer(newRes.id, newRes.duration_seconds);
    updateDetailProgress(newRes.id);
}

// ==================== 计时器管理 ====================
function startTimer(resourceId, duration) {
    if (timerIntervals[resourceId]) return;
    if (progressMap[resourceId] && progressMap[resourceId].completed) return;
    if (!timerElapsed[resourceId]) timerElapsed[resourceId] = 0;
    const interval = setInterval(() => {
        timerElapsed[resourceId] += 1;
        const elapsed = timerElapsed[resourceId];
        const progress = Math.min(100, Math.round((elapsed / duration) * 100));
        updateResourceProgress(resourceId, progress);
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
    const p = progressMap[resourceId];
    if (p) {
        detailProgress.textContent = `学习进度：${p.progress}% ${p.completed ? '✅ 已完成' : ''}`;
    } else {
        detailProgress.textContent = '学习进度：0%';
    }
}

// ==================== 进度更新与完成 ====================
async function updateResourceProgress(resourceId, progress) {
    if (!currentUser) return;
    if (!progressMap[resourceId]) progressMap[resourceId] = { progress: 0, completed: false };
    progressMap[resourceId].progress = Math.min(100, progress);
    await supabaseClient
        .from('user_learning_progress')
        .upsert({
            user_id: currentUser.id,
            resource_id: resourceId,
            progress_percent: progressMap[resourceId].progress,
            completed: progressMap[resourceId].completed,
            last_updated: new Date().toISOString()
        }, { onConflict: 'user_id, resource_id' });
    // 刷新当前阶段列表
    renderStageContent(currentViewStage);
}

async function markResourceCompleted(resourceId) {
    if (!currentUser) return;
    if (progressMap[resourceId] && progressMap[resourceId].completed) return;
    progressMap[resourceId] = { progress: 100, completed: true };
    await supabaseClient
        .from('user_learning_progress')
        .upsert({
            user_id: currentUser.id,
            resource_id: resourceId,
            progress_percent: 100,
            completed: true,
            last_updated: new Date().toISOString()
        }, { onConflict: 'user_id, resource_id' });
    // 检查当前阶段是否全部完成
    const resources = allResources[currentViewStage] || [];
    const allCompleted = resources.every(r => progressMap[r.id] && progressMap[r.id].completed);
    if (allCompleted) {
        // 自动触发考核可用，但不要自动提交，等待用户操作
        // 可以显示提示
        learnMsg.classList.remove('hidden');
        learnMsg.textContent = '🎉 本阶段所有学习资源已完成，请完成考核以晋级！';
    }
    renderStageContent(currentViewStage);
    updateDetailProgress(resourceId);
}

// ==================== 提交考核（重写） ====================
async function submitQuiz() {
    if (!currentUser) return;
    const stages = currentUser.completed_stages || [];
    const actualStage = getCurrentStage(stages);
    if (currentViewStage !== actualStage || actualStage > 6) {
        quizResult.classList.remove('hidden');
        quizResult.textContent = '⚠️ 只能提交当前阶段的考核。';
        return;
    }

    // 检查资源是否全部完成
    const resources = allResources[actualStage] || [];
    const allCompleted = resources.every(r => progressMap[r.id] && progressMap[r.id].completed);
    if (!allCompleted) {
        quizResult.classList.remove('hidden');
        quizResult.textContent = '⚠️ 请先完成本阶段所有学习资源再提交考核。';
        return;
    }

    // 检查题目是否全部确认
    const allConfirmed = questionStates.every(s => s.confirmed);
    if (!allConfirmed) {
        quizResult.classList.remove('hidden');
        quizResult.textContent = '⚠️ 请先确认每道题的答案。';
        return;
    }

    const questions = allQuizzes[actualStage] || [];
    if (questions.length === 0) {
        quizResult.classList.remove('hidden');
        quizResult.textContent = '本阶段无考核，无需提交。';
        return;
    }

    let correctCount = 0;
    questions.forEach((q, idx) => {
        const selected = questionStates[idx].selected || [];
        const sortedSelected = [...selected].sort();
        const sortedCorrect = (q.correct_answers || []).sort();
        if (JSON.stringify(sortedSelected) === JSON.stringify(sortedCorrect)) correctCount++;
    });

    const total = questions.length;
    const passRate = Math.round((correctCount / total) * 100);
    const level = getLevelFromStages(stages);
    const passThreshold = level.quizPass || 80;
    const passed = passRate >= passThreshold;

    const results = currentUser.quiz_results || {};
    results[`stage_${actualStage}`] = { correct: correctCount, total, passRate, passed, date: new Date().toISOString() };
    try {
        await supabaseClient.from('merchants').update({ quiz_results: results }).eq('id', currentUser.id);
        currentUser.quiz_results = results;

        if (passed) {
            // 标记阶段完成
            if (!stages.includes(actualStage)) {
                const newStages = [...stages, actualStage];
                await supabaseClient.from('merchants').update({ completed_stages: newStages }).eq('id', currentUser.id);
                currentUser.completed_stages = newStages;
                // 检查是否升级
                const newLevel = getLevelFromStages(newStages);
                if (newLevel.id !== currentUser.level) {
                    await supabaseClient.from('merchants').update({ level: newLevel.id }).eq('id', currentUser.id);
                    currentUser.level = newLevel.id;
                }
                // 自动切换到下一阶段（如果存在）
                const nextStage = getCurrentStage(newStages);
                if (nextStage <= TOTAL_STAGES) {
                    currentViewStage = nextStage;
                }
                await updateDashboard(currentUser);
                quizResult.classList.remove('hidden');
                quizResult.textContent = `🎉 考核通过 (${passRate}%)，已晋级！${nextStage <= TOTAL_STAGES ? '进入下一阶段' : '全部完成！'}`;
            } else {
                quizResult.classList.remove('hidden');
                quizResult.textContent = `✅ 考核通过 (${passRate}%)，但阶段已标记完成，无需重复晋级。`;
            }
        } else {
            quizResult.classList.remove('hidden');
            quizResult.textContent = `📘 考核未通过 (${passRate}%，需≥${passThreshold}%)，请复习后重试。`;
        }
        // 刷新界面
        await updateDashboard(currentUser);
    } catch (e) {
        quizResult.classList.remove('hidden');
        quizResult.textContent = '❌ ' + e.message;
    }
}

// ==================== 更新仪表盘（主入口） ====================
async function updateDashboard(user) {
    if (!user) return;
    currentUser = user;
    const stages = user.completed_stages || [];
    const level = getLevelFromStages(stages);
    currentLevelObj = level;
    const actualStage = getCurrentStage(stages);

    // 若查看阶段未设置或超出，设为实际阶段
    if (!currentViewStage || currentViewStage < 1 || currentViewStage > TOTAL_STAGES) {
        currentViewStage = actualStage > TOTAL_STAGES ? TOTAL_STAGES : actualStage;
    }

    // 更新头部信息
    shopNameDisplay.textContent = user.name || '商家';
    levelDisplay.textContent = level.label;

    const done = Math.min(stages.length, TOTAL_STAGES);
    const pct = Math.round((done / TOTAL_STAGES) * 100);
    progressFill.style.width = pct + '%';
    stepLabel.textContent = `学习进度 ${pct}% (${done}/${TOTAL_STAGES})`;
    const nextLevel = level.next ? getLevelById(level.next) : null;
    nextLevelLabel.textContent = nextLevel ? `下一等级：${nextLevel.label}` : '🏆 已达最高等级';
    const stageStatus = (actualStage > TOTAL_STAGES) ? '已完成全部阶段' : `当前阶段：${actualStage}`;
    statusText.textContent = `📖 ${stageStatus} · 等级 ${level.label}`;

    // 加载数据（资源/考题/进度）
    await loadAllData();

    // 更新阶段选择器（只显示已解锁阶段）
    const maxUnlocked = stages.length > 0 ? Math.max(...stages) : 0;
    stageSelector.innerHTML = '';
    for (let i = 1; i <= Math.min(maxUnlocked + 1, TOTAL_STAGES); i++) {
        const opt = document.createElement('option');
        opt.value = i;
        opt.textContent = `第${i}阶段`;
        if (i === currentViewStage) opt.selected = true;
        stageSelector.appendChild(opt);
    }

    // 渲染当前查看阶段
    const stageInfo = STAGE_INFO[currentViewStage] || { title: `第${currentViewStage}阶段`, desc: '' };
    stageTitle.textContent = `📘 ${stageInfo.title}`;
    stageDesc.textContent = stageInfo.desc;
    renderStageContent(currentViewStage);

    // 控制按钮：只有查看阶段 == 实际阶段且未完成全部才可用
    const isCurrent = (currentViewStage === actualStage && actualStage <= TOTAL_STAGES);
    markLearnBtn.disabled = !isCurrent;
    submitQuizBtn.disabled = !isCurrent;

    updateAvatar(user);
    avatarWrapper.classList.add('visible');
    learnMsg.classList.add('hidden');
    quizResult.classList.add('hidden');
}

// ==================== 登录/注册（原样保留） ====================
async function handleAuth() {
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
            if (existing.password !== hashed) {
                showAuthMsg('❌ 密码错误，请重试');
                return;
            }
            currentUser = existing;
            authCard.classList.add('hidden');
            dashboard.classList.remove('hidden');
            const stages = existing.completed_stages || [];
            currentViewStage = getCurrentStage(stages);
            if (currentViewStage > TOTAL_STAGES) currentViewStage = TOTAL_STAGES;
            await updateDashboard(currentUser);
            showAuthMsg(`欢迎回来，${existing.name}`, false);
        } else {
            if (!name) { showAuthMsg('请填写店铺名称'); return; }
            const newUser = {
                phone,
                name,
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
            authCard.classList.add('hidden');
            dashboard.classList.remove('hidden');
            currentViewStage = 1;
            await updateDashboard(currentUser);
            showAuthMsg(`🎉 注册成功，${name}！开始学习吧。`, false);
        }
    } catch (e) {
        showAuthMsg('❌ ' + e.message);
        console.error(e);
    }
}

function showAuthMsg(text, isError = true) {
    authMsg.classList.remove('hidden');
    authMsg.textContent = text;
    authMsg.className = 'msg' + (isError ? ' error' : '');
}

// ==================== 标记学习（已被资源完成机制替代，保留但建议移除） ====================
async function markLearn() {
    // 新机制下，标记学习已由资源完成自动触发，此函数可保留为空或显示提示
    learnMsg.classList.remove('hidden');
    learnMsg.textContent = '📌 学习进度已由系统自动追踪，无需手动标记。';
}

// ==================== 刷新 ====================
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
    } catch (e) {
        alert('刷新失败: ' + e.message);
    }
}

// ==================== 头像、密码等（原样） ====================
let selectedFile = null;
function openAvatarModal() {
    selectedFile = null;
    avatarFileInput.value = '';
    avatarModalMsg.classList.add('hidden');
    avatarModalMsg.textContent = '';
    updateAvatar(currentUser);
    avatarModal.classList.add('open');
}
avatarFileInput.addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 50 * 1024) {
        avatarModalMsg.classList.remove('hidden');
        avatarModalMsg.textContent = '❌ 图片大小不能超过50KB，请压缩后重试。';
        avatarModalMsg.className = 'msg error';
        this.value = '';
        return;
    }
    const reader = new FileReader();
    reader.onload = function(ev) {
        modalAvatarPreview.style.backgroundImage = `url(${ev.target.result})`;
        modalAvatarPreview.style.backgroundSize = 'cover';
        modalAvatarPreview.style.backgroundPosition = 'center';
        modalAvatarPreview.textContent = '';
    };
    reader.readAsDataURL(file);
    selectedFile = file;
    avatarModalMsg.classList.add('hidden');
});
async function saveAvatar() {
    if (!selectedFile) {
        avatarModalMsg.classList.remove('hidden');
        avatarModalMsg.textContent = '请先选择一张图片。';
        return;
    }
    if (!currentUser) return;
    const fileExt = selectedFile.name.split('.').pop();
    const fileName = `${currentUser.id}_${Date.now()}.${fileExt}`;
    const filePath = `public/${fileName}`;
    try {
        const { data, error } = await supabaseClient.storage
            .from(STORAGE_BUCKET)
            .upload(filePath, selectedFile, { cacheControl: '3600', upsert: false });
        if (error) throw error;
        const { data: urlData } = supabaseClient.storage.from(STORAGE_BUCKET).getPublicUrl(filePath);
        const avatarUrl = urlData.publicUrl;
        const { error: updateErr } = await supabaseClient
            .from('merchants')
            .update({ avatar_url: avatarUrl })
            .eq('id', currentUser.id);
        if (updateErr) throw updateErr;
        currentUser.avatar_url = avatarUrl;
        updateAvatar(currentUser);
        avatarModalMsg.classList.remove('hidden');
        avatarModalMsg.textContent = '✅ 头像已更新！';
        avatarModalMsg.className = 'msg';
        setTimeout(() => avatarModal.classList.remove('open'), 1000);
    } catch (e) {
        avatarModalMsg.classList.remove('hidden');
        avatarModalMsg.textContent = '❌ ' + e.message;
        avatarModalMsg.className = 'msg error';
    }
}

function openPasswordModal() {
    oldPasswordInput.value = '';
    newPasswordInput.value = '';
    confirmPasswordInput.value = '';
    passwordModalMsg.classList.add('hidden');
    passwordModalMsg.textContent = '';
    passwordModal.classList.add('open');
}
async function savePassword() {
    const old = oldPasswordInput.value.trim();
    const newPwd = newPasswordInput.value.trim();
    const confirm = confirmPasswordInput.value.trim();
    if (!old || !newPwd || !confirm) {
        passwordModalMsg.classList.remove('hidden');
        passwordModalMsg.textContent = '请填写所有字段。';
        return;
    }
    if (newPwd.length < 6) {
        passwordModalMsg.classList.remove('hidden');
        passwordModalMsg.textContent = '新密码至少6位。';
        return;
    }
    if (newPwd !== confirm) {
        passwordModalMsg.classList.remove('hidden');
        passwordModalMsg.textContent = '两次输入的新密码不一致。';
        return;
    }
    const hashedOld = hashPassword(old);
    if (hashedOld !== currentUser.password) {
        passwordModalMsg.classList.remove('hidden');
        passwordModalMsg.textContent = '❌ 旧密码错误。';
        return;
    }
    const hashedNew = hashPassword(newPwd);
    try {
        const { error } = await supabaseClient
            .from('merchants')
            .update({ password: hashedNew })
            .eq('id', currentUser.id);
        if (error) throw error;
        currentUser.password = hashedNew;
        passwordModalMsg.classList.remove('hidden');
        passwordModalMsg.textContent = '✅ 密码已更改！';
        passwordModalMsg.className = 'msg';
        setTimeout(() => passwordModal.classList.remove('open'), 1000);
    } catch (e) {
        passwordModalMsg.classList.remove('hidden');
        passwordModalMsg.textContent = '❌ ' + e.message;
        passwordModalMsg.className = 'msg error';
    }
}

function logout() {
    if (confirm('确定要退出登录吗？')) {
        currentUser = null;
        dashboard.classList.add('hidden');
        authCard.classList.remove('hidden');
        avatarWrapper.classList.remove('visible');
        phoneInput.value = '';
        passwordInput.value = '';
        nameInput.value = '';
        authMsg.classList.add('hidden');
        dropdownMenu.classList.remove('open');
    }
}

// ==================== 事件绑定 ====================
// 阶段选择
stageSelector.addEventListener('change', function() {
    currentViewStage = parseInt(this.value);
    if (currentUser) updateDashboard(currentUser);
});

// 头像下拉
avatarWrapper.addEventListener('click', function(e) {
    e.stopPropagation();
    dropdownMenu.classList.toggle('open');
});
document.addEventListener('click', function(e) {
    if (!avatarWrapper.contains(e.target)) dropdownMenu.classList.remove('open');
});

// 按钮
authBtn.addEventListener('click', handleAuth);
markLearnBtn.addEventListener('click', markLearn);
submitQuizBtn.addEventListener('click', submitQuiz);
refreshBtn.addEventListener('click', refreshUser);

changeAvatarBtn.addEventListener('click', function(e) {
    e.stopPropagation();
    dropdownMenu.classList.remove('open');
    openAvatarModal();
});
avatarCancelBtn.addEventListener('click', function() { avatarModal.classList.remove('open'); });
avatarSaveBtn.addEventListener('click', saveAvatar);

changePasswordBtn.addEventListener('click', function(e) {
    e.stopPropagation();
    dropdownMenu.classList.remove('open');
    openPasswordModal();
});
passwordCancelBtn.addEventListener('click', function() { passwordModal.classList.remove('open'); });
passwordSaveBtn.addEventListener('click', savePassword);

logoutBtn.addEventListener('click', function(e) {
    e.stopPropagation();
    dropdownMenu.classList.remove('open');
    logout();
});

// 详情模态框关闭
if (detailCloseBtn) {
    detailCloseBtn.addEventListener('click', closeDetailModal);
}
// 点击模态框外部关闭（可选）
detailModal.addEventListener('click', function(e) {
    if (e.target === this) closeDetailModal();
});

// 回车登录
phoneInput.addEventListener('keyup', (e) => { if (e.key === 'Enter') handleAuth(); });
passwordInput.addEventListener('keyup', (e) => { if (e.key === 'Enter') handleAuth(); });
nameInput.addEventListener('keyup', (e) => { if (e.key === 'Enter') handleAuth(); });

console.log('🐿️ 松鼠逛逛商家学堂 (资源计时版)');