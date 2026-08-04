// ============ 配置项 修改这里！============
const SUPABASE_URL = "https://sjgegoibummrvyuhehco.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_qnadIPVLPkAgIe5w_aR0lg_zy7VnqPC";
// ==========================================

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm'
import CryptoJS from 'https://cdn.jsdelivr.net/npm/crypto-js@4.2.0/crypto-js-esm.js'

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// 全局状态
let currentAccount = null;
let currentExamAnswers = {};
const appDiv = document.getElementById("app");

// 初始化
async function init() {
  const local = localStorage.getItem("shop_account");
  if(local){
    currentAccount = JSON.parse(local);
    renderMainPage();
  }else{
    renderLoginPage();
  }
}

// 渲染登录注册页
function renderLoginPage() {
  appDiv.innerHTML = `
    <div style="max-width:600px;margin:3rem auto;padding:2rem">
      <h2>松鼠逛逛商家学习平台</h2>
      <div id="authForm">
        <h3>登录 / 注册</h3>
        <input type="text" id="username" placeholder="登录账号（字母/数字）" style="width:100%;padding:8px;margin:6px 0">
        <input type="password" id="pwd" placeholder="密码" style="width:100%;padding:8px;margin:6px 0">
        <input type="text" id="shop" placeholder="门店名称" style="width:100%;padding:8px;margin:6px 0">
        <button id="registerBtn" style="padding:8px 16px;margin:4px">新用户注册</button>
        <button id="loginBtn" style="padding:8px 16px;margin:4px">已有账号登录</button>
      </div>
      <div id="msg" style="color:red;margin-top:10px"></div>
    </div>
  `;
  document.getElementById("loginBtn").onclick = login;
  document.getElementById("registerBtn").onclick = register;
}

// 注册
async function register() {
  const username = document.getElementById("username").value.trim();
  const password = document.getElementById("pwd").value;
  const shop = document.getElementById("shop").value.trim();
  const msgBox = document.getElementById("msg");
  //简单校验账号只能字母数字
  if(!/^[a-zA-Z0-9]+$/.test(username)){
    msgBox.innerText = "账号只能输入字母和数字！";
    return;
  }
  if(password.length<6){
    msgBox.innerText = "密码至少6位";
    return;
  }
  const pwdMd5 = CryptoJS.MD5(password).toString();
  const {data,error} = await supabase.from("shop_account").insert([{
    username,
    password:pwdMd5,
    shop_name:shop
  }]).select();
  if(error){
    msgBox.innerText = error.code === "23505" ? "账号已存在！" : error.message;
    return;
  }
  currentAccount = data[0];
  localStorage.setItem("shop_account",JSON.stringify(currentAccount));
  renderMainPage();
}

// 登录
async function login() {
  const username = document.getElementById("username").value.trim();
  const password = document.getElementById("pwd").value;
  const msgBox = document.getElementById("msg");
  const pwdMd5 = CryptoJS.MD5(password).toString();

  const {data,error} = await supabase
    .from("shop_account")
    .select("*")
    .eq("username",username)
    .eq("password",pwdMd5)
    .single();

  if(error || !data){
    msgBox.innerText = "账号或密码错误";
    return;
  }
  currentAccount = data;
  localStorage.setItem("shop_account",JSON.stringify(currentAccount));
  renderMainPage();
}

// 登录
async function login() {
  const username = document.getElementById("username").value.trim();
  const password = document.getElementById("pwd").value;
  const msgBox = document.getElementById("msg");
  const pwdMd5 = md5(password);

  const {data,error} = await supabase
    .from("shop_account")
    .select("*")
    .eq("username",username)
    .eq("password",pwdMd5)
    .single();

  if(error || !data){
    msgBox.innerText = "账号或密码错误";
    return;
  }
  currentAccount = data;
  localStorage.setItem("shop_account",JSON.stringify(currentAccount));
  renderMainPage();
}

// 主页面：课程列表 + 考试入口
async function renderMainPage() {
  const levelName = {1:"入门商家",2:"进阶商家",3:"资深商家",4:"精英商家"}[currentAccount.level];

  const { data: courses } = await supabase
    .from("courses")
    .select("*")
    .lte("unlock_level", currentAccount.level)
    .order("sort");

  const { data: exams } = await supabase.from("exams").select("*");
  const availableExams = exams.filter(e => e.target_level > currentAccount.level || currentAccount.level === 4);

  let html = `
    <div style="max-width:800px;margin:2rem auto;padding:1rem">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <h2>松鼠逛逛商家学习中心</h2>
        <button id="logout">退出登录</button>
      </div>
      <div style="background:#f0f8ff;padding:1rem;border-radius:8px;margin:1rem 0">
        <h3>当前身份：${currentAccount.shop_name}</h3>
        <h3>登录账号：${currentAccount.username}</h3>
        <h3>等级：⭐${levelName} (Lv${currentAccount.level})</h3>
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

  document.getElementById("logout").onclick = ()=>{
    localStorage.removeItem("shop_account");
    currentAccount = null;
    renderLoginPage();
  }

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
      account_id: currentAccount.id,
      exam_id: examId,
      score: totalScore,
      is_pass: isPass
    })

    const resultBox = document.getElementById("resultText");
    if(isPass){
      resultBox.innerHTML = `<span style="color:green">恭喜！得分${totalScore}，考核通过！页面即将刷新，解锁新阶段课程</span>`;
      // 重新拉取最新等级
      const {data} = await supabase.from("shop_account").select("*").eq("id",currentAccount.id).single();
      currentAccount = data;
      localStorage.setItem("shop_account",JSON.stringify(currentAccount));
      setTimeout(()=>renderMainPage(),2500);
    }else{
      resultBox.innerHTML = `<span style="color:red">得分${totalScore}，未达标，请复习后再次参加考试</span>`;
    }
  }
}

init();