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
const gameOverDialog = document.querySelector('#gameOverDialog');

let board = emptyBoard();
let tray = [];
let score = 0;
let bestScore = Number(localStorage.getItem('kocka-best') || 0);
let selectedIndex = null;
let previewCells = [];
let drag = null;
let combo = 0;
let gameEnded = false;

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
    const blocked=!piece.used&&placements(board,piece.shape).length===0;
    slot.className='piece-slot'+(piece.used?' used':'')+(selectedIndex===index?' selected':'')+(blocked?' blocked':'');
    slot.dataset.index=index;
    slot.setAttribute('role','button');
    slot.setAttribute('aria-label',piece.used?'Uporabljen kos':blocked?`Kos ${index+1}, ni prostora`:`Kos ${index+1}`);
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
function boardMetrics() {
  const rect=boardEl.getBoundingClientRect();
  const gap=parseFloat(getComputedStyle(boardEl).gap)||0;
  const cell=(rect.width-gap*(SIZE-1))/SIZE;
  return {rect,gap,cell,step:cell+gap};
}
function dragCenter(clientX,clientY,pointerType,cell) {
  // Na dotik kos dvignemo ravno toliko, da ga prst ne zakrije. Miška ostane brez odmika.
  const lift=pointerType==='touch' ? Math.min(cell*1.25,58) : pointerType==='pen' ? cell*.55 : 0;
  return {x:clientX,y:clientY-lift,lift};
}
function boardPosition(clientX,clientY,piece,fromDrag=false,pointerType='mouse') {
  const {rect,gap,cell,step}=boardMetrics();
  const b=bounds(piece.shape);
  let row,col;
  if(fromDrag){
    const center=dragCenter(clientX,clientY,pointerType,cell);
    const pieceWidth=b.width*cell+(b.width-1)*gap;
    const pieceHeight=b.height*cell+(b.height-1)*gap;
    col=Math.round((center.x-rect.left-pieceWidth/2)/step);
    row=Math.round((center.y-rect.top-pieceHeight/2)/step);
  } else {
    col=Math.floor((clientX-rect.left)/step);
    row=Math.floor((clientY-rect.top)/step);
  }
  return {
    row:Math.max(0,Math.min(row,SIZE-b.height)),
    col:Math.max(0,Math.min(col,SIZE-b.width))
  };
}

function nearestValidPosition(piece,wanted,maxDistance=1.35) {
  let best=null;
  for(const [row,col] of placements(board,piece.shape)) {
    const distance=Math.hypot(row-wanted.row,col-wanted.col);
    if(!best||distance<best.distance) best={row,col,distance};
  }
  return best&&best.distance<=maxDistance?{row:best.row,col:best.col}:null;
}

function startDrag(e,index) {
  if(e.button!==undefined&&e.button!==0) return;
  e.preventDefault();
  selectedIndex=index;
  renderTray();
  const piece=tray[index];
  const ghost=makePieceGrid(piece,'piece-grid drag-ghost');
  const {cell,gap}=boardMetrics();
  ghost.style.setProperty('--ghost-cell',`${cell}px`);
  ghost.style.gap=`${gap}px`;
  document.body.append(ghost);
  drag={index,ghost,moved:false,startX:e.clientX,startY:e.clientY,pointerType:e.pointerType||'mouse'};
  trayEl.children[index]?.classList.add('dragging');
  moveDrag(e);
  window.addEventListener('pointermove',moveDrag,{passive:false});
  window.addEventListener('pointerup',endDrag,{once:true});
  window.addEventListener('pointercancel',cancelDrag,{once:true});
}
function moveDrag(e) {
  if(!drag) return;
  e.preventDefault();
  const metrics=boardMetrics();
  const center=dragCenter(e.clientX,e.clientY,drag.pointerType,metrics.cell);
  drag.ghost.style.left=`${center.x}px`; drag.ghost.style.top=`${center.y}px`;
  if(Math.hypot(e.clientX-drag.startX,e.clientY-drag.startY)>8) drag.moved=true;
  const rect=metrics.rect;
  const over=center.x>=rect.left&&center.x<=rect.right&&center.y>=rect.top&&center.y<=rect.bottom;
  if(over){
    const piece=tray[drag.index];
    const wanted=boardPosition(e.clientX,e.clientY,piece,true,drag.pointerType);
    const exact=canPlace(board,piece.shape,wanted.row,wanted.col)?wanted:null;
    const pos=exact||nearestValidPosition(piece,wanted);
    if(pos){ showPreview(piece,pos.row,pos.col,true); drag.pos=pos; }
    else { showPreview(piece,wanted.row,wanted.col,false); drag.pos=null; }
  } else { clearPreview(); drag.pos=null; }
}
function endDrag(e) {
  window.removeEventListener('pointermove',moveDrag);
  window.removeEventListener('pointercancel',cancelDrag);
  if(!drag) return;
  const {index,ghost,pos,moved}=drag;
  const trayRect=trayEl.getBoundingClientRect();
  const overTray=e.clientX>=trayRect.left&&e.clientX<=trayRect.right&&e.clientY>=trayRect.top-16&&e.clientY<=trayRect.bottom+16;
  if(moved&&pos&&canPlace(board,tray[index].shape,pos.row,pos.col)) {
    ghost.remove(); drag=null; clearPreview(); playPiece(index,pos.row,pos.col); return;
  }
  if(moved&&overTray) {
    ghost.remove(); drag=null; clearPreview(); selectedIndex=null; renderTray(); showToast('Kos je nazaj med kosi'); return;
  }
  if(moved) {
    clearPreview();
    drag.pos=null; drag.moved=false;
    ghost.classList.add('parked');
    ghost.addEventListener('pointerdown',resumeHeldPiece,{once:true});
    showToast('Ni prostora — premakni kos ali ga vrni nazaj');
    return;
  }
  ghost.remove(); drag=null; clearPreview(); selectedIndex=index; renderTray();
}
function resumeHeldPiece(e) {
  if(!drag) return;
  e.preventDefault();
  drag.ghost.classList.remove('parked');
  drag.ghost.style.pointerEvents='none';
  drag.startX=e.clientX; drag.startY=e.clientY; drag.moved=true; drag.pointerType=e.pointerType||'mouse';
  moveDrag(e);
  window.addEventListener('pointermove',moveDrag,{passive:false});
  window.addEventListener('pointerup',endDrag,{once:true});
  window.addEventListener('pointercancel',cancelDrag,{once:true});
}
function cancelDrag(){ if(drag){drag.ghost.remove();drag=null;} clearPreview(); selectedIndex=null; renderTray(); window.removeEventListener('pointermove',moveDrag); window.removeEventListener('pointerup',endDrag); }

function anyMoveAvailable() {
  return tray.some(piece=>!piece.used&&placements(board,piece.shape).length>0);
}

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
  } else if(!anyMoveAvailable()) gameOver();
}

function gameOver() {
  if(gameEnded) return;
  gameEnded=true;
  document.querySelector('#finalScore').textContent=score;
  setTimeout(()=>gameOverDialog.showModal(),260);
}
function newGame() {
  if(gameOverDialog.open) gameOverDialog.close();
  board=emptyBoard(); score=0; combo=0; selectedIndex=null; gameEnded=false;
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
document.querySelector('#restartButton').addEventListener('click',newGame);
document.querySelector('#inspectBoardButton').addEventListener('click',()=>gameOverDialog.close());
helpDialog.addEventListener('click',e=>{if(e.target===helpDialog)helpDialog.close();});

bestEl.textContent=bestScore;
newGame();
if('serviceWorker' in navigator) window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));
