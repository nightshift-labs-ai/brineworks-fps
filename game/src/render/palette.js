// The look: a salt refinery on a cold coast at dusk, a low warm sun over cool shadows. Five hues for the
// works (salt-white concrete, rust, weathered teal, rose brine, hazard yellow on the objective), so the
// teams' vermilion and cobalt are the only saturated colours on people.
import * as THREE from 'three';

export const PALETTE = {
  sky: [[0, '#2b3650'], [0.22, '#4a5470'], [0.36, '#7a6a80'], [0.43, '#c98a78'], [0.475, '#f29a62'], [0.5, '#ffd09a'], [0.51, '#b89282'], [1, '#2a2e33']],
  haze: '#cfa48c', sun: '#ff9a52', skyLight: '#c4b4b8', groundLight: '#80654c',
  ground: '#a89c8c', concrete: '#aeaaa0', steel: '#56626b', brine: '#ab9693', lamp: '#ffb760', paint: '#efc94c',
  // Per lane: cladding tint, then its accent (containers, sign stripes): rust or weathered teal.
  lanes: { hall: ['#9a5a45', '#56706a'], tanks: ['#d2cfc6', '#9a4a32'], channel: ['#4f8576', '#a24f33'], slip: ['#8c4c38', '#2f7470'], court: ['#c4c0b6', '#2f7470'] },
};

export const std = (o) => new THREE.MeshStandardMaterial({ roughness: 0.85, ...o });
