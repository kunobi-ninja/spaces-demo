import { DRUM, drums, roll, fold, grooveOf, human, playable, type Arrangement } from "@vixi/audio";

// The code behind music/song.mdx. The hook lives in the score as one <Line> per
// chord; this file decides who plays it and how busy the band is at each energy.

export const song = {
  bar(w, b) {
    // Energy can arrive between levels while the music builds; play the nearest one.
    const e = Math.max(0, Math.min(3, Math.round(Number.isFinite(b.energy) ? b.energy : 1)));
    const last = playable(b);
    const len = b.bar.end - b.bar.start;

    // A soft bed under everything, a little brighter as the film builds.
    w.chord("pad", b.voicing, b.bar.start, len, [0.25, 0.32, 0.4, 0.48][e]);

    // Bass: root on the beat, a fifth on the "and" of two and four once the beat is in.
    const root = fold(b.root, 36);
    if (e === 0) w.note("bass", root, b.bar.start, len - 0.05, 0.5);
    else
      for (let s = 0; s < last; s += 4) {
        w.note("bass", root, b.at(s), b.beat * 0.8, human(b, s === 0 ? 0.9 : 0.75));
        if (e >= 2 && (s === 4 || s === 12)) w.note("bass", root + 7, b.at(s + 2), b.beat * 0.4, human(b, 0.6));
      }

    // Plucked chord tones on the eighths, up and down.
    if (e >= 1) {
      const tones = [...b.voicing, b.voicing[0] + 12];
      const order = [0, 1, 2, 3, 2, 1, 2, 3];
      for (let s = 0, k = 0; s < last; s += 2, k++) w.note("pluck", tones[order[k % order.length]] + 12, b.at(s), b.beat * 0.35, human(b, k % 2 ? 0.55 : 0.75));
    }

    // The hook, from the score's line for this chord.
    const line = b.slot ? b.score.lines[b.slot] : undefined;
    if (line && e >= 1)
      for (const n of line) if (n.step < last) w.note("bell", n.midi, b.at(n.step), (n.length * b.beat) / 4, human(b, 0.85, 0.08));

    // The beat.
    if (e >= 2) for (const l of grooveOf(b.score, e === 3 ? "peak" : "body")) drums(w, b, l.drum!, l.steps, l.gain, last);
  },
  transition(w, t) {
    // Drums from the score's own kit: a hat roll into a lift, a crash where it lands,
    // and a clap pickup when the music steps back.
    if (t.kind === "lift" || t.kind === "end") {
      roll(w, t, DRUM.hat, 1, t.joined ? 0.5 : 0.8);
      if (!t.joined) w.drum(DRUM.crash, t.cut, 0.55);
    } else if (t.kind === "drop") {
      w.drum(DRUM.clap, t.cut - t.beat / 2, 0.5);
    }
  },
  ending(w, e) {
    const { at } = e;
    const stop = Number.isFinite(e.end) ? e.end : at + 2;
    // The ending's beat can be missing when the last section is short: fall back to the score's 120 bpm.
    const beat = Number.isFinite(e.beat) && e.beat > 0 ? e.beat : 0.5;
    const ring = Math.max(0.5, stop - at);
    // The final chord's voicing can come back empty; C major is where the hook resolves.
    const voicing = e.voicing?.length ? e.voicing : [60, 64, 67];
    // Every note starts and ends inside the film: one that starts after the reel's end does not mix.
    const note = (track: string, midi: number, t: number, d: number, v: number) => {
      if (t < stop - 0.05) w.note(track, midi, t, Math.min(d, stop - t), v);
    };
    w.drum(DRUM.kick, at, 0.9);
    w.drum(DRUM.crash, at, 0.6);
    w.chord("pad", voicing, at, ring, 0.5);
    note("bass", fold(Number.isFinite(e.root) ? e.root : 48, 36), at, ring, 0.8);
    // A glockenspiel run up the final chord, then its top note rings under the card.
    const run = [...voicing, ...voicing.map((n) => n + 12)];
    run.forEach((n, i) => note("bell", n + 12, at + (i * beat) / 4, beat * 0.5, 0.75 - i * 0.04));
    note("bell", run[run.length - 1] + 12, at + (run.length * beat) / 4, ring, 0.7);
  },
} satisfies Arrangement;
