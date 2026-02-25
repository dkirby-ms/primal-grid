/** Server simulation ticks per second. */
export const TICK_RATE = 4;

/** Default world map size (tiles per side). */
export const DEFAULT_MAP_SIZE = 32;

/** Default Colyseus server port. */
export const SERVER_PORT = 2567;

/** Default seed for procedural map generation. */
export const DEFAULT_MAP_SEED = 12345;

/** Noise-based terrain generation parameters. */
export const NOISE_PARAMS = {
  ELEVATION_SCALE: 0.08,
  MOISTURE_SCALE: 0.06,
  ELEVATION_OCTAVES: 4,
  MOISTURE_OCTAVES: 3,
  WATER_LEVEL: 0.35,
  ROCK_LEVEL: 0.80,
  HIGHLAND_LEVEL: 0.65,
  FOREST_MOISTURE: 0.50,
  SWAMP_MOISTURE: 0.65,
  SWAMP_ELEVATION: 0.45,
  DESERT_MOISTURE: 0.25,
  SAND_MOISTURE: 0.35,
} as const;
