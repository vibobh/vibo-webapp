"use client";

/**
 * X/Twitter-style action glyphs (paths from the web client), rendered as filled SVGs.
 * Web port of the RN `XStyleGlyph` — use `theme.colors.iconPrimary` via `useTheme` + vibo tokens.
 */
import { memo, type SVGProps } from "react";
import { useTheme } from "@/lib/theme/ThemeProvider";
import { iconPrimaryForTheme } from "@/lib/theme/viboTokens";

export const X_STYLE_GLYPH_NAMES = {
  reply: "reply",
  heartOutline: "heartOutline",
  heartFilled: "heartFilled",
  bell: "bell",
  moreHorizontal: "moreHorizontal",
  moreInCircle: "moreInCircle",
  report: "report",
  block: "block",
  copyLink: "copyLink",
  userMute: "userMute",
  saveOutline: "saveOutline",
  saveFilled: "saveFilled",
  homeOutline: "homeOutline",
  homeFilled: "homeFilled",
  searchOutline: "searchOutline",
  searchFilled: "searchFilled",
  sharePost: "sharePost",
  commentLikeOutline: "commentLikeOutline",
  commentLikeFilled: "commentLikeFilled",
  commentDislikeOutline: "commentDislikeOutline",
  commentDislikeFilled: "commentDislikeFilled",
  /** Create-post / sheets — same 24 grid, filled style */
  person: "person",
  peopleTwo: "peopleTwo",
  locationPin: "locationPin",
  musicNote: "musicNote",
  eyeOpen: "eyeOpen",
  eyeOff: "eyeOff",
} as const;

export type XStyleGlyphName =
  (typeof X_STYLE_GLYPH_NAMES)[keyof typeof X_STYLE_GLYPH_NAMES];

const HEART_OUTLINE =
  "M16.792 3.904A4.989 4.989 0 0 1 21.5 9.122c0 3.072-2.652 4.959-5.197 7.222-2.512 2.243-3.865 3.469-4.303 3.752-.477-.309-2.143-1.823-4.303-3.752C5.141 14.072 2.5 12.167 2.5 9.122a4.989 4.989 0 0 1 4.708-5.218 4.21 4.21 0 0 1 3.675 1.941c.84 1.175.98 1.763 1.12 1.763s.278-.588 1.11-1.766a4.17 4.17 0 0 1 3.679-1.938m0-2a6.04 6.04 0 0 0-4.797 2.127 6.052 6.052 0 0 0-4.787-2.127A6.985 6.985 0 0 0 .5 9.122c0 3.61 2.55 5.827 5.015 7.97.283.246.569.494.853.747l1.027.918a44.998 44.998 0 0 0 3.518 3.018 2 2 0 0 0 2.174 0 45.263 45.263 0 0 0 3.626-3.115l.922-.824c.293-.26.59-.519.885-.774 2.334-2.025 4.98-4.32 4.98-7.94a6.985 6.985 0 0 0-6.708-7.218Z";

const HEART_FILLED =
  "M34.6 3.1c-4.5 0-7.9 1.8-10.6 5.6-2.7-3.7-6.1-5.5-10.6-5.5C6 3.1 0 9.6 0 17.6c0 7.3 5.4 12 10.6 16.5.6.5 1.3 1.1 1.9 1.7l2.3 2c4.4 3.9 6.6 5.9 7.6 6.5.5.3 1.1.5 1.6.5s1.1-.2 1.6-.5c1-.6 2.8-2.2 7.8-6.8l2-1.8c.7-.6 1.3-1.2 2-1.7C42.7 29.6 48 25 48 17.6c0-8-6-14.5-13.4-14.5z";

