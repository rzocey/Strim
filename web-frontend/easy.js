const svgBase = (p, w = 24, h = w, attrs = "", vb = "0 0 24 24") =>
  '<svg width="' +
  w +
  '" height="' +
  h +
  '" viewBox="' +
  vb +
  '"' +
  attrs +
  ">" +
  p +
  "</svg>";
const svgStroke = (p, w = 24, h = w, sw = 2, extra = "") => {
  const ex = extra ? " " + extra : "";
  return svgBase(
    p,
    w,
    h,
    ' fill="none" stroke="currentColor" stroke-width="' +
      sw +
      '" stroke-linecap="round" stroke-linejoin="round"' +
      ex,
  );
};
const svgFill = (p, w = 24, h = w, extra = "") => {
  const ex = extra ? " " + extra : "";
  return svgBase(p, w, h, ' fill="currentColor"' + ex);
};
const BOX_RECT = '<rect width="18" height="18" x="3" y="3" rx="2"/>';
const svgBoxBtn = (
  p,
  w = 18,
  h = w,
  sw = 2,
  extra = 'style="flex-shrink:0;"',
) => svgStroke(BOX_RECT + p, w, h, sw, extra);
const COMPANY_PATH =
  '<rect width="18" height="20" x="3" y="2" rx="2"/><path fill="currentColor" stroke="none" d="M6.5 5h2.5v2H6.5zm4.25 0h2.5v2h-2.5zm4.25 0h2.5v2H15zM6.5 9h2.5v2H6.5zm4.25 0h2.5v2h-2.5zm4.25 0h2.5v2H15zM6.5 13h2.5v2H6.5zm4.25 0h2.5v2h-2.5zm4.25 0h2.5v2H15zM9 17h6v5H9z"/>';
const STAR_SVG = (w = 12, h = w, color = "currentColor") =>
  svgBase(
    '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
    w,
    h,
    ' fill="' +
      color +
      '" stroke="' +
      color +
      '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"',
  );
STAR_SVG.toString = () => STAR_SVG(12, 12);
const CHECK_SVG = (w = 13, h = w) =>
  svgStroke(
    '<polyline points="20 6 9 17 4 12"/>',
    w,
    h,
    2.8,
    'style="flex-shrink:0;"',
  );
CHECK_SVG.toString = () => CHECK_SVG(13, 13);
const PLUS_SVG = (w = 13, h = w, sw = 4) =>
  svgStroke(
    '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
    w,
    h,
    sw,
    'style="flex-shrink:0;"',
  );
PLUS_SVG.toString = () => PLUS_SVG(13, 13);
const TRASH_SVG = svgStroke(
  '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="9" x2="9" y1="10" y2="18" stroke-width="1.5"/><line x1="12" x2="12" y1="10" y2="18" stroke-width="1.5"/><line x1="15" x2="15" y1="10" y2="18" stroke-width="1.5"/>',
  18,
);
const GRID_VIEW_SVG = svgBoxBtn(
  '<rect width="5.5" height="5.5" x="5.5" y="5.5" rx="1" fill="currentColor" stroke="none"/><rect width="5.5" height="5.5" x="13" y="5.5" rx="1" fill="currentColor" stroke="none"/><rect width="5.5" height="5.5" x="5.5" y="13" rx="1" fill="currentColor" stroke="none"/><rect width="5.5" height="5.5" x="13" y="13" rx="1" fill="currentColor" stroke="none"/>',
  24,
  24,
  2,
  "",
);
const LIST_VIEW_SVG = svgBoxBtn(
  '<rect width="13" height="3" x="5.5" y="5.5" rx="1" fill="currentColor" stroke="none"/><rect width="13" height="3" x="5.5" y="10.5" rx="1" fill="currentColor" stroke="none"/><rect width="13" height="3" x="5.5" y="15.5" rx="1" fill="currentColor" stroke="none"/>',
  24,
  24,
  2,
  "",
);
const MIN_VIEW_SVG = svgBoxBtn(
  '<rect width="13" height="3" x="5.5" y="10.5" rx="1" fill="currentColor" stroke="none"/>',
  24,
  24,
  2,
  "",
);
const PICTURE_SVG = svgStroke(
  '<rect width="20" height="20" x="2" y="2" rx="2"/><rect width="5" height="6.5" x="9.5" y="6" rx="2.5"/><path d="M6.5 19a5.5 5.5 0 0 1 11 0"/>',
  18,
);
const COMPANY_SVG = svgStroke(COMPANY_PATH, 32);
const EYE_SVG = (w = 13, h = w, crossed = false) => {
  const cross = crossed ? '<line x1="4" y1="4" x2="20" y2="20"/>' : "";
  return svgStroke(
    '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>' +
      cross,
    w,
    h,
    2.5,
    'style="flex-shrink:0;"',
  );
};
EYE_SVG.toString = () => EYE_SVG(13, 13);
const TRI_ARROW_SVG = (d, w = 17, h = w) =>
  svgFill('<path d="' + d + '"/>', w, h);
