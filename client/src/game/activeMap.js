// The map the room is playing on. The server names it in WELCOME, LOBBY and
// START; everything that draws or drives on the floor reads it from here.
import { mapById } from '@rc/shared';
import { useStore } from '../store.js';

// In components: re-renders (and, keyed on map.id, remounts) on a map change.
export const useMap = () => mapById(useStore((s) => s.mapId));
// In frame loops and handlers: the map right now.
export const currentMap = () => mapById(useStore.getState().mapId);