const REPLY_D =
  "M12 3C7.02944 3 3 7.02944 3 12C3 16.9706 7.02944 21 12 21C13.414 21 14.7492 20.6747 15.9373 20.0956C16.1277 20.0028 16.3428 19.9728 16.5514 20.0101L20.7565 20.7619L19.9927 16.5927C19.954 16.3815 19.9843 16.1633 20.0792 15.9707C20.6685 14.7742 21 13.4273 21 12C21 7.02944 16.9706 3 12 3ZM1 12C1 5.92486 5.92488 1 12 1C18.0752 1 23 5.92488 23 12C23 13.6205 22.649 15.1615 22.018 16.549L22.9836 21.8198C23.0427 22.1423 22.94 22.4733 22.7086 22.7056C22.4773 22.938 22.1468 23.0421 21.824 22.9844L16.512 22.0348C15.1341 22.6553 13.6061 23 12 23C5.92488 23 1 18.0752 1 12Z";

const BELL_D =
  "M11.9994 1C13.4355 1 14.701 1.70153 15.4545 2.77246C17.1018 3.55213 18.495 4.92562 19.1762 6.90137L19.309 7.32812L19.3227 7.38281L20.0082 10.4941L20.1069 10.9062C20.3507 11.8655 20.7012 12.795 21.1528 13.6768L21.2709 13.9277C22.3939 16.533 20.4892 19.5 17.5922 19.5H15.9692C15.7238 21.474 14.0419 23.002 12.0014 23.002C9.96109 23.0018 8.27995 21.4739 8.0346 19.5H6.40667C3.41656 19.4998 1.48337 16.3383 2.84613 13.6768L3.03363 13.2959C3.45624 12.4011 3.77746 11.4614 3.99066 10.4941L4.6762 7.38281L4.68988 7.32812C5.30926 5.12284 6.78134 3.60711 8.54437 2.77246C9.29776 1.70144 10.5634 1.00018 11.9994 1ZM10.0668 19.5C10.2884 20.3632 11.0691 21.0018 12.0014 21.002C12.9339 21.002 13.7154 20.3634 13.9369 19.5H10.0668ZM11.9994 3C11.156 3.00019 10.4491 3.44449 10.0854 4.06738C9.97676 4.2533 9.81092 4.39923 9.61273 4.4834C8.22743 5.07166 7.09541 6.18064 6.62054 7.84961L5.94378 10.9238C5.69834 12.0376 5.32886 13.1201 4.84222 14.1504L4.6264 14.5879C3.94496 15.9186 4.91169 17.4998 6.40667 17.5H17.5922C19.0407 17.5 19.9935 16.0165 19.4321 14.7139L19.3725 14.5879C18.8528 13.5731 18.4491 12.5034 18.1684 11.3994L18.0551 10.9238L17.3754 7.83984C16.8989 6.17648 15.7696 5.07049 14.3871 4.4834C14.1889 4.39918 14.0221 4.25335 13.9135 4.06738C13.5497 3.44449 12.843 3 11.9994 3Z";

const MORE_CIRCLE_3D =
  "M7 10.75C7.69036 10.75 8.25 11.3096 8.25 12C8.25 12.6904 7.69036 13.25 7 13.25C6.30964 13.25 5.75 12.6904 5.75 12C5.75 11.3096 6.30964 10.75 7 10.75Z";

const MORE_CIRCLE_3M =
  "M12 10.75C12.6904 10.75 13.25 11.3096 13.25 12C13.25 12.6904 12.6904 13.25 12 13.25C11.3096 13.25 10.75 12.6904 10.75 12C10.75 11.3096 11.3096 10.75 12 10.75Z";

const MORE_CIRCLE_3R =
  "M17 10.75C17.6904 10.75 18.25 11.3096 18.25 12C18.25 12.6904 17.6904 13.25 17 13.25C16.3096 13.25 15.75 12.6904 15.75 12C15.75 11.3096 16.3096 10.75 17 10.75Z";

const MORE_CIRCLE_OUT =
  "M12 1C18.0751 1 23 5.92487 23 12C23 18.0751 18.0751 23 12 23C5.92487 23 1 18.0751 1 12C1 5.92487 5.92487 1 12 1ZM12 3C7.02944 3 3 7.02944 3 12C3 16.9706 7.02944 21 12 21C16.9706 21 21 16.9706 21 12C21 7.02944 16.9706 3 12 3Z";

