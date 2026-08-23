'use strict';

/** Seconds -> "MM:SS" (zero-padded) or "H:MM:SS" past one hour. */
function fmtMarker(totalSec) {
  const s = Math.max(0, Math.round(Number(totalSec) || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const two = (n) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${two(m)}:${two(ss)}` : `${two(m)}:${two(ss)}`;
}

const CUE_TIME_RE = /^(?:(\d{1,2}):)?(\d{2}):(\d{2})\.\d{3}\s*-->/;

/**
 * Convert raw WEBVTT text into plain text with a [MM:SS] marker before the
 * first caption line of each cue. Mirrors the Python vtt_to_text() stripping
 * (WEBVTT header, cue-number lines, timing lines, <tag> markup) but keeps
 * the timestamp as a standalone bracketed token instead of discarding it.
 */
function vttToMarkedText(raw) {
  const lines = String(raw || '').split(/\r?\n/);
  const out = [];
  let pendingSec = null;

  for (let rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith('WEBVTT')) continue;
    if (/^\d+$/.test(line)) continue; // cue number

    const m = CUE_TIME_RE.exec(line);
    if (m) {
      const h = m[1] ? parseInt(m[1], 10) : 0;
      const mm = parseInt(m[2], 10);
      const ss = parseInt(m[3], 10);
      pendingSec = h * 3600 + mm * 60 + ss;
      continue;
    }
    if (line.includes('-->')) continue; // malformed timing line safety net

    const text = line.replace(/<[^>]+>/g, '').trim();
    if (!text) continue;

    if (pendingSec != null) {
      out.push(`[${fmtMarker(pendingSec)}]`);
      pendingSec = null; // only the cue's first caption line gets a marker
    }
    out.push(text);
  }
  return out.join(' ');
}

module.exports = { vttToMarkedText, fmtMarker };
