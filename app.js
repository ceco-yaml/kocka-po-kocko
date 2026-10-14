const SIZE = 8;
const COLORS = ['#2e7d5b', '#ee7b4d', '#e8b84f', '#4e83aa', '#cf5f59'];
const SHAPES = [
  [[0,0]],
  [[0,0],[0,1]], [[0,0],[1,0]],
  [[0,0],[0,1],[0,2]], [[0,0],[1,0],[2,0]],
  [[0,0],[0,1],[0,2],[0,3]], [[0,0],[1,0],[2,0],[3,0]],
  [[0,0],[0,1],[1,0],[1,1]],
  [[0,0],[1,0],[1,1]], [[0,0],[0,1],[1,0]], [[0,0],[0,1],[1,1]], [[0,1],[1,0],[1,1]],
  [[0,0],[1,0],[2,0],[2,1]], [[0,0],[0,1],[0,2],[1,0]],
  [[0,0],[0,1],[1,1],[2,1]], [[0,1],[1,0],[1,1],[2,0]],
  [[0,0],[0,1],[0,2],[1,1]], [[0,1],[1,0],[1,1],[1,2]],
  [[0,0],[0,1],[0,2],[1,0],[1,1],[1,2]],
  [[0,0],[0,1],[0,2],[1,0],[1,1],[1,2],[2,0],[2,1],[2,2]]
];

const boardEl = document.querySelector('#board');
const trayEl = document.querySelector('#tray');
const scoreEl = document.querySelector('#score');
const bestEl = document.querySelector('#bestScore');
const comboEl = document.querySelector('#comboMessage');
const toastEl = document.querySelector('#toast');
const flashEl = document.querySelector('#clearFlash');
const helpDialog = document.querySelector('#helpDialog');

let board = emptyBoard();
let tray = [];
let score = 0;
let bestScore = Number(localStorage.getItem('kocka-best') || 0);
let selectedIndex = null;
let previewCells = [];
let drag = null;
let combo = 0;

function emptyBoard() { return Array.from({length: SIZE}, () => Array(SIZE).fill(null)); }
function cloneBoard(b) { return b.map(row => row.slice()); }
function bounds(shape) {
  return {
    width: Math.max(...shape.map(p => p[1])) + 1,
    height: Math.max(...shape.map(p => p[0])) + 1
  };
}
function canPlace(b, shape, row, col) {
  return shape.every(([dr,dc]) => row+dr >= 0 && col+dc >= 0 && row+dr < SIZE && col+dc < SIZE && !b[row+dr][col+dc]);
}
function placements(b, shape) {
  const {width,height} = bounds(shape);
  const out = [];
  for (let r=0; r<=SIZE-height; r++) for (let c=0; c<=SIZE-width; c++) if (canPlace(b, shape, r, c)) out.push([r,c]);
  return out;
}
function placeAndClear(b, piece, row, col) {
  const next = cloneBoard(b);
  piece.shape.forEach(([dr,dc]) => next[row+dr][col+dc] = piece.color);
  const fullRows = [];
  const fullCols = [];
  for (let r=0;r<SIZE;r++) if (next[r].every(Boolean)) fullRows.push(r);
  for (let c=0;c<SIZE;c++) if (next.every(rowCells => rowCells[c])) fullCols.push(c);
  fullRows.forEach(r => { for(let c=0;c<SIZE;c++) next[r][c]=null; });
  fullCols.forEach(c => { for(let r=0;r<SIZE;r++) next[r][c]=null; });
  return { board: next, fullRows, fullCols };
}

// Preveri, ali obstaja vsaj ena sekvenca, v kateri lahko odigramo vse tri kose.
function trioIsSolvable(startBoard, pieces, depth=0) {
  if (!pieces.length) return true;
  // Najprej poskusi kos z najmanj možnimi mesti: precej hitrejše iskanje.
  const ordered = pieces.map((piece,index) => ({piece,index,spots:placements(startBoard,piece.shape)})).sort((a,b) => a.spots.length-b.spots.length);
  for (const {piece,index,spots} of ordered) {
    for (const [r,c] of spots) {
      const next = placeAndClear(startBoard,piece,r,c).board;
      const rest = pieces.filter((_,i) => i!==index);
      if (trioIsSolvable(next,rest,depth+1)) return true;
    }
  }
  return false;
}

