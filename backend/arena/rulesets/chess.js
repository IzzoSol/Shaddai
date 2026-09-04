'use strict';
// ============================================================================
// arena/rulesets/chess.js - Dependency-free chess ruleset (Tier 1).
// Complete legal-move engine: all 6 pieces, castling, en passant, promotion,
// check / checkmate / stalemate / insufficient-material / 50-move draws.
// Turn-based: seat 'A' plays White, seat 'B' plays Black (referee drives via
// state.activeSeat). Moves are algebraic: {"type":"move","payload":{"from":"e2","to":"e4"}}.
// ============================================================================

const FILES = 'abcdefgh';

// ---- Board helpers ----
// sq = rank*8 + file; rank 0 = "1" (White back rank) .. 7 = "8"; file 0 = "a" .. 7 = "h".
function alg(sq) { return FILES[sq & 7] + String((sq >> 3) + 1); }
function parse(s) {
  s = String(s || '').toLowerCase();
  if (s.length < 2) return -1;
  const f = FILES.indexOf(s[0]);
  const r = Number(s[1]) - 1;
  if (f < 0 || !isFinite(r) || r < 0 || r > 7) return -1;
  return r * 8 + f;
}

function initialBoard() {
  const b = new Array(64).fill('.');
  const back = ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R'];
  for (let f = 0; f < 8; f++) {
    b[f] = back[f];                 // rank 1 white
    b[8 + f] = 'P';                 // rank 2 white pawns
    b[48 + f] = 'p';                // rank 7 black pawns
    b[56 + f] = back[f].toLowerCase(); // rank 8 black
  }
  return b;
}

const colorOf = p => (p === '.' ? '.' : (p === p.toUpperCase() ? 'W' : 'B'));
const pieceOf = p => p.toUpperCase();

// Is square `sq` attacked by `color`?
function attacked(board, sq, color) {
  // Pawns
  const prank = (sq >> 3) - (color === 'W' ? 1 : -1);
  if (prank >= 0 && prank < 8) {
    for (const df of [-1, 1]) {
      const f = (sq & 7) + df;
      if (f >= 0 && f < 8 && board[prank * 8 + f] === (color === 'W' ? 'P' : 'p')) return true;
    }
  }
  // Knights
  const kN = [17, 15, 10, 6, -6, -10, -15, -17];
  for (const dk of kN) {
    const t = sq + dk;
    if (t < 0 || t > 63) continue;
    if (Math.abs((t >> 3) - (sq >> 3)) + Math.abs((t & 7) - (sq & 7)) !== 3) continue; // knight = 2+1
    if (board[t] === (color === 'W' ? 'N' : 'n')) return true;
  }
  // Sliding (rook/bishop/queen)
  const rookCh = color === 'W' ? 'R' : 'r', bisCh = color === 'W' ? 'B' : 'b', queenCh = color === 'W' ? 'Q' : 'q', kingCh = color === 'W' ? 'K' : 'k';
  const dirs = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
  for (let i = 0; i < 8; i++) {
    const [dr, df] = dirs[i];
    let r = (sq >> 3) + dr, f = (sq & 7) + df;
    while (r >= 0 && r < 8 && f >= 0 && f < 8) {
      const at = r * 8 + f;
      const p = board[at];
      if (p !== '.') {
        if (i < 4 && p === rookCh) return true;
        if (i >= 4 && p === bisCh) return true;
        if (p === queenCh) return true;
        break; // any other piece (incl. a king) only blocks
      }
      r += dr; f += df;
    }
  }
  // Adjacent king (kings attack only the 8 neighbouring squares)
  for (const [dr, df] of dirs) {
    const r = (sq >> 3) + dr, f = (sq & 7) + df;
    if (r >= 0 && r < 8 && f >= 0 && f < 8 && board[r * 8 + f] === kingCh) return true;
  }
  return false;
}

function inCheck(board, color) {
  const k = board.indexOf(color === 'W' ? 'K' : 'k');
  if (k < 0) return false;
  return attacked(board, k, color === 'W' ? 'B' : 'W');
}

