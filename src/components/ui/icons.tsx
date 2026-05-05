"use client";

import type { ComponentType, SVGProps } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Airplane01Icon,
  Add01Icon,
  AddSquareIcon,
  ArrowDown01Icon,
  ArrowLeft01Icon,
  ArrowRight01Icon,
  ArrowUp01Icon,
  BarChartIcon,
  Bookmark01Icon,
  BookmarkCheck01Icon,
  Camera01Icon,
  Cancel01Icon,
  CheckmarkBadge01Icon,
  CheckmarkCircle01Icon,
  CodeIcon,
  CompassIcon,
  Calendar01Icon,
  Clapperboard as ClapperboardGlyph,
  Delete02Icon,
  FavouriteIcon,
  Film01Icon,
  File01Icon,
  GlobeIcon,
  GridViewIcon,
  Home01Icon,
  Image01Icon,
  InformationCircleIcon,
  LifebuoyIcon,
  Link01Icon,
  Loading03Icon,
  Logout01Icon,
  Mail01Icon,
  Message01Icon,
  Mic01Icon,
  Moon02Icon,
  MoreHorizontalIcon,
  MusicNote01Icon,
  NewsIcon,
  Notification01Icon,
  PauseIcon,
  PartyIcon,
  PencilEdit02Icon,
  Pizza01Icon,
  PlayIcon,
  PlaySquareIcon,
  RefreshIcon,
  RepeatIcon,
  Rocket01Icon,
  Search01Icon,
  SentIcon,
  Settings01Icon,
  Shirt01Icon,
  Shield01Icon,
  SmileIcon,
  SmartPhone01Icon,
  SparklesIcon,
  Sun03Icon,
  StickerIcon,
  Tick02Icon,
  User02Icon,
  UserCircleIcon,
  UserSettings01Icon,
  UserSquareIcon,
  UserGroupIcon,
  Video01Icon,
  VolleyballIcon,
  VolumeHighIcon,
  ViewIcon,
  ViewOffIcon,
  ZoomInAreaIcon,
  ZoomOutAreaIcon,
} from "@hugeicons/core-free-icons";

export type IconProps = SVGProps<SVGSVGElement> & {
  size?: number | string;
  strokeWidth?: number;
};

export type LucideIcon = ComponentType<IconProps>;

function createIcon(icon: unknown): LucideIcon {
  const Wrapped = ({ size = 24, strokeWidth = 1.8, className, ...rest }: IconProps) => (
    <HugeiconsIcon
      icon={icon as never}
      size={size}
      strokeWidth={strokeWidth}
      className={className}
      {...(rest as object)}
    />
  );
  Wrapped.displayName = "HugeIcon";
  return Wrapped;
}

export const Camera = createIcon(Camera01Icon);
export const Check = createIcon(Tick02Icon);
export const ChevronLeft = createIcon(ArrowLeft01Icon);
export const ChevronRight = createIcon(ArrowRight01Icon);
export const ChevronDown = createIcon(ArrowDown01Icon);
export const ChevronUp = createIcon(ArrowUp01Icon);
export const ImagePlus = createIcon(Image01Icon);
export const Info = createIcon(InformationCircleIcon);
export const Link = createIcon(Link01Icon);
export const Loader2 = createIcon(Loading03Icon);
export const X = createIcon(Cancel01Icon);
export const MessageCircleMore = createIcon(Message01Icon);
export const Search = createIcon(Search01Icon);
export const Compass = createIcon(CompassIcon);
export const Home = createIcon(Home01Icon);
export const PlusSquare = createIcon(AddSquareIcon);
export const Settings = createIcon(Settings01Icon);
export const UserRound = createIcon(UserCircleIcon);
export const ArrowLeft = createIcon(ArrowLeft01Icon);
export const ArrowRight = createIcon(ArrowRight01Icon);
export const CheckCircle2 = createIcon(CheckmarkCircle01Icon);
export const BookmarkCheck = createIcon(BookmarkCheck01Icon);
export const Eye = createIcon(ViewIcon);
export const EyeOff = createIcon(ViewOffIcon);
export const XCircle = createIcon(Delete02Icon);
export const Bookmark = createIcon(Bookmark01Icon);
export const Heart = createIcon(FavouriteIcon);
export const MessageCircle = createIcon(Message01Icon);
export const Mic = createIcon(Mic01Icon);
export const Music2 = createIcon(MusicNote01Icon);
export const Send = createIcon(SentIcon);
export const ShieldCheck = createIcon(Shield01Icon);
export const Plus = createIcon(Add01Icon);
export const Users = createIcon(UserGroupIcon);
export const BellRing = createIcon(Notification01Icon);
export const BadgeCheck = createIcon(CheckmarkBadge01Icon);
export const Play = createIcon(PlayIcon);
export const FileText = createIcon(File01Icon);
export const Globe = createIcon(GlobeIcon);
export const BarChart3 = createIcon(BarChartIcon);
export const Mail = createIcon(Mail01Icon);
export const Smartphone = createIcon(SmartPhone01Icon);
export const ZoomIn = createIcon(ZoomInAreaIcon);
export const ZoomOut = createIcon(ZoomOutAreaIcon);
export const Repeat2 = createIcon(RepeatIcon);
export const RefreshCw = createIcon(RefreshIcon);
export const MoreHorizontal = createIcon(MoreHorizontalIcon);
export const Pause = createIcon(PauseIcon);
export const Smile = createIcon(SmileIcon);
export const Grid3x3 = createIcon(GridViewIcon);
export const PlaySquare = createIcon(PlaySquareIcon);
export const UserSquare2 = createIcon(UserSquareIcon);
export const Bell = createIcon(Notification01Icon);
export const LifeBuoy = createIcon(LifebuoyIcon);
export const LogOut = createIcon(Logout01Icon);
export const MessageCircleHeart = createIcon(FavouriteIcon);
export const Moon = createIcon(Moon02Icon);
export const Sun = createIcon(Sun03Icon);
export const Trash2 = createIcon(Delete02Icon);
export const UserCog = createIcon(UserSettings01Icon);
export const Volume2 = createIcon(VolumeHighIcon);
export const CalendarDays = createIcon(Calendar01Icon);
export const Clapperboard = createIcon(ClapperboardGlyph);
export const Code2 = createIcon(CodeIcon);
export const Newspaper = createIcon(NewsIcon);
export const PartyPopper = createIcon(PartyIcon);
export const Pizza = createIcon(Pizza01Icon);
export const Plane = createIcon(Airplane01Icon);
export const Shirt = createIcon(Shirt01Icon);
export const Video = createIcon(Video01Icon);
export const Volleyball = createIcon(VolleyballIcon);
export const Sticker = createIcon(StickerIcon);
export const User = createIcon(User02Icon);
export const Shield = createIcon(Shield01Icon);
export const Rocket = createIcon(Rocket01Icon);
export const SquarePen = createIcon(PencilEdit02Icon);
export const Film = createIcon(Film01Icon);
export const Sparkles = createIcon(SparklesIcon);