const SAVE_D =
  "M11.5391 17.1123C11.8756 16.9374 12.2885 16.967 12.5996 17.2002L17.4004 20.7998C18.0596 21.294 19 20.824 19 20V5C19 3.89543 18.1046 3 17 3H7C5.89543 3 5 3.89543 5 5V20C5 20.824 5.94038 21.294 6.59961 20.7998L11.4004 17.2002L11.5391 17.1123ZM21 20C21 22.472 18.1779 23.8833 16.2002 22.4004L12 19.249L7.7998 22.4004C5.82211 23.8833 3 22.472 3 20V5C3 2.79086 4.79086 1 7 1H17C19.2091 1 21 2.79086 21 5V20Z";
const SAVE_FILLED_D =
  "M3 5C3 2.79086 4.79086 1 7 1H17C19.2091 1 21 2.79086 21 5V20C21 22.4721 18.1777 23.8833 16.2 22.4L12 19.25L7.8 22.4C5.82229 23.8833 3 22.4721 3 20V5Z";
const HOME_OUTLINE_D =
  "m21.762 8.786-7-6.68C13.266.68 10.734.68 9.238 2.106l-7 6.681A4.017 4.017 0 0 0 1 11.68V20c0 1.654 1.346 3 3 3h5.005a1 1 0 0 0 1-1L10 15c0-1.103.897-2 2-2 1.09 0 1.98.877 2 1.962L13.999 22a1 1 0 0 0 1 1H20c1.654 0 3-1.346 3-3v-8.32a4.021 4.021 0 0 0-1.238-2.894ZM21 20a1 1 0 0 1-1 1h-4.001L16 15c0-2.206-1.794-4-4-4s-4 1.794-4 4l.005 6H4a1 1 0 0 1-1-1v-8.32c0-.543.226-1.07.62-1.447l7-6.68c.747-.714 2.013-.714 2.76 0l7 6.68c.394.376.62.904.62 1.448V20Z";
const HOME_FILLED_D =
  "m21.762 8.786-7-6.68a3.994 3.994 0 0 0-5.524 0l-7 6.681A4.017 4.017 0 0 0 1 11.68V19c0 2.206 1.794 4 4 4h3.005a1 1 0 0 0 1-1v-7.003a2.997 2.997 0 0 1 5.994 0V22a1 1 0 0 0 1 1H19c2.206 0 4-1.794 4-4v-7.32a4.02 4.02 0 0 0-1.238-2.894Z";
const SEARCH_OUTLINE_D =
  "M11 1C16.5228 1 21 5.47715 21 11C21 13.4013 20.1529 15.6043 18.7422 17.3281L22.707 21.293C23.0976 21.6835 23.0976 22.3165 22.707 22.707C22.3165 23.0976 21.6835 23.0976 21.293 22.707L17.3281 18.7422C15.6043 20.1529 13.4013 21 11 21C5.47715 21 1 16.5228 1 11C1 5.47715 5.47715 1 11 1ZM11 3C6.58172 3 3 6.58172 3 11C3 15.4183 6.58172 19 11 19C15.4183 19 19 15.4183 19 11C19 6.58172 15.4183 3 11 3Z";
const SEARCH_FILLED_D =
  "M11 1C16.5228 1 21 5.47715 21 11C21 13.2202 20.275 15.2704 19.0508 16.9297L22.5605 20.4395C23.1463 21.0252 23.1463 21.9748 22.5605 22.5605C21.9748 23.1463 21.0252 23.1463 20.4395 22.5605L16.9297 19.0508C15.2704 20.275 13.2202 21 11 21C5.47715 21 1 16.5228 1 11C1 5.47715 5.47715 1 11 1ZM11 4C7.13401 4 4 7.13401 4 11C4 14.866 7.13401 18 11 18C14.866 18 18 14.866 18 11C18 7.13401 14.866 4 11 4Z";

