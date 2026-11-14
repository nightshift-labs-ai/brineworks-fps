// Every tunable number of Saltline in one place: tick rate, movement, weapons, economy and rounds.
// Simulation modules read these; nothing here touches three.js or the DOM.

export const TICK_HZ = 60;
export const DT = 1 / TICK_HZ;
export const GRAVITY = 20;

// Two teams swap sides at half time. Side 0 attacks (carries the Fuse Core), side 1 defends.
export const SIDE = { ATTACK: 0, DEFEND: 1 };
export const TEAMS = [
  { name: 'Harrow', color: 0xe0703a, css: '#e0703a' }, // rust: salvage crews from the rail yard
  { name: 'Wardens', color: 0x3fb7b0, css: '#3fb7b0' }, // teal: the refinery's own guard
];
export const PLAYER_TEAM = 0;
export const TEAM_SIZE = 5;

export const MOVE = {
  runSpeed: 5.2,
  walkSpeed: 2.6, // shift: silent, steadier aim
  crouchSpeed: 1.8,
  accel: 6.5, // ground acceleration, in "wish speeds per second" (Quake-style accelerate)
  airAccel: 1.4,
  friction: 6.5,
  stopSpeed: 1.8, // friction never works on less than this speed, so stops are crisp
  jumpSpeed: 6.9,
  radius: 0.34,
  standHeight: 1.8,
  crouchHeight: 1.22,
  standEye: 1.62,
  crouchEye: 1.06,
  crouchRate: 7, // crouch transition, fraction per second
  stepHeight: 0.45,
  footstepEvery: 2.2, // metres of running between footstep sounds
};

// Hitbox proportions (fractions of current height) shared by the hit test and the character model.
export const BODY = {
  headRadius: 0.16,
  torsoRadius: 0.27,
  legRadius: 0.22,
  legTop: 0.47, // fraction of height where legs end and torso starts
  legMult: 0.75,
  torsoMult: 1,
};

// Spread values are cone radii in radians. Moving and jumping add a lot: stop to aim.
// bloom is added per shot. recoil: climb = pitch kick per shot (rad), sway = yaw swing per shot once
// `settle` shots have climbed, recover = exponential rate (1/s) at which punch and bloom fade off-trigger.
export const WEAPONS = {
  pike: {
    name: 'Pike-9', kind: 'pistol', slot: 'secondary', price: 200, mag: 12, reserve: 36,
    interval: 0.16, auto: false, damage: 31, headMult: 4, armorPen: 0.47, falloff: 0.86, range: 60,
    pellets: 1, reload: 2.1, speedMult: 1, reward: 300, draw: 0.5,
    spread: { base: 0.006, move: 0.045, air: 0.12, crouch: 0.8, bloom: 0.022 },
    recoil: { climb: 0.018, sway: 0.004, settle: 2, recover: 5 },
  },
  wasp: {
    name: 'Wasp SMG', kind: 'smg', slot: 'primary', price: 1250, mag: 25, reserve: 100,
    interval: 0.075, auto: true, damage: 25, headMult: 3.2, armorPen: 0.6, falloff: 0.75, range: 50,
    pellets: 1, reload: 2.4, speedMult: 0.98, reward: 600, draw: 0.6,
    spread: { base: 0.009, move: 0.022, air: 0.1, crouch: 0.85, bloom: 0.006 },
    recoil: { climb: 0.006, sway: 0.008, settle: 5, recover: 7 },
  },
  kestrel: {
    name: 'Kestrel AR', kind: 'rifle', slot: 'primary', price: 2700, mag: 30, reserve: 90,
    interval: 0.1, auto: true, damage: 35, headMult: 4, armorPen: 0.78, falloff: 0.94, range: 120,
    pellets: 1, reload: 2.5, speedMult: 0.9, reward: 300, draw: 0.8,
    spread: { base: 0.0035, move: 0.075, air: 0.16, crouch: 0.75, bloom: 0.0075 },
    recoil: { climb: 0.0105, sway: 0.0075, settle: 7, recover: 6 },
  },
  brute: {
    name: 'Brute-12', kind: 'shotgun', slot: 'primary', price: 1100, mag: 7, reserve: 28,
    interval: 0.85, auto: false, damage: 15, headMult: 2, armorPen: 0.6, falloff: 0.45, range: 40,
    pellets: 9, reload: 3, speedMult: 0.95, reward: 900, draw: 0.7,
    spread: { base: 0.055, move: 0.02, air: 0.06, crouch: 0.95, bloom: 0.01 },
    recoil: { climb: 0.05, sway: 0.004, settle: 1, recover: 4 },
  },
  heron: {
    name: 'Heron .338', kind: 'marksman', slot: 'primary', price: 4300, mag: 5, reserve: 20,
    interval: 1.3, auto: false, damage: 108, headMult: 2.5, armorPen: 0.95, falloff: 0.99, range: 160,
    pellets: 1, reload: 3.2, speedMult: 0.82, reward: 100, draw: 1,
    scope: 0.32, // field of view multiplier while scoped (right mouse)
    spread: { base: 0.0008, unscoped: 0.075, move: 0.12, air: 0.25, crouch: 0.85, bloom: 0.02 },
    recoil: { climb: 0.045, sway: 0.005, settle: 1, recover: 4 },
  },
};
export const WEAPON_ORDER = ['pike', 'wasp', 'kestrel', 'brute', 'heron'];
WEAPON_ORDER.forEach((id, index) => Object.assign(WEAPONS[id], { id, index }));

// Grenades, bought like guns and thrown with G (frag) and F (smoke). index 100: kill-feed id.
export const GRENADES = {
  frag: { name: 'Clatter frag', price: 300, fuse: 1.5, radius: 7, damage: 105, reward: 300, index: 100 },
  smoke: { name: 'Haze canister', price: 300, fuse: 1.6, radius: 4.4, duration: 15 },
};

// The Fuse Core (the attackers' charge): arm it on a site, defenders disarm it.
export const OBJECTIVE = {
  plantTime: 3.2,
  defuseTime: 5,
  fuse: 40,
  reach: 1.6, // metres from the core to disarm it
  reward: 300, // to the one who arms or disarms
  plantBonus: 800, // to each attacker when they lose a round after arming
  blastRadius: 15,
  blastDamage: 240,
};

export const ECON = {
  start: 800,
  max: 9000,
  win: 3250,
  lossBase: 1400,
  lossStep: 500,
  lossMax: 3400,
};

export const ROUND = {
  freeze: 6, // seconds frozen in spawn at round start (buy menu open)
  live: 105, // round clock
  buyWindow: 20, // seconds into the live round the buy menu stays open
  over: 5, // pause after a round is decided
  matchOver: 9, // pause after the match before a new one starts
  winsNeeded: 6,
  half: 5, // rounds before teams swap sides
};

// Bot skill: reaction to a newly seen enemy, aim settle speed and turn rate.
export const BOT = {
  fov: 2.1, // radians, full cone
  viewRange: 70,
  reactMin: 0.28,
  reactMax: 0.5,
  turnRate: 7.5, // rad/s
  aimSettle: 2.6, // aim error shrinks by e^-k per second while tracking
  aimError: 0.11, // initial aim error (rad) on a fresh target
  burst: [3, 6],
  thinkEvery: 6, // ticks between perception updates
};
