// app.js
// ========== 配置 ==========
const SUPABASE_URL = 'https://sjgegoibummrvyuhehco.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_qnadIPVLPkAgIe5w_aR0lg_zy7VnqPC';
const STORAGE_BUCKET = 'avatars';

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ========== 哈希 ==========
function hashPassword(password) {
    return CryptoJS.SHA256(password).toString();
}

// ========== 等级定义（仍保留，用于晋级逻辑） ==========
const LEVELS = [
    { id: 'beginner', label: '入门商家', stages: [1,2], quizPass: 80, next: 'advanced' },
    { id: 'advanced', label: '进阶商家', stages: [3,4], quizPass: 85, next: 'senior' },
    { id: 'senior', label: '资深商家', stages: [5], quizPass: 90, next: 'elite' },
    { id: 'elite', label: '精英商家', stages: [6], quizPass: 90, next: null }
];

const STAGE_INFO = {
    1: { title: '第一阶段：认知破局', desc: '传统实体经营困境深度解析' },
    2: { title: '第二阶段：方向定位', desc: '社区商家专属新零售突破路径' },
    3: { title: '第三阶段：资源深挖', desc: '社区优势与私域工具升级' },
    4: { title: '第四阶段：平台认知', desc: '松鼠逛逛核心功能全景讲解' },
    5: { title: '第五阶段：商家实操', desc: '商家端全功能精细化教学' },
    6: { title: '第六阶段：运营进阶', desc: '日常落地营销技巧 (增收必修)' }
};

// ========== 状态 ==========
let currentUser = null;
let currentLevelObj = null;
let quizData = {};           // 缓存当前阶段题目 { stage: [question...] }
let questionStates = [];     // 每个题目的状态 { confirmed: false, selected: [] }

// ========== DOM 引用 ==========
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
const stageContent = document.getElementById('stageContent');
const markLearnBtn = document.getElementById('markLearnBtn');
const learnMsg = document.getElementById('learnMsg');
const quizContainer = document.getElementById('quizContainer');
const submitQuizBtn = document.getElementById('submitQuizBtn');
const quizResult = document.getElementById('quizResult');
const refreshBtn = document.getElementById('refreshBtn');

const avatarWrapper = document.getElementById('avatarWrapper');
const avatarCircle = document.getElementById('avatarCircle');
const dropdownMenu = document.getElementById('dropdownMenu');
const changeAvatarBtn = document.getElementById('changeAvatarBtn');
const changePasswordBtn = document.getElementById('changePasswordBtn');
const logoutBtn = document.getElementById('logoutBtn');

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

// ========== 更新头像 ==========
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

// ========== 加载学习内容 ==========
async function loadLearningContent(stage) {
    try {
        const { data, error } = await supabaseClient
            .from('learning_contents')
            .select('*')
            .eq('stage', stage)
            .maybeSingle();
        if (error) throw error;
        return data;
    } catch (e) {
        console.error('加载学习内容失败:', e);
        return null;
    }
}

// ========== 加载考核题目 ==========
async function loadQuizQuestions(stage) {
    try {
        const { data, error } = await supabaseClient
            .from('quiz_questions')
            .select('*')
            .eq('stage', stage)
            .order('sort_order', { ascending: true });
        if (error) throw error;
        return data || [];
    } catch (e) {
        console.error('加载考核题目失败:', e);
        return [];
    }
}

// ========== 渲染学习内容 ==========
function renderLearningContent(content) {
    if (!content) {
        stageContent.innerHTML = '<p>暂无学习内容，请联系管理员。</p>';
        return;
    }
    let html = '';
    if (content.video_url) {
        html += `<video controls src="${content.video_url}" style="width:100%; border-radius:12px; margin:8px 0;"></video>`;
    }
    if (content.image_url) {
        html += `<img src="${content.image_url}" alt="学习图片" style="max-width:100%; border-radius:12px; margin:8px 0;">`;
    }
    if (content.article_content) {
        html += `<div>${content.article_content}</div>`;
    }
    stageContent.innerHTML = html || '<p>内容加载中...</p>';
}