// Pseudo-legal moves from sq (self-check NOT filtered).
// `state` provides { castling, enPassant } context.
function pseudoMoves(board, sq, state) {
  const castling = state.castling;
  const enPassant = state.enPassant;
  const color = colorOf(board[sq]);
  const out = [];
  const r = sq >> 3, f = sq & 7;
  const add = (to, extra) => out.push(Object.assign({ from: sq, to, color }, extra || {}));
  const addPromo = (to, extra) => {
    for (const q of ['Q', 'R', 'B', 'N']) out.push(Object.assign({ from: sq, to, color, promotion: q }, extra || {}));
  };

  switch (pieceOf(board[sq])) {
    case 'P': {
      const d = color === 'W' ? 1 : -1;
      const startRank = color === 'W' ? 1 : 6;
      const promoRank = color === 'W' ? 7 : 0;
      const one = sq + d * 8;
      if (one >= 0 && one < 64 && board[one] === '.') {
        if ((one >> 3) === promoRank) addPromo(one);
        else {
          add(one);
          const two = sq + d * 16;
          if (r === startRank && board[two] === '.') add(two);
        }
      }
      for (const df of [-1, 1]) {
        const ff = f + df;
        if (ff < 0 || ff > 7) continue;
        const t = (r + d) * 8 + ff;
        const p = board[t];
        if (p !== '.' && colorOf(p) !== color) {
          if ((t >> 3) === promoRank) addPromo(t, { capture: true });
          else add(t, { capture: true });
        } else if (p === '.' && enPassant === t) {
          add(t, { capture: true, enPassant: true });
        }
      }
      break;
    }
    case 'N': {
      for (const [dr, df] of [[2,1],[2,-1],[-2,1],[-2,-1],[1,2],[1,-2],[-1,2],[-1,-2]]) {
        const rr = r + dr, ff = f + df;
        if (rr < 0 || rr > 7 || ff < 0 || ff > 7) continue;
        const t = rr * 8 + ff;
        if (board[t] === '.' || colorOf(board[t]) !== color) add(t, board[t] !== '.' ? { capture: true } : {});
      }
      break;
    }
    case 'B': case 'R': case 'Q': {
      const pt = pieceOf(board[sq]);
      const dirs = [];
      if (pt === 'R' || pt === 'Q') dirs.push([1,0],[-1,0],[0,1],[0,-1]);
      if (pt === 'B' || pt === 'Q') dirs.push([1,1],[1,-1],[-1,1],[-1,-1]);
      for (const [dr, df] of dirs) {
        let rr = r + dr, ff = f + df;
        while (rr >= 0 && rr < 8 && ff >= 0 && ff < 8) {
          const t = rr * 8 + ff;
          if (board[t] === '.') add(t);
          else { if (colorOf(board[t]) !== color) add(t, { capture: true }); break; }
          rr += dr; ff += df;
        }
      }
      break;
    }
    case 'K': {
      for (const [dr, df] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]) {
        const rr = r + dr, ff = f + df;
        if (rr < 0 || rr > 7 || ff < 0 || ff > 7) continue;
        const t = rr * 8 + ff;
        if (board[t] === '.' || colorOf(board[t]) !== color) add(t, board[t] !== '.' ? { capture: true } : {});
      }
      const rank = r, opp = color === 'W' ? 'B' : 'W';
      if (rank === (color === 'W' ? 0 : 7) && f === 4) {
        const kR = 4 + rank * 8, kG = 6 + rank * 8, kC = 2 + rank * 8;
        if (castling && castling[color].K && board[5 + rank * 8] === '.' && board[6 + rank * 8] === '.' &&
            board[7 + rank * 8] === (color === 'W' ? 'R' : 'r') &&
            !attacked(board, kR, opp) && !attacked(board, 5 + rank * 8, opp) && !attacked(board, kG, opp)) add(kG, { castle: 'K' });
        if (castling && castling[color].Q && board[3 + rank * 8] === '.' && board[2 + rank * 8] === '.' && board[1 + rank * 8] === '.' &&
            board[0 + rank * 8] === (color === 'W' ? 'R' : 'r') &&
            !attacked(board, kR, opp) && !attacked(board, 3 + rank * 8, opp) && !attacked(board, kC, opp)) add(kC, { castle: 'Q' });
      }
      break;
    }
  }
  return out;
}

