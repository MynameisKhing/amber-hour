import type { CSSProperties } from "react";
import Icon from "@mdi/react";
import {
  mdiMenu,
  mdiClose,
  mdiAccountGroupOutline,
  mdiPaperclip,
  mdiEmoticonOutline,
  mdiReply,
  mdiPencilOutline,
  mdiTrashCanOutline,
  mdiMessageOutline,
  mdiLockOutline,
  mdiWeatherNight,
  mdiWhiteBalanceSunny,
} from "@mdi/js";

interface P { size?: number; style?: CSSProperties }

// Wraps an MDI path as a currentColor icon sized in px (matches the old API).
const make = (path: string, defaultSize: number) =>
  function Ico({ size = defaultSize, style }: P) {
    return <Icon path={path} size={`${size}px`} style={{ display: "block", ...style }} />;
  };

export const IcoMenu    = make(mdiMenu, 18);
export const IcoClose   = make(mdiClose, 16);
export const IcoMembers = make(mdiAccountGroupOutline, 18);
export const IcoAttach  = make(mdiPaperclip, 16);
export const IcoEmoji   = make(mdiEmoticonOutline, 16);
export const IcoReply   = make(mdiReply, 16);
export const IcoEdit    = make(mdiPencilOutline, 15);
export const IcoTrash   = make(mdiTrashCanOutline, 15);
export const IcoMessage = make(mdiMessageOutline, 15);
export const IcoLock    = make(mdiLockOutline, 14);
export const IcoMoon    = make(mdiWeatherNight, 16);
export const IcoSun     = make(mdiWhiteBalanceSunny, 16);
