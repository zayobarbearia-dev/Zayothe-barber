const express = require("express");
const session = require("express-session");
const PgSession = require("connect-pg-simple")(session);
const { Pool } = require("pg");
const bcrypt = require("bcryptjs");
const rateLimit = require("express-rate-limit");

const app = express();
const PORT = process.env.PORT || 3000;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PGSSLMODE === "disable" ? false : (process.env.DATABASE_URL ? { rejectUnauthorized: false } : false)
});

app.set("trust proxy", 1);
app.use(express.json({ limit: "20kb" }));
app.use(express.urlencoded({ extended: false }));
app.use(session({
  store: new PgSession({ pool, tableName: "user_sessions", createTableIfMissing: true }),
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", maxAge: 8 * 60 * 60 * 1000 }
}));

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 8, standardHeaders: true, legacyHeaders: false });
const money = n => "R$ " + Number(n).toFixed(2).replace(".", ",");
const asyncRoute = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const requireAdmin = (req, res, next) => req.session.admin ? next() : res.status(401).json({ error: "Faça login para continuar." });

async function initDb() {
  if (!process.env.DATABASE_URL || !process.env.SESSION_SECRET || !process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD) {
    throw new Error("Configure DATABASE_URL, SESSION_SECRET, ADMIN_EMAIL e ADMIN_PASSWORD nas variáveis do Railway.");
  }
  await pool.query(`
    CREATE TABLE IF NOT EXISTS services (
      id SERIAL PRIMARY KEY, name TEXT NOT NULL, price NUMERIC(10,2) NOT NULL CHECK(price >= 0), active BOOLEAN NOT NULL DEFAULT TRUE
    );
    CREATE TABLE IF NOT EXISTS appointments (
      id BIGSERIAL PRIMARY KEY, customer_name TEXT NOT NULL, phone TEXT NOT NULL,
      service_id INTEGER REFERENCES services(id), service_name TEXT NOT NULL, price NUMERIC(10,2) NOT NULL,
      booking_date DATE NOT NULL, booking_time TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','confirmed','cancelled','completed')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(booking_date, booking_time)
    );
    CREATE TABLE IF NOT EXISTS admins (
      id SERIAL PRIMARY KEY, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL
    );
  `);
  const defaults = [["Corte",30],["Barba",25],["Corte + Barba",55]];
  for (const [name,price] of defaults) {
    await pool.query("INSERT INTO services(name,price) SELECT $1,$2 WHERE NOT EXISTS (SELECT 1 FROM services WHERE name=$1)",[name,price]);
  }
  const email = process.env.ADMIN_EMAIL.trim().toLowerCase();
  const hash = await bcrypt.hash(process.env.ADMIN_PASSWORD, 12);
  await pool.query("INSERT INTO admins(email,password_hash) VALUES($1,$2) ON CONFLICT(email) DO NOTHING",[email,hash]);
}