const SHARE_OUTLINE_D =
  "M13.973 20.046 21.77 6.928C22.8 5.195 21.55 3 19.535 3H4.466C2.138 3 .984 5.825 2.646 7.456l4.842 4.752 1.723 7.121c.548 2.266 3.571 2.721 4.762.717Z";

const REPORT_1 =
  "M12.001 15.0625C12.6223 15.0625 13.126 15.5662 13.126 16.1875C13.126 16.8088 12.6223 17.3125 12.001 17.3125C11.3798 17.3123 10.876 16.8087 10.876 16.1875C10.876 15.5663 11.3798 15.0627 12.001 15.0625Z";

const REPORT_2 =
  "M12.001 6.6875C12.5533 6.6875 13.001 7.13522 13.001 7.6875V12.4375C13.001 12.9898 12.5533 13.4375 12.001 13.4375C11.4489 13.4373 11.001 12.9897 11.001 12.4375V7.6875C11.001 7.13534 11.4489 6.6877 12.001 6.6875Z";

const REPORT_3 =
  "M12 1C18.0751 1 23 5.92488 23 12C23 13.6202 22.6483 15.1606 22.0176 16.5479L22.9834 21.8193C23.0425 22.1418 22.9403 22.4737 22.709 22.7061C22.4777 22.9383 22.1469 23.042 21.8242 22.9844L16.5117 22.0342C15.1338 22.6547 13.606 23 12 23C5.92488 23 1 18.0752 1 12C1 5.92481 5.92488 1 12 1ZM12 3C7.02944 3 3 7.02939 3 12C3 16.9706 7.02944 21 12 21C13.414 21 14.7495 20.6748 15.9375 20.0957L16.084 20.0381C16.2347 19.9922 16.3952 19.9818 16.5518 20.0098L20.7559 20.7617L19.9922 16.5928C19.9535 16.3815 19.9842 16.1634 20.0791 15.9707C20.6684 14.7742 21 13.4272 21 12C21 7.02944 16.9706 3 12 3Z";

const BLOCK_D =
  "M12 1C18.0751 1 23 5.92487 23 12C23 18.0751 18.0751 23 12 23C5.92487 23 1 18.0751 1 12C1 5.92487 5.92487 1 12 1ZM4.96875 6.38281C3.73712 7.92249 3 9.87498 3 12C3 16.9706 7.02944 21 12 21C14.125 21 16.0776 20.2618 17.6162 19.0303L4.96875 6.38281ZM12 3C9.875 3 7.92249 3.73712 6.38281 4.96875L19.0303 17.6162C20.2621 16.0776 21 14.125 21 12C21 7.02944 16.9706 3 12 3Z";

const COPY_A =
  "M4.21806 9.21699C4.6086 8.82701 5.24177 8.82671 5.63212 9.21699C6.02227 9.60735 6.02206 10.2406 5.63212 10.6311L4.60282 11.6603C2.53307 13.7303 2.46839 17.0452 4.40849 19.1926L4.60282 19.3967L4.80693 19.591C6.95427 21.5317 10.2696 21.4666 12.3392 19.3967L13.3684 18.3674C13.7591 17.9773 14.3932 17.9779 14.7835 18.3684C15.1735 18.7589 15.1727 19.3921 14.7825 19.7824L13.7532 20.8117C10.8349 23.7283 6.10597 23.7285 3.18876 20.8107C0.270964 17.8934 0.271164 13.1641 3.18876 10.2463L4.21806 9.21699Z";

const COPY_B =
  "M15.2933 7.29316C15.6838 6.90272 16.3168 6.90269 16.7073 7.29316C17.0976 7.68368 17.0977 8.31678 16.7073 8.70722L8.70732 16.7072C8.31688 17.0976 7.68379 17.0975 7.29325 16.7072C6.90274 16.3167 6.90276 15.6837 7.29325 15.2932L15.2933 7.29316Z";