function randomPiece(pool=SHAPES) {
  const shape = pool[Math.floor(Math.random()*pool.length)];
  return { shape, color: COLORS[Math.floor(Math.random()*COLORS.length)], used:false };
}
function dealSolvableTrio() {
  // Naključje ostane glavni vir; preverjanje le zavrne komplete brez rešitve.
  for (let attempt=0; attempt<240; attempt++) {
    const pieces = [randomPiece(),randomPiece(),randomPiece()];
    if (trioIsSolvable(board,pieces)) return pieces;
  }
  // V zelo tesni mreži postopoma uporabi manjše kose, dokler najde pošten komplet.
  const compact = SHAPES.filter(s => s.length <= 3);
  for (let attempt=0; attempt<160; attempt++) {
    const pieces = [randomPiece(compact),randomPiece(compact),randomPiece(compact)];
    if (trioIsSolvable(board,pieces)) return pieces;
  }
  const singles = [randomPiece([SHAPES[0]]),randomPiece([SHAPES[0]]),randomPiece([SHAPES[0]])];
  return trioIsSolvable(board,singles) ? singles : null;
}

function makePieceGrid(piece, className='piece-grid') {
  const el = document.createElement('div');
  el.className = className;
  const {width,height} = bounds(piece.shape);
  el.style.gridTemplateColumns = `repeat(${width}, 1fr)`;
  el.style.setProperty('--piece-color',piece.color);
  for (let r=0;r<height;r++) for(let c=0;c<width;c++) {
    const block = document.createElement('div');
    block.className = piece.shape.some(([pr,pc])=>pr===r&&pc===c) ? 'piece-block' : 'piece-empty';
    el.append(block);
  }
  return el;
}
function renderBoard() {
  boardEl.innerHTML='';
  for(let r=0;r<SIZE;r++) for(let c=0;c<SIZE;c++) {
    const cell=document.createElement('div');
    cell.className='cell'+(board[r][c]?' filled':'');
    cell.dataset.row=r; cell.dataset.col=c;
    cell.setAttribute('role','gridcell');
    if(board[r][c]) cell.style.setProperty('--cell-color',board[r][c]);
    boardEl.append(cell);
  }
}
function renderTray() {
  trayEl.innerHTML='';
  tray.forEach((piece,index)=>{
    const slot=document.createElement('div');
    slot.className='piece-slot'+(piece.used?' used':'')+(selectedIndex===index?' selected':'');
    slot.dataset.index=index;
    slot.setAttribute('role','button');
    slot.setAttribute('aria-label',piece.used?'Uporabljen kos':`Kos ${index+1}`);
    slot.append(makePieceGrid(piece));
    if(!piece.used) slot.addEventListener('pointerdown', e=>startDrag(e,index));
    trayEl.append(slot);
  });
}
function renderScores() { scoreEl.textContent=score; bestEl.textContent=bestScore; }
function clearPreview() {
  previewCells.forEach(({cell})=>cell.classList.remove('preview','invalid'));
  previewCells=[];
}
function showPreview(piece,row,col,valid) {
  clearPreview();
  piece.shape.forEach(([dr,dc])=>{
    const r=row+dr,c=col+dc;
    if(r>=0&&c>=0&&r<SIZE&&c<SIZE){
      const cell=boardEl.children[r*SIZE+c];
      cell.classList.add(valid?'preview':'invalid');
      cell.style.setProperty('--preview-color',piece.color);
      previewCells.push({cell});
    }
  });
}
function boardPosition(clientX,clientY,piece,fromDrag=false) {
  const rect=boardEl.getBoundingClientRect();
  const gap=parseFloat(getComputedStyle(boardEl).gap)||0;
  const cell=(rect.width-gap*(SIZE-1))/SIZE;
  const lift=fromDrag ? cell*.75 : 0;
  const col=Math.floor((clientX-rect.left)/(cell+gap));
  const row=Math.floor((clientY-lift-rect.top)/(cell+gap));
  const b=bounds(piece.shape);
  return {row:Math.min(row,SIZE-b.height),col:Math.min(col,SIZE-b.width)};
}

