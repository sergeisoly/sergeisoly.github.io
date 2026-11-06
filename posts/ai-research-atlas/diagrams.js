/* Hand-drawn concept diagrams (inline SVG, theme-aware via CSS variables). */
(function () {
  "use strict";
  const W = 460, H = 210;
  let uid = 0;
  // Blog diagram style: tinted fills, thin blue-grey connectors, ink text, muted notes.
  const wrap = (body, h = H) => {
    const id = "ah" + ++uid;
    return `<svg viewBox="0 0 ${W} ${h}" xmlns="http://www.w3.org/2000/svg" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif" font-size="11">
<defs><marker id="${id}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6.5" markerHeight="6.5" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" style="fill:var(--line)"/></marker></defs>${body.replace(/url\(#ah\)/g, `url(#${id})`)}</svg>`;
  };
  const TONE = { "var(--rl)": "rl", "var(--safety)": "safety", "var(--lm)": "lm", "var(--gov)": "gov" };
  const box = (x, y, w, h, text, c = "", sub = "") => {
    const t = TONE[c] || "grey";
    return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6" style="fill:var(--${t}-fill);stroke:var(--${t}-edge)" stroke-width="1"/>
<text x="${x + w / 2}" y="${y + h / 2 + (sub ? -2 : 4)}" text-anchor="middle" style="fill:var(--ink)" font-size="12" font-weight="500">${text}</text>${sub ? `<text x="${x + w / 2}" y="${y + h / 2 + 12}" text-anchor="middle" style="fill:var(--muted)" font-size="10">${sub}</text>` : ""}`;
  };
  const arrow = (x1, y1, x2, y2, label = "", dy = -5, dashed = false) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" style="stroke:var(--line)" stroke-width="1.4" marker-end="url(#ah)" ${dashed ? 'stroke-dasharray="4 3"' : ""}/>${label ? `<text x="${(x1 + x2) / 2}" y="${(y1 + y2) / 2 + dy}" text-anchor="middle" style="fill:var(--muted)" font-size="10">${label}</text>` : ""}`;
  const curve = (d, label = "", lx = 0, ly = 0) => `<path d="${d}" fill="none" style="stroke:var(--line)" stroke-width="1.4" marker-end="url(#ah)"/>${label ? `<text x="${lx}" y="${ly}" text-anchor="middle" style="fill:var(--muted)" font-size="10">${label}</text>` : ""}`;
  const t = (x, y, s, o = "") => {
    const extraStyle = (o.match(/style="([^"]*)"/) || [])[1] || "";
    return `<text x="${x}" y="${y}" ${o.replace(/style="[^"]*"/, "")} style="fill:var(--ink-2);${extraStyle}">${s}</text>`;
  };

  const D = {
    rlLoop: {
      caption: "The agent acts and observes a new state and reward. The formula is TD(0) prediction for a fixed policy: V is state value, α the learning rate and γ the discount factor. It is not the Q-learning action-value update.",
      svg: wrap(`${box(40, 70, 120, 56, "Agent", "var(--rl)", "policy π(a|s)")}${box(300, 70, 120, 56, "Environment", "var(--ink-2)", "dynamics")}
${curve("M160,82 C220,40 240,40 300,82", "action aₜ", 230, 44)}${curve("M300,108 C240,150 220,150 160,108", "state sₜ₊₁, reward rₜ₊₁", 230, 168)}
${t(230, 198, "TD(0): V(s) ← V(s) + α [ r + γ V(s′) − V(s) ]", 'text-anchor="middle" font-size="10.5"')}`),
    },
    qLearning: {
      caption: "Q-learning updates Q(s,a), the estimated value of taking action a in state s. The target is reward r plus the discounted value of the best estimated next action. α is the learning rate and γ the discount factor; s′ is the next state and a′ ranges over its actions. DQN approximates Q with a neural network.",
      svg: wrap(`${box(30, 65, 150, 56, "Choose action", "var(--rl)", "e.g. ε-greedy from Q")}${box(290, 65, 140, 56, "Environment", "var(--ink-2)", "state transition")}
${curve("M180,78 C220,35 250,35 290,78", "action a", 235, 38)}${curve("M290,108 C245,150 220,150 180,108", "next state s′, reward r", 230, 160)}
${t(230, 192, "Q(s,a) ← Q(s,a) + α [ r + γ maxₐ′ Q(s′,a′) − Q(s,a) ]", 'text-anchor="middle" font-size="10.2"')}`),
    },
    rlhf: {
      caption: "InstructGPT-style RLHF: imitate demonstrations, fit a reward model to comparisons, then use PPO with a reference KL penalty. Here π is the policy, πSFT its supervised starting point, rRM the learned reward and β the penalty weight. Earlier preference-learning experiments used different starting-model recipes.",
      svg: wrap(`${box(10, 30, 125, 50, "1 · SFT", "var(--lm)", "imitate human demos")}${box(167, 30, 125, 50, "2 · Reward model", "var(--safety)", "learn from A ≻ B")}${box(324, 30, 125, 50, "3 · RL (PPO)", "var(--rl)", "maximize RM score")}
${arrow(135, 55, 165, 55)}${arrow(292, 55, 322, 55)}
${box(167, 125, 125, 46, "Humans compare", "var(--ink-2)", "pairs of outputs")}${arrow(229, 125, 229, 82, "labels", 4)}
${t(318, 110, "objective:", 'font-size="10"')}${t(318, 126, "r_RM − β·KL(π ‖ π_SFT)", 'font-size="10.5"')}${t(318, 148, "the KL term keeps the policy", 'font-size="10" style="fill:var(--muted)"')}${t(318, 161, "near the SFT model and", 'font-size="10" style="fill:var(--muted)"')}${t(318, 174, "limits reward hacking", 'font-size="10" style="fill:var(--muted)"')}`),
    },
    lmPrefs: {
      caption: "Ziegler et al. 2019 fit a reward model to human comparisons of language-model outputs, then optimize the language model with PPO and a reference KL penalty. The experiments compared pretrained, supervised and RL variants; they did not all start from InstructGPT-style demonstration fine-tuning.",
      svg: wrap(`${box(15, 32, 125, 50, "GPT-2 outputs", "var(--lm)", "sample continuations")}${box(168, 32, 125, 50, "Human comparisons", "var(--safety)", "fit a reward model")}${box(320, 32, 125, 50, "PPO fine-tuning", "var(--rl)", "learned reward + KL")}
${arrow(140, 57, 166, 57)}${arrow(293, 57, 318, 57)}${t(230, 130, "Pretrained LM + learned preferences → a task-adapted policy", 'text-anchor="middle" font-size="10"')}${t(230, 160, "A reference policy discourages drift during optimization.", 'text-anchor="middle" font-size="10"')}`),
    },
    prefs: {
      caption: "Learning a reward from preferences (Christiano et al. 2017): humans compare short clips, a reward model is fit to the comparisons, and RL optimizes that learned reward.",
      svg: wrap(`${box(20, 80, 110, 50, "RL agent", "var(--rl)", "acts in env")}${box(175, 20, 110, 50, "Human", "var(--ink-2)", "clip A or clip B?")}${box(175, 140, 110, 50, "Reward model", "var(--safety)", "r̂(s,a)")}${box(330, 80, 110, 50, "Trajectories", "var(--ink-2)", "pairs of clips")}
${arrow(130, 95, 328, 95, "")}${arrow(385, 80, 287, 45, "show pairs")}${arrow(230, 70, 230, 138, "fit to choices", 0)}${arrow(175, 170, 110, 132, "reward")}`),
    },
    cai: {
      caption: "Constitutional AI: the model critiques and revises its own outputs against written principles (supervised phase), then AI-generated preference labels replace most human harmlessness labels (RLAIF).",
      svg: wrap(`${box(10, 40, 100, 46, "Response", "var(--lm)")}${box(130, 40, 100, 46, "Critique", "var(--safety)", "vs. principle")}${box(250, 40, 100, 46, "Revision", "var(--lm)")}${box(370, 40, 80, 46, "SFT", "var(--rl)")}
${arrow(110, 63, 128, 63)}${arrow(230, 63, 248, 63)}${arrow(350, 63, 368, 63)}
${box(60, 130, 140, 46, "AI judge compares", "var(--safety)", "using the constitution")}${box(250, 130, 140, 46, "RL from AI feedback", "var(--rl)", "preference model")}${arrow(200, 153, 248, 153)}
${t(10, 205, "“Constitution” = short list of natural-language principles", 'font-size="10" style="fill:var(--muted)"')}`),
    },
    attention: {
      caption: "Self-attention mixes value vectors V using similarities between queries Q and keys K. The mask M controls visibility: a causal token can read only itself and earlier positions. dₖ is the key dimension. During training, known sequence positions can be processed in parallel; autoregressive generation remains sequential.",
      svg: wrap(`${["The", "model", "that", "was", "trained", "learns"].map((w, i) => `<rect x="${20 + i * 72}" y="150" width="62" height="28" rx="6" style="fill:var(--surface);stroke:var(--lm)"/><text x="${51 + i * 72}" y="168" text-anchor="middle" style="fill:var(--ink)">${w}</text>`).join("")}
${[[0, 0.15], [1, 0.75], [2, 0.2], [3, 0.3], [4, 0.6]].map(([i, w]) => `<path d="M${51 + i * 72},150 Q${(51 + i * 72 + 411) / 2},${40 + i * 6} 411,150" fill="none" style="stroke:var(--lm)" stroke-width="${1 + w * 5}" opacity="${0.25 + w * 0.7}"/>`).join("")}
${t(230, 25, "softmax(QKᵀ/√dₖ + M)·V", 'text-anchor="middle"')}${t(230, 43, "Illustration: final token “learns” reads its earlier context", 'text-anchor="middle" font-size="10"')}`),
    },
    superposition: {
      caption: "Superposition: a two-dimensional activation can encode more than two sparse features in different directions, illustrated by a pentagon. The representation trades capacity against interference; the directions need not be orthogonal, and individual neurons may respond to several features.",
      svg: wrap(`<line x1="130" y1="190" x2="130" y2="20" style="stroke:var(--line-2)"/><line x1="40" y1="105" x2="205" y2="105" style="stroke:var(--line-2)"/>${t(208, 109, "neuron 1", 'font-size="10"')}${t(136, 202, "neuron 2", 'font-size="10"')}
${[0, 1, 2, 3, 4].map((k) => { const a = -Math.PI / 2 + (k * 2 * Math.PI) / 5; const x = 130 + 75 * Math.cos(a), y = 105 + 75 * Math.sin(a); return `<line x1="130" y1="105" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" style="stroke:var(--safety)" stroke-width="2.4" marker-end="url(#ah)"/><text x="${(130 + 90 * Math.cos(a)).toFixed(1)}" y="${(109 + 90 * Math.sin(a)).toFixed(1)}" text-anchor="middle" style="fill:var(--ink)">f${k + 1}</text>`; }).join("")}
${t(260, 60, "5 features → 2 dimensions")}${t(260, 82, "works when features are sparse", 'style="fill:var(--muted)"')}${t(260, 120, "dense features → model keeps")}${t(260, 136, "only the most important ones", 'style="fill:var(--muted)"')}`),
    },
    pg: {
      caption: "A REINFORCE-style update weights the sampled log-probability gradient by return R minus an action-independent baseline b. θ denotes policy parameters, πθ(a|s) the action distribution and α the learning rate. The bars illustrate the direction of an update, not an exact computed optimizer step.",
      svg: wrap(`${t(75, 22, "π before", 'text-anchor="middle" font-size="10.5"')}${t(225, 22, "advantage R − b", 'text-anchor="middle" font-size="10.5"')}${t(375, 22, "π after", 'text-anchor="middle" font-size="10.5"')}
${arrow(118, 18, 168, 18)}${arrow(282, 18, 332, 18)}
${[0.33, 0.33, 0.34].map((v, i) => `<rect x="${37 + i * 28}" y="${150 - v * 150}" width="22" height="${v * 150}" rx="2" style="fill:var(--rl-fill);stroke:var(--rl-edge)"/><text x="${48 + i * 28}" y="166" text-anchor="middle" style="fill:var(--muted)" font-size="10">a${i + 1}</text>`).join("")}
<line x1="180" x2="272" y1="95" y2="95" style="stroke:var(--line-2)"/>${[3, -2, 1].map((v, i) => `<rect x="${187 + i * 28}" y="${v > 0 ? 95 - v * 15 : 95}" width="22" height="${Math.abs(v) * 15}" rx="2" style="fill:var(--${v > 0 ? "rl" : "safety"}-fill);stroke:var(--${v > 0 ? "rl" : "safety"}-edge)"/><text x="${198 + i * 28}" y="${v > 0 ? 88 - v * 15 : 112 - v * 15}" text-anchor="middle" style="fill:var(--ink-2)" font-size="10">${v > 0 ? "+" + v : "−" + -v}</text>`).join("")}
${[0.47, 0.18, 0.35].map((v, i) => `<rect x="${337 + i * 28}" y="${150 - v * 150}" width="22" height="${v * 150}" rx="2" style="fill:var(--rl-fill);stroke:var(--rl)"/><text x="${348 + i * 28}" y="166" text-anchor="middle" style="fill:var(--muted)" font-size="10">a${i + 1}</text>`).join("")}
${t(230, 194, "θ ← θ + α · ∇θ log πθ(a|s) · (R − b)", 'text-anchor="middle" font-size="11"')}`),
    },
    ppo: {
      caption: "PPO-Clip uses ratio ρ = πnew(a|s)/πold(a|s), advantage A and clip parameter ε. Its objective caps a sample's incentive for a helpful probability change. It does not enforce a hard bound on the probability ratio or KL divergence; implementations may monitor KL and stop early.",
      svg: wrap(`${box(15, 30, 130, 48, "Collect trajectories", "var(--rl)", "under old policy")}${box(165, 30, 130, 48, "Estimate advantage", "var(--lm)", "often with a critic")}${box(315, 30, 130, 48, "Optimize surrogate", "var(--rl)", "several minibatches")}
${arrow(145, 54, 163, 54)}${arrow(295, 54, 313, 54)}
${t(230, 115, "maximize mean[ min(ρA, clip(ρ, 1−ε, 1+ε)A) ]", 'text-anchor="middle" font-size="11"')}
${t(230, 150, "positive A: incentive plateaus above ρ = 1+ε", 'text-anchor="middle" font-size="10"')}${t(230, 170, "negative A: incentive plateaus below ρ = 1−ε", 'text-anchor="middle" font-size="10"')}${t(230, 196, "Clipping limits incentive, not the actual policy change.", 'text-anchor="middle" font-size="10"')}`),
    },
    sae: {
      caption: "A sparse autoencoder represents a dense activation using a larger set of sparsely active features, then reconstructs the activation. These learned features can be easier to interpret than individual neurons, but they are not guaranteed to match the model's underlying units.",
      svg: wrap(`${[0, 1, 2, 3].map((i) => `<circle cx="60" cy="${60 + i * 30}" r="9" style="fill:var(--lm)" opacity="0.8"/>`).join("")}${t(30, 200, "activation (d)", 'font-size="10"')}
${Array.from({ length: 12 }, (_, i) => `<circle cx="230" cy="${22 + i * 15}" r="6" style="fill:${[2, 7].includes(i) ? "var(--safety)" : "var(--line-2)"}"/>`).join("")}${t(190, 206, "sparse features (m ≫ d)", 'font-size="10"')}
${[0, 1, 2, 3].map((i) => `<circle cx="400" cy="${60 + i * 30}" r="9" style="fill:var(--lm)" opacity="0.5"/>`).join("")}${t(372, 200, "reconstruction", 'font-size="10"')}
${arrow(75, 105, 218, 105, "encode + ReLU")}${arrow(242, 105, 386, 105, "decode")}${t(250, 58, "“Golden Gate Bridge”", 'font-size="10" style="fill:var(--safety)"')}${t(250, 133, "“code bug”", 'font-size="10" style="fill:var(--safety)"')}`),
    },
    goodhart: {
      caption: "Specification gaming / Goodhart: optimizing a proxy (the reward you wrote down) tracks the true goal at first, then diverges as the optimizer finds ways to score without doing the task.",
      svg: wrap(`<line x1="40" y1="180" x2="440" y2="180" style="stroke:var(--line-2)"/><line x1="40" y1="180" x2="40" y2="20" style="stroke:var(--line-2)"/>
<path d="M40,170 C150,120 260,60 430,25" fill="none" style="stroke:var(--rl)" stroke-width="2.5"/><path d="M40,172 C140,125 210,85 260,82 C320,80 370,120 430,165" fill="none" style="stroke:var(--safety)" stroke-width="2.5"/>
${t(330, 40, "proxy reward ↑", 'style="fill:var(--rl)" font-weight="600"')}${t(330, 150, "true goal ↓", 'style="fill:var(--safety)" font-weight="600"')}${t(240, 198, "optimization pressure →", 'text-anchor="middle" font-size="10"')}
<line x1="262" y1="30" x2="262" y2="178" style="stroke:var(--muted)" stroke-dasharray="3 3"/>${t(266, 70, "divergence", 'font-size="10" style="fill:var(--muted)"')}`),
    },
    control: {
      caption: "AI control (Greenblatt et al.) assumes that the powerful model U may be scheming. A weaker trusted model T rates how suspicious each output looks. A limited human-audit budget goes to the most suspicious outputs; some other outputs are replaced by T.",
      svg: wrap(`${box(4, 75, 136, 50, "Untrusted U", "var(--safety)", "strong, maybe adversarial")}${box(178, 75, 122, 50, "Trusted monitor T", "var(--rl)", "weak but honest")}${box(330, 15, 120, 44, "Human audit", "var(--ink-2)", "~2% budget")}${box(330, 80, 120, 44, "Defer to T", "var(--rl)", "rewrite output")}${box(330, 145, 120, 44, "Accept", "var(--ink-2)")}
${arrow(140, 100, 176, 100, "output")}${arrow(300, 88, 328, 40)}${arrow(300, 100, 328, 102)}${arrow(300, 112, 328, 165)}${t(318, 66, "very suspicious", 'text-anchor="end" font-size="10" style="fill:var(--muted)"')}${t(316, 140, "normal", 'text-anchor="end" font-size="10" style="fill:var(--muted)"')}`),
    },
    debate: {
      caption: "In the proposed debate setup, two copies of a model argue opposite sides. The aim is to give a human judge a specific disputed step to check, even when they cannot verify the full answer.",
      svg: wrap(`${box(20, 30, 120, 50, "Debater A", "var(--rl)", "claims: yes")}${box(320, 30, 120, 50, "Debater B", "var(--safety)", "claims: no")}${box(170, 140, 120, 50, "Human judge", "var(--ink-2)", "weaker than debaters")}
${curve("M140,48 C200,20 260,20 320,48", "argue, point to flaws", 230, 22)}${curve("M320,64 C260,92 200,92 140,64", "", 0, 0)}${arrow(80, 82, 190, 138, "")}${arrow(380, 82, 270, 138, "")}
${t(230, 120, "hope: lying is harder than refuting a lie", 'text-anchor="middle" font-size="10" style="fill:var(--muted)"')}`),
    },
    w2s: {
      caption: "Weak-to-strong generalization trains a strong student on weak-supervisor labels. Performance gap recovered is (student − weak)/(strong ground-truth-trained baseline − weak): 0 matches the weak supervisor and 1 matches that comparison baseline. Values can be outside 0–1; the bars are illustrative.",
      svg: wrap(`<line x1="60" y1="185" x2="60" y2="20" style="stroke:var(--line-2)"/>${t(14, 30, "acc", 'font-size="10"')}
<rect x="110" y="120" width="60" height="65" rx="4" style="fill:var(--line-2)"/><rect x="200" y="75" width="60" height="110" rx="4" style="fill:var(--rl)"/><rect x="290" y="40" width="60" height="145" rx="4" style="fill:var(--lm)"/>
${t(140, 200, "weak teacher", 'text-anchor="middle" font-size="10"')}${t(230, 200, "strong ← weak labels", 'text-anchor="middle" font-size="10"')}${t(320, 200, "strong ceiling", 'text-anchor="middle" font-size="10"')}
<line x1="360" y1="120" x2="360" y2="40" style="stroke:var(--ink-2)"/><line x1="356" y1="75" x2="364" y2="75" style="stroke:var(--ink-2)"/>${t(368, 82, "PGR = gap", 'font-size="10"')}${t(368, 96, "recovered", 'font-size="10"')}`),
    },
    scaling: {
      caption: "Scaling-law studies fit test loss as a power-law function of compute, data or parameter count: a straight line on log–log axes. Chinchilla studied how to divide a training budget between model size and data. Its compute-optimal allocation scales both together as the budget grows.",
      svg: wrap(`<line x1="50" y1="180" x2="440" y2="180" style="stroke:var(--line-2)"/><line x1="50" y1="180" x2="50" y2="20" style="stroke:var(--line-2)"/>
<line x1="60" y1="35" x2="430" y2="165" style="stroke:var(--lm)" stroke-width="2.5"/>${[0, 1, 2, 3, 4, 5, 6].map((i) => `<circle cx="${80 + i * 55}" cy="${42 + i * 19.3 + (i % 2 ? 4 : -4)}" r="4" style="fill:var(--lm)"/>`).join("")}
${t(245, 200, "log compute", 'text-anchor="middle" font-size="10"')}${t(12, 100, "log loss", 'font-size="10" transform="rotate(-90 22 100)"')}${t(250, 60, "L(C) ≈ (C₀/C)^α")}${t(250, 78, "predictable loss ≠ predictable abilities", 'font-size="10" style="fill:var(--muted)"')}`),
    },
    mesa: {
      caption: "Mesa-optimization: the base optimizer (SGD) selects a model for a base objective; if the model is itself an optimizer, its internal mesa-objective may differ. Matching on the training distribution does not settle which goal it learned.",
      svg: wrap(`${box(20, 75, 120, 54, "Base optimizer", "var(--ink-2)", "SGD")}<rect x="190" y="35" width="250" height="140" rx="12" style="fill:none;stroke:var(--lm)" stroke-dasharray="5 4"/>${t(200, 52, "learned model", 'font-size="10" style="fill:var(--muted)"')}
${box(215, 75, 120, 54, "Mesa-optimizer", "var(--safety)", "plans, searches")}${arrow(140, 102, 213, 102, "selects for")}${t(345, 92, "mesa-objective", 'font-size="10"')}${t(345, 106, "≟ base objective", 'font-size="10"')}
${t(20, 160, "outer alignment: base objective = what we want", 'font-size="10"')}${t(20, 176, "inner alignment: mesa-objective = base objective", 'font-size="10"')}`),
    },
    react: {
      caption: "The agent loop (ReAct style): the language model alternates reasoning and tool calls; observations from tools are appended to its context until it decides the task is done.",
      svg: wrap(`${box(170, 20, 120, 50, "LLM", "var(--lm)", "context window")}${box(20, 135, 120, 50, "Thought", "var(--ink-2)", "plan next step")}${box(170, 135, 120, 50, "Action", "var(--rl)", "tool call")}${box(320, 135, 120, 50, "Observation", "var(--ink-2)", "tool result")}
${arrow(200, 70, 100, 133)}${arrow(140, 160, 168, 160)}${arrow(290, 160, 318, 160)}${arrow(380, 133, 270, 72, "append to context", -2)}`),
    },
    sleeper: {
      caption: "Sleeper agents: a model trained with a backdoor (e.g. writes vulnerable code when the prompt says 2024) kept the behavior through standard safety training; adversarial training could even teach it to hide the trigger better.",
      svg: wrap(`${box(20, 30, 130, 50, "Backdoored model", "var(--safety)")}${box(170, 30, 130, 50, "Safety training", "var(--rl)", "SFT · RLHF · adv.")}${box(320, 30, 130, 50, "Looks safe?", "var(--ink-2)")}${arrow(150, 55, 168, 55)}${arrow(300, 55, 318, 55)}
${box(60, 130, 150, 50, "“Year: 2023”", "var(--ink-2)", "→ secure code")}${box(250, 130, 150, 50, "“Year: 2024”", "var(--safety)", "→ inserts vulnerability")}${arrow(385, 82, 135, 128, "", 0, true)}${arrow(385, 82, 325, 128, "", 0, true)}`),
    },
    reasoningRl: {
      caption: "A general picture of reasoning RL: generate a solution, obtain task feedback, and update the policy to favor better solutions. This does not specify an optimizer or verifier. The o1 announcement reports RL-trained reasoning but does not disclose a GRPO or rule-based-reward recipe.",
      svg: wrap(`${box(15, 35, 120, 52, "Policy", "var(--lm)", "given a problem")}${box(170, 35, 120, 52, "Reasoning + answer", "var(--rl)", "sample a solution")}${box(325, 35, 120, 52, "Task feedback", "var(--ink-2)", "recipe-dependent")}
${arrow(135, 61, 168, 61)}${arrow(290, 61, 323, 61)}${curve("M385,89 C385,160 75,160 75,89", "RL update from feedback", 230, 167)}${t(230, 199, "More inference computation is a separate evaluation choice.", 'text-anchor="middle" font-size="10"')}`),
    },
    ppoRlvr: {
      caption: "Tulu 3's RLVR recipe uses automatic verification for rewards and PPO for policy updates. A learned value model supplies advantage estimates; a reference policy supplies the KL penalty. Verifiable rewards do not imply GRPO, and a checker only verifies its implemented criteria.",
      svg: wrap(`${box(15, 30, 125, 50, "Generate answers", "var(--lm)", "current policy")}${box(168, 30, 125, 50, "Programmatic check", "var(--rl)", "answer / constraint")}${box(320, 30, 125, 50, "PPO update", "var(--rl)", "clipped objective")}
${arrow(140, 55, 166, 55)}${arrow(293, 55, 318, 55, "reward", -6)}${box(170, 130, 125, 45, "Value model", "var(--lm)", "estimate advantage")}${arrow(295, 146, 365, 82)}${t(20, 199, "Reference KL discourages drift; checks can still be exploited.", 'font-size="10"')}`),
    },
    grpo: {
      caption: "Original outcome-supervised GRPO samples G answers per prompt. With rewards r₁…rG, advantage Aᵢ = (rᵢ − mean(r))/std(r). It uses a clipped policy ratio and a reference KL term without a learned critic. Equal rewards give no reward-ranking signal and require handling zero variance.",
      svg: wrap(`${box(15, 28, 140, 50, "Sample G answers", "var(--lm)", "same prompt")}${box(185, 28, 110, 50, "Score answers", "var(--rl)", "task reward")}${box(325, 28, 120, 50, "Policy update", "var(--rl)", "clip ratio + KL")}
${arrow(155, 53, 183, 53)}${arrow(295, 53, 323, 53)}${t(230, 114, "Aᵢ = (rᵢ − mean(r)) / std(r)", 'text-anchor="middle" font-size="12"')}${t(230, 145, "Using population std: [1, 0, 0, 1] → [1, −1, −1, 1]", 'text-anchor="middle" font-size="10"')}${t(230, 182, "Group baseline replaces a learned value model.", 'text-anchor="middle" font-size="10"')}`),
    },
    toolformer: {
      caption: "Toolformer's training procedure inserts candidate API calls into text, executes them, and keeps calls whose results reduce the prediction loss on later tokens. The model is fine-tuned on those filtered examples. This is self-supervised data construction, not the prompted multi-step ReAct loop.",
      svg: wrap(`${box(12, 32, 130, 50, "Propose API call", "var(--lm)", "inside training text")}${box(166, 32, 130, 50, "Execute + compare", "var(--rl)", "loss on later tokens")}${box(320, 32, 128, 50, "Keep useful calls", "var(--lm)", "filtered examples")}
${arrow(142, 57, 164, 57)}${arrow(296, 57, 318, 57)}${box(160, 140, 140, 48, "Fine-tune model", "var(--lm)", "predict call-augmented text")}${curve("M385,84 C385,140 330,164 302,164")}`),
    },
    dpo: {
      caption: "DPO trains policy πθ directly from preference pairs relative to a frozen reference πref. x is the prompt, yw the preferred answer, yl the rejected answer, σ the logistic function and β a regularization parameter. It optimizes a preference loss without a separate reward-model training stage or an online RL sampling loop.",
      svg: wrap(`${box(20, 30, 130, 50, "Preference pair", "var(--ink-2)", "y_w ≻ y_l")}${box(250, 30, 190, 50, "Policy π_θ", "var(--rl)", "vs. frozen π_ref")}${arrow(150, 55, 248, 55)}
${t(230, 115, "Δ = log[πθ(yw|x)/πref(yw|x)] − log[πθ(yl|x)/πref(yl|x)]", 'text-anchor="middle" font-size="10"')}
${t(230, 144, "loss = −log σ(βΔ)", 'text-anchor="middle" font-size="12"')}${t(230, 176, "yw: preferred answer · yl: rejected answer · x: prompt", 'text-anchor="middle" font-size="10"')}${t(230, 199, "β sets the scale; πref stays frozen.", 'text-anchor="middle" font-size="10"')}`),
    },
    ida: {
      caption: "A human breaks a hard question into smaller questions that copies of the current model can answer. This is amplification. A new model learns to imitate their combined answer through distillation, and the cycle repeats.",
      svg: wrap(`${box(180, 15, 100, 40, "Hard question", "var(--ink-2)")}${[0, 1, 2].map((i) => `${box(60 + i * 120, 85, 100, 40, "sub-question", "var(--lm)", "model copy")}${arrow(230, 55, 110 + i * 120, 83)}`).join("")}
${box(20, 160, 180, 40, "Amplify: H + many models", "var(--rl)")}${box(260, 160, 180, 40, "Distill → faster model", "var(--safety)")}${arrow(200, 180, 258, 180)}${curve("M440,168 C462,120 462,36 282,30", "repeat", 428, 150)}`),
    },
    alphago: {
      caption: "AlphaGo / AlphaZero: a policy network proposes moves, a value network evaluates positions, and Monte Carlo tree search combines them; self-play generates the training data.",
      svg: wrap(`<circle cx="120" cy="30" r="10" style="fill:var(--rl)"/>${[60, 120, 180].map((x) => `<line x1="120" y1="40" x2="${x}" y2="90" style="stroke:var(--line-2)" stroke-width="1.5"/><circle cx="${x}" cy="98" r="8" style="fill:var(--rl)" opacity="0.7"/>`).join("")}${[40, 80, 160, 200].map((x, i) => `<line x1="${i < 2 ? 60 : 180}" y1="106" x2="${x}" y2="150" style="stroke:var(--line-2)"/><circle cx="${x}" cy="156" r="6" style="fill:var(--rl)" opacity="0.45"/>`).join("")}
${t(70, 190, "tree search (MCTS)", 'font-size="10"')}${box(270, 30, 170, 44, "Policy net p(a|s)", "var(--lm)", "which moves to try")}${box(270, 90, 170, 44, "Value net v(s)", "var(--lm)", "who is winning")}${box(270, 150, 170, 44, "Self-play", "var(--ink-2)", "new training games")}`),
    },
    evals: {
      caption: "Capability evaluations ask what a model can do when researchers try to elicit its best performance. Propensity evaluations ask how it tends to behave. A score on one does not establish the other, or predict behavior under new conditions.",
      svg: wrap(`${box(20, 30, 190, 60, "Capability eval", "var(--lm)", "can it? (best elicitation)")}${box(250, 30, 190, 60, "Alignment / propensity eval", "var(--safety)", "would it? (default behavior)")}
${box(130, 130, 200, 56, "Threats to validity", "var(--ink-2)", "sandbagging · eval awareness · leakage")}${arrow(115, 92, 190, 128)}${arrow(345, 92, 270, 128)}`),
    },
    persona: {
      caption: "A common picture of LLM training: pretraining learns a wide repertoire of characters and styles; post-training selects and refines one assistant persona. What persists or changes across later RL is an open research question.",
      svg: wrap(`<ellipse cx="120" cy="105" rx="100" ry="70" style="fill:var(--surface);stroke:var(--lm)" stroke-width="1.6"/>${t(70, 50, "pretraining repertoire", 'font-size="10"')}${[[80, 90], [120, 130], [150, 80], [100, 150], [60, 120], [170, 115]].map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="7" style="fill:${i === 2 ? "var(--safety)" : "var(--line-2)"}"/>`).join("")}
${arrow(222, 100, 300, 100, "post-training selects", -8)}${box(305, 75, 140, 54, "Assistant persona", "var(--safety)", "traits · values · style")}${t(305, 160, "later RL may shift it", 'font-size="10" style="fill:var(--muted)"')}`),
    },
  };

  const BY_ID = {
    "rl-1988-td-learning": "rlLoop", "rl-1992-q-learning": "qLearning", "rl-2013-dqn": "qLearning",
    "rl-2016-alphago": "alphago", "rl-2017-alphazero": "alphago",
    "rl-2022-react": "react", "rl-2023-toolformer": "toolformer", "rl-2023-dpo": "dpo",
    "rl-2024-o1": "reasoningRl", "rl-2025-deepseek-r1": "grpo",
    "safety-2017-deep-rl-human-prefs": "prefs", "safety-2022-instructgpt": "rlhf",
    "safety-2022-constitutional-ai": "cai", "safety-2018-debate": "debate", "safety-2018-ida": "ida",
    "safety-2019-mesa-optimization": "mesa", "safety-2023-ai-control": "control",
    "safety-2023-weak-to-strong": "w2s", "safety-2024-sleeper-agents": "sleeper",
    "safety-2022-toy-models-superposition": "superposition", "safety-2023-towards-monosemanticity": "sae",
    "safety-2016-concrete-problems": "goodhart",
    "lm-2017-transformer": "attention", "lm-2020-scaling-laws": "scaling", "lm-2022-chinchilla": "scaling",
    "rl-1992-reinforce": "pg", "rl-1999-policy-gradient-theorem": "pg", "rl-2017-ppo": "ppo",
    "lm-2022-chatgpt": "rlhf", "rl-2019-lm-human-prefs": "lmPrefs", "safety-2020-summarize-human-feedback": "rlhf",
    "rl-2024-grpo": "grpo", "rl-2024-rlvr": "ppoRlvr", "rl-2025-imo-gold": "reasoningRl",
    "rl-2023-agent-benchmarks": "react", "rl-2024-computer-use": "react", "rl-2024-swe-agent": "react", "rl-2025-claude-code": "react", "rl-2025-operator-deep-research": "react",
    "safety-2016-coastrunners": "goodhart", "safety-2019-reward-tampering": "goodhart", "safety-2020-specification-gaming": "goodhart", "safety-2022-sycophancy": "goodhart",
    "rl-2025-coding-reward-hacking": "goodhart", "rl-2026-metr-frontier-cheating": "goodhart", "safety-2025-cot-monitoring-reward-hacking": "goodhart", "safety-2025-natural-emergent-misalignment": "goodhart",
    "safety-2024-scaling-monosemanticity": "sae",
    "safety-2023-arc-evals-gpt4": "evals", "safety-2024-in-context-scheming": "evals", "safety-2025-metr-time-horizons": "evals", "rl-2025-metr-time-horizon": "evals",
    "gov-2023-metr": "evals", "gov-2023-uk-aisi": "evals", "gov-2023-apollo-founded": "evals",
    "safety-2025-emergent-misalignment": "persona", "safety-2025-persona-vectors": "persona", "safety-2026-persona-selection-model": "persona",
  };
  window.DIAGRAMS = {
    all: D,
    forEvent(e) {
      const key = e.diagram || BY_ID[e.id];
      return key && D[key] ? D[key] : null;
    },
  };
})();