const COPY_C =
  "M10.5247 2.92402C13.4571 0.273656 17.9845 0.362116 20.8108 3.18867L21.0765 3.46699C23.6409 6.30485 23.6406 10.6365 21.0765 13.4748L20.8108 13.7541L19.7825 14.7824C19.392 15.1726 18.7589 15.1728 18.3685 14.7824C17.9782 14.392 17.9783 13.7589 18.3685 13.3684L19.3968 12.34L19.5911 12.1359C21.4693 10.0573 21.4691 6.88499 19.5911 4.80683L19.3968 4.60273C17.3272 2.53299 14.0118 2.46786 11.8645 4.4084L11.6604 4.60273L10.6311 5.63203C10.2406 6.02207 9.60744 6.02225 9.21708 5.63203C8.82685 5.24151 8.82682 4.60742 9.21708 4.21699L10.2464 3.18867L10.5247 2.92402Z";

const USER_MUTE_1 =
  "M11.9997 14C12.552 14 12.9997 14.4477 12.9997 15C12.9997 15.5523 12.552 16 11.9997 16C7.99569 16.0001 4.5971 18.6603 3.45377 22.2998C3.28818 22.8266 2.7267 23.1196 2.19986 22.9541C1.67323 22.7884 1.38015 22.2269 1.54556 21.7002C2.94019 17.2609 7.0873 14.0001 11.9997 14Z";

const USER_MUTE_2 =
  "M20.7926 14.793C21.1831 14.4025 21.8162 14.4026 22.2067 14.793C22.5972 15.1835 22.5972 15.8165 22.2067 16.207L19.9137 18.5L22.2067 20.793C22.5972 21.1835 22.5972 21.8165 22.2067 22.207C21.8162 22.5974 21.1831 22.5975 20.7926 22.207L18.4997 19.9141L16.2067 22.207C15.8162 22.5974 15.1831 22.5975 14.7926 22.207C14.4023 21.8166 14.4023 21.1835 14.7926 14.793C15.1831 14.4025 15.8162 14.4026 16.2067 14.793L18.4997 17.0859L20.7926 14.793Z";

const USER_MUTE_3 =
  "M11.9997 1C15.0373 1 17.4997 3.46244 17.4997 6.5C17.4997 9.53756 15.0373 12 11.9997 12C8.9622 11.9998 6.49967 9.53745 6.49967 6.5C6.49967 3.46255 8.96223 1.00018 11.9997 1ZM11.9997 3C10.0668 3.00018 8.49967 4.56711 8.49967 6.5C8.49967 8.43289 10.0668 9.99982 11.9997 10C13.9327 10 15.4997 8.433 15.4997 6.5C15.4997 4.567 13.9327 3 11.9997 3Z";

const COMMENT_LIKE_D =
  "M9.221 1.795a1 1 0 011.109-.656l1.04.173a4 4 0 013.252 4.784L14 9h4.061a3.664 3.664 0 013.576 2.868A3.68 3.68 0 0121 14.85l.02.087A3.815 3.815 0 0120 18.5v.043l-.01.227a2.82 2.82 0 01-.135.663l-.106.282A3.754 3.754 0 0116.295 22h-3.606l-.392-.007a12.002 12.002 0 01-5.223-1.388l-.343-.189-.27-.154a2.005 2.005 0 00-.863-.26l-.13-.004H3.5a1.5 1.5 0 01-1.5-1.5V12.5A1.5 1.5 0 013.5 11h1.79l.157-.013a1 1 0 00.724-.512l.063-.145 2.987-8.535Zm-1.1 9.196A3 3 0 015.29 13H4v4.998h1.468a4 4 0 011.986.528l.27.155.285.157A10 10 0 0012.69 20h3.606c.754 0 1.424-.483 1.663-1.2l.03-.126a.819.819 0 00.012-.131v-.872l.587-.586c.388-.388.577-.927.523-1.465l-.038-.23-.02-.087-.21-.9.55-.744A1.663 1.663 0 0018.061 11H14a2.002 2.002 0 01-1.956-2.418l.623-2.904a2 2 0 00-1.626-2.392l-.21-.035-2.71 7.741Z";

