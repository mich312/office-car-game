// First-time experience on screen: the lobby driving test and the one-time
// match hints. The rules live in tutorial/lessons.js; this reads the car's
// telemetry, feeds them, and draws the card.
import { useEffect, useRef, useState } from 'react';
import { POWERUPS, ABILITIES } from '@rc/shared';
import { useStore } from '../store.js';
import { telemetry } from '../game/LocalCar.jsx';
import { audio } from '../audio.js';
import { LESSONS, newTest, stepTest, tokens, HINTS, nextHint } from '../tutorial/lessons.js';
import Icon from './Icon.jsx';
import './hud/coach.css';

const SAMPLE_MS = 50;
const ICONS = new Set(['chevron-left', 'chevron-right', 'wind', 'flame', 'gift', 'star']);

// '{W} to drive' → keycap + text; '{flame}' → the touch button's own icon
function Prompt({ text, fill = {} }) {
  let t = text;
  for (const [k, v] of Object.entries(fill)) t = t.replaceAll(`{${k}}`, v);
  return (
    <span className="coach-say">
      {tokens(t).map((p, i) => (p.text != null ? <span key={i}>{p.text}</span>
        : ICONS.has(p.key) ? <span key={i} className="coach-icon"><Icon name={p.key} size={15} /></span>
          : <kbd key={i} className="keycap">{p.key}</kbd>))}
    </span>
  );
}

const say = (entry, mode) => entry[mode] || entry.keys;

// ------------------------------------------------------------ driving test
export function DrivingTest() {
  const status = useStore((s) => s.drivingTest);
  const mode = useStore((s) => s.inputMode);
  const [step, setStep] = useState(0);
  const [flash, setFlash] = useState(null); // lesson just passed
  const [finished, setFinished] = useState(false);
  const test = useRef(null);

  useEffect(() => {
    if (status !== 'todo') return undefined;
    test.current = newTest();
    setStep(0); setFinished(false);
    const iv = setInterval(() => {
      const { passed } = stepTest(test.current, telemetry, SAMPLE_MS / 1000);
      if (!passed) return;
      audio.driftTier(Math.min(3, test.current.step));
      setFlash(passed);
      setTimeout(() => setFlash(null), 900);
      setStep(test.current.step);
      if (test.current.done) {
        setFinished(true);
        // passed: remember it, and let the card linger long enough to read
        setTimeout(() => { useStore.setState({ drivingTest: 'done' }); useStore.getState().save(); }, 6000);
      }
    }, SAMPLE_MS);
    return () => clearInterval(iv);
  }, [status]);

  if (status !== 'todo') return null;
  const skip = () => { useStore.setState({ drivingTest: 'skipped' }); useStore.getState().save(); audio.blip(440, 0.06); };
  const lesson = LESSONS[Math.min(step, LESSONS.length - 1)];

  return (
    <div className="coach coach-lobby panel" role="status" aria-live="polite">
      <div className="coach-head">
        <span className="label"><Icon name="flag" size={12} /> driving test</span>
        <span className="coach-dots" aria-label={`${Math.min(step, LESSONS.length)} of ${LESSONS.length} done`}>
          {LESSONS.map((l, i) => <i key={l.id} className={i < step ? 'done' : i === step ? 'now' : ''} />)}
        </span>
        {!finished && <button className="coach-skip" onClick={skip}>skip</button>}
      </div>
      {finished ? (
        <>
          <b className="coach-title"><Icon name="check" size={18} /> Licence granted</b>
          <span className="coach-say">
            During a match, drive over a glowing pad to grab an item. Ready up when you are — the bots are waiting.
          </span>
        </>
      ) : (
        <>
          <b key={lesson.id} className={`coach-title ${flash ? 'passed' : ''}`}>
            {flash ? <><Icon name="check" size={18} /> Nice.</> : lesson.title}
          </b>
          <Prompt text={say(lesson.say, mode)} />
        </>
      )}
    </div>
  );
}

// ------------------------------------------------------------- match hints
export function MatchHints() {
  const [hint, setHint] = useState(null); // { id, fill }
  const acc = useRef({ stuckFor: 0, matchStart: 0, lastAbilityAt: 0, used: false });
  const mode = useStore((s) => s.inputMode);

  useEffect(() => {
    const a = acc.current;
    a.matchStart = performance.now();
    a.lastAbilityAt = useStore.getState().abilityReadyAt;
    let showingUntil = 0;
    const iv = setInterval(() => {
      const st = useStore.getState();
      const now = performance.now();
      a.stuckFor = st.phase === 'playing' && telemetry.throttle > 0 && telemetry.speed < 1 ? a.stuckFor + 0.25 : 0;
      if (st.abilityReadyAt !== a.lastAbilityAt) a.used = true;
      const showing = now < showingUntil;
      if (!showing) setHint((h) => (h ? null : h)); // (functional: this closure's `hint` is stale)
      const id = nextHint({
        phase: st.phase,
        seen: new Set(st.hintsSeen),
        showing,
        holdingItem: !!st.powerup,
        stuckFor: a.stuckFor,
        matchTime: (now - a.matchStart) / 1000,
        usedAbility: a.used,
      });
      if (!id) return;
      const car = st.car;
      setHint({ id, fill: { item: POWERUPS[st.powerup]?.name || 'item', ability: ABILITIES[car]?.name || 'special' } });
      showingUntil = now + 6000;
      useStore.setState({ hintsSeen: [...st.hintsSeen, id] });
      st.save();
      audio.blip(990, 0.06, 0.08);
    }, 250);
    return () => clearInterval(iv);
  }, []);

  if (!hint) return null;
  return (
    <div className="coach coach-hint panel" role="status" aria-live="polite">
      <Prompt text={say(HINTS[hint.id], mode)} fill={hint.fill} />
    </div>
  );
}
