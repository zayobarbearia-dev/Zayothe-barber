
const express = require("express");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

const services = [
  { id: 1, name: "Corte", price: 30 },
  { id: 2, name: "Barba", price: 25 },
  { id: 3, name: "Corte + Barba", price: 55 }
];

app.get("/", (req, res) => {
  res.send(`
<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Zayothe Barber</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{
  background:#101010;color:#fff;
  font-family:Arial,sans-serif;
}
header{
  padding:25px;text-align:center;
  border-bottom:1px solid #80652e;
}
.logo{color:#d6ad58;font-size:30px;
font-weight:900;letter-spacing:4px}
.hero{
  min-height:400px;padding:80px 20px;
  display:flex;flex-direction:column;
  justify-content:center;align-items:center;
  text-align:center;
  background:linear-gradient(135deg,#171717,#090909);
}
.hero h1{font-size:42px;margin-bottom:15px}
.gold{color:#d6ad58}
.hero p{color:#bbb;margin-bottom:28px}
.btn{
  background:#d6ad58;color:#111;
  border:0;padding:15px 25px;
  font-weight:bold;cursor:pointer;
  border-radius:5px;text-decoration:none;
}
section{padding:45px 20px;max-width:900px;margin:auto}
h2{text-align:center;margin-bottom:30px}
.services{
  display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));
  gap:15px;
}
.service{
  border:1px solid #80652e;padding:25px;
  border-radius:8px;background:#191919;
  text-align:center;
}
.service h3{margin-bottom:12px}
.price{color:#d6ad58;font-size:25px;font-weight:bold}
form{
  max-width:500px;margin:auto;
  display:grid;gap:15px;
}
input,select{
  padding:15px;background:#202020;
  border:1px solid #555;color:white;
  border-radius:5px;width:100%;
}
footer{
  text-align:center;padding:25px;
  border-top:1px solid #80652e;color:#aaa;
}
</style>
</head>
<body>
<header>
  <div class="logo">ZAYOTHE BARBER</div>
</header>

<div class="hero">
  <h1>O teu estilo.<br><span class="gold">A tua identidade.</span></h1>
  <p>Precisão, atitude e qualidade em cada corte.</p>
  <a href="#agendar" class="btn">AGENDAR HORÁRIO</a>
</div>

<section>
  <h2>NOSSOS <span class="gold">SERVIÇOS</span></h2>
  <div class="services">
    ${services.map(s => `
      <div class="service">
        <h3>${s.name}</h3>
        <div class="price">R$ ${s.price.toFixed(2).replace(".", ",")}</div>
      </div>
    `).join("")}
  </div>
</section>

<section id="agendar">
  <h2>AGENDE O TEU <span class="gold">HORÁRIO</span></h2>
  <form id="booking">
    <input name="name" placeholder="O teu nome" required>
    <input name="phone" placeholder="WhatsApp com DDD" required>
    <select name="service" required>
      <option value="">Escolhe o serviço</option>
      ${services.map(s => `<option value="${s.id}">${s.name} - R$ ${s.price}</option>`).join("")}
    </select>
    <input type="date" name="date" required>
    <select name="time" required>
      <option value="">Escolhe o horário</option>
      ${Array.from({length:20},(_,i)=>{
        const h=8+Math.floor(i/2);
        const m=i%2===0?"00":"30";
        return `<option>${String(h).padStart(2,"0")}:${m}</option>`;
      }).join("")}
    </select>
    <button class="btn" type="submit">CONTINUAR AGENDAMENTO</button>
    <p id="message" style="color:#d6ad58;text-align:center"></p>
  </form>
</section>

<footer>
  ZAYOTHE BARBER © 2026<br>
  ESTILO • PRECISÃO • ATITUDE
</footer>

<script>
document.querySelector('[name="date"]').min =
  new Date().toISOString().split("T")[0];

document.getElementById("booking").addEventListener("submit",e=>{
  e.preventDefault();
  document.getElementById("message").textContent =
    "Página de demonstração. A confirmação de reservas será ativada na próxima etapa.";
});
</script>
</body>
</html>
  `);
});

app.get("/health", (req, res) => {
  res.json({ status: "ok", app: "Zayothe Barber" });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log("Zayothe Barber iniciado na porta " + PORT);
});