const COMMENT_LIKE_FILLED_D =
  "M9.221 1.795a1 1 0 011.109-.656l1.04.173a4 4 0 013.252 4.784L14 9h4.061a3.664 3.664 0 013.576 2.868A3.68 3.68 0 0121 14.85l.02.087A3.815 3.815 0 0120 18.5v.043l-.01.227a2.82 2.82 0 01-.135.663l-.106.282A3.754 3.754 0 0116.295 22h-3.606l-.392-.007a12.002 12.002 0 01-5.223-1.388l-.343-.189-.27-.154a2.005 2.005 0 00-.863-.26l-.13-.004H3.5a1.5 1.5 0 01-1.5-1.5V12.5A1.5 1.5 0 013.5 11h1.79l.157-.013a1 1 0 00.724-.512l.063-.145 2.987-8.535Z";

const COMMENT_DISLIKE_D =
  "m11.31 2 .392.007c1.824.06 3.61.534 5.223 1.388l.343.189.27.154c.264.152.56.24.863.26l.13.004H20.5a1.5 1.5 0 011.5 1.5V11.5a1.5 1.5 0 01-1.5 1.5h-1.79l-.158.013a1 1 0 00-.723.512l-.064.145-2.987 8.535a1 1 0 01-1.109.656l-1.04-.174a4 4 0 01-3.251-4.783L10 15H5.938a3.664 3.664 0 01-3.576-2.868A3.682 3.682 0 013 9.15l-.02-.088A3.816 3.816 0 014 5.5v-.043l.008-.227a2.86 2.86 0 01.136-.664l.107-.28A3.754 3.754 0 017.705 2h3.605ZM7.705 4c-.755 0-1.425.483-1.663 1.2l-.032.126a.818.818 0 00-.01.131v.872l-.587.586a1.816 1.816 0 00-.524 1.465l.038.23.02.087.21.9-.55.744a1.686 1.686 0 00-.321 1.18l.029.177c.17.76.844 1.302 1.623 1.302H10a2.002 2.002 0 011.956 2.419l-.623 2.904-.034.208a2.002 2.002 0 001.454 2.139l.206.045.21.035 2.708-7.741A3.001 3.001 0 0118.71 11H20V6.002h-1.47c-.696 0-1.38-.183-1.985-.528l-.27-.155-.285-.157A10.002 10.002 0 0011.31 4H7.705Z";

const COMMENT_DISLIKE_FILLED_D =
  "m11.31 2 .392.007c1.824.06 3.61.534 5.223 1.388l.343.189.27.154c.264.152.56.24.863.26l.13.004H20.5a1.5 1.5 0 011.5 1.5V11.5a1.5 1.5 0 01-1.5 1.5h-1.79l-.158.013a1 1 0 00-.723.512l-.064.145-2.987 8.535a1 1 0 01-1.109.656l-1.04-.174a4 4 0 01-3.251-4.783L10 15H5.938a3.664 3.664 0 01-3.576-2.868A3.682 3.682 0 013 9.15l-.02-.088A3.816 3.816 0 014 5.5v-.043l.008-.227a2.86 2.86 0 01.136-.664l.107-.28A3.754 3.754 0 017.705 2h3.605Z";

/** Single user (tag people) — 24×24 filled */
const PERSON_D =
  "M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z";

/** Two people (collaborator) — 24×24 filled */
const PEOPLE_TWO_D =
  "M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 3-1.34 3-3S9.66 5 8 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z";

/** Map pin — 24×24 filled */
const LOCATION_PIN_D =
  "M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5S10.62 6.5 12 6.5s2.5 1.12 2.5 2.5S13.38 11.5 12 11.5z";

/** Music note — 24×24 filled */
const MUSIC_NOTE_D =
  "M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z";

