# Block v1 Manual Smoke Checks

## A. Clipboard

1. Draw one rectangle.
2. Select it.
3. Press `Cmd+C` on macOS or `Ctrl+C` on Windows.
4. Press `Cmd+V` or `Ctrl+V`.
5. Confirm a second rectangle appears about `18px` to the right and up.
6. Confirm the pasted rectangle is selected.

## B. Block

1. Draw two rectangles.
2. Select both.
3. Click `Make Block`.
4. Confirm the document entity count becomes `1`.
5. Confirm the selected entity type is `blockInstance`.
6. Confirm the Properties panel shows `Block Instance`.
7. Move the block instance.
8. Copy and paste the block instance.
9. Explode the block instance.
10. Save JSON.
11. Reload JSON.
12. Confirm there are no console errors.

## C. Hidden / Locked Layer Paste Fallback

1. Copy an entity on a non-active layer.
2. Hide or lock the original layer.
3. Paste.
4. Confirm the pasted entity does not land on a hidden or locked layer.
5. Confirm it falls back to the active visible unlocked layer, or the first visible unlocked layer.

## D. DXF

1. Make a block from two rectangles.
2. Export DXF.
3. Open the DXF in a viewer or inspect the `LINE` entities.
4. Confirm the child rectangle outlines are exported.
