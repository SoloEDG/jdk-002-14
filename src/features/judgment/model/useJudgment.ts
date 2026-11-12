import { computed, ref } from "vue";
import type { Lane, Note } from "../../../shared/chart";
import { secondsAt } from "../../../shared/chart";
import type { Hit, Run } from "../../../shared/session";
import {
  grade,
  statistics,
  worstGrade,
  WINDOWS,
  TAIL_WINDOW,
} from "../lib/rules";

type Holding = { note: Note; headDelta: number };
export type LastJudgment = {
  noteId: string;
  grade: Hit["grade"];
  headDelta: number;
  tailDelta?: number;
};

export function useJudgment() {
  const hits = ref<Hit[]>([]),
    held = ref(new Set<Lane>()),
    feedback = ref(""),
    total = ref(0),
    lastJudgment = ref<LastJudgment | null>(null),
    /** 已进入尾部窗口、等待松手的长按音符 */
    releaseNotes = ref(new Set<string>());
  let run: Run | null = null;
  const holding = new Map<string, Holding>();
  const pending = new Map<string, { at: number; lanes: Set<Lane> }>();
  const done = computed(() => new Set(hits.value.map((h) => h.noteId)));
  const stats = computed(() => statistics(hits.value, total.value));

  function tailTime(n: Note) {
    return secondsAt(n.beat + n.duration, run!.track.bpm);
  }
  function refreshRelease(time: number) {
    const next = new Set<string>();
    for (const h of holding.values()) {
      if (time >= tailTime(h.note) - TAIL_WINDOW) next.add(h.note.id);
    }
    releaseNotes.value = next;
  }
  function commit(hit: Hit, tailDelta?: number) {
    hits.value.push(hit);
    feedback.value = hit.grade;
    lastJudgment.value = {
      noteId: hit.noteId,
      grade: hit.grade,
      headDelta: hit.delta,
      tailDelta,
    };
    holding.delete(hit.noteId);
    pending.delete(hit.noteId);
  }
  function finishTap(n: Note, delta: number, miss = false) {
    if (done.value.has(n.id)) return;
    commit({ noteId: n.id, grade: miss ? "MISS" : grade(delta), delta, beat: n.beat });
  }
  /** 长按单次判定：起点与尾部分别评级，取较差等级，只产生一条 Hit */
  function finishHold(h: Holding, tailDelta: number) {
    const { note, headDelta } = h;
    if (done.value.has(note.id)) return;
    const head = grade(headDelta);
    const tail = grade(tailDelta);
    commit(
      {
        noteId: note.id,
        grade: worstGrade(head, tail),
        delta: headDelta,
        beat: note.beat,
        tailDelta,
      },
      tailDelta,
    );
  }
  function finishMiss(n: Note, delta: number) {
    if (done.value.has(n.id)) return;
    commit({ noteId: n.id, grade: "MISS", delta, beat: n.beat });
  }
  function reset(next: Run) {
    run = next;
    hits.value = [];
    held.value = new Set();
    holding.clear();
    pending.clear();
    feedback.value = "";
    lastJudgment.value = null;
    releaseNotes.value = new Set();
    total.value = next.notes.length;
  }
  function down(lane: Lane, time: number) {
    if (!run || held.value.has(lane)) return;
    held.value.add(lane);
    const n = run.notes.find(
      (n) =>
        n.lanes.includes(lane) &&
        !done.value.has(n.id) &&
        !holding.has(n.id) &&
        Math.abs(secondsAt(n.beat, run!.track.bpm) - time) <= WINDOWS.good,
    );
    if (!n) return;
    const delta = time - secondsAt(n.beat, run.track.bpm);
    if (n.lanes.length > 1) {
      const group = pending.get(n.id) ?? { at: time, lanes: new Set<Lane>() };
      group.lanes.add(lane);
      pending.set(n.id, group);
      if (group.lanes.size < n.lanes.length) return;
    }
    if (n.duration > 0) {
      holding.set(n.id, { note: n, headDelta: delta });
      refreshRelease(time);
    } else finishTap(n, delta);
  }
  function up(lane: Lane, time: number) {
    held.value.delete(lane);
    if (!run) return;
    for (const h of [...holding.values()]) {
      if (!h.note.lanes.includes(lane)) continue;
      const tailDelta = time - tailTime(h.note);
      if (Math.abs(tailDelta) <= TAIL_WINDOW) finishHold(h, tailDelta);
      else finishMiss(h.note, h.headDelta);
    }
    refreshRelease(time);
  }
  function tick(time: number) {
    if (!run) return;
    for (const n of run.notes) {
      if (done.value.has(n.id)) continue;
      const h = holding.get(n.id);
      if (h) {
        // 未松手拖过尾部窗口：按漏音处理
        if (time > tailTime(n) + TAIL_WINDOW) finishMiss(n, h.headDelta);
      } else if (time > secondsAt(n.beat, run.track.bpm) + WINDOWS.good) {
        finishMiss(n, time - secondsAt(n.beat, run.track.bpm));
      }
    }
    refreshRelease(time);
  }
  function clearHeld() {
    held.value.clear();
  }
  return {
    hits,
    held,
    feedback,
    lastJudgment,
    releaseNotes,
    done,
    stats,
    reset,
    down,
    up,
    tick,
    clearHeld,
  };
}
