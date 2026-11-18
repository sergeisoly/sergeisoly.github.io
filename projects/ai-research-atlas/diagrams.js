/* Hand-drawn concept diagrams (inline SVG, theme-aware via CSS variables). */
(function () {
  "use strict";
  const W = 460, H = 210;
  let uid = 0;
  const wrap = (title, description, body, h = H) => {
    const id = "atlas-diagram-" + ++uid;
    return `<svg viewBox="0 0 ${W} ${h}" xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="${id}-title" aria-describedby="${id}-desc" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif" font-size="12">
<title id="${id}-title">${title}</title><desc id="${id}-desc">${description}</desc>
<defs><marker id="${id}-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6.5" markerHeight="6.5" orient="auto"><path d="M0,0 L10,5 L0,10 z" style="fill:var(--muted)"/></marker></defs>${body.replace(/url\(#ah\)/g, `url(#${id}-arrow)`)}</svg>`;
  };
  const TONE = { "var(--rl)": "rl", "var(--safety)": "safety", "var(--lm)": "lm", "var(--gov)": "gov" };
  // A TeX formula. atlas.js typesets it with MathJax once that has loaded; until then the plain text shows.
  const attr = (s) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
  const m = (x, y, tex, plain, o = {}) => {
    const anchor = o.anchor || "middle", size = o.size || 11, tone = o.tone || "ink-2";
    return `<g class="tex-slot" data-tex="${attr(tex)}" data-x="${x}" data-y="${y}" data-size="${size}" data-anchor="${anchor}" data-tone="${tone}"${o.max ? ` data-max="${o.max}"` : ""}${o.weight ? ` data-weight="${o.weight}"` : ""}><text x="${x}" y="${y}" text-anchor="${anchor}" font-size="${size}"${o.weight ? ` font-weight="${o.weight}"` : ""} style="fill:var(--${tone})">${plain}</text></g>`;
  };
  // Box labels are plain strings or { tex, plain } formulas.
  const label = (x, y, v, size, tone, extra = "") => typeof v === "object" ? m(x, y, v.tex, v.plain, { size, tone, weight: extra ? 500 : 0 }) : `<text x="${x}" y="${y}" text-anchor="middle" style="fill:var(--${tone})" font-size="${size}"${extra}>${v}</text>`;
  const box = (x, y, w, h, text, c = "", sub = "") => {
    const t = TONE[c] || "grey";
    return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6" style="fill:var(--${t}-fill);stroke:var(--${t}-edge)" stroke-width="1"/>
${label(x + w / 2, y + h / 2 + (sub ? -3 : 4), text, 12, "ink", ' font-weight="600"')}${sub ? label(x + w / 2, y + h / 2 + 13, sub, 11, "muted") : ""}`;
  };
  const arrow = (x1, y1, x2, y2, label = "", dy = -5, dashed = false) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" style="stroke:var(--muted)" stroke-width="1.4" marker-end="url(#ah)" ${dashed ? 'stroke-dasharray="4 3"' : ""}/>${label ? `<text x="${(x1 + x2) / 2}" y="${(y1 + y2) / 2 + dy}" text-anchor="middle" style="fill:var(--muted)" font-size="11">${label}</text>` : ""}`;
  const curve = (d, label = "", lx = 0, ly = 0) => `<path d="${d}" fill="none" style="stroke:var(--muted)" stroke-width="1.4" marker-end="url(#ah)"/>${typeof label === "object" ? m(lx, ly, label.tex, label.plain, { size: 11, tone: "muted" }) : label ? `<text x="${lx}" y="${ly}" text-anchor="middle" style="fill:var(--muted)" font-size="11">${label}</text>` : ""}`;
  const t = (x, y, s, o = "") => {
    const extraStyle = (o.match(/style="([^"]*)"/) || [])[1] || "";
    return `<text x="${x}" y="${y}" ${o.replace(/style="[^"]*"/, "")} style="fill:var(--ink-2);${extraStyle}">${s}</text>`;
  };

  const D = {
    rlLoop: {
      caption: "The agent acts and observes a new state and reward. The formula is TD(0) prediction for a fixed policy: \\(V\\) is state value, \\(\\alpha\\) the learning rate and \\(\\gamma\\) the discount factor. It is not the Q-learning action-value update.",
      svg: wrap("Agent–environment loop and TD(0)", "The agent sends an action and gets a new state and reward. Add the learning rate times the TD error to the current state value. The error is reward plus discounted next-state value minus current state value.", `${box(40, 70, 120, 56, "Agent", "var(--ink-2)", { tex: "\\text{policy}\\  \\pi(a \\mid s)", plain: "policy π(a|s)" })}${box(300, 70, 120, 56, "Environment", "var(--ink-2)", "dynamics")}
${curve("M160,82 C220,40 240,40 300,82", { tex: "\\text{action}\\ a_t", plain: "action aₜ" }, 230, 44)}${curve("M300,108 C240,150 220,150 160,108", { tex: "\\text{state}\\ s_{t+1}\\text{, reward}\\ r_{t+1}", plain: "state sₜ₊₁, reward rₜ₊₁" }, 230, 168)}
${m(230, 198, "\\text{TD(0):}\\quad V(s) \\leftarrow V(s) + \\alpha\\,[\\,r + \\gamma V(s') - V(s)\\,]", "TD(0): V(s) ← V(s) + α [ r + γ V(s′) − V(s) ]", { size: 11.5 })}`),
    },
    qLearning: {
      caption: "Q-learning updates \\(Q(s,a)\\), the estimated value of taking action \\(a\\) in state \\(s\\). The target is reward \\(r\\) plus the discounted value of the best estimated next action. \\(\\alpha\\) is the learning rate and \\(\\gamma\\) the discount factor; \\(s'\\) is the next state and \\(a'\\) ranges over its actions. DQN approximates \\(Q\\) with a neural network.",
      svg: wrap("Q-learning update", "An exploratory policy selects an action and the environment returns a new state and reward. Move the current action value toward the reward plus the discounted maximum action value in the next state.", `${box(30, 65, 150, 56, "Choose action", "var(--ink-2)", { tex: "\\text{e.g.}\\ \\varepsilon\\text{-greedy from}\\  Q", plain: "e.g. ε-greedy from Q" })}${box(290, 65, 140, 56, "Environment", "var(--ink-2)", "state transition")}
${curve("M180,78 C220,35 250,35 290,78", { tex: "\\text{action}\\ a", plain: "action a" }, 235, 38)}${curve("M290,108 C245,150 220,150 180,108", { tex: "\\text{next state}\\ s'\\text{, reward}\\ r", plain: "next state s′, reward r" }, 230, 160)}
${m(230, 194, "Q(s,a) \\leftarrow Q(s,a) + \\alpha\\,[\\,r + \\gamma \\max_{a'} Q(s',a') - Q(s,a)\\,]", "Q(s,a) ← Q(s,a) + α [ r + γ maxₐ′ Q(s′,a′) − Q(s,a) ]", { size: 11.5 })}`),
    },
    rlhf: {
      caption: "InstructGPT-style RLHF starts with supervised fine-tuning (SFT) on demonstrations. Human preferences train a reward model. PPO increases learned reward while a KL penalty discourages the policy from drifting from its supervised starting point. In the objective, \\(\\beta\\) sets the penalty weight.",
      svg: wrap("Reinforcement learning from human feedback", "Supervised fine-tuning initializes the policy. Human comparisons train a reward model. PPO updates the policy using the learned reward minus a penalty for divergence from the supervised model.", `${box(12, 56, 117, 54, "Supervised model", "", "imitate examples")}${box(167, 56, 126, 54, "Reward model", "", "learn to score outputs")}${box(331, 56, 117, 54, "RL with PPO", "", "update the policy")}
${arrow(129, 83, 165, 83)}${arrow(293, 83, 329, 83)}${curve("M71,54 C71,17 389,17 389,54", "initialize policy", 230, 19)}
${box(167, 137, 126, 45, "Human raters", "", "compare outputs")}${arrow(230, 137, 230, 112)}
${m(230, 210, "\\text{Training reward}\\ = r_{\\mathrm{RM}} - \\beta\\,\\mathrm{KL}(\\pi\\,\\|\\,\\pi_{\\mathrm{SFT}})", "Training reward = learned reward − β·KL(policy ‖ supervised model)", { size: 12 })}`, 224),
    },
    lmPrefs: {
      caption: "Ziegler et al. fit a reward model to human comparisons of language-model outputs, then fine-tuned a language model with PPO and a reference-policy penalty. The experiments compared pretrained, supervised and reinforcement-learned variants.",
      svg: wrap("Language-model fine-tuning with learned preferences", "Sample continuations from GPT-2, train a reward model from human comparisons, and fine-tune a language model with PPO using the learned reward and a reference-policy penalty.", `${box(9, 18, 128, 54, "GPT-2 outputs", "", "sample continuations")}${box(166, 18, 128, 54, "Reward model", "", "from human rankings")}${box(323, 18, 128, 54, "PPO fine-tuning", "", "learned reward + KL")}
${arrow(137, 45, 164, 45)}${arrow(294, 45, 321, 45)}`, 90),
    },
    prefs: {
      caption: "Christiano et al. ask people to compare clips from an agent’s trajectories. A reward model learns to assign rewards that explain the comparisons. The agent then updates its policy to maximize that learned reward.",
      svg: wrap("Reward learning from clip comparisons", "The agent generates trajectories. People compare short clips, a reward model learns from their choices, and the learned reward feeds back into the agent.", `${box(15, 36, 115, 47, "RL agent", "", "acts in environment")}${box(172, 36, 115, 47, "Trajectories", "", "pairs of clips")}${box(329, 36, 115, 47, "Human rater", "", "chooses a clip")}
${box(329, 135, 115, 47, "Reward model", "", { tex: "\\hat{r}(s,a)", plain: "r̂(s,a)" })}
${arrow(130, 60, 170, 60)}${arrow(287, 60, 327, 60)}${arrow(386, 83, 386, 133)}${t(377, 111, "fit to choices", 'text-anchor="end" font-size="11"')}
${curve("M329,159 H101 Q72,159 72,130 V85", "learned reward updates policy", 222, 150)}`, 198),
    },
    cai: {
      caption: "In Bai et al.’s Constitutional AI, written principles guide model-generated revisions in the supervised stage and model-generated harmlessness comparisons in the reinforcement learning stage. People still provide the helpfulness comparisons used to train the preference model.",
      svg: wrap("The two stages of Constitutional AI", "Revised responses become supervised training examples. The resulting model generates pairs of responses. An AI judge labels them for harmlessness, a preference model learns from human and AI choices, and reinforcement learning uses its scores.", `${t(10, 21, "Supervised stage", 'font-weight="600"')}
${box(10, 31, 95, 43, "Draft response")}${box(121, 31, 100, 43, "Critique", "", "apply principle")}${box(237, 31, 95, 43, "Revise")}${box(348, 31, 102, 43, "Fine-tune")}
${arrow(105, 52, 119, 52)}${arrow(221, 52, 235, 52)}${arrow(332, 52, 346, 52)}
${t(10, 114, "Reinforcement learning stage", 'font-weight="600"')}
${box(10, 124, 136, 51, "AI judge compares", "", "apply principles")}${box(165, 124, 128, 51, "Preference model", "", "learn to score outputs")}${box(312, 124, 138, 51, "Policy update", "", "use learned scores")}
${arrow(146, 150, 163, 150)}${arrow(293, 150, 310, 150)}
${arrow(229, 195, 229, 177)}${t(229, 208, "Human helpfulness comparisons", 'text-anchor="middle" font-size="11"')}`, 222),
    },
    attention: {
      caption: "Causal self-attention mixes value vectors \\(V\\) using similarities between queries \\(Q\\) and keys \\(K\\). The mask \\(M\\) blocks later positions and \\(d_k\\) is the key dimension. The arrows trace which tokens can contribute to “trained” in this example.",
      svg: wrap("Causal self-attention at one position", "The token “trained” mixes values from itself and the four earlier tokens. The later token “learns” is masked. The formula applies softmax to scaled query–key dot products plus the mask, then multiplies by the values.", `${m(230, 28, "\\mathrm{softmax}(QK^{\\top}/\\sqrt{d_k} + M)\\,V", "softmax(QKᵀ/√dₖ + M)·V", { size: 13 })}
${box(280, 57, 116, 35, "Output for trained", "var(--lm)")}${[0, 1, 2, 3, 4].map((i) => arrow(50 + i * 72, 147, 302 + i * 9, 94)).join("")}
${["The", "model", "that", "was", "trained"].map((word, i) => box(18 + i * 72, 148, 64, 32, word, i === 4 ? "var(--lm)" : "")).join("")}
<rect x="378" y="148" width="64" height="32" rx="6" style="fill:none;stroke:var(--muted)" stroke-dasharray="3 3"/>${t(410, 168, "learns", 'text-anchor="middle" style="fill:var(--muted)"')}${t(410, 198, "masked", 'text-anchor="middle" font-size="11" style="fill:var(--muted)"')}`),
    },
    superposition: {
      caption: "These five directions in a two-dimensional activation space illustrate one geometry for superposition. When few features are active together, the model can represent more features than it has dimensions. Directions share coordinates, so active features can also interfere with one another.",
      svg: wrap("Five sparse features in two dimensions", "Five feature directions form a pentagon around the origin of a two-neuron activation space. Each direction has a different projection onto the same pair of axes.", `<line x1="127" y1="177" x2="127" y2="28" style="stroke:var(--muted)" stroke-dasharray="3 3"/><line x1="40" y1="101" x2="225" y2="101" style="stroke:var(--muted)" stroke-dasharray="3 3"/>${t(155, 28, "Neuron 2", 'font-size="11"')}${t(218, 117, "Neuron 1", 'font-size="11"')}
${[0, 1, 2, 3, 4].map((k) => {
  const angle = -Math.PI * 4 / 9 + k * 2 * Math.PI / 5;
  const x = 127 + 62 * Math.cos(angle), y = 101 + 62 * Math.sin(angle);
  const lx = 127 + 80 * Math.cos(angle), ly = 105 + 80 * Math.sin(angle);
  return `${arrow(127, 101, x.toFixed(1), y.toFixed(1))}${m(lx.toFixed(1), ly.toFixed(1), "f_" + (k + 1), "f" + (k + 1), { size: 12, tone: "ink" })}`;
}).join("")}
${t(313, 77, "5 feature directions", 'font-weight="600"')}${t(313, 98, "2 activation coordinates", 'font-size="11"')}`, 188),
    },
    pg: {
      caption: "A REINFORCE-style update weights the sampled log-probability gradient by return \\(R\\) minus an action-independent baseline \\(b\\). \\(\\theta\\) denotes policy parameters, \\(\\pi_\\theta(a \\mid s)\\) the action distribution and \\(\\alpha\\) the learning rate. The bars illustrate the direction of an update, not an exact computed optimizer step.",
      svg: wrap("Illustrative policy-gradient update", "Three equally likely actions have illustrative advantages of plus three, minus two and plus one. The first becomes more likely, the second less likely and the third changes little. The update adds the learning rate times the log-probability gradient times return minus baseline.", `${m(75, 22, "\\pi\\ \\text{before}", "π before", { size: 10.5 })}${m(225, 22, "\\text{advantage}\\  R - b", "advantage R − b", { size: 10.5 })}${m(375, 22, "\\pi\\ \\text{after}", "π after", { size: 10.5 })}
${arrow(118, 18, 168, 18)}${arrow(282, 18, 332, 18)}
${[0.33, 0.33, 0.34].map((v, i) => `<rect x="${37 + i * 28}" y="${150 - v * 150}" width="22" height="${v * 150}" rx="2" style="fill:var(--grey-fill);stroke:var(--muted)"/>${m(48 + i * 28, 166, "a_" + (i + 1), "a" + (i + 1), { size: 11, tone: "muted" })}`).join("")}
<line x1="180" x2="272" y1="95" y2="95" style="stroke:var(--muted)"/>${[3, -2, 1].map((v, i) => `<rect x="${187 + i * 28}" y="${v > 0 ? 95 - v * 15 : 95}" width="22" height="${Math.abs(v) * 15}" rx="2" style="fill:var(--${v > 0 ? "rl" : "safety"}-fill);stroke:var(--${v > 0 ? "rl" : "safety"})"/><text x="${198 + i * 28}" y="${v > 0 ? 88 - v * 15 : 112 - v * 15}" text-anchor="middle" style="fill:var(--ink-2)" font-size="11">${v > 0 ? "+" + v : "−" + -v}</text>`).join("")}
${[0.47, 0.18, 0.35].map((v, i) => `<rect x="${337 + i * 28}" y="${150 - v * 150}" width="22" height="${v * 150}" rx="2" style="fill:var(--grey-fill);stroke:var(--ink-2)"/>${m(348 + i * 28, 166, "a_" + (i + 1), "a" + (i + 1), { size: 11, tone: "muted" })}`).join("")}
${m(230, 196, "\\theta \\leftarrow \\theta + \\alpha\\, \\nabla_\\theta \\log \\pi_\\theta(a \\mid s)\\,(R - b)", "θ ← θ + α · ∇θ log πθ(a|s) · (R − b)", { size: 12 })}`),
    },
    ppo: {
      caption: "PPO-Clip uses ratio \\(\\rho = \\pi_{\\mathrm{new}}(a \\mid s)/\\pi_{\\mathrm{old}}(a \\mid s)\\), advantage \\(A\\) and clip parameter \\(\\varepsilon\\). Its objective caps a sample's incentive for a helpful probability change. It does not enforce a hard bound on the probability ratio or KL divergence; implementations may monitor KL and stop early.",
      svg: wrap("Clipped PPO training objective", "Collect trajectories under the old policy and estimate advantages before optimization. Average the smaller of the ratio-weighted advantage and the advantage weighted by the clipped ratio. For positive advantages the objective flattens above the upper clip range, and for negative advantages it flattens below the lower range.", `${box(15, 30, 130, 48, "Collect trajectories", "var(--ink-2)", "under old policy")}${box(165, 30, 130, 48, "Estimate advantage", "var(--ink-2)", "often with a critic")}${box(315, 30, 130, 48, "Optimize surrogate", "var(--ink-2)", "several minibatches")}
${arrow(145, 54, 163, 54)}${arrow(295, 54, 313, 54)}
${m(230, 117, "\\text{maximize}\\ \\ \\hat{\\mathbb{E}}\\big[\\min\\big(\\rho A,\\ \\mathrm{clip}(\\rho,\\, 1-\\varepsilon,\\, 1+\\varepsilon)\\,A\\big)\\big]", "maximize mean[ min(ρA, clip(ρ, 1−ε, 1+ε)A) ]", { size: 12 })}
${m(230, 150, "\\text{positive}\\  A\\text{: incentive plateaus above}\\  \\rho = 1+\\varepsilon", "positive A: incentive plateaus above ρ = 1+ε", { size: 10.5 })}${m(230, 170, "\\text{negative}\\  A\\text{: incentive plateaus below}\\  \\rho = 1-\\varepsilon", "negative A: incentive plateaus below ρ = 1−ε", { size: 10.5 })}${t(230, 196, "Clipping limits incentive, not the actual policy change.", 'text-anchor="middle" font-size="11"')}`),
    },
    sae: {
      caption: "A sparse autoencoder encodes a dense activation into a larger feature vector in which few coordinates are active, then decodes it to reconstruct the activation. Learned features can be easier to interpret than individual neurons. Their relationship to a model’s underlying computations requires separate evidence.",
      svg: wrap("Encoding and decoding with a sparse autoencoder", "A four-dimensional activation becomes a twelve-dimensional feature vector with two active coordinates in this example. A decoder maps the sparse vector back to a four-dimensional reconstruction.", `${[0, 1, 2, 3].map((i) => `<circle cx="68" cy="${62 + i * 24}" r="7" style="fill:var(--ink-2)"/><circle cx="392" cy="${62 + i * 24}" r="7" style="fill:var(--ink-2)"/>`).join("")}
${Array.from({ length: 12 }, (_, i) => {
  const active = [2, 7].includes(i);
  return `<circle cx="${215 + (i % 2) * 30}" cy="${31 + Math.floor(i / 2) * 25}" r="6" style="stroke:var(--lm);fill:${active ? "var(--lm)" : "none"}"/>`;
}).join("")}
${arrow(82, 97, 195, 97, "encode", -10)}${arrow(265, 97, 378, 97, "decode", -10)}
${t(68, 181, "Activation", 'text-anchor="middle" font-weight="600"')}${t(230, 181, "Sparse features", 'text-anchor="middle" font-weight="600"')}${t(392, 181, "Reconstruction", 'text-anchor="middle" font-weight="600"')}${t(230, 199, "2 of 12 active", 'text-anchor="middle" font-size="11" style="fill:var(--muted)"')}`),
    },
    goodhart: {
      caption: "This schematic shows how stronger optimization of a proxy can degrade performance on the intended goal. In specification gaming, a system scores well according to the written objective by exploiting ways it differs from the intended task.",
      svg: wrap("How proxy reward can diverge from the goal", "A schematic shows proxy reward and performance on the intended goal initially rising together. With more optimization, proxy reward keeps rising while performance on the intended goal falls.", `${t(54, 19, "Schematic", 'font-size="11" font-weight="600"')}
<path d="M45,28 V180 H444" fill="none" style="stroke:var(--muted)"/>
<path d="M45,169 C117,134 180,99 224,85 S321,49 420,27" fill="none" style="stroke:var(--rl)" stroke-width="2.5"/>
<path d="M45,169 C117,134 180,99 224,85 S321,83 420,151" fill="none" style="stroke:var(--safety)" stroke-width="2.5" stroke-dasharray="6 4"/>
${t(340, 63, "Proxy reward", 'style="fill:var(--rl)" font-weight="600"')}${t(306, 148, "Intended goal", 'style="fill:var(--safety)" font-weight="600"')}${t(245, 201, "Optimization pressure →", 'text-anchor="middle" font-size="11"')}${t(23, 103, "Score", 'text-anchor="middle" transform="rotate(-90 23 103)" font-size="11"')}`),
    },
    control: {
      caption: "In Greenblatt et al.’s trusted-monitoring protocol, a weaker trusted model scores outputs from a stronger, potentially adversarial model. Humans audit the top 2% by suspicion in the study. With deferral enabled, the protocol uses a fresh answer from the trusted model for an intermediate range of scores.",
      svg: wrap("Trusted monitoring with deferral", "A trusted model scores outputs from a stronger untrusted model. The highest-scoring cases are audited. For intermediate suspicion the protocol can use an answer generated by the trusted model. The original output is used below the threshold.", `${box(8, 79, 110, 50, "Untrusted model", "var(--safety)", "proposes output")}${box(145, 79, 118, 50, "Trusted monitor", "", "scores suspicion")}
${box(326, 15, 126, 44, "Audit output", "", "highest scores")}${box(326, 82, 126, 44, "Defer", "", "use trusted model")}${box(326, 149, 126, 44, "Keep output", "", "lowest scores")}
${arrow(118, 104, 143, 104)}${arrow(263, 91, 324, 37)}${arrow(263, 104, 324, 104)}${arrow(263, 117, 324, 171)}`),
    },
    debate: {
      caption: "In the proposed debate setup, two copies of a model argue opposite sides. The aim is to give a human judge a specific disputed step to check, even when they cannot verify the full answer.",
      svg: wrap("Debate with a human judge", "Two models argue for opposite answers and can point out flaws in each other's reasoning. A human judge reads both arguments and decides which is better supported.", `${box(20, 30, 120, 50, "Debater A", "var(--ink-2)", "claims: yes")}${box(320, 30, 120, 50, "Debater B", "var(--ink-2)", "claims: no")}${box(170, 140, 120, 50, "Human judge", "var(--ink-2)", "weaker than debaters")}
${curve("M140,48 C200,20 260,20 320,48", "argue, point to flaws", 230, 22)}${curve("M320,64 C260,92 200,92 140,64", "", 0, 0)}${arrow(80, 82, 190, 138, "")}${arrow(380, 82, 270, 138, "")}
${t(230, 205, "hope: lying is harder than refuting a lie", 'text-anchor="middle" font-size="11" style="fill:var(--muted)"')}`),
    },
    w2s: {
      caption: "Weak-to-strong generalization trains a strong student on labels from a weaker supervisor. The performance gap recovered is the gain over the weak supervisor divided by the gap between the two reference models. The ratio can fall below 0 or rise above 1. The accuracies here are illustrative.",
      svg: wrap("Performance gap recovered", "In an illustrative example, the weak supervisor scores 40 percent, the student trained on weak labels scores 70 percent, and the strong model trained on ground-truth labels scores 90 percent. The student recovers 30 of the 50 percentage points, or 60 percent.", `${t(112, 23, "Illustrative accuracy", 'font-weight="600"')}
<line x1="110" y1="34" x2="110" y2="164" style="stroke:var(--muted)"/>
${[["Weak supervisor", 40], ["Strong student", 70], ["Strong reference", 90]].map(([name, score], i) => {
  const y = 45 + i * 43, width = score * 3.2;
  return `${t(104, y + 16, name, 'text-anchor="end" font-size="11"')}<rect x="111" y="${y}" width="${width}" height="22" rx="3" style="fill:var(--${i === 1 ? "lm" : "muted"})" opacity="${i === 1 ? 1 : 0.72}"/>${t(117 + width, y + 16, score + "%", 'font-weight="600"')}`;
}).join("")}
${m(230, 192, "\\text{Gap recovered}\\  = (70 - 40)/(90 - 40) = 60\\%", "Gap recovered = (70 − 40)/(90 − 40) = 60%", { size: 12 })}`),
    },
    scaling: {
      caption: "A pure power law for loss \\(L\\) as a function of compute \\(C\\) appears as a straight line on log–log axes. The slope is the negative exponent. Chinchilla studied how to allocate a training budget between model size and data and found an approximately equal rate of growth for both.",
      svg: wrap("A power law on log–log axes", "The schematic plots log loss against log compute. The line slopes down, with a constant slope equal to minus the power-law exponent.", `${t(57, 20, "Schematic", 'font-size="11" font-weight="600"')}
<path d="M50,30 V175 H440" fill="none" style="stroke:var(--muted)"/>
<line x1="64" y1="44" x2="420" y2="160" style="stroke:var(--lm)" stroke-width="2.5"/>
${t(245, 196, "log compute", 'text-anchor="middle" font-size="11"')}${t(23, 105, "log loss", 'text-anchor="middle" transform="rotate(-90 23 105)" font-size="11"')}${m(230, 63, "L(C) \\propto C^{-\\alpha}", "L(C) ∝ C to the power −α", { anchor: "start", size: 13 })}`),
    },
    mesa: {
      caption: "Mesa-optimization: the base optimizer (SGD) selects a model for a base objective; if the model is itself an optimizer, its internal mesa-objective may differ. Matching on the training distribution does not settle which goal it learned.",
      svg: wrap("Base optimization and mesa-optimization", "A base optimizer selects a model. If that model also searches for solutions, its internal objective can differ from the training objective. Outer alignment concerns the training objective, while inner alignment concerns what the learned optimizer pursues.", `${box(20, 75, 120, 54, "Base optimizer", "var(--ink-2)", "SGD")}<rect x="205" y="35" width="240" height="110" rx="12" style="fill:none;stroke:var(--line)" stroke-dasharray="5 4"/>${t(216, 52, "learned model", 'font-size="11" style="fill:var(--muted)"')}
${box(215, 75, 120, 54, "Mesa-optimizer", "var(--safety)", "plans, searches")}${arrow(140, 102, 213, 102)}${t(171, 97, "selects for", 'text-anchor="middle" font-size="11" style="fill:var(--muted)"')}${t(345, 88, "mesa-objective", 'font-size="11"')}${t(345, 106, "= base objective?", 'font-size="11"')}
${t(20, 172, "outer alignment: base objective = what we want", 'font-size="11"')}${t(20, 188, "inner alignment: mesa-objective = base objective", 'font-size="11"')}`),
    },
    react: {
      caption: "The agent loop (ReAct style): the language model alternates reasoning and tool calls; observations from tools are appended to its context until it decides the task is done.",
      svg: wrap("ReAct agent loop", "A language model reasons about the current context and calls a tool. The tool's result goes back into the model's context before the next step.", `${box(170, 20, 120, 50, "LLM", "var(--ink-2)", "context window")}${box(20, 135, 120, 50, "Thought", "var(--ink-2)", "plan next step")}${box(170, 135, 120, 50, "Action", "var(--ink-2)", "tool call")}${box(320, 135, 120, 50, "Observation", "var(--ink-2)", "tool result")}
${arrow(200, 70, 100, 133)}${arrow(140, 160, 168, 160)}${arrow(290, 160, 318, 160)}${arrow(380, 133, 270, 72)}${t(334, 98, "append to context", 'font-size="11" style="fill:var(--muted)"')}`),
    },
    sleeper: {
      caption: "In the sleeper-agent study, deliberately planted behavior persisted through several forms of safety training. The researchers compared responses on inputs with and without the condition that elicited that behavior.",
      svg: wrap("Testing for persistent backdoor behavior", "After safety training, researchers compare behavior on test inputs with and without a trigger. In the illustrated case, the undesirable behavior persists in the trigger condition.", `${box(12, 24, 132, 50, "Backdoored model", "var(--safety)")}${box(171, 24, 118, 50, "Safety training")}${box(316, 24, 132, 50, "Behavior tests")}${arrow(144, 49, 169, 49)}${arrow(289, 49, 314, 49)}
${box(45, 127, 165, 49, "Trigger absent", "", "ordinary behavior")}${box(250, 127, 165, 49, "Trigger present", "var(--safety)", "undesired behavior")}${arrow(380, 76, 128, 125, "", 0, true)}${arrow(391, 76, 332, 125, "", 0, true)}`, 192),
    },
    reasoningRl: {
      caption: "A reasoning policy samples a solution and gets feedback. The training update makes higher-scoring solutions more likely. The way feedback is produced varies across models.",
      svg: wrap("Reinforcement learning for reasoning", "A policy receives a problem, samples a solution and gets a feedback signal. The learning update uses that feedback to change the policy for later samples.", `${box(15, 21, 120, 52, "Policy", "", "given a problem")}${box(170, 21, 120, 52, "Sample solution", "", "reasoning + answer")}${box(325, 21, 120, 52, "Task feedback", "", "score the solution")}
${arrow(135, 47, 168, 47)}${arrow(290, 47, 323, 47)}${curve("M385,75 C385,146 75,146 75,75", "Update policy from feedback", 230, 144)}`, 162),
    },
    ppoRlvr: {
      caption: "Tulu 3's RLVR recipe uses automatic verification for rewards and PPO for policy updates. A learned value model supplies advantage estimates; a reference policy supplies the KL penalty. Verifiable rewards do not imply GRPO, and a checker only verifies its implemented criteria.",
      svg: wrap("PPO with verifiable rewards", "The current policy generates answers and a program checks them to supply rewards. PPO uses advantages estimated with a value model and a penalty relative to a reference policy.", `${box(6, 30, 120, 50, "Generate answers", "var(--ink-2)", "current policy")}${box(148, 30, 142, 50, "Programmatic check", "var(--ink-2)", "answer / constraint")}${box(336, 30, 118, 50, "PPO update", "var(--ink-2)", "clipped objective")}
${arrow(126, 55, 146, 55)}${arrow(290, 55, 334, 55, "reward", -6)}${box(170, 130, 125, 45, "Value model", "var(--ink-2)", "estimate advantage")}${arrow(295, 146, 378, 82)}${t(20, 199, "Reference KL discourages drift; checks can still be exploited.", 'font-size="11"')}`),
    },
    grpo: {
      caption: "Original outcome-supervised GRPO samples \\(G\\) answers per prompt. With rewards \\(r_1, \\dots, r_G\\), advantage \\(A_i = (r_i - \\mathrm{mean}(r))/\\mathrm{std}(r)\\). It uses a clipped policy ratio and a reference KL term without a learned critic. Equal rewards give no reward-ranking signal and require handling zero variance.",
      svg: wrap("Group relative policy optimization", "Sample multiple answers to one prompt and score them. Center the rewards by their within-group mean and scale by their standard deviation to obtain advantages. A clipped policy update uses these advantages and a reference penalty.", `${box(15, 28, 140, 50, "Sample G answers", "var(--ink-2)", "same prompt")}${box(185, 28, 110, 50, "Score answers", "var(--ink-2)", "task reward")}${box(325, 28, 120, 50, "Policy update", "var(--ink-2)", "clip ratio + KL")}
${arrow(155, 53, 183, 53)}${arrow(295, 53, 323, 53)}${m(230, 113, "A_i = \\dfrac{r_i - \\mathrm{mean}(r)}{\\mathrm{std}(r)}", "Aᵢ = (rᵢ − mean(r)) / std(r)", { size: 12 })}${m(230, 145, "\\text{Using population std:}\\ \\ [1, 0, 0, 1] \\to [1, -1, -1, 1]", "Using population std: [1, 0, 0, 1] → [1, −1, −1, 1]", { size: 10 })}${t(230, 182, "Group baseline replaces a learned value model.", 'text-anchor="middle" font-size="11"')}`),
    },
    toolformer: {
      caption: "Toolformer's training procedure inserts candidate API calls into text, executes them, and keeps calls whose results reduce the prediction loss on later tokens. The model is fine-tuned on those filtered examples. This is self-supervised data construction, not the prompted multi-step ReAct loop.",
      svg: wrap("Toolformer training pipeline", "Candidate calls are proposed inside training text and executed. Only calls that reduce prediction loss on later tokens are kept. Those augmented examples are used for fine-tuning.", `${box(12, 32, 130, 50, "Propose API call", "var(--ink-2)", "inside training text")}${box(166, 32, 130, 50, "Execute + compare", "var(--ink-2)", "loss on later tokens")}${box(320, 32, 128, 50, "Keep useful calls", "var(--ink-2)", "filtered examples")}
${arrow(142, 57, 164, 57)}${arrow(296, 57, 318, 57)}${box(160, 140, 140, 48, "Fine-tune model", "var(--ink-2)", "learn from filtered text")}${curve("M385,84 C385,140 330,164 302,164")}`),
    },
    dpo: {
      caption: "DPO trains policy \\(\\pi_\\theta\\) directly from preference pairs relative to a frozen reference \\(\\pi_{\\mathrm{ref}}\\). \\(x\\) is the prompt, \\(y_w\\) the preferred answer, \\(y_l\\) the rejected answer, \\(\\sigma\\) the logistic function and \\(\\beta\\) a regularization parameter. It optimizes a preference loss without a separate reward-model training stage or an online RL sampling loop.",
      svg: wrap("Direct preference optimization loss", "For the preferred and rejected answers, compute the log ratio of the trained policy's probability to the frozen reference policy's probability. Subtract the rejected answer's log ratio from the preferred answer's. The loss is the negative log sigmoid of this difference multiplied by beta.", `${box(20, 30, 130, 50, "Preference pair", "var(--ink-2)", { tex: "y_w \\succ y_l", plain: "y_w ≻ y_l" })}${box(250, 30, 190, 50, { tex: "\\text{Policy}\\  \\pi_\\theta", plain: "Policy πθ" }, "var(--ink-2)", { tex: "\\text{vs. frozen}\\  \\pi_{\\mathrm{ref}}", plain: "vs. frozen πref" })}${arrow(150, 55, 248, 55)}
${m(230, 121, "\\Delta = \\log\\dfrac{\\pi_\\theta(y_w \\mid x)}{\\pi_{\\mathrm{ref}}(y_w \\mid x)} - \\log\\dfrac{\\pi_\\theta(y_l \\mid x)}{\\pi_{\\mathrm{ref}}(y_l \\mid x)}", "Δ = log[πθ(yw|x)/πref(yw|x)] − log[πθ(yl|x)/πref(yl|x)]", { size: 12 })}
${m(230, 158, "\\text{loss} = -\\log \\sigma(\\beta\\Delta)", "loss = −log σ(βΔ)", { size: 13 })}${m(230, 183, "y_w\\text{: preferred answer}\\ \\ \\cdot\\ \\ y_l\\text{: rejected answer}\\ \\ \\cdot\\ \\ x\\text{: prompt}", "yw: preferred answer · yl: rejected answer · x: prompt", { size: 10.5, tone: "muted" })}${m(230, 203, "\\beta\\ \\text{sets the scale;}\\  \\pi_{\\mathrm{ref}}\\ \\text{stays frozen.}", "β sets the scale; πref stays frozen.", { size: 10.5, tone: "muted" })}`),
    },
    ida: {
      caption: "A human breaks a hard question into smaller questions that copies of the current model can answer. The human combines their answers, producing a stronger supervisor through amplification. Distillation trains a single new model to imitate that supervisor so it can help with the next round.",
      svg: wrap("Iterated distillation and amplification", "A human decomposes a question. Copies of the current model answer the parts, then the human combines their answers. A new model learns to imitate the combined answer and is used in the next iteration.", `${box(159, 12, 142, 44, "Human decomposes", "", "hard question")}
${[0, 1, 2].map((i) => `${box(39 + i * 128, 82, 110, 43, "Model copy " + (i + 1), "", "answers one part")}${arrow(230, 56, 94 + i * 128, 80)}${arrow(94 + i * 128, 125, 168 + i * 20, 153)}`).join("")}
${box(92, 155, 160, 44, "Human combines answers", "", "amplified supervisor")}${box(301, 155, 138, 44, "Distill a new model", "", "imitate supervisor")}${arrow(252, 177, 299, 177)}
${curve("M439,166 C453,147 455,58 303,34", "repeat", 416, 61)}`, 211),
    },
    alphago: {
      caption: "Monte Carlo tree search uses a policy estimate to prioritize moves and a value estimate to evaluate positions. AlphaGo used separate networks and learned from expert games and self-play. AlphaZero predicts policy and value from one network trained through self-play starting from random play.",
      svg: wrap("Policy and value estimates guide game-tree search", "Policy estimates prioritize candidate moves and value estimates score positions. Monte Carlo tree search uses both to choose a move. AlphaGo used separate networks, whereas AlphaZero used two outputs from a shared network.", `${box(26, 38, 135, 48, { tex: "\\text{Policy}\\  p(a \\mid s)", plain: "Policy p(a|s)" }, "", "prioritize moves")}${box(26, 107, 135, 48, { tex: "\\text{Value}\\  v(s)", plain: "Value v(s)" }, "", "evaluate positions")}
${arrow(161, 62, 248, 78)}${arrow(161, 131, 248, 103)}
<rect x="250" y="17" width="186" height="165" rx="6" style="fill:var(--grey-fill);stroke:var(--grey-edge)"/>
<circle cx="343" cy="42" r="7" style="fill:var(--ink-2)"/>${[300, 343, 386].map((x) => `<line x1="343" y1="49" x2="${x}" y2="83" style="stroke:var(--muted)" stroke-width="1.5"/><circle cx="${x}" cy="89" r="6" style="fill:var(--ink-2)"/>`).join("")}${[282, 318, 368, 404].map((x, i) => `<line x1="${i < 2 ? 300 : 386}" y1="95" x2="${x}" y2="127" style="stroke:var(--muted)"/><circle cx="${x}" cy="132" r="5" style="fill:var(--ink-2)"/>`).join("")}
${t(343, 164, "Monte Carlo tree search", 'text-anchor="middle" font-weight="600"')}`, 197),
    },
    evals: {
      caption: "Capability evaluations ask what a model can do when researchers try to elicit its best performance. Propensity evaluations ask how it tends to behave. A score on one does not establish the other, or predict behavior under new conditions.",
      svg: wrap("Capability and propensity evaluations", "Capability evaluations try to elicit what a model can do. Propensity evaluations observe how it tends to behave under the tested conditions. Sandbagging, evaluation awareness or leakage can distort the measurements.", `${box(20, 30, 190, 60, "Capability eval", "var(--ink-2)", "can it? (best elicitation)")}${box(250, 30, 190, 60, "Alignment / propensity eval", "var(--ink-2)", "would it? (default behavior)")}
${box(113, 130, 234, 56, "Threats to validity", "var(--ink-2)", "sandbagging · eval awareness · leakage")}${arrow(115, 92, 190, 128)}${arrow(345, 92, 270, 128)}`),
    },
    persona: {
      caption: "A common picture of LLM training: pretraining learns a wide repertoire of characters and styles; post-training selects and refines one assistant persona. What persists or changes across later RL is an open research question.",
      svg: wrap("A hypothesis for persona selection", "The pretraining repertoire contains many styles or characters. An arrow connects the repertoire to an assistant persona selected and refined in post-training.", `<ellipse cx="108" cy="110" rx="92" ry="68" style="fill:var(--surface);stroke:var(--line)" stroke-width="1.4"/>${t(108, 30, "pretraining repertoire", 'text-anchor="middle" font-size="11"')}${[[70, 95], [108, 135], [138, 85], [90, 152], [52, 124], [158, 120]].map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="7" style="fill:${i === 2 ? "var(--lm)" : "var(--muted)"}"/>`).join("")}
${arrow(204, 104, 320, 104, "post-training selects", -8)}${box(324, 77, 130, 54, "Assistant persona", "var(--lm)", "traits · values · style")}${t(324, 162, "later RL may shift it", 'font-size="11" style="fill:var(--muted)"')}`),
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
    "rl-1992-reinforce": "pg", "rl-2017-ppo": "ppo",
    "lm-2022-chatgpt": "rlhf", "rl-2019-lm-human-prefs": "lmPrefs", "safety-2020-summarize-human-feedback": "rlhf",
    "rl-2024-grpo": "grpo", "rl-2024-rlvr": "ppoRlvr", "rl-2025-imo-gold": "reasoningRl",
    "rl-2023-agent-benchmarks": "react", "rl-2024-computer-use": "react", "rl-2025-claude-code": "react", "rl-2025-operator-deep-research": "react",
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