const EYE_OPEN_OUTER =
  "M2.062 12.348a1 1 0 010-.696 10.75 10.75 0 0119.876 0 1 1 0 01-.87 1.696 10.75 10.75 0 00-18.136 0 1 1 0 01-.868 1.696z";

const EYE_OFF_STRIKE =
  "M10.733 5.076a10.744 10.744 0 0111.205 6.575 1 1 0 010 .696 10.747 10.747 0 01-1.988 3.074m0 0L2.062 12.348m15.087 3.297a10.752 10.752 0 01-6.274 4.034 10.738 10.738 0 01-4.65 0 10.752 10.752 0 01-6.274-4.034m15.087-3.297L2.062 12.348";

const EYE_OFF_SLASH = "M22 2 2 22";

function Glyphs({ name, color }: { name: XStyleGlyphName; color: string }) {
  switch (name) {
    case "reply":
      return (
        <path fill={color} fillRule="evenodd" clipRule="evenodd" d={REPLY_D} />
      );
    case "heartOutline":
      return <path fill={color} d={HEART_OUTLINE} />;
    case "heartFilled":
      return <path fill={color} d={HEART_FILLED} />;
    case "bell":
      return (
        <path fill={color} fillRule="evenodd" clipRule="evenodd" d={BELL_D} />
      );
    case "moreHorizontal":
      return (
        <g>
          <circle cx={6} cy={12} r={1.5} fill={color} />
          <circle cx={12} cy={12} r={1.5} fill={color} />
          <circle cx={18} cy={12} r={1.5} fill={color} />
        </g>
      );
    case "moreInCircle":
      return (
        <g>
          <path
            fill={color}
            fillRule="evenodd"
            clipRule="evenodd"
            d={MORE_CIRCLE_OUT}
          />
          <path d={MORE_CIRCLE_3D} fill={color} />
          <path d={MORE_CIRCLE_3M} fill={color} />
          <path d={MORE_CIRCLE_3R} fill={color} />
        </g>
      );
    case "report":
      return (
        <g>
          <path d={REPORT_1} fill={color} />
          <path d={REPORT_2} fill={color} />
          <path
            d={REPORT_3}
            fill={color}
            fillRule="evenodd"
            clipRule="evenodd"
          />
        </g>
      );
    case "block":
      return (
        <path fill={color} fillRule="evenodd" clipRule="evenodd" d={BLOCK_D} />
      );
    case "copyLink":
      return (
        <g>
          <path d={COPY_A} fill={color} />
          <path d={COPY_B} fill={color} />
          <path d={COPY_C} fill={color} />
        </g>
      );
    case "userMute":
      return (
        <g>
          <path
            d={USER_MUTE_1}
            fill={color}
            fillRule="evenodd"
            clipRule="evenodd"
          />
          <path
            d={USER_MUTE_2}
            fill={color}
            fillRule="evenodd"
            clipRule="evenodd"
          />
          <path
            d={USER_MUTE_3}
            fill={color}
            fillRule="evenodd"
            clipRule="evenodd"
          />
        </g>
      );
    case "sharePost":
      return (
        <g>
          <path
            d={SHARE_OUTLINE_D}
            fill="none"
            stroke={color}
            strokeWidth={2}
            strokeLinejoin="round"
          />
          <line
            x1={7.488}
            y1={12.208}
            x2={15.515}
            y2={7.641}
            fill="none"
            stroke={color}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>
      );
    case "saveOutline":
      return <path fill={color} d={SAVE_D} />;
    case "saveFilled":
      return (
        <path
          fill={color}
          fillRule="evenodd"
          clipRule="evenodd"
          d={SAVE_FILLED_D}
        />
      );
    case "homeOutline":
      return <path fill={color} d={HOME_OUTLINE_D} />;
    case "homeFilled":
      return <path fill={color} d={HOME_FILLED_D} />;
    case "searchOutline":
      return (
        <path
          fill={color}
          fillRule="evenodd"
          clipRule="evenodd"
          d={SEARCH_OUTLINE_D}
        />
      );
    case "searchFilled":
      return (
        <path
          fill={color}
          fillRule="evenodd"
          clipRule="evenodd"
          d={SEARCH_FILLED_D}
        />
      );
    case "commentLikeOutline":
      return <path fill={color} d={COMMENT_LIKE_D} />;
    case "commentLikeFilled":
      return <path fill={color} d={COMMENT_LIKE_FILLED_D} />;
    case "commentDislikeOutline":
      return <path fill={color} d={COMMENT_DISLIKE_D} />;
    case "commentDislikeFilled":
      return <path fill={color} d={COMMENT_DISLIKE_FILLED_D} />;
    case "person":
      return <path fill={color} d={PERSON_D} />;
    case "peopleTwo":
      return <path fill={color} d={PEOPLE_TWO_D} />;
    case "locationPin":
      return <path fill={color} d={LOCATION_PIN_D} />;
    case "musicNote":
      return <path fill={color} d={MUSIC_NOTE_D} />;
    case "eyeOpen":
      return (
        <g>
          <path fill={color} d={EYE_OPEN_OUTER} />
          <circle cx={12} cy={12} r={3} fill={color} />
        </g>
      );
    case "eyeOff":
      return (
        <g>
          <path
            fill="none"
            stroke={color}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            d={EYE_OFF_STRIKE}
          />
          <path
            fill="none"
            stroke={color}
            strokeWidth={2}
            strokeLinecap="round"
            d={EYE_OFF_SLASH}
          />
        </g>
      );
    default: {
      const _exhaust: never = name;
      return _exhaust;
    }
  }
}

