const SUPABASE_URL = 'https://sjgegoibummrvyuhehco.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_qnadIPVLPkAgIe5w_aR0lg_zy7VnqPC';
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const adminUser = 'admin';
const adminPassHash = CryptoJS.SHA256('admin123').toString(); // 默认密码 admin123

document.getElementById('adminLoginBtn').addEventListener('click', async function() {
    const user = document.getElementById('adminUser').value.trim();
    const pass = document.getElementById('adminPass').value.trim();
    if (user !== adminUser) {
        showMsg('用户名错误');
        return;
    }
    if (CryptoJS.SHA256(pass).toString() !== adminPassHash) {
        showMsg('密码错误');
        return;
    }
    document.getElementById('adminLogin').classList.add('hidden');
    document.getElementById('adminDashboard').classList.remove('hidden');
    loadAllUsers();
});

function showMsg(text) {
    const el = document.getElementById('adminLoginMsg');
    el.classList.remove('hidden');
    el.textContent = text;
}

async function loadAllUsers() {
    const { data: users, error } = await supabase
        .from('merchants')
        .select('*')
        .order('created_at', { ascending: false });
    if (error) { alert('加载失败'); return; }
    // 加载每个用户的进度
    const container = document.getElementById('adminContent');
    let html = `<table class="admin-table"><thead><tr>
        <th>手机号</th><th>店铺名</th><th>等级</th><th>已完成阶段</th><th>学习进度</th><th>考核记录</th><th>注册时间</th>
    </tr></thead><tbody>`;
    for (const u of users) {
        const { data: prog } = await supabase
            .from('user_learning_progress')
            .select('*')
            .eq('user_id', u.id);
        const completed = prog ? prog.filter(p => p.completed).length : 0;
        const total = prog ? prog.length : 0;
        const levelMap = { beginner: '入门', advanced: '进阶', senior: '资深', elite: '精英' };
        const stages = u.completed_stages || [];
        html += `<tr>
            <td>${u.phone}</td>
            <td>${u.name}</td>
            <td><span class="tag tag-${u.level}">${levelMap[u.level] || u.level}</span></td>
            <td>${stages.join(', ') || '无'}</td>
            <td>${total > 0 ? Math.round((completed/total)*100)+'%' : '0%'}</td>
            <td>${u.quiz_results ? Object.keys(u.quiz_results).length : 0} 次</td>
            <td>${new Date(u.created_at).toLocaleDateString()}</td>
        </tr>`;
    }
    html += '</tbody></table>';
    container.innerHTML = html;
}

document.getElementById('adminLogoutBtn').addEventListener('click', function() {
    document.getElementById('adminDashboard').classList.add('hidden');
    document.getElementById('adminLogin').classList.remove('hidden');
    document.getElementById('adminPass').value = '';
});