const publicPage = () => `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Zayothe Barber</title><style>
*{box-sizing:border-box;margin:0;padding:0}body{background:#101010;color:#fff;font-family:Arial,sans-serif}header{padding:25px;text-align:center;border-bottom:1px solid #80652e}.logo{color:#d6ad58;font-size:30px;font-weight:900;letter-spacing:4px}.hero{min-height:400px;padding:80px 20px;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;background:linear-gradient(135deg,#171717,#090909)}.hero h1{font-size:42px;margin-bottom:15px}.gold{color:#d6ad58}.hero p{color:#bbb;margin-bottom:28px}.btn{background:#d6ad58;color:#111;border:0;padding:15px 25px;font-weight:bold;cursor:pointer;border-radius:5px;text-decoration:none}section{padding:45px 20px;max-width:900px;margin:auto}h2{text-align:center;margin-bottom:30px}.services{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:15px}.service{border:1px solid #80652e;padding:25px;border-radius:8px;background:#191919;text-align:center}.service h3{margin-bottom:12px}.price{color:#d6ad58;font-size:25px;font-weight:bold}form{max-width:500px;margin:auto;display:grid;gap:15px}input,select{padding:15px;background:#202020;border:1px solid #555;color:white;border-radius:5px;width:100%}footer{text-align:center;padding:25px;border-top:1px solid #80652e;color:#aaa}.muted{color:#bbb;text-align:center}
</style></head><body><header><div class="logo">ZAYOTHE BARBER</div></header>
<div class="hero"><h1>O teu estilo.<br><span class="gold">A tua identidade.</span></h1><p>Precisão, atitude e qualidade em cada corte.</p><a href="#agendar" class="btn">AGENDAR HORÁRIO</a></div>
<section><h2>NOSSOS <span class="gold">SERVIÇOS</span></h2><div class="services" id="services"><p class="muted">Carregando serviços...</p></div></section>
<section id="agendar"><h2>AGENDE O TEU <span class="gold">HORÁRIO</span></h2><form id="booking"><input name="name" placeholder="O teu nome" maxlength="100" required><input name="phone" placeholder="WhatsApp com DDD" maxlength="30" required><select name="service" required><option value="">Escolhe o serviço</option></select><input type="date" name="date" required><select name="time" required><option value="">Escolhe o horário</option>${Array.from({length:20},(_,i)=>{const h=8+Math.floor(i/2),m=i%2===0?"00":"30";return "<option>"+String(h).padStart(2,"0")+":"+m+"</option>";}).join("")}</select><button class="btn" type="submit">SOLICITAR AGENDAMENTO</button><p id="message" class="muted"></p></form></section>
<footer>ZAYOTHE BARBER © 2026<br>ESTILO • PRECISÃO • ATITUDE</footer>
<script>
const $=s=>document.querySelector(s);const date=$('[name=date]');date.min=new Date().toLocaleDateString('en-CA');
async function loadServices(){const list=await fetch('/api/services').then(r=>r.json());$('#services').innerHTML=list.map(s=>'<div class="service"><h3>'+s.name+'</h3><div class="price">R$ '+Number(s.price).toFixed(2).replace('.',',')+'</div></div>').join('');$('[name=service]').innerHTML='<option value="">Escolhe o serviço</option>'+list.map(s=>'<option value="'+s.id+'">'+s.name+' - R$ '+Number(s.price).toFixed(2).replace('.',',')+'</option>').join('')}
loadServices().catch(()=>$('#services').textContent='Não foi possível carregar os serviços.');
$('#booking').addEventListener('submit',async e=>{e.preventDefault();const f=new FormData(e.target);const data={name:f.get('name'),phone:f.get('phone'),serviceId:f.get('service'),date:f.get('date'),time:f.get('time')};const msg=$('#message');msg.textContent='Enviando...';try{const r=await fetch('/api/appointments',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});const out=await r.json();if(!r.ok)throw Error(out.error||'Não foi possível agendar.');msg.textContent='Solicitação recebida! Aguarde a confirmação da barbearia.';e.target.reset();date.min=new Date().toLocaleDateString('en-CA')}catch(err){msg.textContent=err.message}});
</script></body></html>`;

