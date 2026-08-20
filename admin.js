// =====================================================
// admin.js - 管理后台（添加重置密码功能）
// =====================================================

const SUPABASE_URL = 'https://sjgegoibummrvyuhehco.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_qnadIPVLPkAgIe5w_aR0lg_zy7VnqPC';
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// DOM 元素
const loginBox = document.getElementById('adminLogin');
const dashboard = document.getElementById('adminDashboard');
const adminUser = document.getElementById('adminUser');
const adminPass = document.getElementById('adminPass');
const loginBtn = document.getElementById('adminLoginBtn');
const loginMsg = document.getElementById('adminLoginMsg');
const logoutBtn = document.getElementById('adminLogoutBtn');
const content = document.getElementById('adminContent');

function hashPassword(pwd) {
    return CryptoJS.SHA256(pwd).toString();
}

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
    // 确认弹窗
    if (!confirm('确定要重置用户 ' + phone + ' 的密码吗？\n重置后密码为：123456')) {
        return;
    }

    try {
        // 将密码重置为 123456 的哈希值
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
        // 刷新列表
        loadAllUsers();

    } catch (e) {
        alert('❌ 重置失败：' + e.message);
        console.error(e);
    }
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
            return;
        }

        let html = `
            <table class="admin-table">
                <thead>
                    <tr>
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

        for (const u of users) {
            // 获取该用户的进度
            const { data: prog } = await supabaseClient
                .from('user_learning_progress')
                .select('*')
                .eq('user_id', u.id);

            const completed = prog ? prog.filter(p => p.completed).length : 0;
            const total = prog ? prog.length : 0;
            const progressPct = total > 0 ? Math.round((completed / total) * 100) : 0;

            const levelMap = { beginner: '入门', advanced: '进阶', senior: '资深', elite: '精英' };
            const stages = u.completed_stages || [];
            const quizCount = u.quiz_results ? Object.keys(u.quiz_results).length : 0;
            const created = u.created_at ? new Date(u.created_at).toLocaleDateString() : '-';

            html += `<tr>
                <td>${u.phone || '-'}</td>
                <td><strong>${u.name || '未命名'}</strong></td>
                <td><span class="tag tag-${u.level}">${levelMap[u.level] || u.level}</span></td>
                <td>${stages.length > 0 ? stages.join(', ') : '无'}</td>
                <td>${progressPct}% (${completed}/${total})</td>
                <td>${quizCount} 次</td>
                <td>${created}</td>
                <td>
                    <button onclick="resetPassword(${u.id}, '${u.phone}')" 
                            style="background:#1f7b4d; color:white; border:none; padding:4px 12px; border-radius:20px; cursor:pointer; font-size:13px;">
                        🔑 重置密码
                    </button>
                </td>
            </tr>`;
        }

        html += '</tbody></table>';
        html += `<p style="margin-top:16px; color:#5e6f7d; font-size:14px;">共 ${users.length} 位商家</p>`;
        content.innerHTML = html;

    } catch (e) {
        content.innerHTML = `<p style="color:#b33;">❌ 加载失败：${e.message}</p>`;
        console.error(e);
    }
}

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