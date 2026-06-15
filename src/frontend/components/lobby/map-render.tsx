import { useObservableState } from "observable-hooks";
import { IGameInstance } from "../../../logic/gameinstance";

export function MapPicker({ gameInstance }: { gameInstance: IGameInstance }) {
  const src = useObservableState(gameInstance.terrainThumbnail);
  const name = useObservableState(gameInstance.mapName);
  // Map-changing controls (predefined-map picker + custom upload) are hidden
  // for the competition build — every match uses the single default level,
  // which the lobby auto-selects. We still show the name + thumbnail so players
  // can see which map they're about to play.
  return (
    <div>
      {name && <h3>{name}</h3>}
      {src && <img style={{ width: "384px", background: "black" }} src={src} />}
    </div>
  );
}
