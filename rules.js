'use strict';
(() => {
  const ALL = (1n << 64n) - 1n;
  const DIRECTIONS = [[1,0xfefefefefefefefen],[-1,0x7f7f7f7f7f7f7f7fn],[8,ALL],[-8,ALL],
    [9,0xfefefefefefefefen],[7,0x7f7f7f7f7f7f7f7fn],[-7,0xfefefefefefefefen],[-9,0x7f7f7f7f7f7f7f7fn]];
  const shift = (x,d,m) => (d > 0 ? x << BigInt(d) : x >> BigInt(-d)) & m & ALL;
  const bits = value => { const result=[]; for(let i=0;i<64;i++) if(value & (1n<<BigInt(i))) result.push(i); return result; };
  function legal(player, opponent) {
    const empty = ALL ^ (player | opponent); let moves = 0n;
    for (const [d,m] of DIRECTIONS) {
      let ray = shift(player,d,m) & opponent;
      for(let i=0;i<5;i++) ray |= shift(ray,d,m) & opponent;
      moves |= shift(ray,d,m) & empty;
    }
    return moves;
  }
  class Board {
    constructor(player=(1n<<28n)|(1n<<35n), opponent=(1n<<27n)|(1n<<36n)) {
      this.player=BigInt(player);this.opponent=BigInt(opponent);
      if ((this.player & this.opponent) || ((this.player | this.opponent) & ~ALL)) throw Error('不正な盤面です。');
    }
    get legal() { return legal(this.player,this.opponent); }
    get terminal() { return !this.legal && !legal(this.opponent,this.player); }
    play(action) {
      if(!Number.isInteger(action)) throw Error('着手の形式が正しくありません。');
      if(action===-1) {
        if(this.legal || this.terminal) throw Error('パスできません。');
        return new Board(this.opponent,this.player);
      }
      if(action<0 || action>=64 || !(this.legal & (1n<<BigInt(action)))) throw Error('そこには置けません。');
      const move=1n<<BigInt(action);let flips=0n;
      for(const [d,m] of DIRECTIONS) {
        let ray=shift(move,d,m), captured=0n;
        while(ray & this.opponent) {captured|=ray;ray=shift(ray,d,m);}
        if(ray & this.player) flips|=captured;
      }
      return new Board(this.opponent & ~flips,this.player | move | flips);
    }
  }
  const transforms = Array.from({length:8},(_,s)=>Array.from({length:64},(_,square)=>{
    let r=Math.floor(square/8), c=square%8;
    if(s>=4)c=7-c;
    for(let i=0;i<s%4;i++) [r,c]=[c,7-r];
    return r*8+c;
  }));
  const masks = Array.from({length:64},(_,i)=>1n<<BigInt(i));
  function canonical(board) {
    let best=null;
    for(let s=0;s<8;s++) {
      let p=0n,o=0n;
      for(let i=0;i<64;i++) {
        const target=masks[transforms[s][i]];
        if(board.player & masks[i])p|=target;
        if(board.opponent & masks[i])o|=target;
      }
      if(!best || p<best.player || (p===best.player && o<best.opponent)) best={player:p,opponent:o,symmetry:s};
    }
    return best;
  }
  function encode(board) {
    const c=canonical(board), features=new Float32Array(128);
    for(let i=0;i<64;i++) { features[i]=(c.player & masks[i])?1:0;features[64+i]=(c.opponent & masks[i])?1:0; }
    return {...c, features, legal:legal(c.player,c.opponent)};
  }
  function select(encoded, logits) {
    let selected=-1,best=-Infinity;
    for(let i=0;i<64;i++) if((encoded.legal & masks[i]) && logits[i]>best) {best=logits[i];selected=i;}
    if(selected<0)throw Error('合法手がありません。');
    return transforms[encoded.symmetry].indexOf(selected);
  }
  const coordinate = a => a<0?'pass':String.fromCharCode(97+a%8)+(1+Math.floor(a/8));
  self.Othello = {Board,bits,legal,canonical,encode,select,coordinate,transforms};
})();
