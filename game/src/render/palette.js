// The look: a salt refinery on a cold coast at dusk, a low warm sun over cool shadows. Five hues for the
// works (salt-white concrete, rust, weathered teal, rose brine, hazard yellow on the objective only), so the
// teams' vermilion and cobalt are the only saturated colours on people.
import * as THREE from 'three';

export const PALETTE = {
  sky: [[0, '#26384c'], [0.22, '#3a5068'], [0.36, '#4a6278'], [0.43, '#9a8f96'], [0.475, '#e2a983'], [0.5, '#f6d8b8'], [0.51, '#b4a093'], [1, '#2a2e33']],
  haze: '#c4ab9a', sun: '#ffac68', skyLight: '#a9b6cf', groundLight: '#6b6458',
  ground: '#858279', concrete: '#aeaaa0', steel: '#56626b', brine: '#c98790', lamp: '#ffb760', paint: '#efc94c',
  // Per lane: cladding tint, then its accent (containers, sign stripes): rust or weathered teal.
  lanes: { hall: ['#9a5a45', '#56706a'], tanks: ['#d2cfc6', '#9a4a32'], channel: ['#4f8576', '#a24f33'], slip: ['#8c4c38', '#2f7470'], court: ['#c4c0b6', '#93472f'] },
};

export const std = (o) => new THREE.MeshStandardMaterial({ roughness: 0.85, ...o });
