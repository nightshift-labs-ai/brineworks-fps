// The look: a salt refinery on a cold coast at dusk, a low warm sun over cool shadows, one accent per lane.
import * as THREE from 'three';

export const PALETTE = {
  sky: [[0, '#0b1230'], [0.22, '#1c2850'], [0.36, '#47507c'], [0.43, '#a4758a'], [0.475, '#e89a70'], [0.5, '#ffcf96'], [0.51, '#8a7f80'], [1, '#2a2e33']],
  haze: '#7d7884', sun: '#ffac68', skyLight: '#a9b6cf', groundLight: '#6b6458',
  ground: '#858279', concrete: '#9b9c96', steel: '#56626b', brine: '#3e7277', lamp: '#ffb760', paint: '#efc94c',
  // Per lane: cladding tint, then one saturated accent (containers, signs) clear of the team colours.
  lanes: { hall: ['#a8634f', '#16967e'], tanks: ['#c9cecf', '#86a82a'], channel: ['#5f9c8f', '#c9a227'], quay: ['#6c87a6', '#b8336f'], court: ['#a9aca9', '#7a4cc0'] },
};

export const std = (o) => new THREE.MeshStandardMaterial({ roughness: 0.85, ...o });
