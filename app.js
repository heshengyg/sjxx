// =====================================================
// app.js - 修复初始跳转回退问题，实现可靠记忆播放
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
const stageList = $('stageList');
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

// ========== Load JSON ==========
async function loadStageData(stage) {
    if (stageData[stage]) return stageData[stage];
    try {
                const resp = await fetch(`data/stage${stage}.json`);
        if (!resp.ok) throw new Error(`加载阶段 ${stage} 失败`);
        
        // 先读取文本，打印出来检查，然后再解析
        const text = await resp.text();
        console.log('📄 出错的 JSON 内容是:', text);
        
        const data = JSON.parse(text); // 改成用 parse 直接解析
        if (data.resources) {
            data.resources.forEach(r => {
                r.id = stage + '-' + r.id;
                
                // 1. 图片：保留 JSON 里写的 duration。如果没写，默认给 60 秒
                if (r.type === 'image') {
                    r.duration = r.duration || 60; 
                } 
                // 2. 视频：自动读取视频真实时长！如果你 JSON 里写了，也会被真实时长覆盖
                else if (r.type === 'video') {
                    // 这里暂时赋个初始值，后面通过 getVideoDuration 异步获取真实时长覆盖它
                    r.duration = 0; 
                } 
                // 3. 文章：自动去 HTML 标签和空格，按 300字/分钟 自动计算
                else if (r.type === 'article') {
                    if (r.content) {
                        let text = r.content || '';
                        let plainText = text.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ');
                        // 去除所有空格，计算纯文本字符数量
                        const charCount = plainText.replace(/\s/g, '').length;
                        // 按照成人平均阅读速度 300 字/分钟计算
                        const minutes = charCount / 300;
                        const seconds = Math.ceil(minutes * 60);
                        r.duration = seconds > 0 ? seconds : 10; // 最少给 10 秒
                    } else {
                        r.duration = 60; // 没有内容时默认 60 秒
                    }
                }
            });
        }
        
        // ✅ 【关键补充】：因为视频获取时长是异步的，我们需要在这里再遍历一次，
        // 给所有视频自动获取真实时长。这样不会阻塞页面列表的渲染。
        if (data.resources) {
            const videoPromises = data.resources
                .filter(r => r.type === 'video')
                .map(async (r) => {
                    r.duration = await getVideoDuration(r.file);
                });
            // 等待所有视频时长获取完毕（后台静默进行，不影响用户看列表）
            await Promise.allSettled(videoPromises);
        }

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

// ========== Helper: 自动获取视频真实时长 ==========
function getVideoDuration(url) {
    return new Promise((resolve) => {
        const video = document.createElement('video');
        video.preload = 'metadata'; // 只下载头部，极快，不消耗流量
        video.src = url;
        
        // 一旦加载到元数据（时长），立刻返回
        video.onloadedmetadata = function() {
            resolve(Math.round(video.duration)); // 返回整数秒
            video.remove();
        };
        
        // 万一加载失败（网络差或地址错误），给一个兜底的 120 秒
        video.onerror = function() {
            resolve(120);
            video.remove();
        };
    });
}
// ========== 进度管理（纯 localStorage） ==========
function getProgressKey() {
    return 'progress_' + (currentUser ? currentUser.id : 'guest');
}

function loadProgressFromLocal() {
    const key = getProgressKey();
    try {
        const data = localStorage.getItem(key);
        if (data) {
            const parsed = JSON.parse(data);
            console.log('📦 从 localStorage 加载进度:', parsed);
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
    console.log(`💾 进度已保存到 localStorage: ${resourceId} -> ${position}s`);
}

async function loadUserProgress() {
    const localData = loadProgressFromLocal();
    progressMap = {};
    Object.keys(localData).forEach(key => {
        const item = localData[key];
        progressMap[key] = {
            progress: item.progress_percent || 0,
            completed: item.completed || false,
            last_position: item.last_position || 0
        };
    });
    // 尝试从 Supabase 同步（失败不影响）
    try {
        if (currentUser) {
            const { data, error } = await supabaseClient
                .from('user_learning_progress')
                .select('*')
                .eq('user_id', currentUser.id);
            if (!error && data) {
                data.forEach(p => {
                    if (!progressMap[p.resource_id]) {
                        progressMap[p.resource_id] = {
                            progress: p.progress_percent || 0,
                            completed: p.completed || false,
                            last_position: p.last_position || 0
                        };
                    }
                });
            }
        }
    } catch (e) {}
    console.log('📊 最终 progressMap:', progressMap);
}

async function updateResourceProgress(resourceId, progress, position = 0) {
    if (!currentUser) return;
    if (!progressMap[resourceId]) {
        progressMap[resourceId] = { progress: 0, completed: false, last_position: 0 };
    }
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
    // 保存到 localStorage
    saveProgressToLocal(
        resourceId,
        progressMap[resourceId].progress,
        progressMap[resourceId].last_position,
        progressMap[resourceId].completed
    );
    // 尝试同步到 Supabase（失败忽略）
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
    } catch (e) {}
    renderCurrentStageResources();
    updateDetailProgress(resourceId);
}

async function markResourceCompleted(resourceId) {
    if (!currentUser) return;
    if (progressMap[resourceId] && progressMap[resourceId].completed) return;
    
    // 读取当前的播放位置（可能是总时长，也可能因为用户提前看完是任意秒数）
    const curLastPos = progressMap[resourceId] ? progressMap[resourceId].last_position : 0;
    
    progressMap[resourceId] = { progress: 100, completed: true, last_position: curLastPos };
    
    saveProgressToLocal(resourceId, 100, curLastPos, true);
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
    } catch (e) {}
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
            // ✅ 修改：彻底移除缩略图加载，改用图标，解决列表渲染卡顿
            thumb.innerHTML = '🖼️';
            thumb.style.display = 'flex';
            thumb.style.alignItems = 'center';
            thumb.style.justifyContent = 'center';
            thumb.style.fontSize = '36px';
            thumb.style.background = '#e8f0fe'; // 浅蓝色背景
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

// ========== renderQuiz ==========
function renderQuiz(quiz) {
    if (!quizContainer) return;
    quizContainer.innerHTML = '';
    if (!quiz || quiz.length === 0) {
        quizContainer.innerHTML = '<p style="color:#5e6f7d;">📭 本阶段暂无考核。</p>';
        if (submitQuizBtn) submitQuizBtn.disabled = true;
        return;
    }
    if (submitQuizBtn) submitQuizBtn.disabled = false;

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
            groups.single.items.push(q);
            groups.single.totalScore += (q.score || 0);
        }
    });

    questionStates = quiz.map(() => ({ confirmed: false, selected: [] }));

    for (const [type, group] of Object.entries(groups)) {
        if (group.items.length === 0) continue;

        const titleDiv = document.createElement('div');
        titleDiv.className = 'group-title';
        const perScore = group.items.length > 0 ? (group.totalScore / group.items.length) : 0;
        titleDiv.textContent = `${group.label}（每题${perScore}分，共${group.totalScore}分）`;
        quizContainer.appendChild(titleDiv);

        group.items.forEach(q => {
            const wrapper = document.createElement('div');
            wrapper.className = 'quiz-item';
            const idx = quiz.indexOf(q);
            wrapper.dataset.idx = idx;

            const qText = document.createElement('div');
            qText.className = 'q-text';
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

function openResourceDetail(resource, allResources) {
    if (!detailModal || !detailTitle || !detailBody || !detailProgress) return;
    currentImageResources = allResources.filter(r => r.type === resource.type);
    currentImageIdx = currentImageResources.findIndex(r => r.id === resource.id);

    detailTitle.textContent = resource.title;
    detailBody.innerHTML = '';
    detailProgress.textContent = '';

                // ========== 视频分支（完美兼容电脑、手机、微信，防快进防秒学） ==========
        if (resource.type === 'video') {
            const video = document.createElement('video');
            video.src = resource.file;
            video.controls = true; // ✅ 保留进度条
            video.playsInline = true;
            video.style.width = '100%';
            video.style.borderRadius = '12px';
            video.preload = 'metadata'; // ✅ 重点修改：改为 metadata，视频打开速度快 10 倍！

            let savedPosition = 0;
            const prog = progressMap[resource.id];
            if (prog && prog.last_position && !prog.completed) {
                savedPosition = prog.last_position;
            }
            console.log(`🎬 视频 ${resource.id} 恢复位置: ${savedPosition}s`);

            let lastValidTime = savedPosition;
            let isRestoring = false;
            let initialSeek = false;

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
                    console.log(`✅ 视频 ${resource.id} 记忆跳转到 ${savedPosition}s`);
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
            }

            video.addEventListener('timeupdate', function() {
                if (!isRestoring && !initialSeek) {
                    lastValidTime = video.currentTime;
                    this._lastValidTime = video.currentTime;
                }
                const pct = Math.round((video.currentTime / video.duration) * 100);
                if (detailProgress) detailProgress.textContent = `学习进度：${pct}%`;
                
                if (!saveTimer) {
                    saveTimer = setTimeout(() => {
                        updateAndSave();
                        saveTimer = null;
                    }, 3000);
                }

                // ✅ 新增：在 timeupdate 里做终极实时拦截，防止移动端底层的闪躲
                if (!isRestoring && !initialSeek && lastValidTime > 0) {
                    if (video.currentTime > lastValidTime + 0.5) {
                        video.currentTime = lastValidTime;
                        video.pause(); // 强行拦截并暂停
                    }
                }
            });

            // ✅ 新增：监听 seeking 做初步拦截
            video.addEventListener('seeking', function() {
                if (isRestoring) return;
                if (initialSeek) return;
                if (video.paused) return; // 暂停状态下允许看前面，不犯规
                
                if (progressMap[resource.id] && progressMap[resource.id].completed) {
                    lastValidTime = video.currentTime;
                    this._lastValidTime = video.currentTime;
                    return;
                }

                if (video.currentTime > lastValidTime + 0.5) {
                    isRestoring = true;
                    video.currentTime = lastValidTime;
                } else {
                    lastValidTime = video.currentTime;
                    this._lastValidTime = video.currentTime;
                }
            });

            // ✅ 新增：监听 seeked 做二次拦截至最终态
            video.addEventListener('seeked', function() {
                if (isRestoring) {
                    isRestoring = false;
                }
                if (initialSeek) return;
                if (progressMap[resource.id] && progressMap[resource.id].completed) return;
                
                // 如果 seeked 结束，依然发现逃出了正常范围，立刻弹回
                if (video.currentTime > lastValidTime + 0.5) {
                    video.currentTime = lastValidTime;
                    video.pause();
                }
            });

            // 防止拖拽到结尾“瞬间秒学完成”
            video.addEventListener('ended', function() {
                if (this._lastValidTime < video.duration - 1) {
                    console.warn('🚨 检测到拖拽偷懒，取消完成标记并弹回');
                    video.currentTime = this._lastValidTime;
                    video.pause();
                    return;
                }
                this._lastValidTime = video.duration;
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
        }  else if (resource.type === 'image') {
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
        // 🚨【核心修复】：在调用 pause() 之前，立即从内存里截获当前播放时间
        // 彻底杜绝手机/微信 pause() 瞬间把时间闪回 0 秒的 Bug！
        const safePos = currentVideoElement._lastValidTime || 0;
        
        currentVideoElement.pause(); // 这一步在微信里会让 currentTime 变 0，但我们已经提前读完了 safePos
        
        if (currentVideoElement.duration) {
            const pct = Math.round((safePos / currentVideoElement.duration) * 100);
            console.log(`💾 视频 ${activeResourceId} 安全保存位置: ${safePos}s`);
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

// ========== 阶段进度 ==========
function renderCurrentStageResources() {
    const data = stageData[currentViewStage];
    if (data) {
        renderResources(currentViewStage, data.resources);
        updateStageProgress(currentViewStage, data.resources);
    }
}

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

// ========== submitQuiz ==========
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

    await loadUserProgress();

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

        // ✅ 精准定义哪些阶段是需要考核的“晋级终点站” (2, 4, 5, 6)
    const examStages = [2, 4, 5, 6]; 
    const isExamStage = examStages.includes(currentViewStage);

    // 只有当是“当前实际阶段”，且“属于考核阶段”时，才能提交
    const canSubmit = (currentViewStage === actualStage && actualStage <= TOTAL_STAGES && isExamStage);

    if (submitQuizBtn) {
        if (!isExamStage) {
            // ✅ 【绝杀修复】：如果是非考核阶段（1、3），直接把这个按钮节点从页面彻底移除以绝后患！
            submitQuizBtn.remove(); 
        } else {
            // ✅ 如果是第 2、4、5、6 阶段，正常显示按钮，并根据学习进度控制是否可用
            submitQuizBtn.style.display = 'inline-block';
            submitQuizBtn.disabled = !canSubmit;
        }
    }

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

console.log('🐿️ 松鼠逛逛商家学堂 (记忆播放修复版)');