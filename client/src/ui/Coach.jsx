// First-time experience on screen: the lobby driving test and the one-time
// match hints. The rules live in tutorial/lessons.js; this reads the car's
// telemetry, feeds them, and draws the card (SPEC-TOYBOX §4.7).
//   DrivingTest  a paper memo in the lobby's top-centre slot: "Driving test ·
//                4 of 5", step pips, the lesson and its prompt, Skip
//   MatchHints   runs the hint rules during a match and publishes the hint;
//                the match HUD draws it as a sticky memo (<CoachMemo />) in
//                its top-centre column, under the objective and any office
//                event (lowest priority, never in the car zone)
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { POWERUPS, ABILITIES } from '@rc/shared';
import { useStore } from '../store.js';
import { telemetry } from '../game/LocalCar.jsx';
import { audio } from '../audio.js';
import { LESSONS, newTest, stepTest, tokens, HINTS, nextHint } from '../tutorial/lessons.js';
import { ToyIcon } from './Icon.jsx';
import './hud/coach.css';

const SAMPLE_MS = 50;
// the touch prompts' glyph tokens ({steer}, {drift}…): each is a Toy icon,
// the same one the touch pad's button wears (scripts/test-tutorial.mjs)
const ICONS = new Set(['steer', 'drift', 'flame', 'gift', 'star']);
// drift tiers named in a prompt wear their spark colour
const TIER_WORD = /\b(blue|orange|pink)\b/;
const TIER_CLS = { blue: 'c1', orange: 'c2', pink: 'c3' };

// '{W} to drive' → keycap + text; '{flame}' → the touch button's own icon;
// '{item}' → the filled-in name, bold
function Prompt({ text, fill = {}, className = 'tb-memo-t' }) {
  return (
    <span className={className}>
      {tokens(text).map((p, i) => {
        if (p.text != null) {
          return p.text.split(TIER_WORD).map((bit, j) => (j % 2 ? <b key={`${i}-${j}`} className={TIER_CLS[bit]}>{bit}</b> : bit));
        }
        if (Object.hasOwn(fill, p.key)) return <b key={i}>{fill[p.key]}</b>;
        if (ICONS.has(p.key)) return <span key={i} className="tb-glyph"><ToyIcon name={p.key} /></span>;
        return <kbd key={i} className="tb-k">{p.key}</kbd>;
      })}
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
  const now = Math.min(step, LESSONS.length - 1);
  const lesson = LESSONS[now];

  return (
    <div className="tb-coach-top" role="status" aria-live="polite">
      <div className="tb-memo tb-test a-pop">
        <span className="tb-memo-k"><ToyIcon name={finished ? 'check' : 'flag'} /></span>
        <span className="tb-memo-b">
          <span className="tb-test-h">
            <span className="tb-micro">{finished ? 'Driving test · passed' : `Driving test · ${now + 1} of ${LESSONS.length}`}</span>
            <span className="tb-test-dots" role="img" aria-label={`${Math.min(step, LESSONS.length)} of ${LESSONS.length} done`}>
              {LESSONS.map((l, i) => <i key={l.id} className={i < step ? 'is-done' : i === step ? 'is-now' : ''} />)}
            </span>
            {!finished && <button type="button" className="tb-test-skip" onClick={skip}>Skip</button>}
          </span>
          {finished ? (
            <>
              <span className="tb-test-t tb-disp is-go">Licence granted</span>
              <span className="tb-memo-t">
                In a match, drive over a glowing pad to grab an item. Ready up when you are — the bots are waiting.
              </span>
            </>
          ) : (
            <>
              <span key={flash ? 'nice' : lesson.id} className={`tb-test-t tb-disp a-pop${flash ? ' is-go' : ''}`}>
                {flash ? <><ToyIcon name="check" /> Nice.</> : lesson.title}
              </span>
              <Prompt text={say(lesson.say, mode)} />
            </>
          )}
        </span>
      </div>
    </div>
  );
}

// ------------------------------------------------------------- match hints
// The hint on screen right now, for the match HUD to draw ({ id, fill } | null).
let current = null;
const listeners = new Set();
const publish = (h) => { current = h; listeners.forEach((f) => f()); };
const subscribe = (f) => { listeners.add(f); return () => listeners.delete(f); };
export const useCoachHint = () => useSyncExternalStore(subscribe, () => current, () => null);

export function MatchHints() {
  const acc = useRef({ stuckFor: 0, matchStart: 0, lastAbilityAt: 0, used: false });

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
      if (!showing && current) publish(null);
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
      const ab = ABILITIES[st.car] || ABILITIES.balanced;
      publish({ id, fill: { item: POWERUPS[st.powerup]?.name || 'item', ability: ab.name, abilityDesc: ab.desc } });
      showingUntil = now + 6000;
      useStore.setState({ hintsSeen: [...st.hintsSeen, id] });
      st.save();
      audio.blip(990, 0.06, 0.08);
    }, 250);
    return () => { clearInterval(iv); publish(null); };
  }, []);

  return null;
}

// the hint as a sticky memo from Facilities (top-centre slot, desktop only)
export function CoachMemo() {
  const hint = useCoachHint();
  const mode = useStore((s) => s.inputMode);
  if (!hint) return null;
  return (
    <div key={hint.id} className="tb-memo a-pop" role="status" aria-live="polite">
      <span className="tb-memo-k"><ToyIcon name="paper" /></span>
      <span className="tb-memo-b">
        <span className="tb-micro">Memo · from Facilities</span>
        <Prompt text={say(HINTS[hint.id], mode)} fill={hint.fill} />
      </span>
    </div>
  );
}