// ========== 渲染考核题目 ==========
function renderQuizQuestions(questions) {
    quizContainer.innerHTML = '';
    quizResult.classList.add('hidden');
    if (!questions || questions.length === 0) {
        quizContainer.innerHTML = '<div style="padding:12px 0; color:#5e6f7d;">📭 本阶段暂无考核，可继续学习。</div>';
        submitQuizBtn.disabled = true;
        submitQuizBtn.style.opacity = 0.6;
        return;
    }
    submitQuizBtn.disabled = false;
    submitQuizBtn.style.opacity = 1;

    // 初始化状态
    questionStates = questions.map(() => ({
        confirmed: false,
        selected: []
    }));

    questions.forEach((q, idx) => {
        const wrapper = document.createElement('div');
        wrapper.className = 'quiz-item';
        wrapper.dataset.idx = idx;

        const isMultiple = q.type === 'multiple';
        const options = q.options || [];

        // 题目文本
        const qText = document.createElement('div');
        qText.className = 'q-text';
        qText.textContent = `${idx+1}. ${q.question}`;
        wrapper.appendChild(qText);

        // 选项容器
        const optionsDiv = document.createElement('div');
        optionsDiv.className = 'options';

        options.forEach((optText, optIdx) => {
            const label = document.createElement('label');
            label.className = 'option-item';
            const input = document.createElement('input');
            input.type = isMultiple ? 'checkbox' : 'radio';
            input.name = `q${idx}`;
            input.value = optIdx;
            input.dataset.idx = optIdx;
            // 初始不禁用
            input.disabled = false;

            const span = document.createElement('span');
            span.textContent = optText;

            label.appendChild(input);
            label.appendChild(span);
            optionsDiv.appendChild(label);

            // 点击选项时更新状态（仅当未确认）
            input.addEventListener('change', function() {
                if (questionStates[idx].confirmed) {
                    this.checked = false; // 不允许修改
                    return;
                }
                // 更新选中
                const selected = questionStates[idx].selected;
                if (isMultiple) {
                    if (this.checked) {
                        if (!selected.includes(optIdx)) selected.push(optIdx);
                    } else {
                        const pos = selected.indexOf(optIdx);
                        if (pos !== -1) selected.splice(pos, 1);
                    }
                } else {
                    // 单选：清除其他选项
                    if (this.checked) {
                        selected.length = 0;
                        selected.push(optIdx);
                        // 取消同组其他选中
                        const siblings = this.closest('.options').querySelectorAll('input[type="radio"]');
                        siblings.forEach(sib => {
                            if (sib !== this) sib.checked = false;
                        });
                    } else {
                        // 如果取消选中（一般不发生，但为了安全）
                        const pos = selected.indexOf(optIdx);
                        if (pos !== -1) selected.splice(pos, 1);
                    }
                }
            });
        });

        wrapper.appendChild(optionsDiv);

        // 确认/修改按钮
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
                // 确认：检查是否有选择
                if (state.selected.length === 0) {
                    alert('请先选择一个选项');
                    return;
                }
                state.confirmed = true;
                // 禁用所有选项输入
                const item = this.closest('.quiz-item');
                const inputs = item.querySelectorAll('input');
                inputs.forEach(inp => inp.disabled = true);
                // 标记样式
                item.classList.add('confirmed');
                this.textContent = '修改答案';
                this.classList.add('modify');
                // 更新状态显示
                const badge = document.createElement('span');
                badge.className = 'status-badge';
                badge.textContent = '✅ 已确认';
                const existing = item.querySelector('.status-badge');
                if (existing) existing.remove();
                this.parentNode.appendChild(badge);
            } else {
                // 修改：解锁
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

// ========== 更新仪表盘 ==========
async function updateDashboard(user) {
    if (!user) return;
    currentUser = user;
    const stages = user.completed_stages || [];
    const level = getLevelFromStages(stages);
    currentLevelObj = level;
    const currentStage = getCurrentStage(stages);

    shopNameDisplay.textContent = user.name || '商家';
    levelDisplay.textContent = level.label;

    // 更新进度
    const totalStages = 6;
    const done = Math.min(stages.length, totalStages);
    const pct = Math.round((done / totalStages) * 100);
    progressFill.style.width = pct + '%';
    stepLabel.textContent = `学习进度 ${pct}% (${done}/${totalStages})`;
    const nextLevel = level.next ? getLevelById(level.next) : null;
    nextLevelLabel.textContent = nextLevel ? `下一等级：${nextLevel.label}` : '🏆 已达最高等级';

    const stageStatus = (currentStage > 6) ? '已完成全部阶段' : `当前阶段：${currentStage}`;
    statusText.textContent = `📖 ${stageStatus} · 等级 ${level.label}`;

    // 加载学习内容
    const stageInfo = STAGE_INFO[currentStage] || { title: '已完成全部阶段', desc: '恭喜！' };
    stageTitle.textContent = `📘 ${stageInfo.title}`;
    stageDesc.textContent = stageInfo.desc;
    const content = await loadLearningContent(currentStage);
    renderLearningContent(content);

    // 加载考核题目
    const questions = await loadQuizQuestions(currentStage);
    renderQuizQuestions(questions);

    // 更新头像
    updateAvatar(user);
    avatarWrapper.classList.add('visible');
    learnMsg.classList.add('hidden');
    quizResult.classList.add('hidden');
}

// ========== 认证 ==========
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

// ========== 标记学习 ==========
async function markLearn() {
    if (!currentUser) return;
    const stages = currentUser.completed_stages || [];
    const currentStage = getCurrentStage(stages);
    if (currentStage > 6) { learnMsg.classList.remove('hidden'); learnMsg.textContent = '您已完成所有阶段！'; return; }
    if (stages.includes(currentStage)) {
        learnMsg.classList.remove('hidden');
        learnMsg.textContent = '⚠️ 本章已学习，可继续下一阶段';
        return;
    }
    const newStages = [...stages, currentStage];
    try {
        const { error } = await supabaseClient
            .from('merchants')
            .update({ completed_stages: newStages })
            .eq('id', currentUser.id);
        if (error) throw error;
        currentUser.completed_stages = newStages;
        const newLevel = getLevelFromStages(newStages);
        if (newLevel.id !== currentUser.level) {
            await supabaseClient.from('merchants').update({ level: newLevel.id }).eq('id', currentUser.id);
            currentUser.level = newLevel.id;
            learnMsg.classList.remove('hidden');
            learnMsg.textContent = `🎊 恭喜升级为 ${newLevel.label}！`;
        } else {
            learnMsg.classList.remove('hidden');
            learnMsg.textContent = '✅ 学习进度已保存！';
        }
        await updateDashboard(currentUser);
    } catch (e) {
        learnMsg.classList.remove('hidden');
        learnMsg.textContent = '❌ ' + e.message;
    }
}

// ========== 提交考核 ==========
async function submitQuiz() {
    if (!currentUser) return;
    const stages = currentUser.completed_stages || [];
    const currentStage = getCurrentStage(stages);
    if (currentStage > 6) return;
    // 检查是否所有题目都已确认
    const allConfirmed = questionStates.every(s => s.confirmed);
    if (!allConfirmed) {
        quizResult.classList.remove('hidden');
        quizResult.textContent = '⚠️ 请先确认每道题的答案（点击每道题下方的「确认答案」按钮）。';
        return;
    }

    // 获取当前阶段题目
    const questions = await loadQuizQuestions(currentStage);
    if (!questions || questions.length === 0) {
        quizResult.classList.remove('hidden');
        quizResult.textContent = '本阶段无考核，无需提交。';
        return;
    }

    let correctCount = 0;
    questions.forEach((q, idx) => {
        const selected = questionStates[idx].selected || [];
        // 排序后比较
        const sortedSelected = [...selected].sort();
        const sortedCorrect = (q.correct_answers || []).sort();
        if (JSON.stringify(sortedSelected) === JSON.stringify(sortedCorrect)) {
            correctCount++;
        }
    });

    const total = questions.length;
    const passRate = Math.round((correctCount / total) * 100);
    const level = getLevelFromStages(stages);
    const passThreshold = level.quizPass || 80;
    const passed = passRate >= passThreshold;

    // 保存考核结果
    const results = currentUser.quiz_results || {};
    results[`stage_${currentStage}`] = { correct: correctCount, total, passRate, passed, date: new Date().toISOString() };
    try {
        await supabaseClient.from('merchants').update({ quiz_results: results }).eq('id', currentUser.id);
        currentUser.quiz_results = results;

        // 若通过且当前阶段已完成学习，自动晋级下一等级
        if (passed && stages.includes(currentStage)) {
            const nextLevel = level.next ? getLevelById(level.next) : null;
            if (nextLevel) {
                const requiredStages = nextLevel.stages || [];
                const allDone = requiredStages.every(s => stages.includes(s));
                if (allDone) {
                    await supabaseClient.from('merchants').update({ level: nextLevel.id }).eq('id', currentUser.id);
                    currentUser.level = nextLevel.id;
                    quizResult.classList.remove('hidden');
                    quizResult.textContent = `🎉 考核通过 (${passRate}%)，自动晋级 ${nextLevel.label}！`;
                    await updateDashboard(currentUser);
                    return;
                }
            }
            quizResult.classList.remove('hidden');
            quizResult.textContent = `✅ 考核通过 (${passRate}%)，继续学习下一阶段。`;
        } else {
            quizResult.classList.remove('hidden');
            quizResult.textContent = `📘 考核 ${passed ? '通过' : '未通过'} (${passRate}%，需≥${passThreshold}%)，请复习后重试。`;
        }
        await updateDashboard(currentUser);
    } catch (e) {
        quizResult.classList.remove('hidden');
        quizResult.textContent = '❌ ' + e.message;
    }
}

// ========== 刷新 ==========
async function refreshUser() {
    if (!currentUser) return;
    try {
        const { data, error } = await supabaseClient.from('merchants').select('*').eq('id', currentUser.id).single();
        if (error) throw error;
        currentUser = data;
        await updateDashboard(currentUser);
    } catch (e) {
        alert('刷新失败: ' + e.message);
    }
}

// ========== 头像上传（限制50KB） ==========
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

        const { data: urlData } = supabaseClient.storage
            .from(STORAGE_BUCKET)
            .getPublicUrl(filePath);
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

// ========== 更改密码 ==========
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

// ========== 退出登录 ==========
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

// ========== 下拉菜单控制 ==========
avatarWrapper.addEventListener('click', function(e) {
    e.stopPropagation();
    dropdownMenu.classList.toggle('open');
});

document.addEventListener('click', function(e) {
    if (!avatarWrapper.contains(e.target)) {
        dropdownMenu.classList.remove('open');
    }
});

// ========== 事件绑定 ==========
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

// 回车登录
phoneInput.addEventListener('keyup', (e) => { if (e.key === 'Enter') handleAuth(); });
passwordInput.addEventListener('keyup', (e) => { if (e.key === 'Enter') handleAuth(); });
nameInput.addEventListener('keyup', (e) => { if (e.key === 'Enter') handleAuth(); });

console.log('🐿️ 松鼠逛逛商家学堂 (分离版 + 动态内容)');