const adminPage = () => `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Painel | Zayothe Barber</title><style>
*{box-sizing:border-box}body{margin:0;background:#101010;color:#f5f5f5;font:15px Arial}header{padding:20px;background:#191919;border-bottom:1px solid #80652e;display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap}.gold{color:#d6ad58}main{max-width:1100px;margin:25px auto;padding:0 15px}.panel{background:#1a1a1a;border:1px solid #383838;border-radius:10px;padding:18px;margin-bottom:18px}input,select,button{padding:12px;border-radius:6px;border:1px solid #555;background:#222;color:#fff}button{background:#d6ad58;color:#111;font-weight:bold;border:0;cursor:pointer}form{display:flex;gap:10px;flex-wrap:wrap;margin:10px 0}form input,form select{flex:1;min-width:130px}.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px}.stat{background:#242424;padding:15px;border-radius:8px}.stat b{display:block;font-size:25px;color:#d6ad58;margin-top:8px}.tablewrap{overflow:auto}table{width:100%;border-collapse:collapse;min-width:680px}td,th{text-align:left;padding:12px;border-bottom:1px solid #383838}th{color:#d6ad58}.actions{display:flex;gap:6px;flex-wrap:wrap}.actions button{padding:8px}.danger{background:#a33;color:white}.hidden{display:none}.hint{color:#aaa;font-size:13px}
</style></head><body><header><strong class="gold">ZAYOTHE BARBER · ADMIN</strong><button id="logout" class="hidden">Sair</button></header><main>
<section id="login" class="panel"><h2>Entrar no painel</h2><p class="hint">Acesso restrito ao administrador.</p><form id="loginForm" style="max-width:420px"><input name="email" type="email" placeholder="E-mail" autocomplete="username" required><input name="password" type="password" placeholder="Senha" autocomplete="current-password" required><button>Entrar</button></form><p id="loginMsg" class="gold"></p></section>
<div id="dashboard" class="hidden"><section class="stats"><div class="stat">Agendamentos de hoje<b id="today">0</b></div><div class="stat">Pendentes<b id="pending">0</b></div><div class="stat">Confirmados<b id="confirmed">0</b></div><div class="stat">Concluídos<b id="completed">0</b></div></section>
<section class="panel"><h2>Agenda</h2><div class="tablewrap"><table><thead><tr><th>Data</th><th>Hora</th><th>Cliente</th><th>WhatsApp</th><th>Serviço</th><th>Valor</th><th>Status</th><th>Ações</th></tr></thead><tbody id="appointments"></tbody></table></div></section>
<section class="panel"><h2>Serviços e preços</h2><div id="services"></div><p class="hint">Edite o nome e o preço e salve. Serviços podem ser ativados ou desativados.</p></section></div>
</main><script>
const $=s=>document.querySelector(s);async function api(url,opts={}){const r=await fetch(url,{...opts,headers:{'Content-Type':'application/json',...(opts.headers||{})}});const d=await r.json();if(!r.ok)throw Error(d.error||'Erro');return d}
function show(on){$('#login').classList.toggle('hidden',on);$('#dashboard').classList.toggle('hidden',!on);$('#logout').classList.toggle('hidden',!on)}
$('#loginForm').onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target);try{await api('/api/admin/login',{method:'POST',body:JSON.stringify({email:f.get('email'),password:f.get('password')})});show(true);load()}catch(err){$('#loginMsg').textContent=err.message}};
$('#logout').onclick=async()=>{await api('/api/admin/logout',{method:'POST'});show(false)};
async function load(){const d=await api('/api/admin/dashboard');$('#today').textContent=d.stats.today;$('#pending').textContent=d.stats.pending;$('#confirmed').textContent=d.stats.confirmed;$('#completed').textContent=d.stats.completed;$('#appointments').innerHTML=d.appointments.map(a=>'<tr><td>'+a.booking_date+'</td><td>'+a.booking_time+'</td><td>'+esc(a.customer_name)+'</td><td>'+esc(a.phone)+'</td><td>'+esc(a.service_name)+'</td><td>'+fmt(a.price)+'</td><td>'+a.status+'</td><td><div class="actions">'+['confirmed','completed','cancelled'].map(s=>'<button data-id="'+a.id+'" data-status="'+s+'">'+({confirmed:'Confirmar',completed:'Concluir',cancelled:'Cancelar'}[s])+'</button>').join('')+'</div></td></tr>').join('')||'<tr><td colspan="8">Nenhum agendamento ainda.</td></tr>';$('#services').innerHTML=d.services.map(s=>'<form data-service="'+s.id+'"><input name="name" value="'+esc(s.name)+'" required><input name="price" type="number" min="0" step=".01" value="'+s.price+'" required><select name="active"><option value="true" '+(s.active?'selected':'')+'>Ativo</option><option value="false" '+(!s.active?'selected':'')+'>Inativo</option></select><button>Salvar</button></form>').join('')}
function esc(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}function fmt(n){return 'R$ '+Number(n).toFixed(2).replace('.',',')}
$('#appointments').onclick=async e=>{const b=e.target.closest('button');if(!b)return;try{await api('/api/admin/appointments/'+b.dataset.id,{method:'PATCH',body:JSON.stringify({status:b.dataset.status})});load()}catch(err){alert(err.message)}};
$('#services').onsubmit=async e=>{if(!e.target.matches('form'))return;e.preventDefault();const f=new FormData(e.target);try{await api('/api/admin/services/'+e.target.dataset.service,{method:'PATCH',body:JSON.stringify({name:f.get('name'),price:f.get('price'),active:f.get('active')==='true'})});load()}catch(err){alert(err.message)}};
api('/api/admin/me').then(()=>{show(true);load()}).catch(()=>show(false));
</script></body></html>`;