// Castling rights helpers: { W:{K,Q}, B:{K,Q} }
function initialCastling() { return { W: { K: true, Q: true }, B: { K: true, Q: true } }; }
function revokeSide(castling, color, side) {
  const nc = { W: { K: castling.W.K, Q: castling.W.Q }, B: { K: castling.B.K, Q: castling.B.Q } };
  nc[color][side] = false;
  return nc;
}
function revokeAll(castling, color) {
  const nc = { W: { K: castling.W.K, Q: castling.W.Q }, B: { K: castling.B.K, Q: castling.B.Q } };
  nc[color].K = false; nc[color].Q = false;
  return nc;
}

// Apply a move, returning a NEW board + updated castling right.
function applyMove(board, move, castling) {
  const nb = board.slice();
  const color = colorOf(nb[move.from]);
  let nc = castling;

  // en passant capture: remove the pawn on the from-rank at the target file.
  if (move.enPassant) {
    nb[(move.from >> 3) * 8 + (move.to & 7)] = '.';
  }

  // castling: relocate rook too
  if (move.castle) {
    const rank = move.from >> 3;
    if (move.castle === 'K') {
      nb[7 + rank * 8] = '.';
      nb[5 + rank * 8] = color === 'W' ? 'R' : 'r';
      nb[6 + rank * 8] = color === 'W' ? 'K' : 'k';
    } else {
      nb[0 + rank * 8] = '.';
      nb[3 + rank * 8] = color === 'W' ? 'R' : 'r';
      nb[2 + rank * 8] = color === 'W' ? 'K' : 'k';
    }
    nb[move.from] = '.';
    // castling rights fully revoked for this color
    nc = revokeAll(castling, color);
    return { board: nb, newCastling: nc, newEnPassant: null, halfMove: 1 };
  }

  if (move.promotion) nb[move.to] = color === 'W' ? move.promotion : move.promotion.toLowerCase();
  else nb[move.to] = nb[move.from];
  nb[move.from] = '.';

  // Update castling rights from king/rook movement and captures.
  if (pieceOf(nb[move.to]) === 'K') nc = revokeAll(castling, color);
  const wRooks = { 0: 'Q', 7: 'K' };
  if (color === 'W' && wRooks[move.from]) nc = revokeSide(nc, 'W', wRooks[move.from]);
  if (color === 'B' && wRooks[move.from - 56]) nc = revokeSide(nc, 'B', wRooks[move.from - 56]);
  // captured rook?
  if (move.to === 0) nc = revokeSide(nc, 'W', 'Q');
  if (move.to === 7) nc = revokeSide(nc, 'W', 'K');
  if (move.to === 56) nc = revokeSide(nc, 'B', 'Q');
  if (move.to === 63) nc = revokeSide(nc, 'B', 'K');

  // En passant target: pawn double-step.
  let ep = null;
  if (pieceOf(nb[move.to]) === 'P' && Math.abs((move.to >> 3) - (move.from >> 3)) === 2) ep = (move.from + move.to) / 2;

  const halfMove = (pieceOf(nb[move.to]) === 'P' || move.capture) ? 0 : 1;
  return { board: nb, newCastling: nc, newEnPassant: ep, halfMove };
}

// Full legal moves for `color` (self-check filtered).
function legalMoves(board, color, state) {
  const res = [];
  for (let sq = 0; sq < 64; sq++) {
    const p = board[sq];
    if (p === '.' || colorOf(p) !== color) continue;
    const pms = pseudoMoves(board, sq, state);
    for (const m of pms) {
      const applied = applyMove(board, m, state.castling);
      if (!inCheck(applied.board, color)) {
        res.push({ ...m, newCastling: applied.newCastling, newEnPassant: applied.newEnPassant, halfMove: applied.halfMove });
      }
    }
  }
  return res;
}

function boardFen(board) {
  let fen = '';
  for (let rank = 7; rank >= 0; rank--) {
    let empty = 0;
    for (let f = 0; f < 8; f++) {
      const p = board[rank * 8 + f];
      if (p === '.') empty++;
      else { if (empty) { fen += empty; empty = 0; } fen += p; }
    }
    if (empty) fen += empty;
    if (rank) fen += '/';
  }
  return fen;
}

