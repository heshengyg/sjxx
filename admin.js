// =====================================================
// admin.js - 管理后台（从 shop_account 表查询）
// =====================================================

const SUPABASE_URL = 'https://sjgegoibummrvyuhehco.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_qnadIPVLPkAgIe5w_aR0lg_zy7VnqPC';
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

function hashPassword(pwd) {
    return CryptoJS.SHA256(pwd).toString();
}

// DOM 元素
const loginBox = document.getElementById('adminLogin');
const dashboard = document.getElementById('adminDashboard');
const adminUser = document.getElementById('adminUser');
const adminPass = document.getElementById('adminPass');
const loginBtn = document.getElementById('adminLoginBtn');
const loginMsg = document.getElementById('adminLoginMsg');
const logoutBtn = document.getElementById('adminLogoutBtn');
const content = document.getElementById('adminContent');

// 搜索相关
const searchKeyword = document.getElementById('searchKeyword');
const searchLevel = document.getElementById('searchLevel');
const searchStage = document.getElementById('searchStage');
const searchDateFrom = document.getElementById('searchDateFrom');
const searchDateTo = document.getElementById('searchDateTo');
const searchBtn = document.getElementById('searchBtn');
const clearSearchBtn = document.getElementById('clearSearchBtn');
const totalCountEl = document.getElementById('totalCount');
const filteredCountEl = document.getElementById('filteredCount');

// 全局数据
let allUsers = [];
let filteredUsers = [];

function showMsg(text, isError = true) {
    loginMsg.classList.remove('hidden');
    loginMsg.textContent = text;
    loginMsg.className = 'msg' + (isError ? ' error' : '');
}

// ========== 登录 ==========
loginBtn.addEventListener('click', async function() {
    const username = adminUser.value.trim();
    const password = adminPass.value.trim();

    if (!username || !password) {
        showMsg('请输入用户名和密码');
        return;
    }

    const { data, error } = await supabaseClient
        .from('shop_account')
        .select('id, username, password, shop_name')
        .eq('username', username)
        .maybeSingle();

    if (error) {
        console.error('查询失败:', error);
        showMsg('登录失败: ' + error.message);
        return;
    }

    if (!data) {
        showMsg('管理员账号不存在');
        return;
    }

    const hashedInput = hashPassword(password);
    if (data.password !== hashedInput) {
        showMsg('密码错误');
        return;
    }

    loginBox.classList.add('hidden');
    dashboard.classList.remove('hidden');
    showMsg('✅ 欢迎回来，' + data.shop_name, false);
    loadAllUsers();
});

// ========== 重置密码 ==========
async function resetPassword(userId, phone) {
    if (!confirm('确定要重置用户 ' + phone + ' 的密码吗？\n重置后密码为：123456')) {
        return;
    }

    try {
        const defaultPassword = '123456';
        const hashedPassword = hashPassword(defaultPassword);

        const { error } = await supabaseClient
            .from('merchants')
            .update({ password: hashedPassword })
            .eq('id', userId);

        if (error) {
            alert('❌ 重置失败：' + error.message);
            return;
        }

        alert('✅ 密码已重置为：123456');
        loadAllUsers();

    } catch (e) {
        alert('❌ 重置失败：' + e.message);
        console.error(e);
    }
}

// ========== 搜索过滤 ==========
function applyFilters() {
    const keyword = searchKeyword.value.trim().toLowerCase();
    const level = searchLevel.value;
    const stage = searchStage.value;
    const dateFrom = searchDateFrom.value;
    const dateTo = searchDateTo.value;

    filteredUsers = allUsers.filter(function(u) {
        // 关键词搜索（手机号、店铺名）
        if (keyword) {
            const phoneMatch = (u.phone || '').toLowerCase().includes(keyword);
            const nameMatch = (u.name || '').toLowerCase().includes(keyword);
            if (!phoneMatch && !nameMatch) return false;
        }

        // 等级过滤
        if (level && u.level !== level) return false;

        // 阶段过滤
        if (stage) {
            const stages = u.completed_stages || [];
            if (!stages.includes(parseInt(stage))) return false;
        }

        // 日期范围过滤
        if (dateFrom && u.created_at) {
            const regDate = new Date(u.created_at);
            const fromDate = new Date(dateFrom);
            if (regDate < fromDate) return false;
        }
        if (dateTo && u.created_at) {
            const regDate = new Date(u.created_at);
            const toDate = new Date(dateTo);
            // 设置到当天结束
            toDate.setHours(23, 59, 59, 999);
            if (regDate > toDate) return false;
        }

        return true;
    });

    // 更新统计
    totalCountEl.textContent = allUsers.length;
    filteredCountEl.textContent = filteredUsers.length;

    renderTable(filteredUsers);
}

function clearSearch() {
    searchKeyword.value = '';
    searchLevel.value = '';
    searchStage.value = '';
    searchDateFrom.value = '';
    searchDateTo.value = '';
    applyFilters();
}