const VIEWBOX: Record<XStyleGlyphName, string> = {
  reply: "0 0 24 24",
  heartOutline: "0 0 24 24",
  heartFilled: "0 0 48 48",
  bell: "0 0 24 24",
  moreHorizontal: "0 0 24 24",
  moreInCircle: "0 0 24 24",
  report: "0 0 24 24",
  block: "0 0 24 24",
  copyLink: "0 0 24 24",
  userMute: "0 0 24 24",
  saveOutline: "0 0 24 24",
  saveFilled: "0 0 24 24",
  homeOutline: "0 0 24 24",
  homeFilled: "0 0 24 24",
  searchOutline: "0 0 24 24",
  searchFilled: "0 0 24 24",
  sharePost: "0 0 24 24",
  commentLikeOutline: "0 0 24 24",
  commentLikeFilled: "0 0 24 24",
  commentDislikeOutline: "0 0 24 24",
  commentDislikeFilled: "0 0 24 24",
  person: "0 0 24 24",
  peopleTwo: "0 0 24 24",
  locationPin: "0 0 24 24",
  musicNote: "0 0 24 24",
  eyeOpen: "0 0 24 24",
  eyeOff: "0 0 24 24",
};

export type XStyleGlyphProps = {
  name: XStyleGlyphName;
  size?: number;
  /** Overrides theme `iconPrimary` when set */
  color?: string;
  className?: string;
  /** Values under 1 shrink the vector inside the `size` box */
  contentScale?: number;
  title?: string;
} & Omit<SVGProps<SVGSVGElement>, "width" | "height" | "viewBox" | "children">;

export const XStyleGlyph = memo(function XStyleGlyph({
  name,
  size = 24,
  color,
  className,
  contentScale = 1,
  title,
  ...svgProps
}: XStyleGlyphProps) {
  const { resolvedTheme } = useTheme();
  const fillColor = color ?? iconPrimaryForTheme(resolvedTheme);
  const inner = size * contentScale;

  return (
    <svg
      width={inner}
      height={inner}
      viewBox={VIEWBOX[name]}
      preserveAspectRatio="xMidYMid meet"
      className={className}
      style={{ display: "block", flexShrink: 0 }}
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
      {...svgProps}
    >
      {title ? <title>{title}</title> : null}
      <Glyphs name={name} color={fillColor} />
    </svg>
  );
});