function insufficientMaterial(board) {
  let minors = 0, bishops = [];
  for (let i = 0; i < 64; i++) {
    const q = pieceOf(board[i]);
    if (q === 'K' || q === '.') continue;
    if (q === 'P' || q === 'R' || q === 'Q') return false;
    minors++;
    if (q === 'B') bishops.push(((i >> 3) + (i & 7)) % 2);
  }
  if (minors === 0 || minors === 1) return true;
  if (minors === 2 && bishops.length === 2 && bishops[0] === bishops[1]) return true;
  return false;
}

// ==== Ruleset object (matches arena ruleset interface) ====
module.exports = {
  id: 'chess',
  simultaneous: false,
  turnMs: 10000,

  start(seed) {
    return {
      board: initialBoard(),
      activeSeat: 'A',        // A=White, B=Black
      castling: initialCastling(),
      enPassant: null,
      halfMoves: 0,           // 50-move counter (half-moves since last pawn/capture)
      fullMove: 1,
      history: [],
      seed
    };
  },

  view(state, seat) {
    const activeColor = state.activeSeat === 'A' ? 'W' : 'B';
    const publicPart = {
      board: boardFen(state.board),
      activeSeat: state.activeSeat,
      check: inCheck(state.board, activeColor),
      fullMove: state.fullMove
    };
    let privatePart = {};
    if (seat === state.activeSeat) {
      privatePart.legalMoves = legalMoves(state.board, activeColor, state).map(m => ({
        from: alg(m.from), to: alg(m.to), promotion: m.promotion || null
      }));
    }
    return { public: publicPart, private: privatePart };
  },

  legal(state, seat, act) {
    if (state.activeSeat !== seat) return false;
    if (!act || act.type !== 'move') return false;
    const { from, to } = (act.payload || {});
    const f = parse(from), t = parse(to);
    if (f < 0 || t < 0) return false;
    const color = seat === 'A' ? 'W' : 'B';
    if (state.board[f] === '.' || colorOf(state.board[f]) !== color) return false;
    const want = String((act.payload && act.payload.promotion) || 'Q').toUpperCase();
    return legalMoves(state.board, color, state).some(m =>
      m.from === f && m.to === t && (!m.promotion || m.promotion === want));
  },

  apply(state, seat, act) {
    let chosen = null;
    if (act && act.type === 'move' && state.activeSeat === seat) {
      const { from, to } = (act.payload || {});
      const f = parse(from), t = parse(to);
      const color = seat === 'A' ? 'W' : 'B';
      const legals = legalMoves(state.board, color, state);
      chosen = legals.find(m => m.from === f && m.to === t) || null;
      if (chosen && chosen.promotion) {
        const want = String((act.payload && act.payload.promotion) || 'Q').toUpperCase();
        if (['Q', 'R', 'B', 'N'].includes(want)) chosen.promotion = want; else chosen.promotion = 'Q';
      }
    }
    if (!chosen) {
      // timeout / illegal move → random legal move (game keeps moving)
      const color = state.activeSeat === 'A' ? 'W' : 'B';
      const legals = legalMoves(state.board, color, state);
      chosen = legals[Math.floor(Math.random() * legals.length)] || null;
    }
    if (!chosen) return state; // mate/stalemate — status resolves

    const applied = applyMove(state.board, chosen, state.castling);
    const newHalf = (chosen.halfMove === 0) ? 0 : state.halfMoves + 1;
    const nextSeat = state.activeSeat === 'A' ? 'B' : 'A';
    return {
      board: applied.board,
      activeSeat: nextSeat,
      castling: applied.newCastling,
      enPassant: applied.newEnPassant,
      halfMoves: newHalf,
      fullMove: (state.activeSeat === 'B') ? state.fullMove + 1 : state.fullMove,
      history: state.history.concat([{
        seat, from: alg(chosen.from), to: alg(chosen.to),
        promotion: chosen.promotion || null, capture: !!chosen.capture, castle: chosen.castle || null
      }]),
      seed: state.seed
    };
  },

  status(state) {
    const color = state.activeSeat === 'A' ? 'W' : 'B';
    const opponent = state.activeSeat === 'A' ? 'B' : 'A';
    const ms = legalMoves(state.board, color, state);
    const check = inCheck(state.board, color);
    if (ms.length === 0) return check ? opponent + '_win' : 'draw';  // checkmate / stalemate
    if (insufficientMaterial(state.board)) return 'draw';
    if (state.halfMoves >= 100) return 'draw';
    return 'playing';
  }
};
