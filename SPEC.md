# Stealh Heist Game
A top-down 2D game set in an office (or bank, actual setting to be determined) where the player is a thief trying to steal treasure and tries to avoid its security system (security cameras, motion detectors, lasers, guards, etc.) Along the way, the player gains powerups that allow them to bypass them or clear them better. The game should be a set of levels in increasing difficulty and cumulative in the powerups the player can use. 

Note: inspired by [The Heist](https://www.youtube.com/watch?v=l69-ZhrFrds), a custom modpack + map in Minecraft. The game should not be a direct copy of this.

## Feature Set
Levels:
- Each level's physical path should not be linear - the player should need to retrace their steps. See Task System below.
- The layout can be maze-like, as a set of hallways and rooms (which can be locked, unlocked, etc.)
- Although top-down, the player should not be able to see into locked rooms.
- The level should culminate in grabbing a treasure (e.g. a diamond) deep in the level, and the level only ends by the player returning to their initial startpoint of the level.
- Levels may also have an above-ground vent level (not required at every level, and should not appear in the first level)
  - The player can't spend too much time in the vent level at a time - it increments a temperature sensor, which triggers at a certain level. Once the player exits the vents, the temperature decreases again.
- There is sufficient level decor (these have no function but decoration).
- The first set of levels can be a tutorial-like.

Task System:
- Reaching the treasure is impossible at the beginning of the level. The player must acheive a certain set of tasks, which thematically progress, in order to be able to get to the treasure. This set of tasks should be the main thing that scales in difficulty across levels.
- Please brainstorm more.
Some examples:
- Ex: In some levels, there should be a security room. The player can disable a computer to knock out all the security cameras. This would "unblock" a path
- Ex: The player needs to grab a keycard to unlock a certain room, which is where the vent is.

Security System:
- There is a counter that ticks up whenever the player is noticed, and this counter can be increased by many security measures in the level. This counter can not go back down, and if it reaches a certain level, the player loses and must restart that level.
- Security Cameras:
  - Have a angle range of vision and limited radial range
  - Should swivel back and forth
  - Should show, on-screen, its vision, in red.
  - Every moment the player is in this red zone, it increases the counter. 
- Guards:
  - Make a set path / course around the level, and never depart from it.
  - They do NOT react to the player.
  - Similar to cameras, they also have an angle range and increase the counter if they see the player.
- Lasers:
  - Are very visible on screen.
  - If tripped, they set the counter to its max, and the game instantly ends.

Powerups:
- The player starts with no powerups, and cumulatively, over several levels, gains powerups (retained across levels).
- Please brainstorm more.
- Ideas:
  - Vent Crawling - If underneath a vent, the player can go into the above-ground floor and crawl in a series of vents. They can exit to the main-ground floor at a vent location There should be no security system in place here, except for the temperature sensor. The main-ground floor should still be overlaid and visible (maybe at lower opacity)
  - X-Ray - The player, with a cooldown, can see into locked rooms.
  - Stealth Mode - The player, with a very big cooldown (or maybe # of times is limited per level), can be completely stealthy for a brief moment (1-4 seconds). They cannot be seen by any security measure during this time.


## Acceptance Criteria (in order of priority)
1. The player moves with WASD, and can (at times) go above to the main floor with two buttons (ex: Q and E)
2. The levels have a main treasure and a set of tasks to complete before getting that treasure.
3. The security system works accurately and difficulty is tuned well.
  - The player should not trip lasers or 
4. The game is sufficiently polished. Art, music, sound effects, and gamefeel don't feel unfinished. 