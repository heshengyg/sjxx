// =====================================================
// admin.js - 管理后台（修复变量重复声明）
// =====================================================

// 使用 supabaseClient 避免与全局 supabase 冲突
const SUPABASE_URL = 'https://sjgegoibummrvyuhehco.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_qnadIPVLPkAgIe5w_aR0lg_zy7VnqPC';
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// 管理员凭证
const ADMIN_USER = 'admin';
// 密码 'admin123' 的 SHA-256 哈希值
const ADMIN_PASS_HASH = CryptoJS.SHA256('admin123').toString();

// DOM 元素
const loginBox = document.getElementById('adminLogin');
const dashboard = document.getElementById('adminDashboard');
const adminUser = document.getElementById('adminUser');
const adminPass = document.getElementById('adminPass');
const loginBtn = document.getElementById('adminLoginBtn');
const loginMsg = document.getElementById('adminLoginMsg');
const logoutBtn = document.getElementById('adminLogoutBtn');
const content = document.getElementById('adminContent');

// ========== 登录 ==========
loginBtn.addEventListener('click', async function() {
    const user = adminUser.value.trim();
    const pass = adminPass.value.trim();

    if (user !== ADMIN_USER) {
        showMsg('❌ 用户名错误');
        return;
    }
    if (CryptoJS.SHA256(pass).toString() !== ADMIN_PASS_HASH) {
        showMsg('❌ 密码错误');
        return;
    }

    // 登录成功
    loginBox.classList.add('hidden');
    dashboard.classList.remove('hidden');
    loadAllUsers();
});

function showMsg(text, isError = true) {
    loginMsg.classList.remove('hidden');
    loginMsg.textContent = text;
    loginMsg.className = 'msg' + (isError ? ' error' : '');
}

// ========== 加载所有用户数据 ==========
async function loadAllUsers() {
    try {
        const { data: users, error } = await supabaseClient
            .from('merchants')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;

        let html = `<table class="admin-table"><thead><tr>
            <th>手机号</th><th>店铺名</th><th>等级</th><th>已完成阶段</th><th>学习进度</th><th>考核记录</th><th>注册时间</th>
        </tr></thead><tbody>`;

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

            html += `<tr>
                <td>${u.phone}</td>
                <td>${u.name}</td>
                <td><span class="tag tag-${u.level}">${levelMap[u.level] || u.level}</span></td>
                <td>${stages.length > 0 ? stages.join(', ') : '无'}</td>
                <td>${progressPct}% (${completed}/${total})</td>
                <td>${u.quiz_results ? Object.keys(u.quiz_results).length : 0} 次</td>
                <td>${new Date(u.created_at).toLocaleDateString()}</td>
            </tr>`;
        }

        html += '</tbody></table>';
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

console.log('🐿️ 管理后台已启动');