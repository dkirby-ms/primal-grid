# Decision: Key Binding Changes for Shape Mode (B8)

**Author:** Gately (Game Dev)
**Date:** 2026-02-25
**Scope:** Client input handling

## Summary

Repurposed the 'V' key from generic build mode to **shape placement mode** (polyomino territory building). Structure build mode (workbench, farm) moved to **'B' key**. Added 'R' for shape rotation.

## Key Bindings After B8

| Key | Action |
|-----|--------|
| V   | Toggle shape placement mode |
| B   | Toggle structure build mode (workbench, farm) |
| R   | Rotate selected shape (in shape mode) |
| 1-9 | Select shape by index (shape mode) or structure (build mode) |
| C   | Craft menu |
| H   | Farm harvest |
| I   | Tame creature |
| ?   | Help screen |

## Rendering Decision (B9)

Shape blocks (shapeHP > 0) render at alpha 0.6 with a darkened border stroke. Open territory stays at alpha 0.25. This gives shape blocks a visually distinct "built wall" appearance.
