// ============ 配置项 修改这里！============
const SUPABASE_URL = "https://sjgegoibummrvyuhehco.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_qnadIPVLPkAgIe5w_aR0lg_zy7VnqPC";
// ==========================================

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm'

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// 全局状态
let user = null;
let profile = null;
let currentExamAnswers = {};

// DOM容器
const appDiv = document.getElementById("app");

// 初始化
async function init() {
  const { data } = await supabase.auth.getSession();
  if (data.session) {
    user = data.session.user;
    await loadUserProfile();
    renderMainPage();
  } else {
    renderLoginPage();
  }
}

// 加载商家资料
async function loadUserProfile() {
  const { data } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();
  profile = data;
}

// 渲染登录注册页
function renderLoginPage() {
  appDiv.innerHTML = `
    <div style="max-width:600px;margin:3rem auto;padding:2rem">
      <h2>松鼠逛逛商家学习平台</h2>
      <div id="authForm">
        <h3>登录 / 注册</h3>
        <input type="email" id="email" placeholder="邮箱" style="width:100%;padding:8px;margin:6px 0">
        <input type="password" id="pwd" placeholder="密码" style="width:100%;padding:8px;margin:6px 0">
        <input type="text" id="shop" placeholder="门店名称" style="width:100%;padding:8px;margin:6px 0">
        <button id="registerBtn" style="padding:8px 16px;margin:4px">新用户注册</button>
        <button id="loginBtn" style="padding:8px 16px;margin:4px">已有账号登录</button>
      </div>
      <div id="msg"></div>
    </div>
  `;

  document.getElementById("loginBtn").onclick = login;
  document.getElementById("registerBtn").onclick = register;
}

async function register() {
  const email = document.getElementById("email").value;
  const password = document.getElementById("pwd").value;
  const shop = document.getElementById("shop").value;
  const msgBox = document.getElementById("msg");

  const { data, error } = await supabase.auth.signUp({
    email, password,
    options: { data: { shop_name: shop } }
  });
  if (error) {
    msgBox.innerText = error.message;
    return;
  }
  // 注册成功后更新店铺名称
  user = data.user;
  await supabase.from("profiles")
    .update({ shop_name: shop })
    .eq("id", user.id);
  init();
}

async function login() {
  const email = document.getElementById("email").value;
  const password = document.getElementById("pwd").value;
  const msgBox = document.getElementById("msg");
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    msgBox.innerText = error.message;
    return;
  }
  user = data.user;
  init();
}

// 主页面：课程列表 + 考试入口
async function renderMainPage() {
  const levelName = {1:"入门商家",2:"进阶商家",3:"资深商家",4:"精英商家"}[profile.level];

  // 获取当前等级解锁课程
  const { data: courses } = await supabase
    .from("courses")
    .select("*")
    .lte("unlock_level", profile.level)
    .order("sort");

  // 获取可以参加的试卷（升级目标>当前等级 或者精英维持考核）
  const { data: exams } = await supabase.from("exams").select("*");
  const availableExams = exams.filter(e => e.target_level > profile.level || profile.level === 4);

  let html = `
    <div style="max-width:800px;margin:2rem auto;padding:1rem">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <h2>松鼠逛逛商家学习中心</h2>
        <button id="logout">退出登录</button>
      </div>
      <div style="background:#f0f8ff;padding:1rem;border-radius:8px;margin:1rem 0">
        <h3>当前身份：${profile.shop_name}</h3>
        <h3>等级：⭐${levelName} (Lv${profile.level})</h3>
      </div>

      <h3>📚 已解锁学习课程</h3>
      <div id="courseList">
  `;

  courses.forEach(c=>{
    html += `
      <div style="border:1px solid #ccc;padding:12px;margin:8px 0;border-radius:6px">
        <h4>${c.title}</h4>
        <div>${c.content}</div>
      </div>
    `
  })

  html += `
      </div>
      <hr>
      <h3>📝 可参与考核</h3>
      <div id="examList">
  `;

  if(availableExams.length === 0){
    html += "<p>暂无待参加考核，您已达到最高等级！</p>"
  }
  availableExams.forEach(ex=>{
    html += `
      <div style="border:1px solid #888;padding:12px;margin:8px 0;border-radius:6px">
        <h4>${ex.title}</h4>
        <p>及格分数：${ex.pass_score}分 | 通过后等级Lv${ex.target_level}</p>
        <button class="startExam" data-examid="${ex.id}">开始考试</button>
      </div>
    `
  })

  html += `</div></div>`
  appDiv.innerHTML = html;

  document.getElementById("logout").onclick = async ()=>{
    await supabase.auth.signOut();
    init();
  }

  // 绑定考试按钮
  document.querySelectorAll(".startExam").forEach(btn=>{
    btn.onclick = ()=> openExam(Number(btn.dataset.examid))
  })
}

// 打开考试页面
async function openExam(examId){
  currentExamAnswers = {};
  const {data:exam} = await supabase.from("exams").select("*").eq("id",examId).single();
  const {data:questions} = await supabase.from("exam_questions").select("*").eq("exam_id",examId).order("id");

  let html = `
    <div style="max-width:800px;margin:2rem auto;padding:1rem">
      <h2>${exam.title}</h2>
      <p>及格线：${exam.pass_score}分</p>
      <div id="qContainer"></div>
      <button id="submitExam" style="margin-top:20px;padding:10px 20px">交卷</button>
      <div id="resultText" style="margin-top:16px;font-weight:bold"></div>
    </div>
  `
  appDiv.innerHTML = html;
  const qContainer = document.getElementById("qContainer");

  questions.forEach((q,idx)=>{
    let optHtml = "";
    const opts = q.options;
    for(const key of Object.keys(opts)){
      optHtml += `
        <label style="display:block;margin:4px">
          <input type="${q.q_type==='multi'?'checkbox':'radio'}" name="q${q.id}" value="${key}">
          ${key}. ${opts[key]}
        </label>
      `
    }
    qContainer.innerHTML += `
      <div style="margin:16px 0;border-bottom:1px solid #ddd;padding-bottom:10px">
        <p>${idx+1}. ${q.question}（${q.score}分）</p>
        ${optHtml}
      </div>
    `
  })

  // 交卷逻辑
  document.getElementById("submitExam").onclick = async ()=>{
    let totalScore = 0;
    questions.forEach(q=>{
      let userSel = [];
      document.querySelectorAll(`input[name="q${q.id}"]:checked`).forEach(input=>{
        userSel.push(input.value)
      })
      userSel = userSel.sort().join(",");
      if(userSel === q.answer){
        totalScore += q.score;
      }
    })

    const isPass = totalScore >= exam.pass_score;
    // 写入答卷记录，触发数据库自动升级触发器！
    await supabase.from("exam_records").insert({
      user_id: user.id,
      exam_id: examId,
      score: totalScore,
      is_pass: isPass
    })

    const resultBox = document.getElementById("resultText");
    if(isPass){
      resultBox.innerHTML = `<span style="color:green">恭喜！得分${totalScore}，考核通过！页面即将刷新，解锁新阶段课程</span>`;
      setTimeout(()=>init(),2500);
    }else{
      resultBox.innerHTML = `<span style="color:red">得分${totalScore}，未达标，请复习后再次参加考试</span>`;
    }
  }
}

// 启动程序
init();