const YT_SVG = (w = 20, h = w) =>
  svgBase(
    '<path fill="var(--path1, #ffffff)" d="M2.5 17a24.12 24.12 0 0 1 0-10 2 2 0 0 1 1.4-1.4 49.56 49.56 0 0 1 16.2 0A2 2 0 0 1 21.5 7a24.12 24.12 0 0 1 0 10 2 2 0 0 1-1.4 1.4 49.55 49.55 0 0 1-16.2 0A2 2 0 0 1 2.5 17z"/><polygon points="10 8.5 16 12 10 15.5" fill="var(--path2, #000000)"/>',
    w,
    h,
    ' fill="none" style="flex-shrink:0;"',
  );
YT_SVG.toString = () => YT_SVG(20, 20);
const DOTS_HTML =
  '<div class="dots-loader"><span class="dot"></span><span class="dot"></span><span class="dot"></span></div>';
const PLAY_BTN_SVG = (w = 18, h = w) =>
  svgBoxBtn(
    '<polygon points="9.5 7.5 16.5 12 9.5 16.5" fill="currentColor" stroke="none"/>',
    w,
    h,
  );
const PAUSE_BTN_SVG = (w = 18, h = w) =>
  svgBoxBtn(
    '<line x1="9.5" y1="7.5" x2="9.5" y2="16.5" stroke-width="3"/><line x1="14.5" y1="7.5" x2="14.5" y2="16.5" stroke-width="3"/>',
    w,
    h,
  );
const ANIME_BTN_SVG = (w = 18, h = w) =>
  svgBoxBtn(
    '<path d="M7.5 7.5h9l-3.1 4.3M11.7 10c0 3.4-1.25 5.3-3.4 6.5"/>',
    w,
    h,
  );
const EXPLORE_SEARCH_SVG = (w = 18, h = w) =>
  svgBoxBtn(
    '<circle cx="11" cy="11" r="3.5"/><path d="m16.5 16.5-3-3"/>',
    w,
    h,
  );
const GALLERY_BTN_SVG = (w = 18, h = w) =>
  svgBoxBtn('<rect width="8" height="8" x="8" y="8" rx="1"/>', w, h);
const INFO_BTN_SVG = (w = 18, h = w) =>
  svgBoxBtn(
    '<circle cx="12" cy="7.5" r="1.25" fill="currentColor" stroke="none"/><path d="M12 10v7"/>',
    w,
    h,
  );
const EXPAND_LEFT_SVG = (w = 18, h = w) =>
  svgStroke('<path d="m15 18-6-6 6-6"/>', w, h, 2, 'style="flex-shrink:0;"');
const EXPAND_RIGHT_SVG = (w = 18, h = w) =>
  svgStroke('<path d="m9 18 6-6-6-6"/>', w, h, 2, 'style="flex-shrink:0;"');
const EXPAND_DOWN_SVG = (w = 18, h = w) =>
  svgStroke('<path d="m6 9 6 6 6-6"/>', w, h, 2, 'style="flex-shrink:0;"');
const EXPAND_UP_SVG = (w = 18, h = w) =>
  svgStroke('<path d="m18 15-6-6-6 6"/>', w, h, 2, 'style="flex-shrink:0;"');