app.get("/", (req,res)=>res.type("html").send(publicPage()));
app.get("/admin", (req,res)=>res.type("html").send(adminPage()));
app.get("/api/services", asyncRoute(async(req,res)=>{const r=await pool.query("SELECT id,name,price FROM services WHERE active=true ORDER BY id");res.json(r.rows)}));
app.post("/api/appointments", asyncRoute(async(req,res)=>{
  const {name,phone,serviceId,date,time}=req.body;
  if(!name||!phone||!serviceId||!date||!time||String(name).length>100||String(phone).length>30||!/^\d{4}-\d{2}-\d{2}$/.test(date)||!/^([01]\d|2[0-3]):(00|30)$/.test(time)) return res.status(400).json({error:"Confira todos os dados do agendamento."});
  const svc=await pool.query("SELECT id,name,price FROM services WHERE id=$1 AND active=true",[serviceId]);
  if(!svc.rowCount)return res.status(400).json({error:"Serviço indisponível."});
  if(date<new Date().toLocaleDateString("en-CA"))return res.status(400).json({error:"Escolha uma data futura."});
  try{const s=svc.rows[0];const r=await pool.query("INSERT INTO appointments(customer_name,phone,service_id,service_name,price,booking_date,booking_time) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id", [String(name).trim(),String(phone).trim(),s.id,s.name,s.price,date,time]);res.status(201).json({ok:true,id:r.rows[0].id})}
  catch(e){if(e.code==="23505")return res.status(409).json({error:"Esse horário já foi reservado. Escolha outro."});throw e}
}));
app.post("/api/admin/login",loginLimiter,asyncRoute(async(req,res)=>{
  const email=String(req.body.email||"").trim().toLowerCase(),password=String(req.body.password||"");
  const r=await pool.query("SELECT id,email,password_hash FROM admins WHERE email=$1",[email]);
  if(!r.rowCount||!await bcrypt.compare(password,r.rows[0].password_hash))return res.status(401).json({error:"E-mail ou senha incorretos."});
  req.session.regenerate(err=>{if(err)return res.status(500).json({error:"Não foi possível iniciar a sessão."});req.session.admin={id:r.rows[0].id,email:r.rows[0].email};res.json({ok:true})});
}));
app.post("/api/admin/logout",(req,res)=>req.session.destroy(()=>res.json({ok:true})));
app.get("/api/admin/me",requireAdmin,(req,res)=>res.json({email:req.session.admin.email}));
app.get("/api/admin/dashboard",requireAdmin,asyncRoute(async(req,res)=>{
  const [stats,appointments,services]=await Promise.all([
    pool.query("SELECT COUNT(*) FILTER(WHERE booking_date=CURRENT_DATE)::int AS today, COUNT(*) FILTER(WHERE status='pending')::int AS pending, COUNT(*) FILTER(WHERE status='confirmed')::int AS confirmed, COUNT(*) FILTER(WHERE status='completed')::int AS completed FROM appointments"),
    pool.query("SELECT id,customer_name,phone,service_name,price::float,TO_CHAR(booking_date,'YYYY-MM-DD') AS booking_date,booking_time,status FROM appointments WHERE status<>'cancelled' ORDER BY booking_date DESC,booking_time DESC LIMIT 300"),
    pool.query("SELECT id,name,price::float,active FROM services ORDER BY id")
  ]);
  res.json({stats:stats.rows[0],appointments:appointments.rows,services:services.rows});
}));
app.patch("/api/admin/appointments/:id",requireAdmin,asyncRoute(async(req,res)=>{
  const allowed=["pending","confirmed","cancelled","completed"];if(!allowed.includes(req.body.status))return res.status(400).json({error:"Status inválido."});
  const r=await pool.query("UPDATE appointments SET status=$1 WHERE id=$2",[req.body.status,req.params.id]);if(!r.rowCount)return res.status(404).json({error:"Agendamento não encontrado."});res.json({ok:true});
}));
app.patch("/api/admin/services/:id",requireAdmin,asyncRoute(async(req,res)=>{
  const {name,price,active}=req.body,n=Number(price);if(!name||String(name).length>80||!Number.isFinite(n)||n<0||n>100000||typeof active!=="boolean")return res.status(400).json({error:"Confira nome, preço e situação."});
  const r=await pool.query("UPDATE services SET name=$1,price=$2,active=$3 WHERE id=$4",[String(name).trim(),n,active,req.params.id]);if(!r.rowCount)return res.status(404).json({error:"Serviço não encontrado."});res.json({ok:true});
}));
app.get("/health",(req,res)=>res.json({status:"ok",app:"Zayothe Barber"}));
app.use((err,req,res,next)=>{console.error(err);res.status(500).json({error:"Erro interno. Tente novamente."})});

initDb().then(()=>app.listen(PORT,"0.0.0.0",()=>console.log("Zayothe Barber iniciado na porta "+PORT))).catch(err=>{console.error(err.message);process.exit(1)});
