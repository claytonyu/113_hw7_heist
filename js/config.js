// Global namespace and tunable constants.
window.Heist = window.Heist || {};

Heist.CONFIG = {
  TILE: 32,               // pixels per tile
  VIEW_W: 960,            // canvas size
  VIEW_H: 640,

  PLAYER_RADIUS: 10,
  PLAYER_SPEED: 150,      // px/s on main floor
  VENT_SPEED: 90,         // px/s while crawling in vents

  ALERT_MAX: 100,         // default; levels can override with alertMax
  INTERACT_TIME: 1.2,     // seconds to hold F to hack a computer
  INTERACT_RANGE: 40,     // px from player center to object center

  TEMP_MAX: 100,          // vent temperature sensor trips at this value
  TEMP_RISE: 12,          // per second while in vents
  TEMP_FALL: 20,          // per second while out of vents
};

// Tile characters used in level `map` strings (main floor).
Heist.TILES = {
  WALL: '#',
  FLOOR: '.',
  VOID: ' ',        // outside the building, solid, drawn dark
  START: 'S',       // floor; player spawn and exit point
  TREASURE: 'T',    // floor; treasure spawns here
  DOOR: 'D',        // door; properties come from level.doors by coordinate
  VENT: 'v',        // floor with a ceiling vent above it (vent opening)
};

// Tile characters used in level `ventMap` strings (vent layer).
Heist.VENT_TILES = {
  DUCT: '=',        // crawlable duct
  OPENING: 'O',     // crawlable; connects to a 'v' tile on the main floor
  // anything else is solid
};
