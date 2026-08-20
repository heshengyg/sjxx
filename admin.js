// =====================================================
// admin.js - 管理后台（移除修复等级按钮）
// =====================================================

const SUPABASE_URL = 'https://sjgegoibummrvyuhehco.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_qnadIPVLPkAgIe5w_aR0lg_zy7VnqPC';
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

function hashPassword(pwd) {
    return CryptoJS.SHA256(pwd).toString();
}

var loginBox = document.getElementById('adminLogin');
var dashboard = document.getElementById('adminDashboard');
var adminUser = document.getElementById('adminUser');
var adminPass = document.getElementById('adminPass');
var loginBtn = document.getElementById('adminLoginBtn');
var loginMsg = document.getElementById('adminLoginMsg');
var logoutBtn = document.getElementById('adminLogoutBtn');
var content = document.getElementById('adminContent');

var searchPhone = document.getElementById('searchPhone');
var searchName = document.getElementById('searchName');
var searchLevel = document.getElementById('searchLevel');
var searchStage = document.getElementById('searchStage');
var searchDateFrom = document.getElementById('searchDateFrom');
var searchDateTo = document.getElementById('searchDateTo');
var clearSearchBtn = document.getElementById('clearSearchBtn');
var totalCountEl = document.getElementById('totalCount');
var filteredCountEl = document.getElementById('filteredCount');

var currentPage = 1;
var pageSize = 10;
var allUsers = [];
var filteredUsers = [];

function showMsg(text, isError) {
    if (isError === undefined) isError = true;
    loginMsg.classList.remove('hidden');
    loginMsg.textContent = text;
    loginMsg.className = 'msg' + (isError ? ' error' : '');
}

