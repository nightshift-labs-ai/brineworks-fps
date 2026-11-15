// Rules and numbers of Brineworks, one table per topic. No three.js, no DOM.
export const DT = 1 / 60; // fixed simulation step (s)
export const GRAVITY = 20;

export const SIDE = { ATTACK: 0, DEFEND: 1 }; // side 0 carries the Fuse Core; teams swap after the half
export const TEAMS = [
  { name: 'Rakers', color: 0xdd4a32, css: '#ef5a3e' },
  { name: 'Saltreeves', color: 0x3a86e0, css: '#4d97f0' },
];
export const PLAYER_TEAM = 0, TEAM_SIZE = 5;

// Metres and seconds. Quake-style accel/friction: speed builds up and bleeds off, and spread follows
// speed (weapons.js), so a player who wants to hit has to plan the stop.
export const MOVE = {
  runSpeed: 5.2, walkSpeed: 2.6, crouchSpeed: 1.8,
  accel: 6.2, airAccel: 1.2, friction: 6, stopSpeed: 1.8,
  jumpSpeed: 6.9, stepHeight: 0.45, radius: 0.34,
  standHeight: 1.8, crouchHeight: 1.22, standEye: 1.62, crouchEye: 1.06, crouchRate: 7,
  footstepEvery: 2.2, // metres of running between footstep noises
};

// Hitboxes as fractions of height (head sphere, torso and leg cylinders); the soldier model uses them too.
export const BODY = { headRadius: 0.16, torsoRadius: 0.27, legRadius: 0.22, legTop: 0.47, legMult: 0.75, torsoMult: 1 };

// Spread: cone radius (rad) = base + move x speed fraction + air + bloom, x crouch. Recoil: `climb`
// per shot for `settle` shots, then a quarter of it while the muzzle sways; `recover` (1/s) fades it.
// Intent: a Ballast headshot (34 x 3.8) beats a helm only up close; a Capstan body shot kills through
// a vest, a leg shot does not; the Skiff is cheap and forgiving on the move but weak far off.
export const WEAPONS = {
  rivet: { name: 'Rivet-9', kind: 'pistol', price: 180, mag: 13, reserve: 39, interval: 0.15, damage: 29, headMult: 3.8, armorPen: 0.5, falloff: 0.85, range: 60, reload: 2, speedMult: 1, reward: 250, draw: 0.45,
    spread: { base: 0.006, move: 0.042, air: 0.12, crouch: 0.8, bloom: 0.02 }, recoil: { climb: 0.017, sway: 0.004, settle: 2, recover: 5 } },
  skiff: { name: 'Skiff SMG', kind: 'smg', price: 1150, mag: 28, reserve: 112, interval: 0.072, auto: true, damage: 24, headMult: 3.4, armorPen: 0.6, falloff: 0.76, range: 50, reload: 2.3, speedMult: 0.98, reward: 550, draw: 0.6,
    spread: { base: 0.009, move: 0.021, air: 0.1, crouch: 0.85, bloom: 0.006 }, recoil: { climb: 0.006, sway: 0.008, settle: 5, recover: 7 } },
  ballast: { name: 'Ballast AR', kind: 'rifle', price: 2600, mag: 30, reserve: 90, interval: 0.095, auto: true, damage: 34, headMult: 3.8, armorPen: 0.8, falloff: 0.95, range: 120, reload: 2.4, speedMult: 0.9, reward: 250, draw: 0.8,
    spread: { base: 0.0035, move: 0.072, air: 0.16, crouch: 0.75, bloom: 0.0075 }, recoil: { climb: 0.0105, sway: 0.0075, settle: 7, recover: 6 } },
  bollard: { name: 'Bollard-12', kind: 'shotgun', price: 1000, mag: 6, reserve: 24, interval: 0.9, damage: 16, headMult: 2.2, armorPen: 0.55, falloff: 0.5, range: 40, pellets: 9, reload: 2.8, speedMult: 0.95, reward: 750, draw: 0.7,
    spread: { base: 0.055, move: 0.02, air: 0.06, crouch: 0.95, bloom: 0.01 }, recoil: { climb: 0.05, sway: 0.004, settle: 1, recover: 4 } },
  capstan: { name: 'Capstan LR', kind: 'marksman', price: 4500, mag: 5, reserve: 15, interval: 1.35, damage: 112, headMult: 2.6, armorPen: 0.95, falloff: 0.99, range: 160, reload: 3.3, speedMult: 0.82, reward: 150, draw: 1,
    scope: 0.32, // FOV multiplier while scoped (right mouse); only precise scoped
    spread: { base: 0.0008, unscoped: 0.075, move: 0.12, air: 0.25, crouch: 0.85, bloom: 0.02 }, recoil: { climb: 0.045, sway: 0.005, settle: 1, recover: 4 } },
};
export const WEAPON_ORDER = ['rivet', 'skiff', 'ballast', 'bollard', 'capstan'];
WEAPON_ORDER.forEach((id, index) => {
  const w = WEAPONS[id];
  Object.assign(w, { id, index, slot: w.kind === 'pistol' ? 'secondary' : 'primary', pellets: w.pellets ?? 1, auto: !!w.auto });
});

// The vest guards the torso, the helm the head (armour points shared); the kit halves disarming.
export const GEAR = { vest: { name: 'Hull vest', price: 600 }, helm: { name: 'Hull helm', price: 300 }, kit: { name: 'Spanner kit', price: 330, side: SIDE.DEFEND } };

// Thrown with G (frag) and F (smoke). index 100: the frag's kill-feed id.
export const GRENADES = {
  frag: { name: 'Clatter frag', price: 240, fuse: 1.6, radius: 7, damage: 100, reward: 250, index: 100 },
  smoke: { name: 'Haze canister', price: 280, fuse: 1.7, radius: 4.4, duration: 15 },
};

// The Fuse Core, this game's bomb objective: armed on a site, disarmed by the defenders.
export const OBJECTIVE = {
  plantTime: 3, defuseTime: 7, kitDefuseTime: 3.5, fuse: 38,
  reach: 1.6, // metres from the core to disarm it
  reward: 250, // to whoever arms or disarms it
  plantBonus: 650, // to each attacker who loses a round after arming
  blastRadius: 16, blastDamage: 250,
};

// Objective wins pay more; each loss in a row raises the next loss pay (the loss bonus).
export const ECON = { start: 900, max: 9500, win: 3100, objectiveWin: 3400, lossBase: 1500, lossStep: 450, lossMax: 3300 };

export const ROUND = {
  freeze: 7, // frozen in spawn, buy menu open
  live: 110, // round clock
  buyWindow: 18, // seconds of the live round the buy menu stays open
  over: 5, matchOver: 9,
  winsNeeded: 6, half: 5, // first to 6; sides swap after round 5
};

// How far each noise carries (m); through walls only HEARING.muffle of it.
export const HEARING = { step: 18, land: 12, shot: 50, reload: 8, bounce: 14, work: 22, alarm: 200, muffle: 0.6 };

export const BOT = {
  fov: 2.1, viewRange: 70, reactMin: 0.28, reactMax: 0.5,
  turnRate: 7.5, // rad/s
  aimSettle: 2.6, // aim error shrinks by e^-k per second while tracking
  aimError: 0.11, // initial aim error (rad) on a fresh target
  burst: [3, 6], thinkEvery: 6, // ticks between sight checks (staggered per bot)
  stageWait: 9, // seconds attackers wait at their stage point for the group
};