const POPOVER_CHECK_SVG = svgStroke(
  '<polyline points="20 6 9 17 4 12"/>',
  15,
  15,
  2.5,
);
const FILTER_BTN_SVG = (w = 18, h = w) =>
  svgBoxBtn(
    '<path d="M6 8h12"/><path d="M8 12h8"/><path d="M10 16h4"/>',
    w,
    h,
    2,
    "",
  );
const LUCKY_DICE_SVG = (w = 18, h = w) =>
  svgBoxBtn(
    '<circle cx="8" cy="8" r="2.25" fill="currentColor" stroke="none"/><circle cx="16" cy="8" r="2.25" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="2.25" fill="currentColor" stroke="none"/><circle cx="8" cy="16" r="2.25" fill="currentColor" stroke="none"/><circle cx="16" cy="16" r="2.25" fill="currentColor" stroke="none"/>',
    w,
    h,
    2,
    "",
  );
const SORT_DESC_SVG = (w = 10, h = w) =>
  svgFill('<path d="M12 4l9 14H3z"/>', w, h);
const SORT_ASC_SVG = (w = 10, h = w) =>
  svgFill('<path d="M12 20L3 6h18z"/>', w, h);
const TV_CARD_SVG = (w = 26, h = w) =>
  svgStroke(
    '<path d="m16 2-4 4.5L8 2"/><rect width="20" height="13" x="2" y="6.5" rx="2.5"/><path d="M6 22h12"/>',
    w,
    h,
  );
const MOVIE_CARD_SVG = (w = 26, h = w) =>
  svgStroke(
    '<rect width="20" height="20" x="2" y="2" rx="3"/><path d="M7 2v20M17 2v20M2 6h5M17 6h5M2 10h5M17 10h5M2 14h5M17 14h5M2 18h5M17 18h5"/><polygon fill="currentColor" stroke="currentColor" stroke-width="1" points="10 9 15 12 10 15"/>',
    w,
    h,
  );
const W_BACK_SVG = (w = 24, h = w) =>
  svgStroke(
    '<path d="M10 8V5a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-7a2 2 0 0 1-2-2v-3"/><polyline points="7 7 2 12 7 17"/><line x1="2" y1="12" x2="16" y2="12"/>',
    w,
    h,
  );
const W_REFRESH_SVG = (w = 21, h = w) =>
  svgStroke(
    '<path d="M21 12a9 9 0 1 1-2.6-6.4L21 8"/><path d="M21 3v5h-5"/>',
    w,
    h,
  );
const W_MENU_SVG = (w = 21, h = w) =>
  svgStroke(
    '<path d="M3 2v1a1 1 0 0 0 1 1h16a1 1 0 0 1 1-1V2M3 22v-1a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v1"/><rect width="18" height="10" x="3" y="7" rx="2"/>',
    w,
    h,
  );
const W_GEAR_SVG = (w = 17, h = w) =>
  svgStroke(
    '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
    w,
    h,
  );
const W_PREV_SVG = (w = 21, h = w) =>
  svgStroke('<path d="M19 12H5m6-6-6 6 6 6"/>', w, h, 2.3);
const W_NEXT_SVG = (w = 21, h = w) =>
  svgStroke('<path d="M5 12h14m-6-6 6 6-6 6"/>', w, h, 2.3);
const W_FS_SVG = (w = 21, h = w) =>
  svgStroke(
    '<path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>',
    w,
    h,
  );
const ARROW_LEFT_SVG = svgBoxBtn(
  '<path d="M16 12H8m4-4-4 4 4 4"/>',
  14,
  14,
  2,
  "",
);
const ARROW_RIGHT_SVG = svgBoxBtn(
  '<path d="M8 12h8m-4-4 4 4-4 4"/>',
  14,
  14,
  2,
  "",
);
const CAST_PLACEHOLDER_SVG =
  '<div class="si-cast-placeholder">' +
  svgBoxBtn(
    '<rect width="5" height="6.5" x="9.5" y="6.5" rx="2.5"/><path d="M6.5 18.5a5.5 5.5 0 0 1 11 0"/>',
    38,
    38,
    1.8,
    "",
  ) +
  "</div>";