// ========== 登录 ==========
loginBtn.addEventListener('click', async function() {
    var username = adminUser.value.trim();
    var password = adminPass.value.trim();

    if (!username || !password) {
        showMsg('请输入用户名和密码');
        return;
    }

    var { data, error } = await supabaseClient
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

    var hashedInput = hashPassword(password);
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
        var defaultPassword = '123456';
        var hashedPassword = hashPassword(defaultPassword);

        var { error } = await supabaseClient
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
    var phoneKeyword = searchPhone.value.trim().toLowerCase();
    var nameKeyword = searchName.value.trim().toLowerCase();
    var level = searchLevel.value;
    var stage = searchStage.value;
    var dateFrom = searchDateFrom.value;
    var dateTo = searchDateTo.value;

    filteredUsers = allUsers.filter(function(u) {
        if (phoneKeyword) {
            var phone = (u.phone || '').toLowerCase();
            if (phone.indexOf(phoneKeyword) === -1) return false;
        }
        if (nameKeyword) {
            var name = (u.name || '').toLowerCase();
            if (name.indexOf(nameKeyword) === -1) return false;
        }
        if (level && u.level !== level) return false;
        if (stage) {
            var stages = u.completed_stages || [];
            if (stages.indexOf(parseInt(stage)) === -1) return false;
        }
        if (dateFrom && u.created_at) {
            var regDate = new Date(u.created_at);
            var fromDate = new Date(dateFrom);
            if (regDate < fromDate) return false;
        }
        if (dateTo && u.created_at) {
            var regDate2 = new Date(u.created_at);
            var toDate = new Date(dateTo);
            toDate.setHours(23, 59, 59, 999);
            if (regDate2 > toDate) return false;
        }
        return true;
    });

    totalCountEl.textContent = allUsers.length;
    filteredCountEl.textContent = filteredUsers.length;

    currentPage = 1;
    renderTable(filteredUsers);
}

function clearSearch() {
    searchPhone.value = '';
    searchName.value = '';
    searchLevel.value = '';
    searchStage.value = '';
    searchDateFrom.value = '';
    searchDateTo.value = '';
    applyFilters();
}

// ========== 渲染表格 ==========
function renderTable(users) {
    if (!users || users.length === 0) {
        content.innerHTML = '<div style="flex:1; display:flex; align-items:center; justify-content:center; color:#888; font-size:16px;">📭 没有匹配的数据</div>';
        return;
    }

    var totalPages = Math.ceil(users.length / pageSize);
    if (currentPage > totalPages) currentPage = totalPages;
    if (currentPage < 1) currentPage = 1;

    var startIndex = (currentPage - 1) * pageSize;
    var endIndex = Math.min(startIndex + pageSize, users.length);
    var pageUsers = users.slice(startIndex, endIndex);

    var levelMap = { beginner: '入门', advanced: '进阶', senior: '资深', elite: '精英' };

    var html = '';
    html += '<div class="table-wrapper">';
    html += '<table>';
    html += '<thead><tr>';
    html += '<th style="width:36px;">#</th>';
    html += '<th>手机号</th>';
    html += '<th>店铺名</th>';
    html += '<th>等级</th>';
    html += '<th>已完成阶段</th>';
    html += '<th>学习进度</th>';
    html += '<th>考核记录</th>';
    html += '<th>注册时间</th>';
    html += '<th>最后登录</th>';
    html += '<th>操作</th>';
    html += '</tr></thead><tbody>';

    pageUsers.forEach(function(u, index) {
        var stages = u.completed_stages || [];
        var quizCount = u.quiz_results ? Object.keys(u.quiz_results).length : 0;
        var created = u.created_at ? new Date(u.created_at).toLocaleDateString() : '-';
        var lastLogin = u.last_login ? new Date(u.last_login).toLocaleString() : '从未登录';
        var rowNum = startIndex + index + 1;
        var prog = u._progress || { completed: 0, total: 0 };
        var progressText = prog.total > 0 ? Math.round((prog.completed / prog.total) * 100) + '% (' + prog.completed + '/' + prog.total + ')' : '0% (0/0)';

        html += '<tr>';
        html += '<td class="row-num">' + rowNum + '</td>';
        html += '<td>' + (u.phone || '-') + '</td>';
        html += '<td><strong>' + (u.name || '未命名') + '</strong></td>';
        html += '<td><span class="tag tag-' + u.level + '">' + (levelMap[u.level] || u.level) + '</span></td>';
        html += '<td>' + (stages.length > 0 ? stages.join(', ') : '无') + '</td>';
        html += '<td>' + progressText + '</td>';
        html += '<td>' + quizCount + ' 次</td>';
        html += '<td>' + created + '</td>';
        html += '<td style="font-size:11px; color:#888;">' + lastLogin + '</td>';
        html += '<td><button onclick="resetPassword(' + u.id + ', \'' + u.phone + '\')" class="reset-btn">🔑 重置密码</button></td>';
        html += '</tr>';
    });

    html += '</tbody></table>';
    html += '</div>';

    html += '<div class="pagination-bar">';
    html += '<div class="page-info">共 <strong>' + users.length + '</strong> 条，第 <strong>' + currentPage + '/' + totalPages + '</strong> 页</div>';
    html += '<div class="page-controls">';
    html += '<button onclick="goToPage(1)" ' + (currentPage <= 1 ? 'disabled' : '') + '>首页</button>';
    html += '<button onclick="goToPage(' + (currentPage - 1) + ')" ' + (currentPage <= 1 ? 'disabled' : '') + '>上一页</button>';

    var startPage = Math.max(1, currentPage - 2);
    var endPage = Math.min(totalPages, currentPage + 2);
    for (var p = startPage; p <= endPage; p++) {
        html += '<span class="page-num ' + (p === currentPage ? 'active' : '') + '" onclick="goToPage(' + p + ')">' + p + '</span>';
    }

    html += '<button onclick="goToPage(' + (currentPage + 1) + ')" ' + (currentPage >= totalPages ? 'disabled' : '') + '>下一页</button>';
    html += '<button onclick="goToPage(' + totalPages + ')" ' + (currentPage >= totalPages ? 'disabled' : '') + '>末页</button>';
    html += '<select id="pageSizeSelect" onchange="changePageSize(this.value)">';
    html += '<option value="10" ' + (pageSize === 10 ? 'selected' : '') + '>10条/页</option>';
    html += '<option value="20" ' + (pageSize === 20 ? 'selected' : '') + '>20条/页</option>';
    html += '<option value="50" ' + (pageSize === 50 ? 'selected' : '') + '>50条/页</option>';
    html += '</select>';
    html += '</div></div>';

    content.innerHTML = html;
}

function goToPage(page) {
    var totalPages = Math.ceil(filteredUsers.length / pageSize);
    if (page < 1 || page > totalPages) return;
    currentPage = page;
    renderTable(filteredUsers);
}

function changePageSize(size) {
    pageSize = parseInt(size);
    currentPage = 1;
    renderTable(filteredUsers);
}

// ========== 加载用户数据 ==========
async function loadAllUsers() {
    content.innerHTML = '<div style="flex:1; display:flex; align-items:center; justify-content:center; color:#888;">📊 加载中...</div>';
    try {
        var { data: users, error } = await supabaseClient
            .from('merchants')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;

        if (!users || users.length === 0) {
            content.innerHTML = '<div style="flex:1; display:flex; align-items:center; justify-content:center; color:#888;">📭 暂无商家数据</div>';
            allUsers = [];
            filteredUsers = [];
            totalCountEl.textContent = '0';
            filteredCountEl.textContent = '0';
            return;
        }

        var userIds = users.map(function(u) { return u.id; });
        var { data: allProgress, error: progError } = await supabaseClient
            .from('user_learning_progress')
            .select('user_id, completed')
            .in('user_id', userIds);

        if (!progError && allProgress) {
            var progressMap = {};
            allProgress.forEach(function(p) {
                if (!progressMap[p.user_id]) {
                    progressMap[p.user_id] = { completed: 0, total: 0 };
                }
                progressMap[p.user_id].total++;
                if (p.completed) {
                    progressMap[p.user_id].completed++;
                }
            });

            users.forEach(function(u) {
                var prog = progressMap[u.id] || { completed: 0, total: 0 };
                u._progress = prog;
            });
        } else {
            users.forEach(function(u) {
                u._progress = { completed: 0, total: 0 };
            });
        }

        allUsers = users;
        applyFilters();

    } catch (e) {
        content.innerHTML = '<div style="flex:1; display:flex; align-items:center; justify-content:center; color:#b33;">❌ 加载失败：' + e.message + '</div>';
        console.error(e);
    }
}

// ========== 事件绑定 ==========
searchPhone.addEventListener('input', applyFilters);
searchName.addEventListener('input', applyFilters);
searchLevel.addEventListener('change', applyFilters);
searchStage.addEventListener('change', applyFilters);
searchDateFrom.addEventListener('change', applyFilters);
searchDateTo.addEventListener('change', applyFilters);
clearSearchBtn.addEventListener('click', clearSearch);
// ========== 刷新列表 ==========
var refreshBtn = document.getElementById('refreshListBtn');
if (refreshBtn) {
    refreshBtn.addEventListener('click', function() {
        var originalText = this.innerHTML;
        this.innerHTML = '⏳ 刷新中...';
        this.disabled = true;
        this.style.opacity = '0.7';
        
        loadAllUsers().then(function() {
            refreshBtn.innerHTML = '✅ 已刷新';
            refreshBtn.disabled = false;
            refreshBtn.style.opacity = '1';
            setTimeout(function() {
                refreshBtn.innerHTML = originalText;
            }, 2000);
        }).catch(function() {
            refreshBtn.innerHTML = '❌ 失败';
            refreshBtn.disabled = false;
            refreshBtn.style.opacity = '1';
            setTimeout(function() {
                refreshBtn.innerHTML = originalText;
            }, 2000);
        });
    });
}

// ========== 退出 ==========
logoutBtn.addEventListener('click', function() {
    dashboard.classList.add('hidden');
    loginBox.classList.remove('hidden');
    adminPass.value = '';
    loginMsg.classList.add('hidden');
});

adminPass.addEventListener('keyup', function(e) {
    if (e.key === 'Enter') loginBtn.click();
});
adminUser.addEventListener('keyup', function(e) {
    if (e.key === 'Enter') loginBtn.click();
});

console.log('🐿️ 管理后台已启动');