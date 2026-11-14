// The look: a salt refinery on a cold coast at dusk; warm colour only in the sun, lamps, paint and teams.
import * as THREE from 'three';

export const PALETTE = {
  sky: [[0, '#0d1633'], [0.25, '#1f2e56'], [0.4, '#4a5a82'], [0.465, '#8d96b2'], [0.49, '#d9a891'], [0.5, '#f6d2a2'], [0.505, '#a6b2be'], [1, '#3b4b58']],
  haze: '#8f9cad', sun: '#ffd7aa', skyLight: '#a8bcdd', groundLight: '#7d878c',
  ground: '#d8dddc', concrete: '#c8cbc8', steel: '#56626b', brine: '#3e7277', lamp: '#ffb760', paint: '#efc94c',
  lanes: { hall: '#a8634f', tanks: '#e6ebec', channel: '#5f9c8f', quay: '#6c87a6', court: '#c2c5c2' }, // cladding tint per lane
  boxes: [0x5d6f80, 0x4f8c88, 0x8a98a5], // steel container colours
};

// The one material maker for opaque surfaces.
export const std = (o) => new THREE.MeshStandardMaterial({ roughness: 0.85, ...o });
