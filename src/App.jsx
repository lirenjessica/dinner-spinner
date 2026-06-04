import { useState, useEffect, useRef } from "react";
const GEMINI_KEY = import.meta.env.VITE_GEMINI_KEY;

/* ─── palette: warm zen, natural tones ──────────────────── */
const ZEN = {
  bg:       "#F7F3EE",
  surface:  "#EDEAE4",
  border:   "#D8D2C8",
  text:     "#2C2825",
  muted:    "#8C8680",
  faint:    "#C5BFB7",
};

const STEPS = [
  { key: "protein", label: "Protein", emoji: "🥩", color: "#8B4A3A", spinBg: "#F5EDE8",
    items: ["Poultry","Red Meat","Pork","Ground Meat & Sausage","Fish","Shrimp & Shellfish","Plant-based"] },
  { key: "veggie",  label: "Veggie",  emoji: "🥦", color: "#3D6E52", spinBg: "#EAF0EB",
    items: ["Leafy Greens","Broccoli & Cabbage","Peppers, Eggplant & Asparagus","Squash","Beans & Corn","Root Veg"] },
  { key: "carb",    label: "Carb",    emoji: "🍚", color: "#7A5C2E", spinBg: "#F2EDE3",
    items: ["Rice","Noodles","Bread","Potatoes","Grains","Legumes"] },
  { key: "style",   label: "Cuisine", emoji: "🌏", color: "#4A5A7A", spinBg: "#E9EBF2",
    items: ["East Asian","Southeast Asian","South Asian","Italian & Mediterranean","French & Continental","Latin American","Middle Eastern","American"] },
];

const DIFF = [
  { key: "easy",   label: "Easy",   icon: "🙂", desc: "~20 min, one pan",    color: "#3D6E52" },
  { key: "medium", label: "Medium", icon: "👨‍🍳", desc: "30–45 min, some prep", color: "#7A5C2E" },
  { key: "hard",   label: "Hard",   icon: "🔥", desc: "1 hr+, multi-step",   color: "#8B4A3A" },
];

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

/* ══════════════════════════════════════════════════════════
   PIE WHEEL SPINNER
   - SVG wheel with equal segments, pointer at top
   - Spins freely via CSS animation on tap of "Spin"
   - On "Stop": pick winner in JS, calculate exact rotation
     to land that segment under the pointer, apply via
     CSS transition. Winner = segment under pointer at rest.
     Zero sync issues — JS drives the final angle.
══════════════════════════════════════════════════════════ */

// Warm muted palette for wheel segments
const SEG_COLORS = [
  "#C4856A","#7EAB8A","#C4A46A","#8A9BBF",
  "#B07A6E","#6E9E80","#A0876E","#7A8FB0",
];

