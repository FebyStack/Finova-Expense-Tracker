const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

let particles = [];
let cursorTrail = [];

const particleCount = 90;
const connectionDistance = 140;

const mouse = {
x:null,
y:null,
radius:170
};

window.addEventListener("mousemove",(e)=>{
mouse.x = e.x;
mouse.y = e.y;

cursorTrail.push({x:e.x,y:e.y,life:20});
});

window.addEventListener("mouseout",()=>{
mouse.x = null;
mouse.y = null;
});

function resizeCanvas(){
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;
}

window.addEventListener("resize",resizeCanvas);
resizeCanvas();

class Particle{

constructor(){

this.x = Math.random()*canvas.width;
this.y = Math.random()*canvas.height;

this.size = Math.random()*2 + 1;

this.speedX = (Math.random()-0.5)*0.5;
this.speedY = (Math.random()-0.5)*0.5;

this.depth = Math.random()*0.6+0.4;

}

move(){

this.x += this.speedX*this.depth;
this.y += this.speedY*this.depth;

if(this.x<0||this.x>canvas.width) this.speedX*=-1;
if(this.y<0||this.y>canvas.height) this.speedY*=-1;

if(mouse.x && mouse.y){

let dx = this.x - mouse.x;
let dy = this.y - mouse.y;

let dist = Math.sqrt(dx*dx + dy*dy);

if(dist < mouse.radius){

let force = (mouse.radius-dist)/mouse.radius;

this.x += dx*force*0.05;
this.y += dy*force*0.05;

}

}

}

draw(){

ctx.beginPath();

ctx.arc(this.x,this.y,this.size,0,Math.PI*2);

const glow = ctx.createRadialGradient(
this.x,this.y,0,
this.x,this.y,this.size*4
);

glow.addColorStop(0,"#4f7ef8");
glow.addColorStop(1,"transparent");

ctx.fillStyle = glow;
ctx.fill();

}

}

function initParticles(){

particles=[];

for(let i=0;i<particleCount;i++){
particles.push(new Particle());
}

}

function drawGrid(){

const gridSize = 60;

ctx.strokeStyle="rgba(79,126,248,0.05)";
ctx.lineWidth=1;

for(let x=0;x<canvas.width;x+=gridSize){

ctx.beginPath();
ctx.moveTo(x,0);
ctx.lineTo(x,canvas.height);
ctx.stroke();

}

for(let y=0;y<canvas.height;y+=gridSize){

ctx.beginPath();
ctx.moveTo(0,y);
ctx.lineTo(canvas.width,y);
ctx.stroke();

}

}

function connectParticles(){

for(let a=0;a<particles.length;a++){

for(let b=a;b<particles.length;b++){

let dx = particles[a].x - particles[b].x;
let dy = particles[a].y - particles[b].y;

let dist = Math.sqrt(dx*dx+dy*dy);

if(dist<connectionDistance){

let opacity = 1 - dist/connectionDistance;

ctx.strokeStyle=`rgba(79,126,248,${opacity*0.25})`;
ctx.lineWidth=1;

ctx.beginPath();
ctx.moveTo(particles[a].x,particles[a].y);
ctx.lineTo(particles[b].x,particles[b].y);
ctx.stroke();

}

}

}

}

function drawCursorTrail(){

cursorTrail.forEach((p,i)=>{

ctx.beginPath();
ctx.arc(p.x,p.y,3,0,Math.PI*2);

ctx.fillStyle=`rgba(79,126,248,${p.life/20})`;
ctx.fill();

p.life--;

if(p.life<=0){
cursorTrail.splice(i,1);
}

});

}

let chartLines=[];

function initCharts(){

for(let i=0;i<3;i++){

let baseY = canvas.height*(0.6 + Math.random()*0.3);

let points=[];

for(let x=0;x<canvas.width;x+=120){

points.push({
x:x,
y:baseY + Math.random()*60-30
});

}

chartLines.push(points);

}

}

function drawCharts(){

ctx.lineWidth=2;

chartLines.forEach(line=>{

ctx.beginPath();

line.forEach((p,i)=>{

p.y += Math.sin(Date.now()*0.001 + i)*0.2;

if(i===0){
ctx.moveTo(p.x,p.y);
}else{
ctx.lineTo(p.x,p.y);
}

});

ctx.strokeStyle="rgba(79,126,248,0.15)";
ctx.stroke();

});

}

function animate(){

ctx.clearRect(0,0,canvas.width,canvas.height);

drawGrid();

drawCharts();

particles.forEach(p=>{
p.move();
p.draw();
});

connectParticles();

drawCursorTrail();

requestAnimationFrame(animate);

}

initParticles();
initCharts();
animate();