// ========== 渲染表格 ==========
function renderTable(users) {
    if (!users || users.length === 0) {
        content.innerHTML = '<p style="padding:20px; text-align:center; color:#888;">📭 没有匹配的数据</p>';
        return;
    }

    let html = `
        <table class="admin-table">
            <thead>
                <tr>
                    <th style="width:40px;">#</th>
                    <th>手机号</th>
                    <th>店铺名</th>
                    <th>等级</th>
                    <th>已完成阶段</th>
                    <th>学习进度</th>
                    <th>考核记录</th>
                    <th>注册时间</th>
                    <th>操作</th>
                </tr>
            </thead>
            <tbody>
    `;

    users.forEach(function(u, index) {
        const levelMap = { beginner: '入门', advanced: '进阶', senior: '资深', elite: '精英' };
        const stages = u.completed_stages || [];
        const quizCount = u.quiz_results ? Object.keys(u.quiz_results).length : 0;
        const created = u.created_at ? new Date(u.created_at).toLocaleDateString() : '-';
        const rowNum = index + 1;

        html += `<tr>
            <td class="row-num">${rowNum}</td>
            <td>${u.phone || '-'}</td>
            <td><strong>${u.name || '未命名'}</strong></td>
            <td><span class="tag tag-${u.level}">${levelMap[u.level] || u.level}</span></td>
            <td>${stages.length > 0 ? stages.join(', ') : '无'}</td>
            <td>-</td>
            <td>${quizCount} 次</td>
            <td>${created}</td>
            <td>
                <button onclick="resetPassword(${u.id}, '${u.phone}')" class="reset-btn">
                    🔑 重置密码
                </button>
            </td>
        </tr>`;
    });

    html += '</tbody></table>';
    content.innerHTML = html;
}

// ========== 加载所有用户数据 ==========
async function loadAllUsers() {
    content.innerHTML = '<p>📊 加载中...</p>';
    try {
        const { data: users, error } = await supabaseClient
            .from('merchants')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;

        if (!users || users.length === 0) {
            content.innerHTML = '<p>📭 暂无商家数据</p>';
            allUsers = [];
            filteredUsers = [];
            totalCountEl.textContent = '0';
            filteredCountEl.textContent = '0';
            return;
        }

        // ★★★ 获取所有用户的进度（批量查询优化）★★★
        const userIds = users.map(u => u.id);
        const { data: allProgress, error: progError } = await supabaseClient
            .from('user_learning_progress')
            .select('user_id, completed')
            .in('user_id', userIds);

        if (!progError && allProgress) {
            // 计算每个用户的进度
            const progressMap = {};
            allProgress.forEach(p => {
                if (!progressMap[p.user_id]) {
                    progressMap[p.user_id] = { completed: 0, total: 0 };
                }
                progressMap[p.user_id].total++;
                if (p.completed) {
                    progressMap[p.user_id].completed++;
                }
            });

            // 合并到用户数据
            users.forEach(u => {
                const prog = progressMap[u.id] || { completed: 0, total: 0 };
                u._progress = prog;
            });
        } else {
            users.forEach(u => {
                u._progress = { completed: 0, total: 0 };
            });
        }

        allUsers = users;
        applyFilters();

    } catch (e) {
        content.innerHTML = `<p style="color:#b33;">❌ 加载失败：${e.message}</p>`;
        console.error(e);
    }
}

// 更新渲染表格，包含进度
function renderTable(users) {
    if (!users || users.length === 0) {
        content.innerHTML = '<p style="padding:20px; text-align:center; color:#888;">📭 没有匹配的数据</p>';
        return;
    }

    let html = `
        <table class="admin-table">
            <thead>
                <tr>
                    <th style="width:40px;">#</th>
                    <th>手机号</th>
                    <th>店铺名</th>
                    <th>等级</th>
                    <th>已完成阶段</th>
                    <th>学习进度</th>
                    <th>考核记录</th>
                    <th>注册时间</th>
                    <th>操作</th>
                </tr>
            </thead>
            <tbody>
    `;

    users.forEach(function(u, index) {
        const levelMap = { beginner: '入门', advanced: '进阶', senior: '资深', elite: '精英' };
        const stages = u.completed_stages || [];
        const quizCount = u.quiz_results ? Object.keys(u.quiz_results).length : 0;
        const created = u.created_at ? new Date(u.created_at).toLocaleDateString() : '-';
        const rowNum = index + 1;
        const prog = u._progress || { completed: 0, total: 0 };
        const progressText = prog.total > 0 ? Math.round((prog.completed / prog.total) * 100) + '% (' + prog.completed + '/' + prog.total + ')' : '0% (0/0)';

        html += `<tr>
            <td class="row-num">${rowNum}</td>
            <td>${u.phone || '-'}</td>
            <td><strong>${u.name || '未命名'}</strong></td>
            <td><span class="tag tag-${u.level}">${levelMap[u.level] || u.level}</span></td>
            <td>${stages.length > 0 ? stages.join(', ') : '无'}</td>
            <td>${progressText}</td>
            <td>${quizCount} 次</td>
            <td>${created}</td>
            <td>
                <button onclick="resetPassword(${u.id}, '${u.phone}')" class="reset-btn">
                    🔑 重置密码
                </button>
            </td>
        </tr>`;
    });

    html += '</tbody></table>';
    content.innerHTML = html;
}

// ========== 事件绑定 ==========
// 搜索按钮
searchBtn.addEventListener('click', applyFilters);

// 回车键搜索
searchKeyword.addEventListener('keyup', function(e) {
    if (e.key === 'Enter') applyFilters();
});

// 清空按钮
clearSearchBtn.addEventListener('click', clearSearch);

// 下拉选择变化时自动搜索
searchLevel.addEventListener('change', applyFilters);
searchStage.addEventListener('change', applyFilters);
searchDateFrom.addEventListener('change', applyFilters);
searchDateTo.addEventListener('change', applyFilters);

// ========== 退出 ==========
logoutBtn.addEventListener('click', function() {
    dashboard.classList.add('hidden');
    loginBox.classList.remove('hidden');
    adminPass.value = '';
    loginMsg.classList.add('hidden');
});

// 回车键登录
adminPass.addEventListener('keyup', function(e) {
    if (e.key === 'Enter') loginBtn.click();
});
adminUser.addEventListener('keyup', function(e) {
    if (e.key === 'Enter') loginBtn.click();
});

console.log('🐿️ 管理后台已启动');