function PieWheel({ items, color, phase, winner, onSpinEnd }) {
  const SIZE = 280;
  const cx = SIZE / 2;
  const cy = SIZE / 2;
  const r  = SIZE / 2 - 4;
  const n  = items.length;
  const segAngle = 360 / n;

  // rotationRef holds the current accumulated rotation (degrees)
  const rotationRef = useRef(0);
  const wheelRef    = useRef(null);
  // For free spin: store animation start time + speed
  const spinStateRef = useRef({ active: false, speed: 0, lastTs: null });
  const rafRef = useRef(null);
  const [displayRot, setDisplayRot] = useState(0);

  // Free spin loop
  useEffect(() => {
    if (phase === "spinning") {
      spinStateRef.current = { active: true, speed: 8, lastTs: null };
      function frame(ts) {
        const s = spinStateRef.current;
        if (!s.active) return;
        if (!s.lastTs) s.lastTs = ts;
        const dt = Math.min(ts - s.lastTs, 50);
        s.lastTs = ts;
        rotationRef.current = (rotationRef.current + s.speed * (dt / 16)) % 36000;
        setDisplayRot(rotationRef.current);
        rafRef.current = requestAnimationFrame(frame);
      }
      rafRef.current = requestAnimationFrame(frame);
      return () => {
        spinStateRef.current.active = false;
        cancelAnimationFrame(rafRef.current);
      };
    }

    if (phase === "stopping" && winner) {
      // Stop free spin
      spinStateRef.current.active = false;
      cancelAnimationFrame(rafRef.current);

      // The pointer is at the top (270° in SVG space, or "12 o'clock").
      // Segment i is centered at: -90 + i * segAngle + segAngle/2 degrees from 12-o-clock
      // We want winner segment centered under pointer.
      // Winner index:
      const wi = items.indexOf(winner);
      // Current wheel rotation mod 360
      const curMod = rotationRef.current % 360;
      // The winner segment center (in wheel-local coords, before rotation) sits at:
      const segCenter = wi * segAngle + segAngle / 2;
      // We want: (segCenter + finalRot) mod 360 = 0 (pointing up = 0° after our offset)
      // So finalRot = (-segCenter + 360*k) for some k
      let targetMod = ((-segCenter) % 360 + 360) % 360;
      // Travel forward from curMod, at least 2 full spins for visual satisfaction
      let travelDelta = (targetMod - curMod + 360) % 360;
      if (travelDelta < 90) travelDelta += 360;
      travelDelta += 720; // ensure at least 2 full rotations
      const finalRot = rotationRef.current + travelDelta;

      // Animate to finalRot using CSS transition on the element
      if (wheelRef.current) {
        wheelRef.current.style.transition = "transform 1.4s cubic-bezier(0.25, 0.1, 0.1, 1)";
        wheelRef.current.style.transform  = `rotate(${finalRot}deg)`;
        rotationRef.current = finalRot;
        setDisplayRot(finalRot);
      }

      const t = setTimeout(() => onSpinEnd && onSpinEnd(), 1500);
      return () => clearTimeout(t);
    }

    if (phase === "idle") {
      spinStateRef.current.active = false;
      cancelAnimationFrame(rafRef.current);
      if (wheelRef.current) {
        wheelRef.current.style.transition = "none";
        wheelRef.current.style.transform  = `rotate(${rotationRef.current}deg)`;
      }
    }
  }, [phase, winner]);

  // Sync display rotation to wheel element during free spin
  useEffect(() => {
    if (phase === "spinning" && wheelRef.current) {
      wheelRef.current.style.transition = "none";
      wheelRef.current.style.transform  = `rotate(${displayRot}deg)`;
    }
  }, [displayRot, phase]);

  // Build SVG segments
  function polarToCart(angleDeg, radius) {
    const rad = ((angleDeg - 90) * Math.PI) / 180;
    return { x: cx + radius * Math.cos(rad), y: cy + radius * Math.sin(rad) };
  }

  function segPath(i) {
    const start = i * segAngle;
    const end   = start + segAngle;
    const p1 = polarToCart(start, r);
    const p2 = polarToCart(end,   r);
    const large = segAngle > 180 ? 1 : 0;
    return `M ${cx} ${cy} L ${p1.x} ${p1.y} A ${r} ${r} 0 ${large} 1 ${p2.x} ${p2.y} Z`;
  }

  function labelPos(i) {
    const midAngle = i * segAngle + segAngle / 2;
    return polarToCart(midAngle, r * 0.62);
  }

  const isRevealing = phase === "stopping" || phase === "done";

  return (
    <div style={{ position:"relative", width:SIZE, height:SIZE + 32, display:"flex", flexDirection:"column", alignItems:"center" }}>
      {/* pointer triangle */}
      <div style={{
        width:0, height:0,
        borderLeft:"12px solid transparent",
        borderRight:"12px solid transparent",
        borderTop:`26px solid ${color}`,
        position:"absolute", top:0, left:"50%",
        transform:"translateX(-50%)",
        zIndex:10, filter:`drop-shadow(0 2px 4px ${color}66)`,
      }} />

      {/* wheel */}
      <div ref={wheelRef} style={{
        width:SIZE, height:SIZE,
        borderRadius:"50%",
        overflow:"hidden",
        boxShadow:"0 4px 24px rgba(44,40,37,0.14)",
        marginTop:6,
        willChange:"transform",
      }}>
        <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
          {items.map((item, i) => {
            const lp = labelPos(i);
            const midAngle = i * segAngle + segAngle / 2;
            const labelAngle = midAngle - 90; // rotate label to face outward
            return (
              <g key={i}>
                <path d={segPath(i)} fill={SEG_COLORS[i % SEG_COLORS.length]} stroke="#fff" strokeWidth="1.5" />
                <text
                  x={lp.x} y={lp.y}
                  textAnchor="middle" dominantBaseline="middle"
                  transform={`rotate(${labelAngle}, ${lp.x}, ${lp.y})`}
                  fontSize={n > 6 ? "10" : "12"}
                  fontFamily="'DM Sans', sans-serif"
                  fontWeight="500"
                  fill="#fff"
                  style={{ pointerEvents:"none", userSelect:"none" }}
                >
                  {item.length > 12 ? item.slice(0,11) + "…" : item}
                </text>
              </g>
            );
          })}
          {/* center circle */}
          <circle cx={cx} cy={cy} r={22} fill={ZEN.bg} stroke="#fff" strokeWidth="2" />
          <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle" fontSize="18">🍽️</text>
        </svg>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   SPIN SCREEN
══════════════════════════════════════════════════════════ */
function SpinScreen({ step, stepIdx, total, onDone }) {
  const { label, emoji, color, items } = step;
  const [phase, setPhase] = useState("idle"); // idle | spinning | stopping | done
  const [winner, setWinner] = useState(null);
  const tappedRef = useRef(false);

  function handleSpin() {
    if (phase !== "idle") return;
    tappedRef.current = false;
    setPhase("spinning");
  }

  function handleStop() {
    if (phase !== "spinning") return;
    if (tappedRef.current) return;
    tappedRef.current = true;
    const w = pick(items);
    setWinner(w);
    setPhase("stopping");
  }

  function handleSpinEnd() {
    setPhase("done");
  }

  return (
    <div style={{
      minHeight:"100vh", background:ZEN.bg,
      display:"flex", flexDirection:"column",
      alignItems:"center", justifyContent:"center",
      padding:"40px 28px", position:"relative",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Lora:wght@400;600&family=DM+Sans:wght@400;500&display=swap');
        * { box-sizing:border-box; margin:0; padding:0; }
        @keyframes fadeIn  { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        @keyframes softPulse { from{opacity:0.85;transform:scale(0.99)} to{opacity:1;transform:scale(1.02)} }
      `}</style>

      <div style={{ position:"absolute", top:28, display:"flex", gap:10 }}>
        {STEPS.map((s, i) => (
          <div key={s.key} style={{
            width: i === stepIdx ? 32 : 10, height:10, borderRadius:5,
            background: i < stepIdx ? color : i === stepIdx ? color : ZEN.border,
            opacity: i < stepIdx ? 0.4 : 1, transition:"all 0.4s",
          }} />
        ))}
      </div>

      <div style={{ fontSize:11, letterSpacing:"3px", color:ZEN.muted, fontFamily:"'DM Sans',sans-serif", marginBottom:12, textTransform:"uppercase" }}>
        {stepIdx + 1} of {total}
      </div>
      <div style={{ fontSize:56, marginBottom:8, lineHeight:1 }}>{emoji}</div>
      <h2 style={{ fontFamily:"'Lora',serif", fontSize:34, fontWeight:400, color:ZEN.text, margin:"0 0 32px", letterSpacing:1 }}>
        {label}
      </h2>

      <PieWheel
        items={items}
        color={color}
        phase={phase}
        winner={winner}
        onSpinEnd={handleSpinEnd}
      />

      <div style={{ marginTop:40, height:72, display:"flex", alignItems:"center", justifyContent:"center" }}>
        {phase === "idle" && (
          <button onTouchStart={handleSpin} onClick={handleSpin} style={{
            background:color, color:"#fff", border:"none",
            borderRadius:50, padding:"18px 60px",
            fontSize:20, fontFamily:"'DM Sans',sans-serif", fontWeight:500,
            cursor:"pointer", boxShadow:`0 4px 28px ${color}44`,
            WebkitTapHighlightColor:"transparent", touchAction:"manipulation",
          }}>Spin</button>
        )}
        {phase === "spinning" && (
          <button onTouchStart={handleStop} onClick={handleStop} style={{
            background:color, color:"#fff", border:"none",
            borderRadius:50, padding:"18px 60px",
            fontSize:20, fontFamily:"'DM Sans',sans-serif", fontWeight:500,
            cursor:"pointer", boxShadow:`0 4px 28px ${color}55`,
            animation:"softPulse 1.2s ease infinite alternate",
            WebkitTapHighlightColor:"transparent", touchAction:"manipulation",
          }}>Stop</button>
        )}
        {phase === "stopping" && (
          <p style={{ color:ZEN.muted, fontSize:16, fontFamily:"'DM Sans',sans-serif" }}>Landing…</p>
        )}
        {phase === "done" && winner && (
          <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:14, animation:"fadeIn 0.5s ease" }}>
            <p style={{ color, fontSize:22, fontFamily:"'Lora',serif", fontWeight:600 }}>✓ {winner}</p>
            <button
              onTouchStart={() => onDone(winner)}
              onClick={() => onDone(winner)}
              style={{
                background:color, color:"#fff", border:"none",
                borderRadius:50, padding:"16px 52px",
                fontSize:19, fontFamily:"'DM Sans',sans-serif", fontWeight:500,
                cursor:"pointer", boxShadow:`0 4px 24px ${color}44`,
                WebkitTapHighlightColor:"transparent", touchAction:"manipulation",
              }}
            >Next →</button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   RESPIN MODAL — tap a pill to re-spin or type manually
══════════════════════════════════════════════════════════ */
function RespinModal({ step, currentValue, onSave, onClose }) {
  const { label, emoji, color, spinBg, items } = step;
  const [reelPhase, setReelPhase] = useState("idle");
  const [lockedItem, setLockedItem] = useState(null);
  const [manual, setManual] = useState("");
  const [tab, setTab] = useState("spin");
  const tappedRef = useRef(false);

  function startSpin() {
    setLockedItem(null);
    tappedRef.current = false;
    setReelPhase("spinning");
  }

  function handleStop() {
    if (reelPhase !== "spinning") return;
    if (tappedRef.current) return;
    tappedRef.current = true;
    const w = pick(items);
    setLockedItem(w);
    setReelPhase("stopping");
  }

  return (
    <div style={{
      position:"fixed",inset:0,background:"rgba(44,40,37,0.55)",
      display:"flex",alignItems:"flex-end",justifyContent:"center",
      zIndex:100,
    }} onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{
        background:ZEN.bg,
        borderRadius:"24px 24px 0 0",
        padding:"28px 24px 40px",
        width:"100%",maxWidth:480,
        animation:"slideUp 0.3s ease",
      }}>
        <style>{`@keyframes slideUp{from{transform:translateY(60px);opacity:0}to{transform:translateY(0);opacity:1}}`}</style>
        <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20 }}>
          <div style={{ display:"flex",alignItems:"center",gap:10 }}>
            <span style={{fontSize:28}}>{emoji}</span>
            <span style={{ fontFamily:"'Lora',serif",fontSize:22,color:ZEN.text }}>{label}</span>
          </div>
          <button onClick={onClose} style={{ background:"none",border:"none",fontSize:22,color:ZEN.muted,cursor:"pointer",WebkitTapHighlightColor:"transparent" }}>✕</button>
        </div>

        {/* tabs */}
        <div style={{ display:"flex",gap:8,marginBottom:24 }}>
          {["spin","manual"].map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              flex:1,padding:"10px",borderRadius:10,border:"none",
              background: tab===t ? color : ZEN.surface,
              color: tab===t ? "#fff" : ZEN.muted,
              fontFamily:"'DM Sans',sans-serif",fontSize:15,fontWeight:500,
              cursor:"pointer",transition:"all 0.2s",
              WebkitTapHighlightColor:"transparent",touchAction:"manipulation",
            }}>{t === "spin" ? "Re-spin" : "Type it in"}</button>
          ))}
        </div>

        {tab === "spin" && (
          <div style={{ display:"flex",flexDirection:"column",gap:12,alignItems:"center" }}>
            <PieWheel
              items={items}
              color={color}
              phase={reelPhase}
              winner={lockedItem}
              onSpinEnd={() => setReelPhase("locked")}
            />
            <div style={{ height:52,display:"flex",alignItems:"center",justifyContent:"center" }}>
              {reelPhase === "idle" && (
                <button onTouchStart={startSpin} onClick={startSpin} style={{
                  background:color,color:"#fff",border:"none",borderRadius:50,
                  padding:"12px 40px",fontSize:16,fontFamily:"'DM Sans',sans-serif",
                  fontWeight:500,cursor:"pointer",
                  WebkitTapHighlightColor:"transparent",touchAction:"manipulation",
                }}>Spin</button>
              )}
              {reelPhase === "spinning" && (
                <button onTouchStart={handleStop} onClick={handleStop} style={{
                  background:color,color:"#fff",border:"none",borderRadius:50,
                  padding:"12px 40px",fontSize:16,fontFamily:"'DM Sans',sans-serif",
                  fontWeight:500,cursor:"pointer",animation:"softPulse 1.2s ease infinite alternate",
                  WebkitTapHighlightColor:"transparent",touchAction:"manipulation",
                }}>Stop</button>
              )}
              {reelPhase === "stopping" && (
                <p style={{color:ZEN.muted,fontSize:15,fontFamily:"'DM Sans',sans-serif"}}>Landing…</p>
              )}
              {reelPhase === "locked" && lockedItem && (
                <p style={{ color,fontSize:16,fontFamily:"'Lora',serif",fontWeight:600 }}>✓ {lockedItem}</p>
              )}
            </div>
            {reelPhase === "locked" && lockedItem && (
              <div style={{ width:"100%",display:"flex",flexDirection:"column",gap:10,alignItems:"center" }}>
                <button onTouchStart={() => onSave(lockedItem)} onClick={() => onSave(lockedItem)} style={{
                  width:"100%",background:color,color:"#fff",border:"none",
                  borderRadius:12,padding:"14px",fontSize:17,
                  fontFamily:"'DM Sans',sans-serif",fontWeight:500,cursor:"pointer",
                  WebkitTapHighlightColor:"transparent",touchAction:"manipulation",
                }}>
                  Use "{lockedItem}"
                </button>
                <button onTouchStart={startSpin} onClick={startSpin} style={{
                  background:"none",border:"none",color:ZEN.muted,fontSize:14,
                  fontFamily:"'DM Sans',sans-serif",cursor:"pointer",textDecoration:"underline",
                  WebkitTapHighlightColor:"transparent",
                }}>Spin again</button>
              </div>
            )}
          </div>
        )}

        {tab === "manual" && (
          <div style={{ display:"flex",flexDirection:"column",gap:12 }}>
            <div style={{ display:"flex",flexWrap:"wrap",gap:8,maxHeight:200,overflowY:"auto" }}>
              {items.map(it => (
                <button key={it} onClick={() => setManual(it)} style={{
                  background: manual===it ? color : ZEN.surface,
                  color: manual===it ? "#fff" : ZEN.text,
                  border:`1.5px solid ${manual===it ? color : ZEN.border}`,
                  borderRadius:20,padding:"8px 16px",
                  fontFamily:"'DM Sans',sans-serif",fontSize:15,
                  cursor:"pointer",transition:"all 0.15s",
                }}>{it}</button>
              ))}
            </div>
            <input
              value={manual}
              onChange={e=>setManual(e.target.value)}
              placeholder="Or type your own…"
              style={{
                width:"100%",padding:"12px 14px",
                border:`1.5px solid ${ZEN.border}`,borderRadius:10,
                background:ZEN.surface,color:ZEN.text,
                fontFamily:"'DM Sans',sans-serif",fontSize:16,
                outline:"none",
              }}
            />
            <button
              onClick={() => manual.trim() && onSave(manual.trim())}
              disabled={!manual.trim()}
              style={{
                background: manual.trim() ? color : ZEN.border,
                color: manual.trim() ? "#fff" : ZEN.muted,
                border:"none",borderRadius:12,padding:"14px",
                fontSize:17,fontFamily:"'DM Sans',sans-serif",fontWeight:500,cursor:"pointer",
                transition:"all 0.2s",
              }}
            >Save</button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   SUMMARY SCREEN
══════════════════════════════════════════════════════════ */
function SummaryScreen({ results, setResults, onGenerate, loading }) {
  const [toppings, setToppings] = useState("");
  const [diff, setDiff] = useState("medium");
  const [servings, setServings] = useState(2);
  const [editing, setEditing] = useState(null);
  const submittingRef = useRef(false);

  function handleGetRecipes() {
    if (submittingRef.current) return;
    submittingRef.current = true;
    onGenerate({ toppings, diff, servings }, results);
    setTimeout(() => { submittingRef.current = false; }, 4000);
  }

  const editingStep = editing ? STEPS.find(s => s.key === editing) : null;

  function saveEdit(val) {
    setResults(r => ({ ...r, [editing]: val }));
    setEditing(null);
  }

  return (
    <div style={{
      minHeight:"100vh",background:ZEN.bg,
      display:"flex",flexDirection:"column",
      alignItems:"center",padding:"52px 24px 120px",gap:28,
      fontFamily:"'DM Sans',sans-serif",
      position:"relative",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Lora:wght@400;600&family=DM+Sans:wght@400;500&display=swap');
        *{box-sizing:border-box;}
        @keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        input:focus,textarea:focus{outline:none!important;border-color:#7A5C2E!important}
      `}</style>

      <div style={{ textAlign:"center" }}>
        <p style={{ fontSize:13,letterSpacing:"2px",color:ZEN.muted,marginBottom:10,textTransform:"uppercase" }}>
          Ready to cook
        </p>
        <h1 style={{ fontFamily:"'Lora',serif",fontSize:32,fontWeight:400,color:ZEN.text,letterSpacing:1 }}>
          Today's ingredients
        </h1>
      </div>

      {/* ingredient pills — tappable */}
      <div style={{ display:"flex",gap:12,flexWrap:"wrap",justifyContent:"center",maxWidth:480 }}>
        {STEPS.map(s => (
          <button key={s.key} onClick={() => setEditing(s.key)} style={{
            background:"#fff",
            border:`2px solid ${s.color}33`,
            borderRadius:50,padding:"12px 22px",
            display:"flex",alignItems:"center",gap:10,
            cursor:"pointer",transition:"all 0.2s",
            boxShadow:"0 2px 8px rgba(44,40,37,0.06)",
            animation:"fadeIn 0.4s ease",
          }}>
            <span style={{fontSize:22}}>{s.emoji}</span>
            <span style={{ fontFamily:"'Lora',serif",fontSize:18,color:ZEN.text }}>{results[s.key]}</span>
            <span style={{ fontSize:13,color:ZEN.faint }}>✎</span>
          </button>
        ))}
      </div>
      <p style={{ fontSize:14,color:ZEN.muted,marginTop:-12 }}>Tap any ingredient to change it</p>

      {/* toppings */}
      <div style={{ width:"100%",maxWidth:440 }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline", marginBottom:6 }}>
          <label style={{ fontSize:14,color:ZEN.muted }}>
            Ingredients you want to try to use
          </label>
          <span style={{ fontSize:12,color:ZEN.faint,fontStyle:"italic" }}>optional</span>
        </div>
        <textarea
          value={toppings}
          onChange={e=>setToppings(e.target.value)}
          placeholder="Dump anything here — garlic, lemon, that half tin of coconut milk… recipes will try to work them in but no promises."
          rows={3}
          style={{
            width:"100%",background:"#fff",
            border:`1.5px solid ${ZEN.border}`,borderRadius:12,
            color:ZEN.text,fontSize:15,
            fontFamily:"'DM Sans',sans-serif",
            padding:"12px 14px",resize:"vertical",
            transition:"border-color 0.2s",
            lineHeight:1.6,
          }}
        />

      </div>

      {/* difficulty */}
      <div style={{ width:"100%",maxWidth:440 }}>
        <div style={{ fontSize:14,color:ZEN.muted,marginBottom:10 }}>How much effort tonight?</div>
        <div style={{ display:"flex",gap:10 }}>
          {DIFF.map(d => {
            const sel = diff === d.key;
            return (
              <button key={d.key} onClick={() => setDiff(d.key)} style={{
                flex:1,background: sel ? d.color : "#fff",
                border:`1.5px solid ${sel ? d.color : ZEN.border}`,
                color: sel ? "#fff" : ZEN.text,
                borderRadius:12,padding:"12px 6px",
                cursor:"pointer",fontFamily:"'DM Sans',sans-serif",
                fontSize:15,fontWeight:500,transition:"all 0.2s",
              }}>
                <div style={{fontSize:22,marginBottom:4}}>{d.icon}</div>
                {d.label}
                <div style={{fontSize:12,marginTop:3,opacity:0.75,fontWeight:400}}>{d.desc}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* servings */}
      <div style={{ width:"100%",maxWidth:440 }}>
        <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10 }}>
          <span style={{ fontSize:14,color:ZEN.muted }}>Servings</span>
          <span style={{ fontSize:18,fontFamily:"'Lora',serif",color:ZEN.text,fontWeight:600 }}>{servings} people</span>
        </div>
        <input
          type="range" min={1} max={8} step={1}
          value={servings}
          onChange={e => setServings(Number(e.target.value))}
          style={{ width:"100%", accentColor:"#7A5C2E", height:6, cursor:"pointer" }}
        />
        <div style={{ display:"flex",justifyContent:"space-between",fontSize:12,color:ZEN.faint,marginTop:4 }}>
          <span>1</span><span>2</span><span>3</span><span>4</span><span>5</span><span>6</span><span>7</span><span>8</span>
        </div>
      </div>



      {/* respin modal */}
      {editing && editingStep && (
        <RespinModal
          step={editingStep}
          currentValue={results[editing]}
          onSave={saveEdit}
          onClose={() => setEditing(null)}
        />
      )}

      {/* sticky get recipes button */}
      <div style={{
        position:"fixed", bottom:0, left:0, right:0,
        padding:"16px 24px 32px",
        background:`linear-gradient(to top, ${ZEN.bg} 60%, transparent)`,
        display:"flex", justifyContent:"center",
        zIndex:50,
      }}>
        <div
          onTouchStart={(e) => { e.preventDefault(); handleGetRecipes(); }}
          onClick={handleGetRecipes}
          role="button"
          style={{
            background: ZEN.text,
            WebkitTapHighlightColor:"transparent",
            touchAction:"manipulation",
            color:"#fff",
            borderRadius:14,
            padding:"18px 0",
            fontSize:19, fontFamily:"'DM Sans',sans-serif", fontWeight:500,
            cursor:"pointer",
            textAlign:"center",
            width:"100%", maxWidth:440,
            boxShadow:"0 4px 24px rgba(44,40,37,0.22)",
            userSelect:"none",
            WebkitUserSelect:"none",
          }}
        >
          Get recipes →
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   RECIPES SCREEN — pick one, no shopping list shown
══════════════════════════════════════════════════════════ */
function RecipesScreen({ recipes, onBack, onRestart, onSelect }) {
  const accents = ["#8B4A3A","#3D6E52"];

  return (
    <div style={{
      minHeight:"100vh",background:ZEN.bg,
      display:"flex",flexDirection:"column",
      alignItems:"center",padding:"48px 24px 80px",gap:24,
      fontFamily:"'DM Sans',sans-serif",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Lora:wght@400;600&family=DM+Sans:wght@400;500&display=swap');
        *{box-sizing:border-box;}
        @keyframes slideIn{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:translateY(0)}}
      `}</style>

      <div style={{ textAlign:"center" }}>
        <p style={{ fontSize:13,letterSpacing:"2px",color:ZEN.muted,marginBottom:10,textTransform:"uppercase" }}>Choose one</p>
        <h1 style={{ fontFamily:"'Lora',serif",fontSize:32,fontWeight:400,color:ZEN.text,letterSpacing:1 }}>
          Tonight's recipes
        </h1>
      </div>

      <div style={{ width:"100%",maxWidth:480,display:"flex",flexDirection:"column",gap:16 }}>
        {recipes.map((r, i) => {
          const c = accents[i];
          return (
            <div key={i} style={{
              background:"#fff",
              border:`1.5px solid ${ZEN.border}`,
              borderLeft:`5px solid ${c}`,
              borderRadius:16,padding:"22px 24px",
              animation:`slideIn 0.4s ease ${i*0.15}s both`,
              boxShadow:"0 2px 12px rgba(44,40,37,0.06)",
            }}>
              <div style={{ fontSize:13,letterSpacing:"1px",color:c,fontFamily:"'DM Sans',sans-serif",fontWeight:500,marginBottom:8,textTransform:"uppercase" }}>
                Option {i+1}
              </div>
              <div style={{ fontSize:22,fontFamily:"'Lora',serif",color:ZEN.text,marginBottom:10,lineHeight:1.3 }}>
                {r.name}
              </div>
              <div style={{ fontSize:17,color:ZEN.muted,lineHeight:1.7,marginBottom:14 }}>
                {r.description}
              </div>
              <div style={{ display:"flex",gap:8,flexWrap:"wrap",marginBottom:20 }}>
                {r.tags?.map(tag => (
                  <span key={tag} style={{
                    fontSize:13,color:c,background:`${c}12`,
                    borderRadius:20,padding:"4px 12px",
                    fontFamily:"'DM Sans',sans-serif",
                  }}>{tag}</span>
                ))}
              </div>
              <button onTouchStart={() => onSelect(r)} onClick={() => onSelect(r)} style={{
                width:"100%",background:c,color:"#fff",border:"none",
                borderRadius:12,padding:"14px",fontSize:17,
                fontFamily:"'DM Sans',sans-serif",fontWeight:500,
                cursor:"pointer",transition:"all 0.2s",
                WebkitTapHighlightColor:"transparent",touchAction:"manipulation",
              }}>
                Cook this →
              </button>
            </div>
          );
        })}
      </div>

      <button onClick={onBack} style={{
        background:"#fff",border:`1.5px solid ${ZEN.border}`,
        color:ZEN.muted,borderRadius:12,padding:"13px 32px",
        fontSize:16,fontFamily:"'DM Sans',sans-serif",
        cursor:"pointer",marginTop:4,transition:"all 0.2s",
      }}>
        ← Back to ingredients
      </button>

      <button onClick={onRestart} style={{
        background:"none",border:"none",
        color:ZEN.faint,fontSize:14,fontFamily:"'DM Sans',sans-serif",
        cursor:"pointer",textDecoration:"underline",
      }}>
        Start over
      </button>
    </div>
  );
}

/* ── download helper ─────────────────────────────────── */
// Blob download blocked in sandboxed iframes; use share modal instead
function downloadTextFile(filename, text) {
  // fallback no-op — replaced by ShareModal
}

function buildShoppingText(recipe, servings) {
  const lines = [
    recipe.name + " — Shopping List",
    "Serves " + servings,
    "",
    ...recipe.shoppingList.map(i => "• " + i),
  ];
  return lines.join("\n");
}

function buildRecipeText(recipe, servings) {
  const lines = [
    recipe.name,
    "Serves " + servings,
    recipe.tags ? recipe.tags.join(" · ") : "",
    "",
    recipe.description,
    "",
    "SHOPPING LIST",
    ...recipe.shoppingList.map(i => "• " + i),
    "",
    "STEPS",
    ...recipe.steps.map((s, i) => (i + 1) + ". " + s),
  ];
  return lines.join("\n");
}

/* ══════════════════════════════════════════════════════════
   SHARE MODAL — shows text content for copy / share
══════════════════════════════════════════════════════════ */
function ShareModal({ title, text, onClose }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    } else {
      // fallback for older iOS
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      try { document.execCommand("copy"); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch(e) {}
      document.body.removeChild(ta);
    }
  }

  function handleShare() {
    if (navigator.share) {
      navigator.share({ title, text }).catch(() => {});
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position:"fixed", inset:0,
        background:"rgba(44,40,37,0.6)",
        display:"flex", alignItems:"flex-end", justifyContent:"center",
        zIndex:200,
      }}
    >
      <div onClick={e => e.stopPropagation()} style={{
        background:ZEN.bg,
        borderRadius:"24px 24px 0 0",
        padding:"28px 24px 48px",
        width:"100%", maxWidth:520,
        animation:"slideUp 0.3s ease",
        maxHeight:"80vh",
        display:"flex", flexDirection:"column",
        gap:16,
      }}>
        <style>{`@keyframes slideUp{from{transform:translateY(60px);opacity:0}to{transform:translateY(0);opacity:1}}`}</style>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <h3 style={{ fontFamily:"'Lora',serif", fontSize:20, fontWeight:400, color:ZEN.text }}>{title}</h3>
          <button onClick={onClose} style={{ background:"none", border:"none", fontSize:22, color:ZEN.muted, cursor:"pointer" }}>✕</button>
        </div>

        <pre style={{
          fontFamily:"'DM Sans',sans-serif",
          fontSize:14, color:ZEN.text,
          background:"#fff", border:`1px solid ${ZEN.border}`,
          borderRadius:12, padding:"14px 16px",
          overflowY:"auto", flex:1,
          whiteSpace:"pre-wrap", wordBreak:"break-word",
          lineHeight:1.7,
        }}>{text}</pre>

        <div style={{ display:"flex", gap:10 }}>
          <button
            onTouchStart={handleCopy} onClick={handleCopy}
            style={{
              flex:1, background: copied ? "#3D6E52" : ZEN.text,
              color:"#fff", border:"none", borderRadius:12,
              padding:"14px", fontSize:16,
              fontFamily:"'DM Sans',sans-serif", fontWeight:500,
              cursor:"pointer", transition:"background 0.2s",
              WebkitTapHighlightColor:"transparent", touchAction:"manipulation",
            }}
          >
            {copied ? "Copied ✓" : "Copy text"}
          </button>
          {navigator.share && (
            <button
              onTouchStart={handleShare} onClick={handleShare}
              style={{
                flex:1, background:"transparent",
                color:ZEN.text, border:`1.5px solid ${ZEN.border}`,
                borderRadius:12, padding:"14px", fontSize:16,
                fontFamily:"'DM Sans',sans-serif", fontWeight:500,
                cursor:"pointer",
                WebkitTapHighlightColor:"transparent", touchAction:"manipulation",
              }}
            >
              Share
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   SHOPPING LIST SCREEN — tick off before cooking
══════════════════════════════════════════════════════════ */
function ShoppingListScreen({ recipe, onCook, onBack, servings = 2 }) {
  const [checked, setChecked] = useState(new Set());
  const [showShare, setShowShare] = useState(false);

  function toggle(i) {
    setChecked(s => {
      const n = new Set(s);
      n.has(i) ? n.delete(i) : n.add(i);
      return n;
    });
  }

  const total = recipe.shoppingList?.length || 0;
  const done = checked.size;

  return (
    <div style={{
      minHeight:"100vh",background:ZEN.bg,
      display:"flex",flexDirection:"column",
      alignItems:"center",padding:"48px 24px 100px",gap:0,
      fontFamily:"'DM Sans',sans-serif",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Lora:wght@400;600&family=DM+Sans:wght@400;500&display=swap');
        *{box-sizing:border-box;}
        @keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
      `}</style>

      <div style={{ width:"100%",maxWidth:480 }}>
        <button onClick={onBack} style={{
          background:"none",border:"none",color:ZEN.muted,
          fontFamily:"'DM Sans',sans-serif",fontSize:15,
          cursor:"pointer",marginBottom:24,padding:0,
        }}>← Back to recipes</button>

        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:8 }}>
          <p style={{ fontSize:13,letterSpacing:"2px",color:ZEN.muted,textTransform:"uppercase" }}>
            Shopping list
          </p>
          <button
            onTouchStart={() => setShowShare(true)}
            onClick={() => setShowShare(true)}
            style={{
              background:"none", border:`1.5px solid ${ZEN.border}`,
              borderRadius:8, padding:"5px 12px",
              fontSize:13, color:ZEN.muted,
              fontFamily:"'DM Sans',sans-serif",
              cursor:"pointer", display:"flex", alignItems:"center", gap:5,
              WebkitTapHighlightColor:"transparent", touchAction:"manipulation",
            }}
          >
            ↑ Save / Share
          </button>
        </div>
        <h1 style={{
          fontFamily:"'Lora',serif",fontSize:28,fontWeight:400,
          color:ZEN.text,lineHeight:1.3,marginBottom:6,
        }}>{recipe.name}</h1>

        {/* progress */}
        <p style={{ fontSize:15,color:ZEN.muted,marginBottom:24 }}>
          {done === total && total > 0 ? "All good to go ✓" : `${done} of ${total} checked`}
        </p>

        {/* progress bar */}
        <div style={{ width:"100%",height:4,background:ZEN.surface,borderRadius:2,marginBottom:28,overflow:"hidden" }}>
          <div style={{
            height:"100%",borderRadius:2,
            background:"#3D6E52",
            width: total > 0 ? `${(done/total)*100}%` : "0%",
            transition:"width 0.3s ease",
          }} />
        </div>

        <div style={{ display:"flex",flexDirection:"column",gap:2 }}>
          {recipe.shoppingList?.map((item, i) => {
            const ticked = checked.has(i);
            return (
              <div key={i} onClick={() => toggle(i)} style={{
                display:"flex",alignItems:"center",gap:16,
                padding:"13px 0",
                borderBottom:`1px solid ${ZEN.surface}`,
                cursor:"pointer",transition:"all 0.15s",
                animation:`fadeIn 0.3s ease ${i*0.04}s both`,
              }}>
                <div style={{
                  width:26,height:26,borderRadius:6,flexShrink:0,
                  background: ticked ? "#3D6E52" : "#fff",
                  border:`2px solid ${ticked ? "#3D6E52" : ZEN.border}`,
                  display:"flex",alignItems:"center",justifyContent:"center",
                  transition:"all 0.2s",
                }}>
                  {ticked && <span style={{ color:"#fff",fontSize:14,fontWeight:700 }}>✓</span>}
                </div>
                <span style={{
                  fontSize:18,color: ticked ? ZEN.faint : ZEN.text,
                  textDecoration: ticked ? "line-through" : "none",
                  transition:"all 0.2s",
                }}>{item}</span>
              </div>
            );
          })}
        </div>
      </div>

      {showShare && (
        <ShareModal
          title={recipe.name + " — Shopping List"}
          text={buildShoppingText(recipe, servings)}
          onClose={() => setShowShare(false)}
        />
      )}

      {/* sticky CTA */}
      <div style={{
        position:"fixed",bottom:0,left:0,right:0,
        padding:"16px 24px 32px",
        background:`linear-gradient(to top, ${ZEN.bg} 70%, transparent)`,
        display:"flex",justifyContent:"center",
      }}>
        <button onTouchStart={onCook} onClick={onCook} style={{
          background:ZEN.text,color:"#fff",border:"none",
          borderRadius:14,padding:"16px 48px",
          fontSize:18,fontFamily:"'DM Sans',sans-serif",fontWeight:500,
          cursor:"pointer",width:"100%",maxWidth:440,
          boxShadow:"0 4px 20px rgba(44,40,37,0.18)",
          WebkitTapHighlightColor:"transparent",touchAction:"manipulation",
        }}>
          Let's cook →
        </button>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   RECIPE STEPS SCREEN
══════════════════════════════════════════════════════════ */
function RecipeStepsScreen({ recipe, onBack, servings = 2 }) {
  const [doneSteps, setDoneSteps] = useState(new Set());

  function toggle(i) {
    setDoneSteps(s => {
      const n = new Set(s);
      n.has(i) ? n.delete(i) : n.add(i);
      return n;
    });
  }

  return (
    <div style={{
      minHeight:"100vh",background:ZEN.bg,
      display:"flex",flexDirection:"column",
      alignItems:"center",padding:"48px 24px 80px",gap:0,
      fontFamily:"'DM Sans',sans-serif",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Lora:wght@400;600&family=DM+Sans:wght@400;500&display=swap');
        *{box-sizing:border-box;}
        @keyframes fadeIn{from{opacity:0}to{opacity:1}}
      `}</style>

      <div style={{ width:"100%",maxWidth:480 }}>
        <button onClick={onBack} style={{
          background:"none",border:"none",color:ZEN.muted,
          fontFamily:"'DM Sans',sans-serif",fontSize:15,
          cursor:"pointer",marginBottom:24,padding:0,
        }}>← Back to shopping list</button>

        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:8 }}>
          <p style={{ fontSize:13,letterSpacing:"2px",color:ZEN.muted,textTransform:"uppercase" }}>
            How to make it
          </p>
          <button
            onTouchStart={() => setShowShare(true)}
            onClick={() => setShowShare(true)}
            style={{
              background:"none", border:`1.5px solid ${ZEN.border}`,
              borderRadius:8, padding:"5px 12px",
              fontSize:13, color:ZEN.muted,
              fontFamily:"'DM Sans',sans-serif",
              cursor:"pointer", display:"flex", alignItems:"center", gap:5,
              WebkitTapHighlightColor:"transparent", touchAction:"manipulation",
            }}
          >
            ↑ Save / Share
          </button>
        </div>
        <h1 style={{
          fontFamily:"'Lora',serif",fontSize:28,fontWeight:400,
          color:ZEN.text,lineHeight:1.3,marginBottom:6,
        }}>{recipe.name}</h1>

        <div style={{ display:"flex",gap:8,flexWrap:"wrap",marginBottom:28 }}>
          {recipe.tags?.map(tag => (
            <span key={tag} style={{
              fontSize:13,color:ZEN.muted,background:ZEN.surface,
              borderRadius:20,padding:"4px 12px",
            }}>{tag}</span>
          ))}
        </div>

        <div style={{ display:"flex",flexDirection:"column",gap:12 }}>
          {recipe.steps?.map((step, i) => {
            const done = doneSteps.has(i);
            return (
              <div key={i} onClick={() => toggle(i)} style={{
                display:"flex",gap:16,
                background: done ? ZEN.surface : "#fff",
                border:`1.5px solid ${ZEN.border}`,
                borderRadius:14,padding:"18px 18px",
                cursor:"pointer",transition:"all 0.2s",
                opacity: done ? 0.5 : 1,
                animation:`fadeIn 0.3s ease ${i*0.06}s both`,
              }}>
                <div style={{
                  width:30,height:30,borderRadius:"50%",flexShrink:0,
                  background: done ? "#3D6E52" : ZEN.surface,
                  border:`2px solid ${done ? "#3D6E52" : ZEN.border}`,
                  display:"flex",alignItems:"center",justifyContent:"center",
                  fontSize:14,color: done ? "#fff" : ZEN.muted,
                  fontWeight:600,marginTop:2,transition:"all 0.2s",
                }}>{done ? "✓" : i+1}</div>
                <p style={{ fontSize:18,color:ZEN.text,lineHeight:1.7,margin:0 }}>{step}</p>
              </div>
            );
          })}
        </div>
      </div>

      {showShare && (
        <ShareModal
          title={recipe.name}
          text={buildRecipeText(recipe, servings)}
          onClose={() => setShowShare(false)}
        />
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   LOADING SCREEN
══════════════════════════════════════════════════════════ */
function LoadingScreen({ results, error }) {
  const [msgIdx, setMsgIdx] = useState(0);
  const messages = [
    "Spinning up your recipes…",
    "Checking the pantry…",
    "Consulting the chef…",
    "Almost there…",
  ];
  useEffect(() => {
    const id = setInterval(() => setMsgIdx(i => (i+1) % messages.length), 1800);
    return () => clearInterval(id);
  }, []);

  return (
    <div style={{
      minHeight:"100vh", background:ZEN.bg,
      display:"flex", flexDirection:"column",
      alignItems:"center", justifyContent:"center",
      padding:"40px 28px", gap:28,
      fontFamily:"'DM Sans',sans-serif",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Lora:wght@400;600&family=DM+Sans:wght@400;500&display=swap');
        * { box-sizing:border-box; margin:0; padding:0; }
        @keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        @keyframes bounce { from{transform:translateY(0)} to{transform:translateY(-8px)} }
        @keyframes pillPop { from{opacity:0;transform:scale(0.88) translateY(8px)} to{opacity:1;transform:scale(1) translateY(0)} }
      `}</style>

      <div style={{ fontSize:72, animation:"spin 2.4s linear infinite", lineHeight:1 }}>🍽️</div>

      <div style={{ display:"flex", gap:10, flexWrap:"wrap", justifyContent:"center", maxWidth:360 }}>
        {STEPS.map((s, i) => results[s.key] ? (
          <div key={s.key} style={{
            background:"#fff", border:`2px solid ${s.color}44`,
            borderRadius:50, padding:"10px 18px",
            display:"flex", alignItems:"center", gap:8,
            boxShadow:"0 2px 8px rgba(44,40,37,0.07)",
            animation:`pillPop 0.4s ease ${i * 0.1}s both`,
          }}>
            <span style={{fontSize:18}}>{s.emoji}</span>
            <span style={{ fontFamily:"'Lora',serif", fontSize:16, color:ZEN.text }}>{results[s.key]}</span>
          </div>
        ) : null)}
      </div>

      <p style={{ fontSize:18, color:ZEN.muted, textAlign:"center", fontStyle:"italic" }}>
        {messages[msgIdx]}
      </p>

      <div style={{ display:"flex", gap:8 }}>
        {[0,1,2].map(i => (
          <div key={i} style={{
            width:8, height:8, borderRadius:"50%", background:ZEN.faint,
            animation:`bounce ${0.6 + i*0.15}s ease-in-out infinite alternate`,
          }} />
        ))}
      </div>

      {error && (
        <p style={{ color:"#8B4A3A", fontSize:15, textAlign:"center" }}>{error}</p>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   WELCOME SCREEN
══════════════════════════════════════════════════════════ */
function WelcomeScreen({ onStart, onQuickPick }) {
  return (
    <div style={{
      minHeight:"100vh", background:ZEN.bg,
      display:"flex", flexDirection:"column",
      alignItems:"center", justifyContent:"center",
      padding:"40px 28px", gap:0,
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Lora:wght@400;600&family=DM+Sans:wght@400;500&display=swap');
        * { box-sizing:border-box; margin:0; padding:0; }
        @keyframes fadeIn { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
        @keyframes gentleSpin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
      `}</style>

      <div style={{ animation:"gentleSpin 18s linear infinite", fontSize:88, marginBottom:28, lineHeight:1 }}>
        🍽️
      </div>

      <h1 style={{
        fontFamily:"'Lora',serif", fontSize:42, fontWeight:400,
        color:ZEN.text, letterSpacing:2, marginBottom:12, textAlign:"center",
        animation:"fadeIn 0.6s ease",
      }}>
        Dinner Spinner
      </h1>

      <p style={{
        fontSize:17, color:ZEN.muted, fontFamily:"'DM Sans',sans-serif",
        marginBottom:48, textAlign:"center", lineHeight:1.6,
        animation:"fadeIn 0.7s ease",
      }}>
        Spin to discover tonight's meal
      </p>

      <button
        onTouchStart={onStart}
        onClick={onStart}
        style={{
          background:"#8B4A3A", color:"#fff", border:"none",
          borderRadius:50, padding:"20px 64px",
          fontSize:21, fontFamily:"'DM Sans',sans-serif", fontWeight:500,
          cursor:"pointer", letterSpacing:"0.5px",
          boxShadow:"0 6px 32px rgba(139,74,58,0.35)",
          animation:"fadeIn 0.9s ease",
          WebkitTapHighlightColor:"transparent", touchAction:"manipulation",
          marginBottom:16,
        }}
      >
        Let's get cookin' 🔥
      </button>

      <button
        onTouchStart={onQuickPick}
        onClick={onQuickPick}
        style={{
          background:"transparent", color:ZEN.muted,
          border:`1.5px solid ${ZEN.border}`,
          borderRadius:50, padding:"14px 40px",
          fontSize:16, fontFamily:"'DM Sans',sans-serif", fontWeight:400,
          cursor:"pointer",
          animation:"fadeIn 1.1s ease",
          WebkitTapHighlightColor:"transparent", touchAction:"manipulation",
        }}
      >
        🎲 Surprise me
      </button>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   ROOT
══════════════════════════════════════════════════════════ */
export default function App() {
  const [screen, setScreen] = useState("welcome"); // welcome | spin | summary | loading | recipes | shopping | steps
  const [stepIdx, setStepIdx] = useState(0);
  const [results, setResults] = useState({});
  const [recipes, setRecipes] = useState(null);
  const [lastToppings, setLastToppings] = useState("");
  const [lastServings, setLastServings] = useState(2);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [activeRecipe, setActiveRecipe] = useState(null);


  const prefetchRef = useRef(null);
  const prefetchedRecipes = useRef(null);
  const latestResultsRef = useRef({});

  async function triggerPrefetch(res, toppings, diff, servings) {
    prefetchedRecipes.current = null;
    const diffLabel = DIFF.find(d => d.key === diff)?.label || "Medium";
    const prompt = buildPrompt(res, toppings, diffLabel, servings);
    try {
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body:JSON.stringify({ model:"claude-sonnet-4-20250514", max_tokens:2000,
          messages:[{role:"user",content:prompt}] }),
      });
      const data = await r.json();
      const text = data.content?.find(b=>b.type==="text")?.text || "";
      const clean = text.replace(/```json|```/g,"").trim();
      prefetchedRecipes.current = { recipes: JSON.parse(clean), toppings, servings };
    } catch(e) { prefetchedRecipes.current = null; }
  }

  function buildPrompt(res, toppings, diffLabel, servings) {
    const PROTEIN_MAP = "if Poultry: use chicken, duck, or turkey; if Red Meat: use beef or lamb; if Pork: use pork chops, tenderloin, or belly; if Ground Meat & Sausage: use ground beef, ground pork, chorizo, or Italian sausage; if Fish: use salmon, cod, tuna, or halibut; if Shrimp & Shellfish: use shrimp, scallops, mussels, or crab; if Plant-based: use tofu or tempeh";
    const VEGGIE_MAP  = "if Leafy Greens: use spinach, kale, bok choy, or Swiss chard; if Broccoli & Cabbage: use broccoli, cauliflower, cabbage, or Brussels sprouts; if Peppers, Eggplant & Asparagus: use bell peppers, eggplant, or asparagus; if Squash: use zucchini, butternut squash, or acorn squash; if Beans & Corn: use green beans, snap peas, edamame, or corn; if Root Veg: use carrots, sweet potato, parsnips, or beets";
    const CARB_MAP    = "if Rice: use white, brown, jasmine, or basmati rice; if Noodles: use pasta, soba, udon, ramen, or rice noodles; if Bread: use crusty bread, flatbread, tortillas, or pita; if Potatoes: use roasted, mashed, or wedged potatoes or sweet potato; if Grains: use quinoa, farro, couscous, or barley; if Legumes: use lentils, chickpeas, or black beans";
    const CUISINE_MAP = "if East Asian: Japanese, Chinese, or Korean flavors; if Southeast Asian: Thai, Vietnamese, or Filipino flavors; if South Asian: Indian, Sri Lankan, or Pakistani flavors; if Italian & Mediterranean: Italian, Greek, or Spanish flavors; if French & Continental: French, Belgian, or Swiss flavors; if Latin American: Mexican, Peruvian, or Brazilian flavors; if Middle Eastern: Lebanese, Turkish, Persian, or Moroccan flavors; if American: BBQ, Southern, or comfort food";
    return [
      "You are a home cooking assistant. Generate exactly 2 dinner recipes that are as different from each other as possible — different cooking method, different flavor profile, different texture and feel. One might be light and fresh, the other rich and hearty. One might be a stir fry, the other a braise. Push them apart as much as you can while still using the ingredients below.",
      "",
      "Protein: " + res.protein + " (" + PROTEIN_MAP + ")",
      "Veggie: " + res.veggie + " (" + VEGGIE_MAP + ")",
      "Carb: " + res.carb + " (" + CARB_MAP + ")",
      "Cuisine: " + res.style + " (" + CUISINE_MAP + ")",
      "Extra ingredients to try to use (optional, use what makes sense): " + (toppings || "none"),
      "Cooking difficulty: " + diffLabel,
      "Servings: " + servings + " people — scale all ingredient quantities accordingly.",
      "",
      "Rules for descriptions: write them like a friend would text you — super clear, no flowery language. One sentence on what the dish is, one sentence on the main flavors.",
      "",
      "For the shopping list, scale quantities for " + servings + " people. Include everything needed: fresh produce, proteins, pantry staples, condiments, oils, spices, herbs. Write quantities inline (e.g. '500g chicken thighs', '2 cloves garlic', '1 tbsp soy sauce').",
      "",
      "Return ONLY a raw JSON array of exactly 2 objects. Each must have:",
      "- name: string (simple dish name)",
      "- description: string (2 plain sentences)",
      "- tags: array of 3 short strings (e.g. '30 min', 'one pan', 'spicy')",
      "- steps: array of 6-8 plain-English cooking steps",
      "- shoppingList: array of strings with quantities for " + servings + " people",
      "",
      "No markdown, no backticks, raw JSON only.",
    ].join("\n");
  }

  function handleStepDone(value) {
    const key = STEPS[stepIdx].key;
    const next = { ...results, [key]: value };
    setResults(next);
    latestResultsRef.current = next;
    if (stepIdx < STEPS.length - 1) {
      setStepIdx(i => i + 1);
    } else {
      setScreen("summary");
      // Kick off recipe generation early in the background with defaults
      // so it's ready (or nearly ready) by the time user hits Get Recipes
      prefetchRef.current = { results: next, toppings: "", diff: "medium", servings: 2 };
      triggerPrefetch(next, "", "medium", 2);
      // Store results snapshot for handleGenerate to use
      latestResultsRef.current = next;
    }
  }

  async function handleGenerate({ toppings, diff, servings = 2 }, currentResults) {
    const res = currentResults || latestResultsRef.current || results;
    setError(null);
    setLastToppings(toppings);
    setLastServings(servings);
    setLoading(true);
    setScreen("loading");
    const diffLabel = DIFF.find(d => d.key === diff)?.label || "Medium";

    const pf = prefetchedRecipes.current;
    if (pf && pf.toppings === toppings && pf.servings === servings && diff === "medium") {
      setRecipes(pf.recipes);
      setScreen("recipes");
      setLoading(false);
      return;
    }

    try {
      const prompt = buildPrompt(res, toppings, diffLabel, servings);
     const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=" + GEMINI_KEY, {
  method:"POST",
  headers:{"Content-Type":"application/json"},
  body:JSON.stringify({
    contents:[{parts:[{text:prompt}]}],
  }),
});
const data = await response.json();
if (data.error) throw new Error(data.error.message || "API error");
const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
      if (!text) throw new Error("Empty response");
      const clean = text.replace(/```json|```/g,"").trim();
      const parsed = JSON.parse(clean);
      setRecipes(parsed);
      setScreen("recipes");
    } catch(e) {
      setError("Error: " + (e.message || "try again"));
    }
    setLoading(false);
  }

  function restart() {
    setScreen("welcome"); setStepIdx(0);
    setResults({}); setRecipes(null);
    setError(null); setActiveRecipe(null);
  }

  function handleQuickPick() {
    const quickResults = {};
    STEPS.forEach(s => { quickResults[s.key] = pick(s.items); });
    setResults(quickResults);
    latestResultsRef.current = quickResults;
    triggerPrefetch(quickResults, "", "medium", 2);
    setScreen("summary");
  }

  if (screen === "welcome") return (
    <WelcomeScreen onStart={() => setScreen("spin")} onQuickPick={handleQuickPick} />
  );

  if (screen === "spin") return (
    <SpinScreen key={stepIdx} step={STEPS[stepIdx]} stepIdx={stepIdx}
      total={STEPS.length} onDone={handleStepDone} />
  );

  if (screen === "loading") return (
    <LoadingScreen results={results} error={error} />
  );

  if (screen === "summary") return (
    <>
      <SummaryScreen results={results} setResults={setResults}
        onGenerate={handleGenerate} loading={loading} />
      {error && (
        <div style={{
          position:"fixed",bottom:24,left:"50%",transform:"translateX(-50%)",
          background:"#8B4A3A",color:"#fff",padding:"10px 20px",
          borderRadius:8,fontSize:15,fontFamily:"'DM Sans',sans-serif",
        }}>{error}</div>
      )}
    </>
  );

  if (screen === "recipes") return (
    <RecipesScreen
      recipes={recipes}
      onBack={() => setScreen("summary")}
      onRestart={restart}
      onSelect={r => { setActiveRecipe(r); setScreen("shopping"); }}
    />
  );

  if (screen === "shopping") return (
    <ShoppingListScreen
      recipe={activeRecipe}
      onBack={() => setScreen("recipes")}
      onCook={() => setScreen("steps")}
      servings={lastServings}
    />
  );

  if (screen === "steps") return (
    <RecipeStepsScreen
      recipe={activeRecipe}
      onBack={() => setScreen("shopping")}
      servings={lastServings}
    />
  );
}
