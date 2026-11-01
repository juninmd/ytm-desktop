import { createContext, useContext, type ReactNode } from "react";
import type { Track } from "../types";

/** What a menu deep in the tree may ask the shell to show. */
export type Navigation = {
  openAlbum: (id: string) => void;
  /** Opens the catalogue search for `query` (used to reach an artist by name). */
  searchFor: (query: string) => void;
  /** Opens the details dialog for a track. */
  showInfo: (track: Track) => void;
};

const NavigationContext = createContext<Navigation | null>(null);

export function NavigationProvider({ value, children }: { value: Navigation; children: ReactNode }) {
  return <NavigationContext.Provider value={value}>{children}</NavigationContext.Provider>;
}

/** `null` outside the workspace, so menus simply omit the navigation entries. */
export function useNavigation(): Navigation | null {
  return useContext(NavigationContext);
}