const SWITCH_TITLES_SVG = svgStroke(
  '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  18,
  18,
);
const SWITCH_EPISODES_SVG = W_MENU_SVG(18);
const SWITCH_BROWSING_SVG = svgStroke(
  '<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>',
  18,
  18,
);
const OPTIONS_ITEMS_DATA = [
  [
    "history",
    "History",
    "",
    '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
    "currentColor",
  ],
  [
    "blocklist",
    "Blocklist",
    "",
    '<circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>',
    "currentColor",
  ],
  [
    "customize",
    "Customize",
    "",
    '<path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>',
    "currentColor",
  ],
  [
    "storage",
    "Data & Storage",
    "",
    '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 1.66 4.03 3 9 3s9-1.34 9-3V5"/><path d="M3 10c0 1.66 4.03 3 9 3s9-1.34 9-3"/><path d="M3 15c0 1.66 4.03 3 9 3s9-1.34 9-3"/>',
    "currentColor",
  ],
  [
    "github",
    "GitHub Page",
    "",
    '<path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8"/>',
    "currentColor",
    "0 0 16 16",
    true,
  ],
  [
    "about",
    "Disclaimer",
    "",
    '<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>',
    "currentColor",
  ],
];
const STATIC_ICONS = {
  back: svgStroke('<path d="M19 12H5M12 19l-7-7 7-7"/>', 22, 22, 2.5),
  home: svgStroke(
    '<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7h-6v7H4a1 1 0 0 1-1-1z"/>',
    22,
  ),
  explore: svgStroke(
    '<circle cx="12" cy="12" r="10"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10zM2 12h20M4.93 5.93h14.14M4.93 18.07h14.14"/>',
    22,
  ),
  mylist: svgFill(
    '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
    22,
    22,
    'style="flex-shrink:0;"',
  ),
  search: svgStroke(
    '<circle cx="10.5" cy="10.5" r="7.5"/><path d="m21 21-5.2-5.2"/>',
    22,
    22,
    2.4,
  ),
  options: svgBase(
    '<rect width="16" height="2.5" x="4" y="3.75" rx="1"/><rect width="3.5" height="7" x="6" y="1.5" rx="1"/><rect width="16" height="2.5" x="4" y="13.75" rx="1"/><rect width="3.5" height="7" x="14" y="11.5" rx="1"/><rect width="16" height="2.5" x="4" y="23.75" rx="1"/><rect width="3.5" height="7" x="9" y="21.5" rx="1"/>',
    18,
    22,
    ' fill="currentColor" stroke="none"',
    "0 0 24 30",
  ),
  "col-nav": svgStroke(
    '<circle cx="12" cy="12" r="10"/><path d="m15 9-6 6M9 9l6 6"/>',
    24,
    24,
    2.2,
  ),
  "sort-desc": SORT_DESC_SVG(10),
  "sort-asc": SORT_ASC_SVG(10),
  "clear-sm": svgStroke(
    '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
    13,
    13,
    2.5,
    'style="display:block;"',
  ),
  "edit-sm": svgStroke(
    '<path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>',
    15,
  ),
  "edit-hub": svgStroke(
    '<path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>',
    24,
  ),
  "plus-sm": svgStroke(
    '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
    15,
    15,
    2.5,
  ),
  "plus-md": svgStroke(
    '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
    18,
    18,
    2.5,
  ),
  "star-hub": STAR_SVG(28, 28, "#378EF0"),
  trailer: YT_SVG(20, 20),
  watched: EYE_SVG(20, 20, true),
  "arrow-left": ARROW_LEFT_SVG,
  "arrow-right": ARROW_RIGHT_SVG,
  "back-seasons": W_BACK_SVG(21),
  "scroll-top": svgFill(
    '<path d="M13.5 21a1.5 1.5 0 0 1-3 0V7.83l-4.88 4.88a1.5 1.5 0 1 1-2.12-2.12l7.5-7.5a1.5 1.5 0 0 1 2.12 0l7.5 7.5a1.5 1.5 0 1 1-2.12 2.12L13.5 7.83z"/>',
    18,
  ),
  "expand-right": EXPAND_RIGHT_SVG(18, 18),
  "switch-tv": TV_CARD_SVG(18),
  "switch-movie": MOVIE_CARD_SVG(18),
  "switch-company": svgStroke(COMPANY_PATH, 18, 20),
  "switch-person": PICTURE_SVG,
  "switch-episodes": SWITCH_EPISODES_SVG,
  "switch-browsing": SWITCH_BROWSING_SVG,
  "plus-si": PLUS_SVG(15),
  "person-bio-placeholder": svgStroke(
    '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    32,
  ),
  "map-pin": svgStroke(
    '<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>',
    15,
    15,
    2,
    'style="flex-shrink:0;"',
  ),
};
if (typeof window !== "undefined") {
  window.app = window.app || {};
  window.app.renderStaticIcons = function () {
    document.querySelectorAll("[data-icon]").forEach((el) => {
      if (el.querySelector("svg")) return;
      const k = el.getAttribute("data-icon");
      if (STATIC_ICONS[k]) el.insertAdjacentHTML("afterbegin", STATIC_ICONS[k]);
    });
  };
  window.svgStroke = svgStroke;
  window.svgFill = svgFill;
  window.STAR_SVG = STAR_SVG;
  window.CHECK_SVG = CHECK_SVG;
  window.PLUS_SVG = PLUS_SVG;
  window.TRASH_SVG = TRASH_SVG;
  window.GRID_VIEW_SVG = GRID_VIEW_SVG;
  window.LIST_VIEW_SVG = LIST_VIEW_SVG;
  window.MIN_VIEW_SVG = MIN_VIEW_SVG;
  window.PICTURE_SVG = PICTURE_SVG;
  window.COMPANY_SVG = COMPANY_SVG;
  window.EYE_SVG = EYE_SVG;
  window.TRI_ARROW_SVG = TRI_ARROW_SVG;
  window.YT_SVG = YT_SVG;
  window.DOTS_HTML = DOTS_HTML;
  window.PLAY_BTN_SVG = PLAY_BTN_SVG;
  window.PAUSE_BTN_SVG = PAUSE_BTN_SVG;
  window.ANIME_BTN_SVG = ANIME_BTN_SVG;
  window.EXPLORE_SEARCH_SVG = EXPLORE_SEARCH_SVG;
  window.GALLERY_BTN_SVG = GALLERY_BTN_SVG;
  window.INFO_BTN_SVG = INFO_BTN_SVG;
  window.EXPAND_LEFT_SVG = EXPAND_LEFT_SVG;
  window.EXPAND_RIGHT_SVG = EXPAND_RIGHT_SVG;
  window.EXPAND_DOWN_SVG = EXPAND_DOWN_SVG;
  window.EXPAND_UP_SVG = EXPAND_UP_SVG;
  window.POPOVER_CHECK_SVG = POPOVER_CHECK_SVG;
  window.FILTER_BTN_SVG = FILTER_BTN_SVG;
  window.LUCKY_DICE_SVG = LUCKY_DICE_SVG;
  window.SORT_DESC_SVG = SORT_DESC_SVG;
  window.SORT_ASC_SVG = SORT_ASC_SVG;
  window.TV_CARD_SVG = TV_CARD_SVG;
  window.MOVIE_CARD_SVG = MOVIE_CARD_SVG;
  window.W_BACK_SVG = W_BACK_SVG;
  window.W_REFRESH_SVG = W_REFRESH_SVG;
  window.W_MENU_SVG = W_MENU_SVG;
  window.W_GEAR_SVG = W_GEAR_SVG;
  window.W_PREV_SVG = W_PREV_SVG;
  window.W_NEXT_SVG = W_NEXT_SVG;
  window.W_FS_SVG = W_FS_SVG;
  window.ARROW_LEFT_SVG = ARROW_LEFT_SVG;
  window.ARROW_RIGHT_SVG = ARROW_RIGHT_SVG;
  window.CAST_PLACEHOLDER_SVG = CAST_PLACEHOLDER_SVG;
  window.SWITCH_TITLES_SVG = SWITCH_TITLES_SVG;
  window.SWITCH_EPISODES_SVG = SWITCH_EPISODES_SVG;
  window.OPTIONS_ITEMS_DATA = OPTIONS_ITEMS_DATA;
  window.STATIC_ICONS = STATIC_ICONS;
}