function startDrag(e,index) {
  if(e.button!==undefined&&e.button!==0) return;
  e.preventDefault();
  selectedIndex=index;
  renderTray();
  const piece=tray[index];
  const ghost=makePieceGrid(piece,'piece-grid drag-ghost');
  const cell=(boardEl.getBoundingClientRect().width-(SIZE-1)*5)/SIZE;
  ghost.style.setProperty('--ghost-cell',`${cell}px`);
  document.body.append(ghost);
  drag={index,ghost,moved:false,startX:e.clientX,startY:e.clientY};
  moveDrag(e);
  window.addEventListener('pointermove',moveDrag,{passive:false});
  window.addEventListener('pointerup',endDrag,{once:true});
  window.addEventListener('pointercancel',cancelDrag,{once:true});
}
function moveDrag(e) {
  if(!drag) return;
  e.preventDefault();
  drag.ghost.style.left=`${e.clientX}px`; drag.ghost.style.top=`${e.clientY}px`;
  if(Math.hypot(e.clientX-drag.startX,e.clientY-drag.startY)>8) drag.moved=true;
  const rect=boardEl.getBoundingClientRect();
  const over=e.clientX>=rect.left&&e.clientX<=rect.right&&e.clientY>=rect.top&&e.clientY<=rect.bottom+60;
  if(over){
    const piece=tray[drag.index];
    const pos=boardPosition(e.clientX,e.clientY,piece,true);
    showPreview(piece,pos.row,pos.col,canPlace(board,piece.shape,pos.row,pos.col));
    drag.pos=pos;
  } else { clearPreview(); drag.pos=null; }
}
function endDrag(e) {
  window.removeEventListener('pointermove',moveDrag);
  if(!drag) return;
  const {index,ghost,pos,moved}=drag;
  ghost.remove(); drag=null; clearPreview();
  if(moved&&pos&&canPlace(board,tray[index].shape,pos.row,pos.col)) playPiece(index,pos.row,pos.col);
  else { selectedIndex=index; renderTray(); }
}
function cancelDrag(){ if(drag){drag.ghost.remove();drag=null;} clearPreview(); window.removeEventListener('pointermove',moveDrag); }

boardEl.addEventListener('pointerdown',e=>{
  if(selectedIndex===null) return;
  const cell=e.target.closest('.cell'); if(!cell) return;
  const piece=tray[selectedIndex];
  const pos=boardPosition(e.clientX,e.clientY,piece,false);
  if(canPlace(board,piece.shape,pos.row,pos.col)) playPiece(selectedIndex,pos.row,pos.col);
  else { showPreview(piece,pos.row,pos.col,false); setTimeout(clearPreview,220); }
});

function playPiece(index,row,col) {
  const piece=tray[index]; if(!piece||piece.used) return;
  const result=placeAndClear(board,piece,row,col);
  board=result.board; piece.used=true; selectedIndex=null;
  const lines=result.fullRows.length+result.fullCols.length;
  combo=lines?combo+1:0;
  score += piece.shape.length + (lines ? lines*10 + Math.max(0,lines-1)*8 + Math.max(0,combo-1)*5 : 0);
  if(score>bestScore){bestScore=score;localStorage.setItem('kocka-best',bestScore);}
  renderBoard(); renderTray(); renderScores();
  if(lines){
    comboEl.textContent=lines>1?`${lines} linije! +${lines*10+Math.max(0,lines-1)*8}`:`Čista linija! +10`;
    flashEl.classList.remove('pop'); void flashEl.offsetWidth; flashEl.classList.add('pop');
    setTimeout(()=>comboEl.textContent='',1200);
  }
  if(tray.every(p=>p.used)) {
    const next=dealSolvableTrio();
    if(next){ tray=next; setTimeout(renderTray,150); }
    else gameOver();
  }
}

function gameOver() {
  showToast('Ni več mogoče sestaviti rešljivega kompleta.');
  setTimeout(()=>{ if(confirm(`Konec igre — dosegel si ${score} točk. Nova igra?`)) newGame(); },300);
}
function newGame() {
  board=emptyBoard(); score=0; combo=0; selectedIndex=null;
  tray=dealSolvableTrio();
  renderBoard();renderTray();renderScores();
  showToast('Nova poštena igra');
}
function showToast(message){
  toastEl.textContent=message;toastEl.classList.add('show');
  clearTimeout(showToast.timer);showToast.timer=setTimeout(()=>toastEl.classList.remove('show'),1800);
}

document.querySelector('#newGameButton').addEventListener('click',()=>{ if(score===0||confirm('Začnem novo igro? Trenutni rezultat bo izgubljen.')) newGame(); });
document.querySelector('#helpButton').addEventListener('click',()=>helpDialog.showModal());
document.querySelector('#closeHelp').addEventListener('click',()=>helpDialog.close());
document.querySelector('#gotItButton').addEventListener('click',()=>helpDialog.close());
helpDialog.addEventListener('click',e=>{if(e.target===helpDialog)helpDialog.close();});

bestEl.textContent=bestScore;
newGame();
if('serviceWorker' in navigator) window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));
