const TApi = "TMDB_API";
const FApi = "FANART.TV_API";
const OApi = "OMDB_API";
const MApi = "MAL_API";
const ANILIST_URL = "https://graphql.anilist.co";
const BASE_URL = "https://api.themoviedb.org/3";
const IMG_BASE = "https://image.tmdb.org/t/p/";
var app = {
  tmdbCache: {},
  apiInFlight: {},
  showDetailsCache: {},
  episodeCache: {},
  omdbRatingsCache: {},
  omdbInFlight: {},
  omdbPrimaryExhausted: false,
  cardItemCache: {},
  logoCache: {},
  logoInFlight: {},
  countryCache: {},
  ratingCache: {},
  starRatingCache: {},
  compNetCache: {},
  tvTypeCache: {},
  deadIds: new Set(),
  siReqId: 0,
  metaQueue: [],
  metaPending: null,
  metaActive: 0,
  saveMetaTimer: null,
  toastTimer: null,
  blocklist: [],
  catBlocklist: [],
  blockRulePairs: [
    ["genres", "genre"],
    ["genre2s", "genre2"],
    ["years", "year"],
    ["countries", "country"],
    ["persons", "person"],
    ["compNets", "compNet"],
  ],
  blockKeys: ["genre", "genre2", "year", "country", "compNet", "person"],
  blockMulti: {
    genre: [],
    genre2: [],
    year: [],
    country: [],
    compNet: [],
    person: [],
  },
  antiSpoiler: false,
  genres: { movie: [], tv: [] },
  countryMap: {},
  countriesList: [],
  languageMap: {},
  languagesList: [],
  customApiKeys: { tmdb: "", mal: "", fanart: "", omdb: "" },
  disabledServers: { embed: [], anime: [] },
  customServers: [],
  getTmdbKey() {
    return this.customApiKeys && this.customApiKeys.tmdb
      ? this.customApiKeys.tmdb
      : TApi;
  },
  getTmdbMediaKey() {
    return this.customApiKeys && this.customApiKeys.tmdb
      ? this.customApiKeys.tmdb
      : TApi;
  },
  getTmdbAnimeKey() {
    return this.customApiKeys && this.customApiKeys.tmdb
      ? this.customApiKeys.tmdb
      : TApi;
  },
  getFanartKey() {
    return this.customApiKeys && this.customApiKeys.fanart
      ? this.customApiKeys.fanart
      : FApi;
  },
  getMalKey() {
    return this.customApiKeys && this.customApiKeys.mal
      ? this.customApiKeys.mal
      : MApi;
  },
  getOmdbKey() {
    return this.customApiKeys && this.customApiKeys.omdb
      ? this.customApiKeys.omdb
      : OApi;
  },
  async fetchOmdb(queryStr) {
    const key = this.getOmdbKey();
    if (!key || this.omdbPrimaryExhausted) return null;
    const fetchWithTimeout = async (url) => {
      let tId = null;
      const ctrl =
        typeof AbortController !== "undefined" ? new AbortController() : null;
      const hasAbortTimeout =
        typeof AbortSignal !== "undefined" &&
        typeof AbortSignal.timeout === "function";
      const sig = hasAbortTimeout
        ? AbortSignal.timeout(2500)
        : ctrl
          ? ctrl.signal
          : undefined;
      if (!hasAbortTimeout && ctrl) tId = setTimeout(() => ctrl.abort(), 2500);
      try {
        return await fetch(url, sig ? { signal: sig } : {});
      } finally {
        if (tId) clearTimeout(tId);
      }
    };
    try {
      const res = await fetchWithTimeout(
        `https://www.omdbapi.com/?${queryStr}&apikey=${key}`,
      );
      if (res.ok) {
        const data = await res.json();
        if (data && /limit/i.test(data.Error || "")) {
          this.omdbPrimaryExhausted = true;
        } else {
          return data;
        }
      } else if (
        res.status === 401 ||
        res.status === 403 ||
        res.status === 429
      ) {
        this.omdbPrimaryExhausted = true;
      }
    } catch (e) {}
    return null;
  },
  getItemYear(item) {
    if (!item) return "";
    return String(
      item.year || item.release_date || item.first_air_date || "",
    ).substring(0, 4);
  },
  getRawTvType(item, fallbackId) {
    if (!item) return "";
    const id = item.id || fallbackId;
    return (
      item.show_type ||
      item.type_str ||
      (item.type && item.type.toLowerCase() !== "tv" ? item.type : "") ||
      (id ? this.tvTypeCache?.[`tv_${id}`] || this.tvTypeCache?.[id] : "") ||
      ""
    );
  },
  toCardSummary(item, typeOverride = null) {
    if (!item) return null;
    const type =
      typeOverride || item.media_type || (item.name ? "tv" : "movie");
    const rawTvType = type === "tv" ? this.getRawTvType(item) : "";
    const summary = {
      id: item.id,
      title: item.title || item.name || "",
      media_type: type,
      type: type,
      show_type: rawTvType || item.show_type || "",
      poster_path: item.poster_path || "",
      year: this.getItemYear(item),
      country: item.country || this.getCountryCode(item) || "",
      original_language: item.original_language || item.language || "",
    };
    if (item.addedAt) summary.addedAt = item.addedAt;
    if (item.ani_id) summary.ani_id = item.ani_id;
    if (item.mal_id) summary.mal_id = item.mal_id;
    return summary;
  },
  IMG_SIZES: {
    poster: { low: "w154", mid: "w185", vhigh: "w500", def: "w342" },
    backdrop: { low: "w300", mid: "w780", def: "w1280" },
    logo: { low: "w154", mid: "w185", vhigh: "w500", def: "w300" },
    still: { low: "w185", mid: "w300", vhigh: "w780", def: "w500" },
    ani: { low: "medium", vhigh: "extraLarge", def: "large" },
  },
  getImageSize(type, quality) {
    const cfg = this.IMG_SIZES[type] || this.IMG_SIZES.poster;
    return cfg[quality] || cfg.def;
  },
  getImg(path, type = "poster") {
    if (!path) return "";
    if (typeof path === "object") return this.getAniCover(path);
    if (
      path.startsWith("http://") ||
      path.startsWith("https://") ||
      path.startsWith("data:")
    )
      return path;
    const clean = path.startsWith("/") ? path : `/${path}`;
    const qKey =
      type === "backdrop"
        ? "backdropQuality"
        : type === "logo"
          ? "logoQuality"
          : "posterQuality";
    const q = this.uiPrefs?.[qKey] || "high";
    const size = this.getImageSize(type, q);
    return `${IMG_BASE}${size}${clean}`;
  },
  async getImdbRating(imdbId) {
    if (!imdbId) return null;
    return this._runInFlight("omdbInFlight", imdbId, async () => {
      const data = await this.fetchOmdb(`i=${imdbId}`);
      if (!data) return { transientError: true };
      if (/limit/i.test(data.Error || "")) return { error: true };
      if (data.imdbRating && data.imdbRating !== "N/A") return data.imdbRating;
      return "N/A";
    });
  },
  async resolveStarRating(data, type) {
    const t = type || data.media_type || (data.name ? "tv" : "movie");
    const id = data.id;
    const key = id ? `${t}_${id}` : "";
    if (key && this.starRatingCache[key] !== undefined)
      return this.starRatingCache[key] || null;
    let tmdbRate =
      typeof data.vote_average === "number" && data.vote_average > 0
        ? data.vote_average.toFixed(1)
        : data.vote_average
          ? String(data.vote_average)
          : "";
    const imdbId =
      data.external_ids?.imdb_id ||
      data.imdb_id ||
      (typeof id === "string" && id.startsWith("tt") ? id : null);
    if (imdbId) {
      const res = await this.getImdbRating(imdbId);
      if (typeof res === "string" && res !== "N/A") {
        if (key) {
          this.starRatingCache[key] = res;
          this.saveMetaCache();
        }
        return res;
      }
      if (res && res.transientError) {
        return tmdbRate || null;
      }
      if (res && res.error) {
        if (key) {
          this.starRatingCache[key] = tmdbRate || "";
          this.saveMetaCache();
        }
        return tmdbRate || null;
      }
    }
    if (key) {
      this.starRatingCache[key] = tmdbRate || "";
      this.saveMetaCache();
    }
    return tmdbRate || null;
  },
  async getOmdbSeasonRatings(imdbId, seasonNum) {
    if (!imdbId || !seasonNum) return {};
    const omdbKey = `${imdbId}_s${seasonNum}`;
    if (!this.omdbRatingsCache) this.omdbRatingsCache = {};
    const c = this.lruGet(this.omdbRatingsCache, omdbKey);
    if (c) return c;
    const data = await this.fetchOmdb(`i=${imdbId}&Season=${seasonNum}`);
    if (!data || /limit/i.test(data.Error || "")) return {};
    if (!data.Episodes) {
      this.lruSet(this.omdbRatingsCache, omdbKey, {}, "omdb");
      return {};
    }
    const map = {};
    data.Episodes.forEach((ep) => {
      if (ep.Episode && ep.imdbRating && ep.imdbRating !== "N/A")
        map[String(ep.Episode)] = ep.imdbRating;
    });
    this.lruSet(this.omdbRatingsCache, omdbKey, map, "omdb");
    return map;
  },
  $g(id) {
    return document.getElementById(id);
  },
  $qa(sel, fn = null) {
    const list = document.querySelectorAll(sel);
    if (typeof fn === "function") list.forEach(fn);
    return list;
  },
  animateHeight(el, mutateFn, revertFn = null, duration = 280) {
    if (typeof revertFn === "number") {
      duration = revertFn;
      revertFn = null;
    }
    if (!el || typeof mutateFn !== "function") {
      if (typeof mutateFn === "function") mutateFn();
      return;
    }
    if (el._animatingHeightTimer) {
      clearTimeout(el._animatingHeightTimer);
      el._animatingHeightTimer = null;
    }
    if (el._animatingHeightEnd) {
      el.removeEventListener("transitionend", el._animatingHeightEnd);
      el._animatingHeightEnd = null;
    }
    const prevHeight = el.offsetHeight;
    let newHeight = 0;
    if (typeof revertFn === "function") {
      document.documentElement.classList.add("height-measure");
      mutateFn();
      newHeight = el.offsetHeight;
      revertFn();
      void el.offsetHeight;
      document.documentElement.classList.remove("height-measure");
      void el.offsetHeight;
    } else {
      el.style.height = "auto";
      mutateFn();
      newHeight = el.offsetHeight;
    }
    if (prevHeight === newHeight || prevHeight === 0 || newHeight === 0) {
      el.classList.remove("height-animating");
      el.style.height = "";
      if (typeof revertFn === "function") mutateFn();
      return;
    }
    el.style.height = prevHeight + "px";
    void el.offsetHeight;
    el.classList.add("height-animating");
    if (typeof revertFn === "function") mutateFn();
    el.style.height = newHeight + "px";
    const onEnd = (e) => {
      if (e && (e.target !== el || e.propertyName !== "height")) return;
      el.removeEventListener("transitionend", onEnd);
      el._animatingHeightEnd = null;
      el.classList.remove("height-animating");
      el.style.height = "";
      if (el._animatingHeightTimer) {
        clearTimeout(el._animatingHeightTimer);
        el._animatingHeightTimer = null;
      }
    };
    el._animatingHeightEnd = onEnd;
    el.addEventListener("transitionend", onEnd);
    el._animatingHeightTimer = setTimeout(() => {
      if (el.classList.contains("height-animating")) {
        el.classList.remove("height-animating");
        el.style.height = "";
      }
      el._animatingHeightTimer = null;
      el._animatingHeightEnd = null;
    }, duration + 60);
  },
  $display(targets, defaultVal = "none") {
    if (!targets) return;
    if (Array.isArray(targets)) {
      targets.forEach((id) => {
        const el = typeof id === "string" ? this.$g(id) : id;
        if (el) el.style.display = defaultVal;
      });
    } else if (typeof targets === "object") {
      Object.entries(targets).forEach(([id, val]) => {
        const el = this.$g(id);
        if (el) el.style.display = val;
      });
    }
  },
  $clear(ids) {
    if (!ids) return;
    ids.forEach((id) => {
      const el = typeof id === "string" ? this.$g(id) : id;
      if (el) el.innerHTML = "";
    });
  },
  $storeGet(key, fallback = null) {
    try {
      const s = localStorage.getItem(key);
      return s ? JSON.parse(s) : fallback;
    } catch (e) {
      return fallback;
    }
  },
  $storeSetRaw(key, raw) {
    try {
      localStorage.setItem(key, raw);
    } catch (e) {
      const isCache = key.startsWith("str_c_");
      if (isCache) {
        try {
          const entries = Object.entries(JSON.parse(raw));
          const half = Object.fromEntries(
            entries.slice(Math.floor(entries.length / 2)),
          );
          localStorage.setItem(key, JSON.stringify(half));
        } catch (err) {}
      } else {
        for (let attempt = 0; attempt < 5; attempt++) {
          this.evictCachesForUserData();
          try {
            localStorage.setItem(key, raw);
            break;
          } catch (err) {}
        }
      }
    }
  },
  $storeSet(key, val) {
    this.$storeSetRaw(key, JSON.stringify(val));
  },
  evictCachesForUserData() {
    const keys = [
      "str_c_similar",
      "str_c_episode",
      "str_c_tmdb",
      "str_c_ani",
      "str_c_show",
      "str_c_card",
      "str_c_anime",
      "str_c_omdb",
      "meta_details_cache",
      "cached_home_showcase",
    ];
    for (let i = 0; i < keys.length; i++) {
      try {
        if (localStorage.getItem(keys[i])) {
          localStorage.removeItem(keys[i]);
          return;
        }
      } catch (e) {}
    }
  },
  saveWatchProgress(pKey, prog, force = false, dur = 0) {
    if (!pKey || isNaN(prog) || prog <= 10) return;
    if (!this.lastProgressSaved) this.lastProgressSaved = {};
    const last = this.lastProgressSaved[pKey] || 0;
    if (!force && Math.abs(prog - last) < 5) return;
    this.lastProgressSaved[pKey] = prog;
    let wp = this.$storeGet("sh_watch_progress", {});
    if (!wp || typeof wp !== "object" || Array.isArray(wp)) wp = {};
    const prevEntry = wp[pKey];
    const prevDur =
      prevEntry &&
      typeof prevEntry === "object" &&
      !isNaN(prevEntry.d) &&
      prevEntry.d > 0
        ? Number(prevEntry.d)
        : 0;
    let finalDur = !isNaN(dur) && dur > 0 ? Math.round(dur) : prevDur;
    if (!finalDur && this.watchState && this.watchState.id) {
      finalDur = this.resolveWatchDuration(
        this.watchState.id,
        this.watchState.type,
        this.watchState.season,
        this.watchState.episode,
        this.currentShow,
      );
    }
    const val =
      finalDur > 0
        ? { t: Math.round(prog), d: Math.round(finalDur) }
        : { t: Math.round(prog), d: 0 };
    this.lruSet(wp, pKey, val, null, 25);
    this.$storeSet("sh_watch_progress", wp);
  },
  removeWatchProgress(pKey) {
    if (!pKey) return;
    if (this.lastProgressSaved) delete this.lastProgressSaved[pKey];
    this.$storeRemove(pKey);
    let wp = this.$storeGet("sh_watch_progress", null);
    if (wp && typeof wp === "object" && wp[pKey] !== undefined) {
      delete wp[pKey];
      this.$storeSet("sh_watch_progress", wp);
    }
  },
  getWatchProgressEntry(pKey) {
    if (!pKey) return null;
    const wp = this.$storeGet("sh_watch_progress", null);
    if (wp && typeof wp === "object" && wp[pKey] !== undefined) {
      const raw = wp[pKey];
      if (raw && typeof raw === "object") {
        const t = parseFloat(raw.t || 0);
        const d = parseFloat(raw.d || 0);
        return isNaN(t) ? null : { t, d: isNaN(d) ? 0 : d };
      }
      const n = parseFloat(raw || 0);
      return isNaN(n) ? null : { t: n, d: 0 };
    }
    const legacy = parseFloat(this.$storeGet(pKey, 0) || 0);
    return !isNaN(legacy) && legacy > 0 ? { t: legacy, d: 0 } : null;
  },
  getWatchProgress(pKey) {
    const entry = this.getWatchProgressEntry(pKey);
    return entry ? entry.t : 0;
  },
  resolveWatchDuration(id, type, season = null, episode = null, item = null) {
    if (!id) return 0;
    const idStr = String(id);
    const isTv = type === "tv" || type === "series" || type === "show";
    let mins = 0;
    if (isTv) {
      const sNum = parseInt(season, 10) || 1;
      const eNum = parseInt(episode, 10) || 1;
      const epCacheData =
        this.episodeCache && this.episodeCache[`${idStr}_s${sNum}`];
      const cachedEp =
        epCacheData && Array.isArray(epCacheData.episodes)
          ? epCacheData.episodes.find(
              (ep) => Number(ep.episode_number) === eNum,
            )
          : null;
      if (cachedEp && cachedEp.runtime > 0) mins = Number(cachedEp.runtime);
      if (!mins && typeof this.getEpisodeHistory === "function") {
        const epHist = this.getEpisodeHistory();
        const group = Array.isArray(epHist)
          ? epHist.find((g) => String(g.id) === idStr)
          : null;
        const histEp =
          group && Array.isArray(group.episodes)
            ? group.episodes.find(
                (ep) => Number(ep.s) === sNum && Number(ep.e) === eNum,
              )
            : null;
        if (histEp && histEp.runtime > 0) mins = Number(histEp.runtime);
      }
      if (!mins) {
        const showObj =
          this.currentShow && String(this.currentShow.id) === idStr
            ? this.currentShow
            : this.getShowDetailsCache
              ? this.getShowDetailsCache(`tv_${idStr}`)?.data ||
                this.getShowDetailsCache(idStr)?.data
              : null;
        const src = item || showObj;
        const ert =
          (src &&
            Array.isArray(src.episode_run_time) &&
            src.episode_run_time[0]) ||
          (showObj &&
            Array.isArray(showObj.episode_run_time) &&
            showObj.episode_run_time[0]) ||
          0;
        mins = Number(
          ert ||
            src?.last_episode_to_air?.runtime ||
            showObj?.last_episode_to_air?.runtime ||
            src?.runtime ||
            showObj?.runtime ||
            0,
        );
      }
    } else {
      const showObj =
        this.currentShow && String(this.currentShow.id) === idStr
          ? this.currentShow
          : this.getShowDetailsCache
            ? this.getShowDetailsCache(`movie_${idStr}`)?.data ||
              this.getShowDetailsCache(idStr)?.data
            : null;
      mins = Number(item?.runtime || showObj?.runtime || 0);
    }
    return !isNaN(mins) && mins > 0 ? Math.round(mins * 60) : 0;
  },
  getWatchProgressPercent(
    id,
    type,
    season = null,
    episode = null,
    item = null,
  ) {
    if (!id) return 0;
    const isTv = type === "tv" || type === "series" || type === "show";
    const sNum = parseInt(season, 10) || 1;
    const eNum = parseInt(episode, 10) || 1;
    const pKey = isTv ? `progress_${id}_s${sNum}_e${eNum}` : `progress_${id}`;
    const entry = this.getWatchProgressEntry(pKey);
    if (!entry || entry.t <= 10) return 0;
    const dur =
      entry.d > 0
        ? entry.d
        : this.resolveWatchDuration(id, type, sNum, eNum, item);
    if (!dur || dur <= 0) return 0;
    const pct = Math.round((entry.t / dur) * 100);
    return Math.max(2, Math.min(98, pct));
  },
  packCacheRaw(obj) {
    if (!obj || typeof obj !== "object") return "{}";
    return JSON.stringify(obj)
      .replace(
        /https:\/\/s4\.anilist\.co\/file\/anilistcdn\/media\/anime\/cover\//g,
        "~ac~",
      )
      .replace(
        /https:\/\/s4\.anilist\.co\/file\/anilistcdn\/media\/anime\/banner\//g,
        "~ab~",
      )
      .replace(/https:\/\/assets\.fanart\.tv\/fanart\//g, "~fa~")
      .replace(/https:\/\/image\.tmdb\.org\/t\/p\//g, "~ti~");
  },
  unpackCacheRaw(raw) {
    if (!raw || typeof raw !== "string") return {};
    const s = raw
      .replace(
        /~ac~/g,
        "https://s4.anilist.co/file/anilistcdn/media/anime/cover/",
      )
      .replace(
        /~ab~/g,
        "https://s4.anilist.co/file/anilistcdn/media/anime/banner/",
      )
      .replace(/~fa~/g, "https://assets.fanart.tv/fanart/")
      .replace(/~ti~/g, "https://image.tmdb.org/t/p/");
    try {
      return JSON.parse(s);
    } catch (e) {
      return {};
    }
  },
  normalizeParams(params) {
    if (!params || typeof params !== "object") return "";
    const keys = Object.keys(params).sort();
    const out = [];
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      const v = params[k];
      if (v !== undefined && v !== null && v !== "") out.push(`${k}=${v}`);
    }
    return out.join("&");
  },
  $storeRemove(key) {
    try {
      localStorage.removeItem(key);
    } catch (e) {}
  },
  $sessGet(key, fallback = null) {
    try {
      const s = sessionStorage.getItem(key);
      return s ? JSON.parse(s) : fallback;
    } catch (e) {
      return fallback;
    }
  },
  $sessSet(key, val) {
    try {
      sessionStorage.setItem(key, JSON.stringify(val));
    } catch (e) {
      try {
        if (typeof val === "object" && val !== null) {
          const entries = Object.entries(val);
          const half = Object.fromEntries(
            entries.slice(Math.floor(entries.length / 2)),
          );
          sessionStorage.setItem(key, JSON.stringify(half));
        }
      } catch (err) {}
    }
  },
  $sessRemove(key) {
    try {
      sessionStorage.removeItem(key);
    } catch (e) {}
  },
  cacheCaps: {
    card: { session: 800, local: 600 },
    ani: { session: 120, local: 85 },
    anime: { session: 200, local: 150 },
    show: { session: 350, local: 240 },
    tmdb: { session: 120, local: 80 },
    similar: { session: 75, local: 45 },
    episode: { session: 25, local: 15 },
    omdb: { session: 200, local: 150 },
  },
  cacheTimers: {},
  sanitizeEpisodeSeason(data) {
    if (!data || !Array.isArray(data.episodes)) return data;
    return {
      id: data.id,
      season_number: data.season_number,
      episodes: data.episodes.map((ep) => ({
        episode_number: ep.episode_number,
        name: ep.name,
        overview: ep.overview,
        still_path: ep.still_path,
        air_date: ep.air_date,
        vote_average: ep.vote_average,
        vote_count: ep.vote_count,
        runtime: ep.runtime,
      })),
    };
  },
  sanitizeShowDetails(entry) {
    if (!entry || !entry.data) return entry;
    const d = entry.data;
    const sData = { ...d };
    sData.languageList =
      d.languageList ||
      (this.getShowLanguageList ? this.getShowLanguageList(d) : "");
    if (sData.spoken_languages && Array.isArray(sData.spoken_languages)) {
      sData.spoken_languages = sData.spoken_languages
        .slice(0, 5)
        .map((l) => ({
          english_name: l.english_name || l.name,
          iso_639_1: l.iso_639_1,
          name: l.name,
        }));
    }
    if (sData.credits || sData.aggregate_credits) {
      const isAnimShow = Boolean(
        sData.isAnime ||
        sData.is_anime ||
        (sData.genre_ids && sData.genre_ids.includes(16)) ||
        (sData.genres &&
          sData.genres.some((g) =>
            typeof g === "object" && g
              ? g.id === 16 ||
                (g.name && String(g.name).toLowerCase().includes("anim"))
              : g === 16 || String(g).toLowerCase().includes("anim"),
          )),
      );
      const rawCast =
        sData.aggregate_credits &&
        Array.isArray(sData.aggregate_credits.cast) &&
        sData.aggregate_credits.cast.length > 0
          ? sData.aggregate_credits.cast
          : d.credits?.cast || [];
      sData.credits = {
        cast: rawCast.slice(0, 60).map((c) => {
          let charStr = "";
          const cleanLiveChar = (s) =>
            String(s || "")
              .split(/\s*\/\s*/)[0]
              .replace(/\s*\((?:[^)]*uncredited[^)]*)\)/gi, "")
              .trim();
          const cleanAnimChar = (s) =>
            String(s || "")
              .replace(/\s*\((?:[^)]*voice[^)]*)\)/gi, "")
              .replace(/\s*\((?:[^)]*uncredited[^)]*)\)/gi, "")
              .trim();
          if (Array.isArray(c.roles) && c.roles.length > 0) {
            const sorted = [...c.roles].sort(
              (a, b) => (b.episode_count || 0) - (a.episode_count || 0),
            );
            if (!isAnimShow) {
              charStr = cleanLiveChar(sorted[0]?.character || c.character);
            } else {
              const maxEp = sorted[0]?.episode_count || 0;
              const threshold = Math.max(4, Math.round(maxEp * 0.45));
              const qualRoles = sorted.filter(
                (r, idx) => idx === 0 || (r.episode_count || 0) >= threshold,
              );
              const seen = new Set();
              const parts = [];
              for (const r of qualRoles) {
                const rawTokens = String(r.character || "").split(/\s*\/\s*/);
                for (const token of rawTokens) {
                  const ch = cleanAnimChar(token);
                  const norm = ch.toLowerCase();
                  if (ch && !seen.has(norm)) {
                    seen.add(norm);
                    parts.push(ch);
                  }
                }
              }
              charStr = parts.join(" / ");
            }
          } else {
            if (!isAnimShow) {
              charStr = cleanLiveChar(c.character);
            } else {
              const rawTokens = String(c.character || "").split(/\s*\/\s*/);
              const seen = new Set();
              const parts = [];
              for (const token of rawTokens) {
                const ch = cleanAnimChar(token);
                const norm = ch.toLowerCase();
                if (ch && !seen.has(norm)) {
                  seen.add(norm);
                  parts.push(ch);
                }
              }
              charStr = parts.join(" / ");
            }
          }
          return {
            id: c.id,
            name: c.name,
            character: charStr,
            roles: Array.isArray(c.roles) ? c.roles.slice(0, 5) : undefined,
            profile_path: c.profile_path,
          };
        }),
        crew: (d.credits?.crew || [])
          .filter(
            (c) =>
              c.job === "Director" ||
              c.department === "Directing" ||
              c.job === "Writer" ||
              c.department === "Writing" ||
              /^(?:screenplay|story|characters?|creator)\b/i.test(c.job || ""),
          )
          .slice(0, 12)
          .map((c) => ({
            id: c.id,
            name: c.name,
            job: c.job,
            department: c.department,
          })),
      };
    }
    if (sData.images) {
      sData.images = {
        backdrops: (d.images.backdrops || [])
          .slice(0, 15)
          .map((i) => ({ file_path: i.file_path, iso_639_1: i.iso_639_1 })),
        posters: (d.images.posters || [])
          .slice(0, 15)
          .map((i) => ({ file_path: i.file_path, iso_639_1: i.iso_639_1 })),
        logos: (d.images.logos || [])
          .slice(0, 10)
          .map((i) => ({ file_path: i.file_path, iso_639_1: i.iso_639_1 })),
      };
    }
    if (sData.release_dates && sData.release_dates.results) {
      const usR =
        sData.release_dates.results.find(
          (x) => x.iso_639_1 === "US" || x.iso_3166_1 === "US",
        ) || sData.release_dates.results[0];
      sData.release_dates = { results: usR ? [usR] : [] };
    }
    if (sData.content_ratings && sData.content_ratings.results) {
      const usCr =
        sData.content_ratings.results.find((x) => x.iso_639_1 === "US") ||
        sData.content_ratings.results[0];
      sData.content_ratings = { results: usCr ? [usCr] : [] };
    }
    let sAni = entry.anilistMedia;
    if (sAni) {
      sAni = {
        id: sAni.id,
        idMal: sAni.idMal || sAni.id,
        title: sAni.title,
        description: sAni.description,
        coverImage: sAni.coverImage,
        bannerImage: sAni.bannerImage,
        genres: sAni.genres,
        studios: sAni.studios,
        season: sAni.season,
        seasonYear: sAni.seasonYear,
        format: sAni.format,
        episodes: sAni.episodes,
        nextAiringEpisode: sAni.nextAiringEpisode,
        trailer: sAni.trailer,
        relations: sAni.relations || null,
      };
    }
    return {
      data: sData,
      anilistMedia: sAni,
      resolvedId: entry.resolvedId,
      resolvedType: entry.resolvedType,
    };
  },
  sanitizeCardItem(item) {
    if (!item || typeof item !== "object") return item;
    return {
      id: item.id,
      title: item.title || item.name || "",
      name: item.name || item.title || "",
      media_type: item.media_type || (item.name ? "tv" : "movie"),
      type: item.type || item.media_type || (item.name ? "tv" : "movie"),
      poster_path: item.poster_path || "",
      backdrop_path: item.backdrop_path || "",
      release_date: item.release_date || "",
      first_air_date: item.first_air_date || "",
      year: this.getItemYear(item),
      vote_average: item.vote_average || 0,
      genres: Array.isArray(item.genres)
        ? item.genres.map((g) => (typeof g === "object" ? g.name || g.id : g))
        : [],
      country:
        item.country || (item.origin_country && item.origin_country[0]) || "",
      original_language: item.original_language || item.language || "",
      is_anime: Boolean(item.is_anime || item.isAnime),
      is_anilist: Boolean(item.is_anilist),
      ani_id: item.ani_id || null,
      mal_id: item.mal_id || null,
      romaji: item.romaji || "",
      studios: Array.isArray(item.studios) ? item.studios : [],
      season: item.season || null,
      trailer: item.trailer || null,
      overview: (item.overview || "").substring(0, 300),
    };
  },
  normTitle(s) {
    return (s || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
  },
  formatRuntime(mins) {
    if (!mins) return "";
    const m = parseInt(mins, 10);
    if (isNaN(m) || m <= 0) return "";
    return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;
  },
  getTmdbDatePrefix(type) {
    return type === "movie" ? "primary_release_date" : "first_air_date";
  },
  buildLogoImgHtml(src, title, cls = "hero-title-logo", onErrJs = null) {
    const safeTitle = (title || "").replace(/"/g, "&quot;");
    const errAttr = onErrJs
      ? ` onerror="${onErrJs}"`
      : ` onerror="this.outerHTML='${(title || "").replace(/'/g, "\\'")}';"`;
    return `<img src="${src}" class="title-logo ${cls}" alt="${safeTitle}" onload="this.classList.add('loaded')"${errAttr}>`;
  },
  getShowTypeText(item, context = "card") {
    if (!item) return "";
    const t = item.media_type || (item.name ? "tv" : "movie");
    if (t === "movie") {
      const mType = this.resolveMovieType(item);
      return this.formatMovieType(mType, context);
    }
    const rawTvType = this.getRawTvType(item);
    return this.formatSeriesType(rawTvType, context);
  },
  startLoader() {},
  stopLoader() {
    this.hidePageReloadOverlay();
  },
  sortByAddedAt(rawItems) {
    const arr = (rawItems || []).slice();
    return arr.sort((a, b) => {
      const ta = a.addedAt || 0;
      const tb = b.addedAt || 0;
      if (ta && tb) return tb - ta;
      if (ta && !tb) return -1;
      if (!ta && tb) return 1;
      return arr.indexOf(b) - arr.indexOf(a);
    });
  },
  async _runInFlight(mapProp, key, asyncFn) {
    if (!this[mapProp]) this[mapProp] = {};
    if (this[mapProp][key]) return this[mapProp][key];
    const promise = asyncFn();
    this[mapProp][key] = promise;
    try {
      return await promise;
    } finally {
      delete this[mapProp][key];
    }
  },
  lruGet(obj, k) {
    if (!obj || !(k in obj)) return undefined;
    const v = obj[k];
    delete obj[k];
    obj[k] = v;
    return v;
  },
  lruSet(obj, k, v, persistType = null, maxKeys = 0) {
    if (!obj) return;
    delete obj[k];
    obj[k] = v;
    if (maxKeys > 0) {
      const keys = Object.keys(obj);
      if (keys.length > maxKeys) {
        for (let i = 0; i < keys.length - maxKeys; i++) delete obj[keys[i]];
      }
    }
    if (persistType) this.persistCache(persistType);
  },
  initPersistentCaches() {
    if (localStorage.getItem("str_anime_ver") !== "v22") {
      localStorage.removeItem("str_c_anime");
      localStorage.removeItem("str_c_show");
      localStorage.removeItem("str_c_similar");
      localStorage.removeItem("sh_dead_ids");
      this.deadIds = new Set();
      sessionStorage.removeItem("str_c_anime");
      sessionStorage.removeItem("str_c_show");
      sessionStorage.removeItem("str_c_similar");
      localStorage.setItem("str_anime_ver", "v22");
    }
    for (const type in this.cacheMap) {
      const prop = this.cacheMap[type];
      if (!this[prop]) this[prop] = {};
      const localRaw = localStorage.getItem(`str_c_${type}`);
      const localData = localRaw ? this.unpackCacheRaw(localRaw) : {};
      if (localData && typeof localData === "object")
        Object.assign(this[prop], localData);
      const sessRaw = sessionStorage.getItem(`str_c_${type}`);
      const sessData = sessRaw ? this.unpackCacheRaw(sessRaw) : {};
      if (sessData && typeof sessData === "object")
        Object.assign(this[prop], sessData);
    }
    const discNets = this.$storeGet("tmdb_discovered_networks", null);
    if (discNets && typeof discNets === "object")
      this.discoveredNetworks = discNets;
    if (!this.discoveredNetworks) this.discoveredNetworks = {};
    const wp = this.$storeGet("tmdb_watch_providers", null);
    if (wp && wp._ts && Date.now() - wp._ts < 7 * 86400000)
      this.watchProvidersList = wp.list || null;
    if (this.showDetailsCache && typeof this.showDetailsCache === "object") {
      Object.values(this.showDetailsCache).forEach((entry) => {
        (entry?.data?.networks || []).forEach((nt) => {
          if (nt && nt.id && !this.discoveredNetworks[nt.id]) {
            this.discoveredNetworks[nt.id] = {
              id: nt.id,
              name: nt.name,
              origin_country: nt.origin_country || "",
            };
          }
        });
      });
    }
    if (!this._cacheUnloadBound) {
      this._cacheUnloadBound = true;
      window.addEventListener("beforeunload", () =>
        this.flushAllPersistentCaches(),
      );
      window.addEventListener("pagehide", () =>
        this.flushAllPersistentCaches(),
      );
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden")
          this.flushAllPersistentCaches();
      });
    }
  },
  persistCache(type) {
    if (!this.dirtyCaches) this.dirtyCaches = new Set();
    this.dirtyCaches.add(type);
    if (!this.cacheTimers) this.cacheTimers = {};
    clearTimeout(this.cacheTimers[type]);
    this.cacheTimers[type] = setTimeout(() => {
      const runFlush = () => {
        if (this.dirtyCaches.has(type)) {
          this.dirtyCaches.delete(type);
          this.flushPersistentCache(type);
        }
      };
      if (typeof window.requestIdleCallback === "function") {
        window.requestIdleCallback(runFlush, { timeout: 1000 });
      } else {
        runFlush();
      }
    }, 800);
  },
  flushAllPersistentCaches() {
    const types = Object.keys(this.cacheMap);
    for (let i = 0; i < types.length; i++) {
      if (this.dirtyCaches && this.dirtyCaches.has(types[i])) {
        this.dirtyCaches.delete(types[i]);
        this.flushPersistentCache(types[i]);
      }
    }
    if (this.saveMetaTimer) this.flushMetaCache();
  },
  getShowDetailsCache(key) {
    if (!this.showDetailsCache || !key) return null;
    const kStr = String(key);
    let raw = this.showDetailsCache[key] || this.showDetailsCache[kStr] || null;
    if (!raw) return null;
    let refKey = null;
    let entry = raw;
    if (raw._ref && this.showDetailsCache[raw._ref]) {
      refKey = raw._ref;
      entry = this.showDetailsCache[refKey];
    }
    if (entry && entry.data) {
      if (refKey) {
        this.lruSet(this.showDetailsCache, refKey, entry);
      }
      const matchedKey = this.showDetailsCache[key] !== undefined ? key : kStr;
      this.lruSet(this.showDetailsCache, matchedKey, raw);
      return entry;
    }
    return null;
  },
  prefetchTimer: {},
  prefetchShowinfo(id, type) {
    if (!id) return;
    const t = type || "movie";
    const showCacheKey = `${t}_${id}`;
    if (!this.prefetchTimer) this.prefetchTimer = {};
    clearTimeout(this.prefetchTimer[showCacheKey]);
    this.prefetchTimer[showCacheKey] = setTimeout(() => {
      const cachedShow =
        this.getShowDetailsCache(showCacheKey) || this.getShowDetailsCache(id);
      const showData = cachedShow?.data || cachedShow;
      if (showData && showData.id) {
        if (t === "tv" && this.isAnimeItem(showData)) {
          const cS1 =
            this.animeCache &&
            (this.animeCache[`${showData.id}_s1`] ||
              this.animeCache[String(showData.id)]);
          if (!cS1 || !cS1._chainComplete) {
            this.fetchAnimeInfo(showData, 1, false).catch(() => {});
          }
        }
        return;
      }
      if (typeof id === "string" && id.startsWith("ani_")) {
        const aniNum = parseInt(id.replace("ani_", ""), 10);
        const pre = this.animeCache?.[id] || this.animeCache?.[`ani_${aniNum}`];
        const cardItem =
          (this.cardItemCache && this.cardItemCache[String(id)]) || null;
        const fmt = pre?.animeFormat || cardItem?.type;
        if (
          ["TV", "TV_SHORT", "MOVIE", "Scripted", "movie", "ONA"].includes(fmt)
        )
          return;
        if (pre && (pre.episodes || pre.episodes === 0)) return;
        this.aniApi(this.ANI_MEDIA_QUERY, { id: aniNum });
      } else if (
        typeof id === "number" ||
        (!String(id).startsWith("tt") && !isNaN(Number(id)))
      ) {
        this.api(`/${t}/${id}`, {
          append_to_response:
            t === "tv"
              ? "aggregate_credits,credits,videos,images,release_dates,external_ids,content_ratings,alternative_titles,keywords,watch/providers"
              : "credits,videos,images,release_dates,external_ids,content_ratings,alternative_titles,keywords,watch/providers",
          include_image_language: "en,null",
          include_video_language: "en,null",
        })
          .then((res) => {
            if (res && res.id) {
              if (!this.showDetailsCache) this.showDetailsCache = {};
              const canonKey = `${t}_${res.id}`;
              const cleanEntry = this.sanitizeShowDetails({
                data: res,
                anilistMedia: null,
                resolvedId: res.id,
                resolvedType: t,
              });
              this.showDetailsCache[canonKey] = cleanEntry;
              if (`${t}_${id}` !== canonKey)
                this.showDetailsCache[`${t}_${id}`] = { _ref: canonKey };
              this.persistCache("show");
              if (t === "tv" && this.isAnimeItem(res)) {
                const cS1 =
                  this.animeCache &&
                  (this.animeCache[`${res.id}_s1`] ||
                    this.animeCache[String(res.id)]);
                if (!cS1 || !cS1._chainComplete) {
                  this.fetchAnimeInfo(res, 1, false).catch(() => {});
                }
              }
            }
          })
          .catch(() => {});
      }
    }, 160);
  },
  fieldMap: {
    compNet: "comp-net",
    aniStudio: "ani-studio",
    aniStaff: "ani-staff",
    aniTag: "ani-tag",
  },
  getFieldKey(key) {
    return this.fieldMap[key] || key;
  },
  encodeItem(item) {
    return btoa(encodeURIComponent(JSON.stringify(item)));
  },
  decodeItem(str) {
    return JSON.parse(decodeURIComponent(atob(str)));
  },
  resetCollapseBtns() {
    [
      ["w-col-left-btn", EXPAND_LEFT_SVG(18)],
      ["w-col-right-btn", EXPAND_RIGHT_SVG(18)],
      ["w-col-up-btn", EXPAND_UP_SVG(18)],
      ["w-col-down-btn", EXPAND_DOWN_SVG(18)],
    ].forEach(([id, svg]) => {
      const el = this.$g(id);
      if (el) el.innerHTML = svg;
    });
  },
  compNetTimer: null,
  rowSlideDelay: 2000,
  infiniteRows: [
    "row-trend-movies",
    "row-trend-series",
    "row-top-movies",
    "row-top-series",
  ],
  getFanartLogo(type, id, tvdbId) {
    const cacheKey = `${type}_${id}`;
    if (this.logoCache[cacheKey] !== undefined) {
      const val = this.logoCache[cacheKey];
      return Promise.resolve(val === "NONE" ? null : val);
    }
    return this._runInFlight("logoInFlight", cacheKey, () => {
      const isMovie = type === "movie";
      const targetId = isMovie ? id : tvdbId;
      if (!targetId) {
        this.logoCache[cacheKey] = "NONE";
        return Promise.resolve(null);
      }
      const fKey = this.getFanartKey();
      if (!fKey) {
        this.logoCache[cacheKey] = "NONE";
        return Promise.resolve(null);
      }
      const fUrl = `https://webservice.fanart.tv/v3/${isMovie ? "movies" : "tv"}/${targetId}?api_key=${fKey}`;
      return fetch(fUrl)
        .then((r) => r.json())
        .then((f) => {
          const url = isMovie
            ? (f.movielogo && f.movielogo[0]?.url) ||
              (f.hdmovielogo && f.hdmovielogo[0]?.url) ||
              null
            : (f.clearlogo && f.clearlogo[0]?.url) ||
              (f.hdtvlogo && f.hdtvlogo[0]?.url) ||
              null;
          if (url) {
            const img = new Image();
            img.src = url;
          }
          this.logoCache[cacheKey] = url || "NONE";
          this.saveMetaCache();
          return url;
        })
        .catch(() => {
          this.logoCache[cacheKey] = "NONE";
          this.saveMetaCache();
          return null;
        });
    });
  },
  handlePosterError(imgEl) {
    if (!imgEl || !imgEl.src || imgEl.src.startsWith("data:")) return;
    imgEl.classList.remove("loaded");
    imgEl.style.opacity = "0";
    const retries = parseInt(imgEl.dataset.retryCount || "0", 10);
    if (retries >= 2) return;
    imgEl.dataset.retryCount = String(retries + 1);
    const baseSrc = imgEl.dataset.origSrc || imgEl.src;
    if (!imgEl.dataset.origSrc) imgEl.dataset.origSrc = baseSrc;
    const delay = retries === 0 ? 800 : 2000;
    setTimeout(() => {
      if (!imgEl || !imgEl.isConnected) return;
      let nextSrc = baseSrc;
      if (retries === 0 && nextSrc.includes("/w342/"))
        nextSrc = nextSrc.replace("/w342/", "/w500/");
      const sep = nextSrc.includes("?") ? "&" : "?";
      imgEl.src = nextSrc + sep + "_r=" + Date.now();
    }, delay);
  },
  setupImageFade() {
    document.addEventListener(
      "load",
      (e) => {
        if (
          e.target &&
          e.target.tagName === "IMG" &&
          !e.target.closest("#view-home .scroll-row:not(#row-continue)")
        ) {
          e.target.style.opacity = "";
          e.target.classList.add("loaded");
        }
      },
      true,
    );
    document.addEventListener(
      "error",
      (e) => {
        if (e.target && e.target.tagName === "IMG") {
          if (e.target.classList.contains("poster-img")) {
            this.handlePosterError(e.target);
          } else if (
            !e.target.closest("#view-home .scroll-row:not(#row-continue)")
          ) {
            e.target.classList.add("loaded");
          }
        }
      },
      true,
    );
    document.querySelectorAll("img").forEach((img) => {
      if (
        img.complete &&
        img.naturalWidth > 0 &&
        !img.closest("#view-home .scroll-row:not(#row-continue)")
      )
        img.classList.add("loaded");
    });
  },
  setupScrollRowArrows() {
    const lSvg = ARROW_LEFT_SVG;
    const rSvg = ARROW_RIGHT_SVG;
    document.querySelectorAll(".row-nav-arrows").forEach((el) => el.remove());
    document.querySelectorAll(".scroll-row").forEach((row) => {
      const container = row.closest(".scroll-row-container");
      if (!container) return;
      let lb = container.querySelector(":scope > .scroll-arrow.left");
      let rb = container.querySelector(":scope > .scroll-arrow.right");
      if (!lb) {
        lb = document.createElement("button");
        lb.type = "button";
        lb.className = "scroll-arrow left";
        lb.setAttribute("aria-label", "Previous");
        lb.innerHTML = lSvg;
        container.appendChild(lb);
      }
      lb.onclick = (e) => {
        e.stopPropagation();
        app.scrollRow(lb, -400);
      };
      if (!rb) {
        rb = document.createElement("button");
        rb.type = "button";
        rb.className = "scroll-arrow right";
        rb.setAttribute("aria-label", "Next");
        rb.innerHTML = rSvg;
        container.appendChild(rb);
      }
      rb.onclick = (e) => {
        e.stopPropagation();
        app.scrollRow(rb, 400);
      };
      if (!container._hasScrollArrowMoveListener) {
        container._hasScrollArrowMoveListener = true;
        container.addEventListener(
          "pointerenter",
          (e) => {
            if (e && (e.pointerType === "touch" || e.type === "touchstart"))
              return;
            container.classList.add("is-hovered");
            this.checkScrollArrow(row);
          },
          { passive: true },
        );
        container.addEventListener("pointerleave", () => {
          container.classList.remove("is-hovered");
        });
      }
      this.checkScrollArrow(row);
    });
  },
  getCountryCode(item) {
    let c = item.country || "";
    if (!c && item.id) {
      const t = item.media_type || (item.name ? "tv" : "movie");
      c =
        this.countryCache[`${t}_${item.id}`] ||
        this.countryCache[item.id] ||
        "";
    }
    if (!c && item.origin_country && item.origin_country.length > 0)
      c = item.origin_country[0];
    else if (
      !c &&
      item.production_countries &&
      item.production_countries.length > 0
    )
      c = item.production_countries[0].iso_3166_1;
    if (!c && item.original_language) {
      const l = item.original_language.toLowerCase();
      if (l === "en") {
        c = "US";
      } else if (l.length >= 2) {
        try {
          const reg = new Intl.Locale(l).maximize().region;
          if (reg) c = reg;
        } catch (e) {}
      }
    }
    if (c === "GB") c = "UK";
    return c;
  },
  getShowLanguageList: function (data) {
    if (!data) return "";
    if (data.languageList && typeof data.languageList === "string")
      return data.languageList;
    const rawLangs = [];
    if (
      Array.isArray(data.spoken_languages) &&
      data.spoken_languages.length > 0
    ) {
      data.spoken_languages.forEach((l) => {
        if (!l) return;
        const name =
          l.english_name || l.name || this.getLanguageName(l.iso_639_1);
        if (name && !rawLangs.includes(name)) rawLangs.push(name);
      });
    } else if (Array.isArray(data.languages) && data.languages.length > 0) {
      data.languages.forEach((code) => {
        const name = this.getLanguageName(code);
        if (name && !rawLangs.includes(name)) rawLangs.push(name);
      });
    } else if (data.original_language) {
      const name = this.getLanguageName(data.original_language);
      if (name && !rawLangs.includes(name)) rawLangs.push(name);
    } else if (data.Language && data.Language !== "N/A") {
      data.Language.split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .forEach((name) => {
          if (!rawLangs.includes(name)) rawLangs.push(name);
        });
    }
    const validLangs = rawLangs.filter(
      (l) =>
        l &&
        typeof l === "string" &&
        l.toLowerCase() !== "no language" &&
        l.toLowerCase() !== "none" &&
        l.toLowerCase() !== "xx",
    );
    const res = validLangs.slice(0, 3).join(", ");
    data.languageList = res;
    return res;
  },
  formatSeriesType: function (typeStr, context = "card") {
    if (!typeStr || String(typeStr).trim().toLowerCase() === "tv")
      return context === "showinfo" ? "TV Series" : "SERIES";
    const raw = String(typeStr).trim();
    const k = raw.toLowerCase();
    if (context === "showinfo") {
      const SHOW_MAP = {
        scripted: "TV Series",
        ona: "ONA",
        short: "Short",
        tv_short: "Short",
        documentary: "Documentary",
        "talk show": "Talk Show",
        miniseries: "Miniseries",
        news: "News",
        reality: "Reality",
        video: "Video",
      };
      return SHOW_MAP[k] || raw;
    }
    const CARD_MAP = {
      scripted: "SERIES",
      ona: "ONA",
      short: "SHORT",
      tv_short: "SHORT",
      documentary: "DOC",
      "talk show": "TALK",
    };
    return CARD_MAP[k] || raw.toUpperCase();
  },
  resolveMovieType: function (item) {
    if (!item) return "movie";
    const genres = item.genres || [];
    const genreIds =
      item.genre_ids && Array.isArray(item.genre_ids)
        ? item.genre_ids
        : genres
            .map((g) => (typeof g === "object" && g ? g.id : g))
            .filter(Boolean);
    const hasGenre = (id, name) =>
      genreIds.includes(id) ||
      genres.some(
        (g) => g.id === id || (g.name && String(g.name).toLowerCase() === name),
      );
    if (hasGenre(99, "documentary")) return "documentary";
    if (hasGenre(10770, "tv movie")) return "tv_movie";
    const runtime = Number(item.runtime) || 0;
    if (runtime > 0 && runtime <= 40) return "short";
    return "movie";
  },
  formatMovieType: function (typeStr, context = "card") {
    const raw = String(typeStr || "")
      .trim()
      .toLowerCase();
    if (context === "showinfo") {
      if (raw === "documentary") return "Documentary";
      if (raw === "tv_movie") return "TV Movie";
      if (raw === "short") return "Short Movie";
      return "Movie";
    }
    if (raw === "documentary") return "DOC";
    if (raw === "tv_movie") return "TV MOVIE";
    if (raw === "short") return "SHORT";
    return "MOVIE";
  },
  initMetaCache() {
    const parsed = this.$storeGet("meta_details_cache");
    if (parsed) {
      if (parsed.rating) Object.assign(this.ratingCache, parsed.rating);
      if (parsed.starRating)
        Object.assign(this.starRatingCache, parsed.starRating);
      if (parsed.country) Object.assign(this.countryCache, parsed.country);
      if (parsed.tvType) Object.assign(this.tvTypeCache, parsed.tvType);
      if (parsed.logo) Object.assign(this.logoCache, parsed.logo);
      if (parsed.compNet) {
        for (const k in parsed.compNet) {
          if (!this.compNetCache[k]) {
            const v = parsed.compNet[k];
            if (v) {
              this.compNetCache[k] = {
                comps: v.c ? v.c.split(",") : v.comps || [],
                nets: v.n ? v.n.split(",") : v.nets || [],
                provs: v.p ? v.p.split(",") : v.provs || [],
              };
            }
          }
        }
      }
    }
  },
  saveMetaCache() {
    clearTimeout(this.saveMetaTimer);
    this.saveMetaTimer = setTimeout(() => {
      if (typeof window.requestIdleCallback === "function") {
        window.requestIdleCallback(() => this.flushMetaCache(), {
          timeout: 1000,
        });
      } else {
        this.flushMetaCache();
      }
    }, 800);
  },
  queueMetaFetch(id, type) {
    if (!id) return;
    const t = type || "movie";
    const key = `${t}_${id}`;
    if (
      this.ratingCache[key] !== undefined &&
      this.starRatingCache[key] !== undefined &&
      this.compNetCache[key] !== undefined &&
      (this.countryCache[key] || t !== "movie") &&
      (this.tvTypeCache[key] !== undefined || t !== "tv")
    )
      return;
    if (!this.metaQueue) this.metaQueue = [];
    if (!this.metaPending) this.metaPending = new Set();
    if (this.metaPending.has(key)) return;
    this.metaPending.add(key);
    this.metaQueue.push({
      id,
      type: t,
      key,
    });
    this.processMetaQueue();
  },
  processMetaQueue: function () {
    if (!this.metaActive) this.metaActive = 0;
    while (this.metaActive < 2 && this.metaQueue && this.metaQueue.length > 0) {
      const task = this.metaQueue.shift();
      this.metaActive++;
      this.fetchMetaItem(task.id, task.type, task.key).finally(() => {
        this.metaActive--;
        this.processMetaQueue();
      });
    }
  },
  cacheShowMeta: function (data, type, id) {
    const key = `${type}_${id}`;
    let cRating = "";
    if (type === "movie" && data.release_dates?.results) {
      const usR =
        data.release_dates.results.find(
          (x) => x.iso_639_1 === "US" || x.iso_3166_1 === "US",
        ) || data.release_dates.results[0];
      const m = usR?.release_dates?.find(
        (x) => x.certification && x.certification.trim(),
      );
      if (m) cRating = m.certification.trim();
    } else if (type === "tv" && data.content_ratings?.results) {
      const usCr =
        data.content_ratings.results.find((x) => x.iso_639_1 === "US") ||
        data.content_ratings.results.find((x) => x.rating && x.rating.trim());
      if (usCr?.rating) cRating = usCr.rating.trim();
    }
    this.ratingCache[key] = cRating || "";
    data.rating = cRating;
    const provList = [];
    const usProv = data["watch/providers"]?.results?.US;
    if (usProv) {
      ["flatrate", "free", "ads"].forEach((k) => {
        (usProv[k] || []).forEach((p) => {
          if (p?.provider_id) provList.push(String(p.provider_id));
        });
      });
    }
    if (Array.isArray(data.networks)) {
      if (!this.discoveredNetworks) this.discoveredNetworks = {};
      data.networks.forEach((nt) => {
        if (nt && nt.id && !this.discoveredNetworks[nt.id]) {
          this.discoveredNetworks[nt.id] = {
            id: nt.id,
            name: nt.name,
            origin_country: nt.origin_country || "",
          };
          this.scheduleSaveDiscoveredNetworks();
        }
      });
    }
    this.compNetCache[key] = {
      comps: [
        ...new Set(
          (data.production_companies || []).map((cp) => String(cp.id || cp)),
        ),
      ],
      nets: [
        ...new Set((data.networks || []).map((nt) => String(nt.id || nt))),
      ],
      provs: [...new Set(provList)],
    };
    this.saveMetaCache();
    return cRating;
  },
  setDropHtml(drop, html) {
    if (!drop) return;
    drop.style.minWidth = "";
    drop.style.width = "";
    drop.innerHTML =
      html ||
      '<div style="padding:10px;font-size:0.8rem;color:#999;text-align:center;">No matches found</div>';
    drop.style.display = "block";
    this.adjustDropPosition(drop);
  },
  showDropLoader(drop) {
    if (!drop) return;
    this.setDropHtml(
      drop,
      '<div class="dots-loader"><span class="dot"></span><span class="dot"></span><span class="dot"></span></div>',
    );
  },
  checkEmptySearch(q, drop) {
    if (!q) {
      this.setDropHtml(
        drop,
        '<div style="padding:8px 12px;font-size:0.85rem;color:#888;cursor:default;user-select:none;white-space:nowrap;" onmousedown="event.preventDefault()">Type to search...</div>',
      );
      if (drop) {
        drop.style.minWidth = "auto";
        drop.style.width = "max-content";
        this.adjustDropPosition(drop);
      }
      return true;
    }
    return false;
  },
  adjustDropPosition(drop) {
    if (!drop || drop.style.display === "none") return;
    drop.style.left = "0";
    drop.style.right = "auto";
    drop.style.maxWidth = "";
    const vw = window.innerWidth || document.documentElement.clientWidth || 360;
    const rect = drop.getBoundingClientRect();
    if (rect.right > vw - 10) {
      drop.style.left = "auto";
      drop.style.right = "0";
      const r2 = drop.getBoundingClientRect();
      if (r2.right > vw - 10) {
        drop.style.right = `${Math.round(r2.right - (vw - 10))}px`;
      }
      if (r2.left < 10) {
        const wrapRect = drop.parentElement
          ? drop.parentElement.getBoundingClientRect()
          : { left: 0 };
        drop.style.right = "auto";
        drop.style.left = `${Math.round(10 - wrapRect.left)}px`;
        drop.style.maxWidth = `${Math.round(vw - 20)}px`;
      }
    } else if (rect.left < 10) {
      const wrapRect = drop.parentElement
        ? drop.parentElement.getBoundingClientRect()
        : { left: 0 };
      drop.style.left = `${Math.round(10 - wrapRect.left)}px`;
      drop.style.right = "auto";
      drop.style.maxWidth = `${Math.round(vw - 20)}px`;
    }
  },
  renderDropItemHtml(cat, id, name, tag, target) {
    const badge = tag
      ? `<span style="font-size:0.7rem;padding:2px 6px;border-radius:4px;background:#ffffff1a;color:#aaaaaa;">${tag}</span>`
      : "";
    return `<div class="comp-net-item" onclick="app.selectFilterItem('${cat}','${id}','${(name || "").replace(/'/g, "\\'")}','${target}','${(tag || "").replace(/'/g, "\\'")}')"><span>${name}</span>${badge}</div>`;
  },
  scheduleSaveDiscoveredNetworks() {
    clearTimeout(this._saveNetworksTimer);
    this._saveNetworksTimer = setTimeout(() => {
      if (this.discoveredNetworks) {
        this.$storeSet("tmdb_discovered_networks", this.discoveredNetworks);
      }
    }, 1000);
  },
  async getWatchProvidersList() {
    if (this.watchProvidersList && Array.isArray(this.watchProvidersList))
      return this.watchProvidersList;
    if (this._watchProvidersPromise) return await this._watchProvidersPromise;
    this._watchProvidersPromise = (async () => {
      try {
        const [mRes, tRes] = await Promise.all([
          this.api("/watch/providers/movie", { watch_region: "US" }),
          this.api("/watch/providers/tv", { watch_region: "US" }),
        ]);
        const rawList = [...(mRes?.results || []), ...(tRes?.results || [])];
        const provMap = {};
        const storefrontExclude =
          /^(?:google play|youtube|vudu|fandango|microsoft store|redbox|amc on demand)/i;
        const channelSuffix =
          /\s+(?:amazon|apple\s*tv|roku\s*premium)\s+channel.*$/i;
        const adsSuffix = /\s+(?:basic|standard)\s+with\s+ads$/i;
        rawList.forEach((p) => {
          if (!p || !p.provider_id || !p.provider_name) return;
          const name = p.provider_name.trim();
          if (storefrontExclude.test(name)) return;
          const baseName = name
            .replace(channelSuffix, "")
            .replace(adsSuffix, "")
            .trim();
          const normKey = baseName.toLowerCase();
          if (!provMap[normKey]) {
            provMap[normKey] = {
              id: String(p.provider_id),
              allIds: [String(p.provider_id)],
              name: baseName,
              display_priority: p.display_priority ?? 999,
            };
          } else {
            const entry = provMap[normKey];
            if (!entry.allIds.includes(String(p.provider_id))) {
              entry.allIds.push(String(p.provider_id));
            }
            if ((p.display_priority ?? 999) < entry.display_priority) {
              entry.display_priority = p.display_priority ?? 999;
            }
          }
        });
        const list = Object.values(provMap)
          .map((e) => ({
            id: e.allIds.length > 1 ? e.allIds.join(",") : e.id,
            name: e.name,
            display_priority: e.display_priority,
          }))
          .sort((a, b) => a.display_priority - b.display_priority);
        this.watchProvidersList = list;
        this.$storeSet("tmdb_watch_providers", { _ts: Date.now(), list });
        return list;
      } catch (e) {
        return [];
      } finally {
        this._watchProvidersPromise = null;
      }
    })();
    return await this._watchProvidersPromise;
  },
  async discoverNetworksLive(query, preloadedCompRes = null) {
    const q = query.trim();
    if (!q || q.length < 2) return [];
    const qLower = q.toLowerCase();
    if (this.networkSearchCache && this.networkSearchCache[qLower]) {
      return this.networkSearchCache[qLower];
    }
    const matchedNets = [];
    const seenNetIds = new Set();
    const checkAndAddNet = (net) => {
      if (!net || !net.id || seenNetIds.has(String(net.id))) return;
      const nName = String(net.name || "").trim();
      if (!nName) return;
      seenNetIds.add(String(net.id));
      if (!this.discoveredNetworks) this.discoveredNetworks = {};
      this.discoveredNetworks[net.id] = {
        id: net.id,
        name: nName,
        origin_country: net.origin_country || "",
      };
      this.scheduleSaveDiscoveredNetworks();
      if (
        nName.toLowerCase().includes(qLower) ||
        qLower.includes(nName.toLowerCase())
      ) {
        matchedNets.push({
          id: `net_${net.id}`,
          name: nName,
          tag: "Network",
        });
      }
    };
    if (this.discoveredNetworks) {
      Object.values(this.discoveredNetworks).forEach((net) =>
        checkAndAddNet(net),
      );
    }
    if (matchedNets.length > 0) {
      if (!this.networkSearchCache) this.networkSearchCache = {};
      this.networkSearchCache[qLower] = matchedNets;
      return matchedNets;
    }
    try {
      const compPromise = preloadedCompRes
        ? Promise.resolve(preloadedCompRes)
        : this.api("/search/company", { query: q }).catch(() => null);
      const [compRes, tvRes] = await Promise.all([
        compPromise,
        this.api("/search/tv", { query: q }).catch(() => null),
      ]);
      const candidateShowIds = new Set();
      (tvRes?.results || []).slice(0, 3).forEach((s) => {
        if (s?.id) candidateShowIds.add(s.id);
      });
      const topComps = (compRes?.results || []).slice(0, 2);
      for (let c of topComps) {
        try {
          const discRes = await this.api("/discover/tv", {
            with_companies: c.id,
            sort_by: "popularity.desc",
            page: 1,
          });
          (discRes?.results || []).slice(0, 2).forEach((s) => {
            if (s?.id) candidateShowIds.add(s.id);
          });
        } catch (e) {}
      }
      const showIdsArr = Array.from(candidateShowIds).slice(0, 4);
      if (showIdsArr.length > 0) {
        const showDetails = await Promise.all(
          showIdsArr.map((sId) => this.api(`/tv/${sId}`).catch(() => null)),
        );
        showDetails.forEach((s) => {
          if (s && Array.isArray(s.networks)) {
            s.networks.forEach((net) => checkAndAddNet(net));
          }
        });
      }
    } catch (e) {}
    if (!this.networkSearchCache) this.networkSearchCache = {};
    this.networkSearchCache[qLower] = matchedNets;
    return matchedNets;
  },
  searchCompNet(query, target) {
    clearTimeout(this.compNetTimer);
    const prefix =
      target === "block"
        ? "bc-"
        : target === "person"
          ? "pf-"
          : target === "source"
            ? "sf-"
            : "filter-";
    const drop = this.$g(`${prefix}comp-net-drop`);
    const q = query.trim();
    if (this.checkEmptySearch(q, drop)) return;
    this.showDropLoader(drop);
    this.compNetReqId = (this.compNetReqId || 0) + 1;
    const reqId = this.compNetReqId;
    this.compNetTimer = setTimeout(async () => {
      const qLower = q.toLowerCase();
      const qNorm = qLower.replace(/\+/g, "plus").replace(/\s+/g, " ").trim();
      const provs = await this.getWatchProvidersList();
      if (reqId !== this.compNetReqId) return;
      let platMatches = [];
      if (
        target !== "explore" ||
        this.exploreType === "movie" ||
        this.exploreType === "tv"
      ) {
        platMatches = (provs || [])
          .filter((p) => {
            const pNorm = (p.name || "")
              .toLowerCase()
              .replace(/\+/g, "plus")
              .replace(/\s+/g, " ")
              .trim();
            return (
              pNorm.includes(qNorm) ||
              (qNorm.length >= 3 && pNorm.startsWith(qNorm))
            );
          })
          .map((p) => ({
            id: `prov_${p.id}`,
            name: p.name,
            tag: "Platform",
          }));
      }
      let cachedNetMatches = [];
      if (target !== "explore" || this.exploreType === "tv") {
        if (this.discoveredNetworks) {
          const seenIds = new Set();
          Object.values(this.discoveredNetworks).forEach((net) => {
            if (net && net.name && !seenIds.has(String(net.id))) {
              if (net.name.toLowerCase().includes(qLower)) {
                seenIds.add(String(net.id));
                cachedNetMatches.push({
                  id: `net_${net.id}`,
                  name: net.name,
                  tag: "Network",
                });
              }
            }
          });
        }
      }
      let studioMatches = [];
      let compSearchRes = null;
      try {
        const res = await this.api("/search/company", { query: q });
        compSearchRes = res;
        if (res && res.results) {
          const scored = res.results
            .map((c) => {
              let score = 0;
              const cName = (c.name || "").toLowerCase();
              if (cName === qLower) score += 100;
              else if (cName.startsWith(qLower)) score += 50;
              else if (cName.includes(qLower)) score += 20;
              if (c.logo_path) score += 25;
              if (c.origin_country) score += 15;
              return { c, score };
            })
            .sort((a, b) => b.score - a.score);
          scored.slice(0, 10).forEach(({ c }) => {
            studioMatches.push({
              id: `comp_${c.id}`,
              name: c.name,
              tag: "Studio",
            });
          });
        }
      } catch (e) {}
      if (reqId !== this.compNetReqId) return;
      const buildCombined = (nets) => {
        const combined = [];
        const seen = new Set();
        const add = (item) => {
          if (!item || !item.id) return;
          const k = `${item.tag}:${(item.name || "").toLowerCase()}`;
          if (!seen.has(k)) {
            seen.add(k);
            combined.push(item);
          }
        };
        platMatches.forEach(add);
        if (target !== "explore" || this.exploreType !== "movie")
          (nets || []).forEach(add);
        studioMatches.forEach(add);
        return combined;
      };
      const phase1 = buildCombined(cachedNetMatches);
      if (phase1.length > 0) {
        this.setDropHtml(
          drop,
          phase1
            .slice(0, 14)
            .map((m) =>
              this.renderDropItemHtml("compNet", m.id, m.name, m.tag, target),
            )
            .join(""),
        );
      }
      if (target !== "explore" || this.exploreType === "tv") {
        this.discoverNetworksLive(q, compSearchRes)
          .then((liveNets) => {
            if (reqId !== this.compNetReqId) return;
            const phase2 = buildCombined([...cachedNetMatches, ...liveNets]);
            this.setDropHtml(
              drop,
              phase2
                .slice(0, 14)
                .map((m) =>
                  this.renderDropItemHtml(
                    "compNet",
                    m.id,
                    m.name,
                    m.tag,
                    target,
                  ),
                )
                .join(""),
            );
          })
          .catch(() => {
            if (reqId === this.compNetReqId && phase1.length === 0)
              this.setDropHtml(drop, "");
          });
      } else {
        if (phase1.length === 0) this.setDropHtml(drop, "");
      }
    }, 280);
  },
  selectFilterItem: function (category, id, name, target, dept) {
    this.addMultiFilter(
      category,
      id,
      name,
      dept,
      target === "block"
        ? "block"
        : target === "person"
          ? "person"
          : target === "source"
            ? "source"
            : "explore",
    );
  },
  runDebouncedSearch: function (
    timerKey,
    dropEl,
    query,
    fetchAndMapFn,
    delay = 250,
  ) {
    clearTimeout(this[timerKey]);
    if (!dropEl) return;
    const q = (query || "").trim();
    if (this.checkEmptySearch(q, dropEl)) return;
    this.showDropLoader(dropEl);
    this[timerKey] = setTimeout(async () => {
      try {
        const html = await fetchAndMapFn(q);
        this.setDropHtml(dropEl, html);
      } catch (e) {}
    }, delay);
  },
  searchPerson: function (query, target) {
    const prefix =
      target === "block"
        ? "bc-"
        : target === "person"
          ? "pf-"
          : target === "source"
            ? "sf-"
            : "filter-";
    const drop = this.$g(`${prefix}person-drop`);
    this.runDebouncedSearch("personTimer", drop, query, async (q) => {
      const res = await this.api("/search/person", { query: q });
      return (res?.results || [])
        .slice(0, 10)
        .map((p) =>
          this.renderDropItemHtml(
            "person",
            p.id,
            p.name,
            p.known_for_department || "Person",
            target,
          ),
        )
        .join("");
    });
  },
  isSeasonAired: function (s) {
    if (!s || s.season_number <= 0) return false;
    if (s.episode_count === 0) return false;
    if (s.air_date) {
      const d = new Date(s.air_date);
      if (d > new Date()) return false;
    }
    return true;
  },
  checkTooltip: function () {
    if (this.$storeGet("hidePlayerTooltip") !== true) {
      const pt = this.$g("player-tooltip");
      if (pt) pt.classList.add("active");
    }
  },
  closeTooltip: function (dontShow) {
    const pt = this.$g("player-tooltip");
    if (pt) pt.classList.remove("active");
    if (dontShow) this.$storeSet("hidePlayerTooltip", true);
  },
  setupFsTimer: function () {
    const c = this.$g("global-player-container");
    const r = () => {
      if (!document.fullscreenElement) return;
      c.classList.remove("controls-hidden");
      clearTimeout(this.fsTimer);
      this.fsTimer = setTimeout(() => {
        const e = this.$g("w-ep-panel");
        const s = this.$g("w-server-panel");
        if (
          !e.classList.contains("active") &&
          !s.classList.contains("active")
        ) {
          c.classList.add("controls-hidden");
        }
      }, 3000);
    };
    c.addEventListener("mousemove", r);
    c.addEventListener("touchstart", r);
    c.addEventListener("click", r);
    document.addEventListener("fullscreenchange", () => {
      if (!document.fullscreenElement) {
        clearTimeout(this.fsTimer);
        c.classList.remove("controls-hidden");
        const bar = this.$g("w-controls-bar");
        if (bar) {
          bar.classList.remove(
            "collapsed-left",
            "collapsed-right",
            "collapsed-up",
            "collapsed-down",
          );
          this.resetCollapseBtns();
        }
      } else {
        r();
      }
    });
  },
  setupCardPeekTouch: function () {
    let peekTimer = null;
    let activeCard = null;
    let startX = 0;
    let startY = 0;
    let didPeek = false;
    const peekedCards = new Set();
    const clearActive = (card) => {
      if (card) card.classList.remove("is-peeking");
    };
    document.addEventListener(
      "touchstart",
      (e) => {
        if (
          e.target.closest(".bookmark-btn") ||
          e.target.closest(".remove-btn") ||
          e.target.closest(".watched-badge")
        )
          return;
        const card = e.target.closest(".poster-card");
        clearTimeout(peekTimer);
        if (activeCard && activeCard !== card) clearActive(activeCard);
        if (!card) {
          activeCard = null;
          didPeek = false;
          return;
        }
        activeCard = card;
        didPeek = false;
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
        peekTimer = setTimeout(() => {
          if (activeCard) {
            activeCard.classList.add("is-peeking");
            didPeek = true;
            peekedCards.add(activeCard);
            if (navigator.vibrate) navigator.vibrate(30);
            const pId = activeCard.getAttribute("data-show-id");
            const pType = activeCard.getAttribute("data-show-type");
            if (pId) this.prefetchShowinfo(pId, pType);
          }
        }, 140);
      },
      { passive: true },
    );
    document.addEventListener(
      "touchmove",
      (e) => {
        if (!activeCard && !didPeek) return;
        const touch = e.touches[0];
        if (!touch) return;
        if (!didPeek) {
          const dx = Math.abs(touch.clientX - startX);
          const dy = Math.abs(touch.clientY - startY);
          if (dx > 16 || dy > 16) {
            clearTimeout(peekTimer);
            if (activeCard) clearActive(activeCard);
            activeCard = null;
          }
        } else {
          const target = document.elementFromPoint(
            touch.clientX,
            touch.clientY,
          );
          const newCard = target ? target.closest(".poster-card") : null;
          if (newCard !== activeCard) {
            if (activeCard) clearActive(activeCard);
            activeCard = newCard;
            if (activeCard) {
              activeCard.classList.add("is-peeking");
              peekedCards.add(activeCard);
              if (navigator.vibrate) navigator.vibrate(20);
            }
          }
        }
      },
      { passive: true },
    );
    const finishTouch = () => {
      clearTimeout(peekTimer);
      const cardToReset = activeCard;
      const hadPeeked = didPeek;
      activeCard = null;
      didPeek = false;
      if (cardToReset) clearActive(cardToReset);
      if (hadPeeked && peekedCards.size > 0) {
        peekedCards.forEach((c) => {
          c._suppressClick = true;
          setTimeout(() => {
            c._suppressClick = false;
          }, 300);
        });
        peekedCards.clear();
      }
    };
    document.addEventListener("touchend", finishTouch, { passive: true });
    document.addEventListener("touchcancel", finishTouch, { passive: true });
    document.addEventListener(
      "click",
      (e) => {
        const card = e.target.closest(".poster-card");
        if (card && card._suppressClick) {
          e.preventDefault();
          e.stopPropagation();
          card._suppressClick = false;
        }
      },
      true,
    );
  },
  setupUniversalTouchHover: function () {
    let hoverTimer = null;
    let activeTarget = null;
    let startX = 0;
    let startY = 0;
    let didHold = false;
    const heldElements = new Set();
    const clearHover = (el) => {
      if (el) el.classList.remove("is-touch-hover");
    };
    const selector =
      'button, a, [role="button"], .scroll-arrow, .explore-card, .mylist-hub-card, .custom-list-card, .view-all, .btn-icon, .btn-primary, .ep-card, .ep-page-btn, .history-group-delete-btn, .history-ep-delete-btn, .custom-list-del-btn, .rating-hint-btn, #si-more-similar-btn, .nav-btn, .tab-btn, .si-action-btn, .si-media-arrow, .sheet-item, .search-recent-item, .recent-del-btn, .hero-dot, .btn-filter-toggle, .btn-anime, .btn-lucky, #filter-type-clear, .btn-new-list, .btn-rename-list, .btn-new-list-action, .popover-header, .popover-row, .storage-action-btn, .history-ep-group-title, .bookmark-btn, .remove-btn, .si-cast-card, .si-cast-toggle-title, .section-nav-title, .si-season-card, .si-media-card, .catalog-type-filter-btn, [data-touch-hover], .clickable';
    document.addEventListener(
      "touchstart",
      (e) => {
        if (
          e.target.closest(".poster-card") &&
          !e.target.closest(".bookmark-btn, .remove-btn")
        )
          return;
        const target = e.target.closest(selector);
        clearTimeout(hoverTimer);
        if (activeTarget && activeTarget !== target) clearHover(activeTarget);
        if (
          !target ||
          target.disabled ||
          target.classList.contains("disabled")
        ) {
          activeTarget = null;
          didHold = false;
          return;
        }
        activeTarget = target;
        didHold = false;
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
        hoverTimer = setTimeout(() => {
          if (activeTarget) {
            activeTarget.classList.add("is-touch-hover");
            didHold = true;
            heldElements.add(activeTarget);
            if (navigator.vibrate) navigator.vibrate(20);
          }
        }, 140);
      },
      { passive: true },
    );
    document.addEventListener(
      "touchmove",
      (e) => {
        if (!activeTarget && !didHold) return;
        const touch = e.touches[0];
        if (!touch) return;
        if (!didHold) {
          const dx = Math.abs(touch.clientX - startX);
          const dy = Math.abs(touch.clientY - startY);
          if (dx > 14 || dy > 14) {
            clearTimeout(hoverTimer);
            if (activeTarget) clearHover(activeTarget);
            activeTarget = null;
          }
        } else {
          const target = document.elementFromPoint(
            touch.clientX,
            touch.clientY,
          );
          const newTarget = target ? target.closest(selector) : null;
          if (newTarget !== activeTarget) {
            if (activeTarget) clearHover(activeTarget);
            activeTarget = newTarget;
            if (
              activeTarget &&
              !activeTarget.disabled &&
              !activeTarget.classList.contains("disabled") &&
              (!activeTarget.closest(".poster-card") ||
                activeTarget.closest(".bookmark-btn, .remove-btn"))
            ) {
              activeTarget.classList.add("is-touch-hover");
              heldElements.add(activeTarget);
              if (navigator.vibrate) navigator.vibrate(20);
            }
          }
        }
      },
      { passive: true },
    );
    const finishTouch = () => {
      clearTimeout(hoverTimer);
      const elToReset = activeTarget;
      const wasHeld = didHold;
      activeTarget = null;
      didHold = false;
      if (elToReset) clearHover(elToReset);
      if (wasHeld && heldElements.size > 0) {
        heldElements.forEach((el) => {
          el._suppressClick = true;
          setTimeout(() => {
            el._suppressClick = false;
          }, 300);
        });
        heldElements.clear();
      }
      if (
        document.activeElement &&
        typeof document.activeElement.blur === "function"
      ) {
        document.activeElement.blur();
      }
    };
    document.addEventListener("touchend", finishTouch, { passive: true });
    document.addEventListener("touchcancel", finishTouch, { passive: true });
    document.addEventListener(
      "click",
      (e) => {
        const el = e.target.closest(selector);
        if (el && el._suppressClick) {
          e.preventDefault();
          e.stopPropagation();
          el._suppressClick = false;
        }
      },
      true,
    );
  },
  startLoader: function () {
    const l = this.$g("top-loader");
    if (!l) return;
    if (this.loaderTimer) clearTimeout(this.loaderTimer);
    l.style.transition = "none";
    l.style.width = "0";
    l.style.opacity = "1";
    setTimeout(() => {
      if (l) {
        l.style.transition = "width 0.4s ease, opacity 0.3s ease";
        l.style.width = "40%";
      }
    }, 50);
  },
  stopLoader: function () {
    this.hidePageReloadOverlay();
    const l = this.$g("top-loader");
    if (!l) return;
    l.style.width = "100%";
    if (this.loaderTimer) clearTimeout(this.loaderTimer);
    this.loaderTimer = setTimeout(() => {
      if (l) {
        l.style.opacity = "0";
        setTimeout(() => {
          if (l) {
            l.style.transition = "none";
            l.style.width = "0";
          }
        }, 300);
      }
    }, 400);
  },
  resetPlayerIframe: function () {
    const c = document.querySelector(".iframe-container");
    if (c) {
      c.innerHTML =
        '<iframe id="main-iframe" class="w-full h-full border-none" frameborder="0" scrolling="no" referrerpolicy="origin" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope" allowtransparency="true" style="background-color:#000000;"></iframe><button type="button" id="w-fs-overlay-btn" class="w-fs-overlay-btn" aria-label="Toggle Fullscreen" onclick="app.toggleFullscreen()"></button>';
    }
  },
  setupScrollEvents: function () {
    const upBtn = this.$g("upBtn");
    let upBtnTimer = null;
    window.addEventListener(
      "scroll",
      () => {
        if (window.scrollY > 300) {
          upBtn.classList.add("visible");
          clearTimeout(upBtnTimer);
          upBtnTimer = setTimeout(() => {
            upBtn.classList.remove("visible");
          }, 1800);
        } else {
          clearTimeout(upBtnTimer);
          upBtn.classList.remove("visible");
        }
        if (
          this.currentView === "movies" ||
          this.currentView === "shows" ||
          this.currentView === "series" ||
          this.currentView === "people" ||
          this.currentView === "companies"
        ) {
          if (
            window.innerHeight + window.scrollY >=
            document.body.offsetHeight - 800
          ) {
            if (
              !this.exploreLoading &&
              this.exploreHasMore !== false &&
              this.explorePage < 500
            ) {
              this.explorePage++;
              this.loadExplore();
            }
          }
        }
        if (this.currentView === "search" && this.similarSearch) {
          if (
            window.innerHeight + window.scrollY >=
            document.body.offsetHeight - 800
          ) {
            if (
              !this.similarSearchLoading &&
              this.similarSearch.page < this.similarSearch.totalPages
            ) {
              this.loadNextSimilarPage();
            }
          }
        }
        if (this.currentView === "person") {
          if (
            window.innerHeight + window.scrollY >=
            document.body.offsetHeight - 800
          ) {
            this.loadMorePersonFilmography();
          }
        }
        if (this.currentView === "source") {
          if (
            window.innerHeight + window.scrollY >=
            document.body.offsetHeight - 800
          ) {
            this.loadMoreSourceCatalog();
          }
        }
      },
      {
        passive: true,
      },
    );
  },
  updateArrows: function () {
    document
      .querySelectorAll(".scroll-row")
      .forEach((row) => this.checkScrollArrow(row));
  },
  pauseRowSlide: function (row) {
    if (!row) return;
    row.dataset.userInteracting = "1";
    clearTimeout(row.interactTimer);
    row.interactTimer = setTimeout(() => {
      row.dataset.userInteracting = "0";
    }, this.rowSlideDelay);
  },
  startRowAutoSlide: function () {
    this.stopRowAutoSlide();
    if (this.uiPrefs && this.uiPrefs.turnOffAutoSlide) return;
    this.infiniteRows.forEach((id, idx) => {
      const row = this.$g(id);
      if (!row) return;
      if (!row.dataset.hasSlideEvents) {
        row.dataset.hasSlideEvents = "1";
        row.addEventListener(
          "touchstart",
          () => {
            row.dataset.userInteracting = "1";
          },
          {
            passive: true,
          },
        );
        row.addEventListener(
          "touchend",
          () => {
            this.pauseRowSlide(row);
          },
          {
            passive: true,
          },
        );
        row.addEventListener("mouseenter", () => {
          row.dataset.userInteracting = "1";
        });
        row.addEventListener("mouseleave", () => {
          row.dataset.userInteracting = "0";
        });
        setTimeout(() => {
          const unit = row.scrollWidth / 3;
          if (unit > 0) row.scrollLeft = unit + idx * 85;
        }, 150);
      }
      const rowInterval = 2800 + idx * 500;
      row.slideTimer = setInterval(() => {
        if (this.currentView !== "home") return;
        if (
          !row ||
          row.dataset.userInteracting === "1" ||
          row._isWrapping ||
          this.activePopoverShowId
        )
          return;
        const unit = row.scrollWidth / 3;
        if (unit > 0 && row.scrollLeft >= unit * 1.9) {
          row._isWrapping = true;
          row.scrollLeft -= unit;
          requestAnimationFrame(() => {
            row._isWrapping = false;
          });
          return;
        }
        const card = row.firstElementChild;
        const cardWidth = card ? card.offsetWidth : 140;
        const step = (cardWidth + 15) * 2;
        row.scrollBy({
          left: step,
          behavior: "smooth",
        });
      }, rowInterval);
    });
  },
  stopRowAutoSlide: function () {
    this.infiniteRows.forEach((id) => {
      const row = this.$g(id);
      if (row && row.slideTimer) {
        clearInterval(row.slideTimer);
        row.slideTimer = null;
      }
    });
  },
  scrollRow: function (btn, amount) {
    const container = btn.closest(".scroll-row-container") || btn.parentElement;
    const row = container ? container.querySelector(".scroll-row") : null;
    if (row) {
      this.pauseRowSlide(row);
      if (this.infiniteRows.includes(row.id)) {
        const unit = row.scrollWidth / 3;
        if (unit > 0) {
          if (amount > 0 && row.scrollLeft >= unit * 1.9 - 50) {
            row.scrollLeft -= unit;
          } else if (amount < 0 && row.scrollLeft <= unit * 0.7 + 50) {
            row.scrollLeft += unit;
          }
        }
      }
      row.scrollBy({
        left: amount,
        behavior: "smooth",
      });
    }
  },
  checkScrollArrow: function (row) {
    if (!row) return;
    const isInf = this.infiniteRows.includes(row.id);
    const container = row.closest(".scroll-row-container") || row.parentElement;
    const leftBtn = container
      ? container.querySelector(":scope > .scroll-arrow.left")
      : null;
    const rightBtn = container
      ? container.querySelector(":scope > .scroll-arrow.right")
      : null;
    if (isInf) {
      if (!row._isWrapping) {
        const unit = row.scrollWidth / 3;
        if (unit > 0) {
          if (row.scrollLeft >= unit * 1.9) {
            row._isWrapping = true;
            row.scrollLeft -= unit;
            requestAnimationFrame(() => {
              row._isWrapping = false;
            });
          } else if (row.scrollLeft <= unit * 0.7) {
            row._isWrapping = true;
            row.scrollLeft += unit;
            requestAnimationFrame(() => {
              row._isWrapping = false;
            });
          }
        }
      }
      if (leftBtn) {
        leftBtn.style.display = "flex";
        leftBtn.disabled = false;
        leftBtn.classList.remove("is-edge-hidden");
      }
      if (rightBtn) {
        rightBtn.style.display = "flex";
        rightBtn.disabled = false;
        rightBtn.classList.remove("is-edge-hidden");
      }
      return;
    }
    const hasOverflow = row.scrollWidth > row.clientWidth + 5;
    if (!hasOverflow) {
      if (leftBtn) {
        leftBtn.style.display = "none";
        leftBtn.disabled = true;
        leftBtn.classList.add("is-edge-hidden");
      }
      if (rightBtn) {
        rightBtn.style.display = "none";
        rightBtn.disabled = true;
        rightBtn.classList.add("is-edge-hidden");
      }
      return;
    }
    const atStart = row.scrollLeft <= 5;
    const atEnd = row.scrollLeft + row.clientWidth >= row.scrollWidth - 15;
    if (leftBtn) {
      leftBtn.style.display = "flex";
      leftBtn.disabled = atStart;
      leftBtn.classList.toggle("is-edge-hidden", atStart);
    }
    if (rightBtn) {
      rightBtn.style.display = "flex";
      rightBtn.disabled = atEnd;
      rightBtn.classList.toggle("is-edge-hidden", atEnd);
    }
  },
  async api(endpoint, params = {}, keyOverride = null, forceRefresh = false) {
    const norm = this.normalizeParams(params);
    const cacheKey = norm ? `${endpoint}?${norm}` : endpoint;
    const isDetailAppend = Boolean(params && params.append_to_response);
    if (!forceRefresh) {
      if (isDetailAppend) {
        const m = endpoint.match(/^\/(movie|tv)\/(\d+)$/);
        if (m) {
          const cShow = this.getShowDetailsCache
            ? this.getShowDetailsCache(`${m[1]}_${m[2]}`) ||
              this.getShowDetailsCache(m[2])
            : null;
          if (cShow && cShow.data) return cShow.data;
        }
      } else if (this.tmdbCache) {
        const c = this.lruGet(this.tmdbCache, cacheKey);
        if (c) {
          const isDynamic =
            endpoint.includes("/trending/") || endpoint.includes("/discover/");
          const isStale =
            isDynamic && c._ts && Date.now() - c._ts > 30 * 60 * 1000;
          if (isStale && (!this.apiInFlight || !this.apiInFlight[cacheKey])) {
            c._ts = Date.now();
            setTimeout(() => {
              this.api(endpoint, params, keyOverride, true).catch(() => {});
            }, 120);
          }
          return c;
        }
      }
    }
    return this._runInFlight("apiInFlight", cacheKey, async () => {
      const u = new URL(`${BASE_URL}${endpoint}`);
      const activeKey = keyOverride || this.getTmdbKey();
      if (activeKey) u.searchParams.append("api_key", activeKey);
      for (let k in params) u.searchParams.append(k, params[k]);
      try {
        const res = await fetch(u);
        if (!res.ok) throw new Error("API req failed");
        const data = await res.json();
        if (
          !isDetailAppend &&
          data &&
          (data.id ||
            (Array.isArray(data.results) && data.results.length > 0) ||
            Array.isArray(data.genres) ||
            Array.isArray(data))
        ) {
          data._ts = Date.now();
          this.lruSet(this.tmdbCache, cacheKey, data, "tmdb");
        }
        return data;
      } catch (e) {
        return {
          results: [],
        };
      }
    });
  },
  async fetchGenres() {
    const cached = this.$storeGet("tmdb_genres_cache");
    if (
      cached &&
      cached.genres &&
      Date.now() - (cached.time || 0) < 7 * 86400000
    ) {
      this.genres = cached.genres;
      return;
    }
    const [mRes, tRes] = await Promise.all([
      this.api("/genre/movie/list"),
      this.api("/genre/tv/list"),
    ]);
    if (mRes && mRes.genres) this.genres.movie = mRes.genres;
    if (tRes && tRes.genres) this.genres.tv = tRes.genres;
    this.$storeSet("tmdb_genres_cache", {
      genres: this.genres,
      time: Date.now(),
    });
  },
  async loadCachedConfig(storeKey, endpoint, mapper) {
    const cached = this.$storeGet(storeKey);
    if (
      cached &&
      Array.isArray(cached.list) &&
      cached.list.length > 0 &&
      Date.now() - (cached.time || 0) < 7 * 86400000
    ) {
      return cached.list;
    }
    const data = await this.api(endpoint);
    if (data && data.length) {
      const list = mapper(data);
      this.$storeSet(storeKey, { list, time: Date.now() });
      return list;
    }
    return [];
  },
  async fetchCountries() {
    this.countriesList = await this.loadCachedConfig(
      "tmdb_countries_cache",
      "/configuration/countries",
      (data) =>
        data
          .map((c) => ({
            code: c.iso_3166_1 === "GB" ? "UK" : c.iso_3166_1,
            name: c.english_name,
          }))
          .sort((a, b) => a.name.localeCompare(b.name)),
    );
    if (this.countriesList) {
      this.countriesList.forEach((c) => {
        this.countryMap[c.code] = c.name;
      });
      this.countryMap["GB"] = "United Kingdom";
      this.countryMap["UK"] = "United Kingdom";
    }
  },
  getCountryOptions: function (target) {
    if (target === "person") {
      const credits = this.personAllCredits || [];
      const ctrySet = new Set();
      credits.forEach((c) => {
        const code = this.getCountryCode(c);
        if (code) ctrySet.add(code);
      });
      return Array.from(ctrySet)
        .map((code) => ({
          id: code,
          name: this.countryMap[code] || code,
          extra: code,
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
    }
    if (target === "source") {
      const titles = this.sourceAllTitles || [];
      const ctrySet = new Set();
      titles.forEach((t) => {
        const code = this.getCountryCode(t);
        if (code) ctrySet.add(code);
      });
      return Array.from(ctrySet)
        .map((code) => ({
          id: code,
          name: this.countryMap[code] || code,
          extra: code,
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
    }
    const gList =
      target === "block"
        ? this.getBlockMultiList("genre")
        : this.getMultiList("genre", this.exploreType) || [];
    if (gList.some((g) => g.id === "anime")) {
      const aniCountries = [
        { id: "CN", name: "China", extra: "CN" },
        { id: "JP", name: "Japan", extra: "JP" },
        { id: "KR", name: "South Korea", extra: "KR" },
      ];
      return aniCountries;
    }
    if (!this.countriesList || this.countriesList.length === 0) return [];
    const list = this.countriesList.map((c) => ({
      id: c.code,
      name: c.name,
      extra: c.code,
    }));
    return list;
  },
  searchCountry: function (query, target) {
    this.searchFilterDropdown("country", query, target);
  },
  async fetchLanguages() {
    this.languagesList = await this.loadCachedConfig(
      "tmdb_languages_cache",
      "/configuration/languages",
      (data) =>
        data
          .filter((l) => l && l.iso_639_1 && (l.english_name || l.name))
          .map((l) => ({
            code: l.iso_639_1.toLowerCase(),
            name: l.english_name || l.name,
          }))
          .filter((l) => l.name && l.name !== "No Language")
          .sort((a, b) => a.name.localeCompare(b.name)),
    );
    if (this.languagesList) {
      this.languagesList.forEach((l) => {
        this.languageMap[l.code] = l.name;
      });
      if (!this.tmdbLangMap) this.tmdbLangMap = {};
      Object.assign(this.tmdbLangMap, this.languageMap);
    }
  },
  getTypeOptions: function (target) {
    if (target === "block") {
      return [
        {
          val: "movie",
          name: "Movies",
        },
        {
          val: "tv",
          name: "Shows",
        },
      ];
    }
    if (target === "person") {
      return [{ val: "known_for", name: "Known For" }];
    }
    if (target === "source") {
      return [
        { val: "trending", name: "Trending" },
        { val: "top_rated", name: "Top Rated" },
      ];
    }
    if (target === "explore" && this.exploreType === "person") {
      return [
        { val: "popular", name: "Popular" },
        { val: "trending", name: "Trending" },
      ];
    }
    if (target === "explore" && this.exploreType === "company") {
      return [
        { val: "popular", name: "Popular" },
        { val: "trending", name: "Trending" },
        { val: "top_rated", name: "Top Rated" },
      ];
    }
    const isShows = this.exploreType === "tv";
    const hasAnime =
      target === "explore" &&
      (this.getMultiList("genre") || []).some((item) => item.id === "anime");
    const mid =
      this.exploreType === "movie"
        ? { val: "revenue", name: "Box Office" }
        : { val: "airing", name: "Currently Airing" };
    const opts = hasAnime
      ? [
          { val: "trending", name: "Trending" },
          { val: "newest", name: "New Releases" },
        ]
      : [
          { val: "popular", name: "Popular" },
          { val: "trending", name: "Trending" },
          { val: "newest", name: "New Releases" },
        ];
    if (!hasAnime || isShows) {
      opts.push(mid);
    }
    if (hasAnime) {
      opts.push({ val: "popular", name: "Top Rated" });
    } else {
      opts.push({ val: "top_rated", name: "Top Rated" });
    }
    if (hasAnime && isShows) {
      opts.push({ val: "specials", name: "Specials" });
    }
    return opts;
  },
  toggleTypeDropdown: function (target) {
    this.toggleFilterDropdown("type", target);
  },
  toggleFilterDropdown: function (key, target) {
    if (
      target === "explore" &&
      key === "genre" &&
      this.getMultiList("genre").some((item) => item.id === "anime")
    )
      return;
    const fieldKey = this.getFieldKey(key);
    const prefix =
      target === "block"
        ? "bc-"
        : target === "person"
          ? "pf-"
          : target === "source"
            ? "sf-"
            : "filter-";
    const drop = this.$g(`${prefix}${fieldKey}-drop`);
    if (drop && drop.style.display === "block") {
      drop.style.display = "none";
      drop.innerHTML = "";
      drop.style.minWidth = "";
      drop.style.width = "";
    } else {
      const inp = this.$g(`${prefix}${fieldKey}-input`);
      if (inp) inp.focus();
      const val = inp ? inp.value : "";
      const dispatch = {
        compNet: () => this.searchCompNet(val, target),
        person: () => this.searchPerson(val, target),
        aniStudio: () => this.searchAniStudio(val, target),
        aniStaff: () => this.searchAniStaff(val, target),
        aniTag: () => this.searchAniTag(val, target),
        type: () => this.searchType("", target),
      };
      if (dispatch[key]) dispatch[key]();
      else this.searchFilterDropdown(key, "", target);
    }
  },
  activateMultiInput: function (key, target = "explore") {
    if (
      target === "explore" &&
      key === "genre" &&
      this.getMultiList("genre").some((item) => item.id === "anime")
    )
      return;
    const fieldKey = this.getFieldKey(key);
    const prefix =
      target === "block"
        ? "bc"
        : target === "person"
          ? "pf"
          : target === "source"
            ? "sf"
            : "filter";
    const inp = this.$g(`${prefix}-${fieldKey}-input`);
    this.syncMultiInputUI(inp, true);
    if (inp) inp.focus();
    this.toggleFilterDropdown(key, target);
  },
  updateTypeInputWidth: function (target = "explore") {
    const prefix =
      target === "block"
        ? "bc"
        : target === "person"
          ? "pf"
          : target === "source"
            ? "sf"
            : "filter";
    const inp = this.$g(`${prefix}-type-input`);
    if (!inp) return;
    const clr = this.$g(`${prefix}-type-clear`);
    const curVal = this.$g(`${prefix}-type`)?.value;
    const hasClr =
      target === "explore"
        ? Boolean(curVal && curVal !== "all")
        : Boolean(curVal);
    if (clr) clr.style.display = hasClr ? "inline-flex" : "none";
    const defPh = target === "block" ? "Type" : "Sort By";
    const txt = inp.value || inp.placeholder || defPh;
    let textWidth = 0;
    try {
      if (!this._typeCanvas)
        this._typeCanvas = document.createElement("canvas");
      const ctx = this._typeCanvas.getContext("2d");
      if (ctx) {
        const compStyle = window.getComputedStyle(inp);
        ctx.font = `${compStyle.fontWeight || "400"} ${compStyle.fontSize || "13.76px"} ${compStyle.fontFamily || "sans-serif"}`;
        textWidth = ctx.measureText(txt).width;
      }
    } catch (e) {
      textWidth = 0;
    }
    if (!textWidth) textWidth = Math.round(txt.length * 8.6);
    inp.style.paddingRight = hasClr ? "28px" : "12px";
    inp.style.paddingLeft = "12px";
    inp.style.textAlign = "left";
    inp.style.width = hasClr
      ? Math.ceil(textWidth + 44) + "px"
      : target === "block"
        ? "72px"
        : "84px";
  },
  searchType: function (query, target) {
    const prefix =
      target === "block"
        ? "bc"
        : target === "person"
          ? "pf"
          : target === "source"
            ? "sf"
            : "filter";
    const drop = this.$g(`${prefix}-type-drop`);
    const clr = this.$g(`${prefix}-type-clear`);
    if (clr) {
      const curVal = this.$g(`${prefix}-type`)?.value;
      const hasClr =
        target === "explore"
          ? Boolean(curVal && curVal !== "all")
          : Boolean(curVal);
      clr.style.display = hasClr ? "inline-flex" : "none";
      this.updateTypeInputWidth(target);
    }
    const q = query.trim().toLowerCase();
    const opts = this.getTypeOptions(target).filter(
      (o) => !q || o.name.toLowerCase().includes(q),
    );
    this.setDropHtml(
      drop,
      opts
        .map(
          (o) =>
            `<div class="comp-net-item" onclick="app.selectType('${o.val}','${o.name}','${target}')"><span>${o.name}</span></div>`,
        )
        .join(""),
    );
  },
  selectType: function (val, name, target) {
    const prefix =
      target === "block"
        ? "bc"
        : target === "person"
          ? "pf"
          : target === "source"
            ? "sf"
            : "filter";
    const inp = this.$g(`${prefix}-type-input`);
    const hiddenId = this.$g(`${prefix}-type`);
    const drop = this.$g(`${prefix}-type-drop`);
    const clr = this.$g(`${prefix}-type-clear`);
    if (hiddenId) hiddenId.value = val;
    if (inp) {
      const isDef =
        (target === "explore" && (!val || val === "all")) ||
        (target === "block" && !val);
      inp.value = isDef ? "" : name;
    }
    if (clr) {
      const hasClr =
        target === "explore" ? Boolean(val && val !== "all") : Boolean(val);
      clr.style.display = hasClr ? "inline-flex" : "none";
    }
    this.updateTypeInputWidth(target);
    if (drop) {
      drop.style.display = "none";
      drop.innerHTML = "";
    }
    if (target === "explore") {
      this.saveExplorePrefs();
      this.resetExplore();
    } else if (target === "person") {
      this.applyPersonFilters();
    } else if (target === "source") {
      this.applySourceFilters();
    }
  },
  clearType: function (target) {
    const defVal = target === "explore" ? "all" : "";
    const defName = "";
    this.selectType(defVal, defName, target);
    const prefix =
      target === "block"
        ? "bc"
        : target === "person"
          ? "pf"
          : target === "source"
            ? "sf"
            : "filter";
    const inp = this.$g(`${prefix}-type-input`);
    if (inp) inp.focus();
  },
  getGenreOptions: function (target) {
    if (target === "block") {
      const gMap = new Map();
      (this.genres.movie || []).forEach((g) => gMap.set(g.id, g.name));
      (this.genres.tv || []).forEach((g) => gMap.set(g.id, g.name));
      const gList = Array.from(gMap.entries())
        .sort((a, b) => a[1].localeCompare(b[1]))
        .map((e) => ({
          id: String(e[0]),
          name: e[1],
        }));
      return [
        {
          id: "anime",
          name: "Anime",
        },
        ...gList,
      ];
    }
    if (target === "person") {
      const credits = this.personAllCredits || [];
      const genreMap = new Map();
      credits.forEach((c) => {
        (c.genres || []).forEach((g) => {
          if (g && g.id) genreMap.set(String(g.id), g.name || String(g.id));
        });
        (c.genre_ids || []).forEach((gid) => {
          const gName =
            (this.genres.movie || []).find((x) => x.id === gid)?.name ||
            (this.genres.tv || []).find((x) => x.id === gid)?.name;
          if (gName) genreMap.set(String(gid), gName);
        });
      });
      return Array.from(genreMap.entries())
        .sort((a, b) => a[1].localeCompare(b[1]))
        .map(([id, name]) => ({ id, name }));
    }
    if (target === "source") {
      const titles = this.sourceAllTitles || [];
      const genreMap = new Map();
      titles.forEach((t) => {
        (t.genres || []).forEach((g) => {
          if (g && g.id) genreMap.set(String(g.id), g.name || String(g.id));
        });
        (t.genre_ids || []).forEach((gid) => {
          const gName =
            (this.genres.movie || []).find((x) => x.id === gid)?.name ||
            (this.genres.tv || []).find((x) => x.id === gid)?.name;
          if (gName) genreMap.set(String(gid), gName);
        });
      });
      return Array.from(genreMap.entries())
        .sort((a, b) => a[1].localeCompare(b[1]))
        .map(([id, name]) => ({ id, name }));
    }
    const list = (this.genres[this.exploreType] || []).map((g) => ({
      id: String(g.id),
      name: g.name,
    }));
    return list;
  },
  getGenre2Options: function (target = "explore") {
    const anilistGenres = [
      "Action",
      "Adventure",
      "Comedy",
      "Drama",
      "Ecchi",
      "Fantasy",
      "Horror",
      "Mahou Shoujo",
      "Mecha",
      "Music",
      "Mystery",
      "Psychological",
      "Romance",
      "Sci-Fi",
      "Slice of Life",
      "Sports",
      "Supernatural",
      "Thriller",
    ];
    const gList =
      target === "block"
        ? this.getBlockMultiList("genre")
        : this.getMultiList("genre", this.exploreType) || [];
    const hasAnime = gList.some((g) => g.id === "anime");
    if (hasAnime) {
      return anilistGenres.map((g) => ({
        id: g,
        name: g,
      }));
    }
    const list = (this.genres[this.exploreType] || [])
      .filter(
        (g) =>
          parseInt(g.id, 10) !== 16 &&
          (g.name || "").toLowerCase() !== "animation",
      )
      .map((g) => ({
        id: String(g.id),
        name: g.name,
      }));
    return list;
  },
  getSeasonOptions: function () {
    return [
      { id: "winter", name: "Winter" },
      { id: "spring", name: "Spring" },
      { id: "summer", name: "Summer" },
      { id: "fall", name: "Fall" },
    ];
  },
  getExpRoleOptions: function () {
    if (this.exploreType === "person") {
      return [
        { id: "Acting", name: "Acting" },
        { id: "Directing", name: "Directing" },
        { id: "Writing", name: "Writing" },
        { id: "Production", name: "Production" },
        { id: "Camera", name: "Camera" },
        { id: "Editing", name: "Editing" },
        { id: "Sound", name: "Sound" },
      ];
    }
    if (this.exploreType === "company") {
      return [
        { id: "platform", name: "Platform" },
        { id: "movie_studio", name: "Studio" },
        { id: "tv_network", name: "Network" },
      ];
    }
    return [];
  },
  getFilterOptions: function (key, target) {
    if (key === "genre") return this.getGenreOptions(target);
    if (key === "genre2") return this.getGenre2Options(target);
    if (key === "season") return this.getSeasonOptions();
    if (key === "year") return this.getYearOptions(target);
    if (key === "country") return this.getCountryOptions(target);
    if (key === "expRole" || key === "exp-role")
      return this.getExpRoleOptions();
    return [];
  },
  searchExpRole: function (query, target) {
    this.searchFilterDropdown("expRole", query, target);
  },
  searchSeason: function (query, target) {
    this.searchFilterDropdown("season", query, target);
  },
  searchFilterDropdown: function (key, query, target) {
    const fieldKey = this.getFieldKey
      ? this.getFieldKey(key)
      : key === "genre2"
        ? "genre2"
        : key;
    const prefix =
      target === "block"
        ? "bc-"
        : target === "person"
          ? "pf-"
          : target === "source"
            ? "sf-"
            : "filter-";
    const drop = this.$g(`${prefix}${fieldKey}-drop`);
    if (!drop) return;
    const q = query.trim().toLowerCase();
    let opts = this.getFilterOptions(key, target);
    opts = opts.filter(
      (o) =>
        !q ||
        o.name.toLowerCase().includes(q) ||
        (o.extra && o.extra.toLowerCase().includes(q)),
    );
    this.setDropHtml(
      drop,
      opts
        .map((o) =>
          this.renderDropItemHtml(
            key,
            o.id !== undefined ? o.id : o.val,
            o.name,
            o.extra,
            target,
          ),
        )
        .join(""),
    );
  },
  searchGenre: function (query, target) {
    this.searchFilterDropdown("genre", query, target);
  },
  searchGenre2: function (query, target) {
    this.searchFilterDropdown("genre2", query, target);
  },
  getYearOptions: function (target) {
    if (target === "person") {
      const credits = this.personAllCredits || [];
      const yearSet = new Set();
      credits.forEach((c) => {
        const y = c.actingYear || this.getItemYear(c);
        if (y && String(y).length === 4) yearSet.add(String(y));
      });
      return Array.from(yearSet)
        .sort((a, b) => b.localeCompare(a))
        .map((y) => ({ val: y, name: y }));
    }
    if (target === "source") {
      const titles = this.sourceAllTitles || [];
      const yearSet = new Set();
      titles.forEach((t) => {
        const y = this.getItemYear(t);
        if (y && String(y).length === 4) yearSet.add(String(y));
      });
      return Array.from(yearSet)
        .sort((a, b) => b.localeCompare(a))
        .map((y) => ({ val: y, name: y }));
    }
    const arr = [];
    for (let y = new Date().getFullYear(); y >= 1900; y--)
      arr.push({
        val: String(y),
        name: String(y),
      });
    return arr;
  },
  searchYear: function (query, target) {
    this.searchFilterDropdown("year", query, target);
  },
  buildCard: function (item, typeOverride = null, isHistory = false) {
    if (!isHistory && item && item.id) {
      if (!this.cardItemCache) this.cardItemCache = {};
      this.lruSet(
        this.cardItemCache,
        String(item.id),
        this.sanitizeCardItem ? this.sanitizeCardItem(item) : item,
        "card",
      );
    }
    if (!item || !item.poster_path) return "";
    const type =
      typeOverride || item.media_type || (item.name ? "tv" : "movie");
    if (isHistory) {
      if (this.isUserBlocked && this.isUserBlocked(item, type)) return "";
    } else {
      if (this.isBlocked && this.isBlocked(item, type)) return "";
    }
    const title = item.title || item.name;
    const year = this.getItemYear(item);
    const ctry = this.getCountryCode(item);
    const img = this.getImg(item.poster_path, "poster");
    const savedInfo = this.getSavedBtnInfo(item.id, false, item);
    const isWatched = Array.from(this.getEquivalentIds(item.id, item)).some(
      (eid) => Boolean(this.watchedList && this.watchedList[eid]),
    );
    const safeItem = this.encodeItem(this.toCardSummary(item, type));
    let rmBtn = "";
    if (isHistory === "bookmark") {
      rmBtn = `<div class="remove-btn" onclick="event.stopPropagation();app.removeFromBookmark('${item.id}')">&times;</div>`;
    } else if (
      typeof isHistory === "string" &&
      isHistory.startsWith("custom_list:")
    ) {
      const listId = isHistory.split(":")[1];
      rmBtn = `<div class="remove-btn" onclick="event.stopPropagation();app.removeFromCustomList('${listId}','${item.id}')">&times;</div>`;
    } else if (isHistory === "browsing") {
      rmBtn = `<div class="remove-btn" onclick="event.stopPropagation();app.removeFromBrowsingHistory('${item.id}')">&times;</div>`;
    } else if (
      isHistory &&
      isHistory !== "mylist" &&
      isHistory !== "watched" &&
      isHistory !== "markedaswatched"
    ) {
      rmBtn = `<div class="remove-btn" onclick="event.stopPropagation();app.removeFromHistory('${item.id}')">&times;</div>`;
    }
    const btnStar = savedInfo.icon;
    const btnClass = savedInfo.btnClass;
    const btnClickAttr = `onclick="event.stopPropagation();app.handleBookmarkBtnClick('${safeItem}',this)"`;
    const watchedBadge = isWatched
      ? `<div class="watched-badge" title="Watched">${EYE_SVG(13, 13)}</div>`
      : "";
    const metaParts = [];
    if (type) {
      if (type.toLowerCase() === "tv") {
        const rawTvType = this.getRawTvType(item);
        const displayType = this.formatSeriesType(rawTvType, "card");
        metaParts.push(
          `<span class="badge-type-tv-${item.id}">${displayType}</span>`,
        );
        if (!rawTvType && item.id && !String(item.id).startsWith("ani_")) {
          this.queueMetaFetch(item.id, "tv");
        }
      } else {
        const mType = this.resolveMovieType(item);
        const displayType = this.formatMovieType(mType, "card");
        metaParts.push(
          `<span class="badge-type-movie-${item.id}">${displayType}</span>`,
        );
      }
    }
    if (year) metaParts.push(`<span>${year}</span>`);
    if (ctry) {
      metaParts.push(`<span>${ctry}</span>`);
      if (
        type === "movie" &&
        item.original_language &&
        item.original_language.toLowerCase() === "en" &&
        !item.country &&
        !item.origin_country
      ) {
        this.queueMetaFetch(item.id, type);
      }
    }
    let cardMetaHtml = metaParts.join(
      '<span class="card-meta-dot">&bull;</span>',
    );
    if (!ctry && item.id && type === "movie") {
      cardMetaHtml += `<span class="badge-ctry-${type}-${item.id}" style="display:none;"></span>`;
      this.queueMetaFetch(item.id, type);
    }
    const titleLen = (title || "").length;
    let titleSizeClass = "";
    if (titleLen > 70) titleSizeClass = "title-xxs";
    else if (titleLen > 45) titleSizeClass = "title-xs";
    else if (titleLen > 25) titleSizeClass = "title-sm";
    const cachedRate =
      this.starRatingCache?.[`${type}_${item.id}`] ||
      this.starRatingCache?.[item.id];
    const rateVal =
      cachedRate ||
      (typeof item.vote_average === "number" && item.vote_average > 0
        ? item.vote_average.toFixed(1)
        : item.vote_average
          ? String(item.vote_average)
          : "");
    const ovParts = [];
    if (year) ovParts.push(year);
    if (ctry) ovParts.push(ctry);
    const rateSep = ovParts.length > 0 ? " &bull; " : "";
    const rateHtml = `<span class="badge-rate-wrap-${type}-${item.id}" style="display:${rateVal ? "inline-flex" : "none"};align-items:center;gap:3px;color:#f5c518;"><span style="color:#f3f4f6;margin-right:2px;">${rateSep}</span>${STAR_SVG(11, 11)}<span class="badge-rate-${type}-${item.id}">${rateVal}</span></span>`;
    const overlayMetaHtml = `${ovParts.join(" &bull; ")}${rateHtml}`;
    const metaBlock =
      year || ctry || rateVal
        ? '<div class="poster-overlay-meta">' + overlayMetaHtml + "</div>"
        : "";
    const overlayHtml =
      '<div class="poster-overlay"><div class="poster-overlay-title ' +
      titleSizeClass +
      '">' +
      title +
      "</div>" +
      metaBlock +
      "</div>";
    if (item.id && !String(item.id).startsWith("ani_")) {
      this.queueMetaFetch(item.id, type);
    }
    if (type === "tv" && item.id) this.queueAnimePrewarm(item);
    const roleHtml = item.personRole
      ? '<div class="card-person-role" title="' +
        item.personRole +
        '">' +
        item.personRole +
        "</div>"
      : "";
    return `<div class="poster-card" data-show-id="${item.id}" data-show-type="${type}" onmouseenter="app.prefetchShowinfo('${item.id}','${type}')" onpointerenter="app.prefetchShowinfo('${item.id}','${type}')" onclick="app.openShowinfo('${item.id}','${type}')"><div class="poster-img-container"><img src="${img}" class="poster-img" loading="lazy">${overlayHtml}${rmBtn}<div class="${btnClass}" ${btnClickAttr}>${btnStar}</div>${watchedBadge}</div><div class="card-title" title="${title}">${title}</div><div class="card-meta">${cardMetaHtml}</div>${roleHtml}</div>`;
  },
  extractCountryCodeFromBirthplace: function (place) {
    if (!place || typeof place !== "string") return "";
    const parts = place
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.length === 0) return "";
    const raw = parts[parts.length - 1].replace(/\.+$/, "").trim();
    const low = raw.toLowerCase();
    const aliases = {
      usa: "US",
      "u.s.a": "US",
      "u.s": "US",
      us: "US",
      "united states": "US",
      "united states of america": "US",
      uk: "UK",
      "u.k": "UK",
      "united kingdom": "UK",
      "great britain": "UK",
      england: "UK",
      scotland: "UK",
      wales: "UK",
      "northern ireland": "UK",
      "south korea": "KR",
      "republic of korea": "KR",
      korea: "KR",
      "north korea": "KP",
      russia: "RU",
      "russian federation": "RU",
      ussr: "RU",
      "soviet union": "RU",
      china: "CN",
      "people's republic of china": "CN",
      prc: "CN",
      "hong kong": "HK",
      taiwan: "TW",
      macau: "MO",
      japan: "JP",
      canada: "CA",
      australia: "AU",
      "new zealand": "NZ",
      france: "FR",
      germany: "DE",
      "west germany": "DE",
      italy: "IT",
      spain: "ES",
      india: "IN",
      mexico: "MX",
      brazil: "BR",
      argentina: "AR",
      colombia: "CO",
      chile: "CL",
      sweden: "SE",
      denmark: "DK",
      norway: "NO",
      finland: "FI",
      iceland: "IS",
      ireland: "IE",
      netherlands: "NL",
      holland: "NL",
      belgium: "BE",
      switzerland: "CH",
      austria: "AT",
      poland: "PL",
      czechia: "CZ",
      "czech republic": "CZ",
      turkey: "TR",
      indonesia: "ID",
      thailand: "TH",
      philippines: "PH",
      vietnam: "VN",
      malaysia: "MY",
      singapore: "SG",
      "south africa": "ZA",
      nigeria: "NG",
      egypt: "EG",
      israel: "IL",
      iran: "IR",
      greece: "GR",
      portugal: "PT",
      ukraine: "UA",
    };
    if (aliases[low]) return aliases[low];
    if (/^[a-z]{2}$/i.test(raw))
      return raw.toUpperCase() === "GB" ? "UK" : raw.toUpperCase();
    if (this.countriesList) {
      const match = this.countriesList.find(
        (c) => c.name && c.name.toLowerCase() === low,
      );
      if (match) return match.code;
    }
    return "";
  },
  buildPersonExploreCard: function (person) {
    if (!person || !person.id || !person.profile_path) return "";
    const name = person.name || "Person";
    const safeNameAttr = name.replace(/"/g, "&quot;");
    const dept = person.known_for_department || "Acting";
    const roleLabel = String(dept).toUpperCase();
    const ctry = person._country || "";
    const img = this.getImg(person.profile_path, "poster");
    const titleLen = name.length;
    let titleSizeClass = "";
    if (titleLen > 70) titleSizeClass = "title-xxs";
    else if (titleLen > 45) titleSizeClass = "title-xs";
    else if (titleLen > 25) titleSizeClass = "title-sm";
    const ctryMetaSpan = ctry
      ? '<span class="card-meta-dot">&bull;</span><span>' + ctry + "</span>"
      : '<span class="badge-person-ctry-' +
        person.id +
        '" style="display:none;"></span>';
    const cardMetaHtml = "<span>" + roleLabel + "</span>" + ctryMetaSpan;
    const ovCtrySpan = ctry
      ? '<span class="badge-person-ov-ctry-' +
        person.id +
        '"> &bull; ' +
        ctry +
        "</span>"
      : '<span class="badge-person-ov-ctry-' +
        person.id +
        '" style="display:none;"></span>';
    const overlayHtml =
      '<div class="poster-overlay"><div class="poster-overlay-title ' +
      titleSizeClass +
      '">' +
      name +
      '</div><div class="poster-overlay-meta">' +
      roleLabel +
      ovCtrySpan +
      "</div></div>";
    const safeDept = dept.replace(/'/g, "\\'");
    return (
      '<div class="poster-card" data-person-id="' +
      person.id +
      '" onclick="app.openPerson(\'' +
      person.id +
      "',true,false,'" +
      safeDept +
      '\')"><div class="poster-img-container"><img src="' +
      img +
      '" class="poster-img" loading="lazy">' +
      overlayHtml +
      '</div><div class="card-title" title="' +
      safeNameAttr +
      '">' +
      name +
      '</div><div class="card-meta">' +
      cardMetaHtml +
      "</div></div>"
    );
  },
  buildCompanyExploreCard: function (company) {
    if (!company || !company.id || !company.logo_path) return "";
    const name = company.name || "Company";
    const safeNameAttr = name.replace(/"/g, "&quot;");
    const safeNameJs = name.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
    const sourceType =
      company._sourceType === "network" ? "network" : "company";
    const typeLabel =
      company._catLabel || (sourceType === "network" ? "NETWORK" : "STUDIO");
    let ctry = company.origin_country || "";
    if (ctry === "GB") ctry = "UK";
    const img = this.getImg(company.logo_path, "poster");
    const titleLen = name.length;
    let titleSizeClass = "";
    if (titleLen > 70) titleSizeClass = "title-xxs";
    else if (titleLen > 45) titleSizeClass = "title-xs";
    else if (titleLen > 25) titleSizeClass = "title-sm";
    const ctryMetaSpan = ctry
      ? '<span class="card-meta-dot">&bull;</span><span>' + ctry + "</span>"
      : "";
    const cardMetaHtml = "<span>" + typeLabel + "</span>" + ctryMetaSpan;
    const ovCtryText = ctry ? " &bull; " + ctry : "";
    const overlayHtml =
      '<div class="poster-overlay"><div class="poster-overlay-title ' +
      titleSizeClass +
      '">' +
      name +
      '</div><div class="poster-overlay-meta">' +
      typeLabel +
      ovCtryText +
      "</div></div>";
    return (
      '<div class="poster-card poster-card-company" data-source-id="' +
      company.id +
      '" onclick="app.openSource(\'' +
      company.id +
      "','" +
      sourceType +
      "','" +
      safeNameJs +
      '\')"><div class="poster-img-container"><img src="' +
      img +
      '" class="poster-img" loading="lazy" crossorigin="anonymous" onload="app.applyCompanyLogoBg(this)" onerror="this.classList.add(\'loaded\')">' +
      overlayHtml +
      '</div><div class="card-title" title="' +
      safeNameAttr +
      '">' +
      name +
      '</div><div class="card-meta">' +
      cardMetaHtml +
      "</div></div>"
    );
  },
  clearBrowserAndAppCaches: function (fullReset = false) {
    if ("caches" in window) {
      caches
        .keys()
        .then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
        .catch(() => {});
    }
    try {
      sessionStorage.clear();
    } catch (e) {}
    if (fullReset) {
      try {
        localStorage.clear();
      } catch (e) {}
      window.location.href = window.location.pathname;
      return;
    }
    this.cardItemCache = {};
    this.tmdbCache = {};
    this.animeCache = {};
    this.episodeCache = {};
    this.showDetailsCache = {};
    this.tvTypeCache = {};
    this.starRatingCache = {};
    this.watchProvidersList = null;
    this.discoveredNetworks = {};
    this.networkSearchCache = {};
    this.$storeSet("tmdb_genres_cache", null);
    this.$storeSet("tmdb_countries_cache", null);
    this.$storeSet("sh_recent_searches", []);
  },
  executeBlockCurrentShow: function (skipGoBack = false) {
    if (!this.currentShow) return;
    const item = this.toCardSummary(this.currentShow);
    const idStr = String(item.id);
    if (
      !this.blocklist.some(
        (b) => String(b.id) === idStr && b.type === item.type,
      )
    ) {
      this.blocklist.push(item);
      this.$storeSet("sh_blocklist", this.blocklist);
    }
    document
      .querySelectorAll(`.poster-card[data-show-id="${idStr}"]`)
      .forEach((c) => c.remove());
    const title = item.title || item.name || "";
    if (title)
      this.showToast(
        `<span class="toast-title">${title}</span> added to Blocklist`,
      );
    if (!skipGoBack) this.goBack();
  },
  isBlocked: function (item, typeOverride = null) {
    if (!item) return false;
    const id = typeof item === "object" ? item.id : item;
    const numId = parseInt(id);
    const isValidObj =
      typeof item === "object" &&
      item.id &&
      (item.title || item.name) &&
      (item.poster_path || item.backdrop_path) &&
      !item.adult;
    if (
      isValidObj &&
      this.deadIds &&
      (this.deadIds.has(String(id)) || this.deadIds.has(numId))
    ) {
      this.deadIds.delete(String(id));
      this.deadIds.delete(numId);
    }
    if (
      !isValidObj &&
      this.deadIds &&
      (this.deadIds.has(String(id)) || this.deadIds.has(numId))
    )
      return true;
    const type =
      typeOverride ||
      (typeof item === "object"
        ? item.media_type || (item.name ? "tv" : "movie")
        : null);
    if (typeof item === "object") {
      if (
        !item.poster_path &&
        (!item.backdrop_path ||
          (!item.overview && (!item.genres || item.genres.length === 0)))
      )
        return true;
      if (item.adult) return true;
      const oLang = item.original_language || "";
      const ctry = Array.isArray(item.origin_country)
        ? item.origin_country
        : [];
      const hasGenres =
        (Array.isArray(item.genre_ids) && item.genre_ids.length > 0) ||
        (Array.isArray(item.genres) && item.genres.length > 0);
      const noGenres = !hasGenres;
      const isZeroVoteLowPop =
        typeof item.vote_count === "number" &&
        item.vote_count === 0 &&
        (item.popularity || 0) < 1;
      if (
        type === "tv" &&
        (ctry.includes("US") || oLang === "en") &&
        noGenres &&
        isZeroVoteLowPop
      )
        return true;
      if (
        type === "tv" &&
        ctry.length === 0 &&
        (!item.overview || !item.overview.trim()) &&
        isZeroVoteLowPop
      )
        return true;
      const rawDateStr0 = String(
        item.release_date || item.first_air_date || item.air_date || "",
      ).trim();
      const hasDate = Boolean(
        rawDateStr0 || (item.year && String(item.year).trim()),
      );
      const isZeroVote =
        typeof item.vote_count === "number" && item.vote_count === 0;
      if (!hasDate && isZeroVote) {
        if (type === "tv") return true;
        if (type === "movie") {
          const noOverview = !item.overview || !item.overview.trim();
          const noChar = !item.character || !item.character.trim();
          const lowPop = (item.popularity || 0) < 3;
          if (noOverview || noChar || noGenres || lowPop) return true;
        }
      }
      if (
        noGenres &&
        typeof item.vote_count === "number" &&
        item.vote_count === 0 &&
        (item.popularity || 0) < 0.5
      )
        return true;
      const itemYr = parseInt(this.getItemYear(item), 10);
      const rawDateStr = (
        item.release_date ||
        item.first_air_date ||
        item.air_date ||
        ""
      ).trim();
      if (rawDateStr) {
        const relTs = Date.parse(rawDateStr);
        if (!isNaN(relTs) && relTs - Date.now() >= 365 * 86400000) return true;
      }
      if (itemYr && itemYr > new Date().getFullYear() + 1) return true;
      if (
        this.isAnimeItem(item) &&
        (!itemYr || itemYr > new Date().getFullYear()) &&
        typeof item.vote_count === "number" &&
        item.vote_count === 0
      )
        return true;
    }
    if (this.isUserBlocked(item, typeOverride)) return true;
    return false;
  },
  isUserBlocked: function (item, typeOverride = null) {
    if (!item) return false;
    const id = typeof item === "object" ? item.id : item;
    const type =
      typeOverride ||
      (typeof item === "object"
        ? item.media_type || (item.name ? "tv" : "movie")
        : null);
    if (this.blocklist && Array.isArray(this.blocklist)) {
      if (
        this.blocklist.some(
          (b) =>
            String(b.id) === String(id) &&
            (!type || !b.type || b.type === type),
        )
      )
        return true;
    }
    if (
      typeof item === "object" &&
      this.catBlocklist &&
      Array.isArray(this.catBlocklist) &&
      this.catBlocklist.length > 0
    ) {
      const iYear = this.getItemYear(item);
      const iGen = Array.isArray(item.genre_ids)
        ? item.genre_ids
        : (item.genres || [])
            .map((g) => (typeof g === "object" ? g.id : parseInt(g, 10)))
            .filter(Boolean);
      const iCtry = this.getCountryCode(item);
      for (let r of this.catBlocklist) {
        const [rGenres, rGenre2s, rYears, rCountries, rPersons, rCompNets] =
          this.blockRulePairs.map(([pl, s]) => this.toRuleArr(r[pl], r[s]));
        const hasRuleCriteria =
          (r.type && r.type !== "all") ||
          rGenres.length > 0 ||
          rGenre2s.length > 0 ||
          rYears.length > 0 ||
          rCountries.length > 0 ||
          rPersons.length > 0 ||
          rCompNets.length > 0;
        if (!hasRuleCriteria) continue;
        if (r.type && r.type !== "all" && r.type !== type) continue;
        if (rGenres.length > 0) {
          const hasGenreMatch = rGenres.some((g) =>
            g === "anime" ? this.isAnimeItem(item) : iGen.includes(parseInt(g)),
          );
          if (!hasGenreMatch) continue;
        }
        if (rGenre2s.length > 0) {
          const itemGNames = (item.genres || []).map((g) =>
            typeof g === "string"
              ? g.toLowerCase()
              : (g?.name || "").toLowerCase(),
          );
          const hasGenre2Match = rGenre2s.some((g2) => {
            const g2Int = parseInt(g2, 10);
            return (
              (!isNaN(g2Int) && iGen.includes(g2Int)) ||
              itemGNames.includes(String(g2).toLowerCase())
            );
          });
          if (!hasGenre2Match) continue;
        }
        if (rYears.length > 0 && !rYears.includes(iYear)) continue;
        if (rCountries.length > 0 && !rCountries.includes(iCtry)) continue;
        if (rPersons.length > 0) {
          const pIds = r.personMediaIds || [];
          const inCredits = rPersons.some(
            (pid) =>
              (item.credits?.cast || []).some(
                (c) => String(c.id) === String(pid),
              ) ||
              (item.credits?.crew || []).some(
                (c) => String(c.id) === String(pid),
              ),
          );
          if (!pIds.includes(item.id) && !inCredits) continue;
        }
        if (rCompNets.length > 0) {
          const cachedMeta = this.compNetCache
            ? this.compNetCache[`${type}_${item.id}`] ||
              this.compNetCache[`${item.id}`]
            : null;
          const comps = [
            ...(item.production_companies || []).map((c) => String(c.id || c)),
            ...(cachedMeta?.comps || []),
          ];
          const nets = [
            ...(item.networks || []).map((n) => String(n.id || n)),
            ...(cachedMeta?.nets || []),
          ];
          const provs = [
            ...(item.providers || []).map((p) => String(p.id || p)),
            ...(cachedMeta?.provs || []),
          ];
          const matchFound = rCompNets.some((cn) => {
            const p = this.parseCompNetRule(cn);
            if (!p) return false;
            if (p.type === "comp") return comps.includes(p.id);
            if (p.type === "net")
              return p.ids
                ? p.ids.some((nid) => nets.includes(nid) || comps.includes(nid))
                : nets.includes(p.id) || comps.includes(p.id);
            if (p.type === "prov")
              return (p.pIds || [p.id]).some((pid) => provs.includes(pid));
            return comps.includes(p.id) || nets.includes(p.id);
          });
          if (!matchFound) continue;
        }
        return true;
      }
    }
    return false;
  },
  removeCatBlock: function (idx) {
    this.catBlocklist.splice(idx, 1);
    this.$storeSet("sh_cat_blocklist", this.catBlocklist);
    this.loadBlockList();
    this.triggerGlobalRefresh();
  },
  buildBlockCard: function (item, isSearch = false, isBlocked = false) {
    const parts = [];
    if (item.type) {
      if (item.type.toLowerCase() === "tv") {
        const rawTvType = this.getRawTvType(item);
        parts.push(this.formatSeriesType(rawTvType, "card"));
      } else {
        parts.push(item.type.toUpperCase());
      }
    }
    if (item.year) parts.push(item.year);
    if (item.country)
      parts.push(
        `<span style="font-size:${item.country.length > 3 ? "0.65rem" : "0.75rem"};">${item.country}</span>`,
      );
    const safeStr = this.encodeItem(item);
    const bCls = isBlocked ? "block-overlay-btn add" : "block-overlay-btn";
    const bTxt = isBlocked ? CHECK_SVG(14, 14) : PLUS_SVG(14, 14);
    const btnHtml = isSearch
      ? '<div class="' +
        bCls +
        '" onclick="app.toggleBlockItem(\'' +
        safeStr +
        "')\">" +
        bTxt +
        "</div>"
      : '<div class="block-overlay-btn remove" onclick="app.toggleBlockItem(\'' +
        safeStr +
        "')\">&times;</div>";
    const metaHtml = parts
      .map(function (p) {
        return "<span>" + p + "</span>";
      })
      .join('<span class="card-meta-dot">&bull;</span>');
    return (
      '<div class="poster-card"><div class="block-card-poster"><img src="' +
      this.getImg(item.poster_path, "poster") +
      '" loading="lazy">' +
      btnHtml +
      '</div><div class="card-title" title="' +
      item.title +
      '">' +
      item.title +
      '</div><div class="card-meta">' +
      metaHtml +
      "</div></div>"
    );
  },
  loadBlockList: function () {
    const catCont = this.$g("cat-blocklist-container");
    if (this.catBlocklist.length === 0) {
      catCont.innerHTML =
        '<div class="msg-box" style="text-align:center;grid-column:1/-1;width:100%;padding:10px 0;font-size:0.9rem;">No category blocks added.</div>';
    } else {
      catCont.innerHTML = this.catBlocklist
        .map(
          (r, idx) =>
            `<div class="block-card"><span class="block-card-text">${r.label}</span><button class="block-delete-btn" onclick="app.removeCatBlock(${idx})">&times;</button></div>`,
        )
        .join("");
    }
    const container = this.$g("blocklist-container");
    if (this.blocklist.length === 0) {
      container.innerHTML =
        '<div class="msg-box" style="text-align:center;grid-column:1/-1;width:100%;padding:20px 0;">No blocked items.</div>';
      return;
    }
    container.innerHTML = this.blocklist
      .map((item) => this.buildBlockCard(item, false))
      .join("");
  },
  async triggerBlockSearch() {
    const inp = this.$g("block-search-input");
    const query = inp.value.trim();
    if (!query) return;
    this.startLoader();
    const sec = this.$g("block-search-section");
    const grid = this.$g("block-search-grid");
    if (sec) sec.style.display = "block";
    if (grid)
      grid.innerHTML =
        '<div class="dots-loader"><span class="dot"></span><span class="dot"></span><span class="dot"></span></div>';
    const data = await this.api("/search/multi", {
      query: query,
    });
    const results = (data.results || []).filter(
      (i) =>
        (i.media_type === "movie" || i.media_type === "tv") && i.poster_path,
    );
    if (results.length === 0) {
      grid.innerHTML =
        '<div class="msg-box" style="text-align:left;padding:10px 0;">No results found.</div>';
    } else {
      grid.innerHTML = results
        .map((i) => {
          const itemObj = Object.assign(this.toCardSummary(i, i.media_type), {
            type_str: i.type,
          });
          return this.buildBlockCard(
            itemObj,
            true,
            this.isBlocked(i, i.media_type),
          );
        })
        .join("");
    }
    this.stopLoader();
  },
  toggleBlockItem: function (safeStr) {
    const item = this.decodeItem(safeStr);
    const idx = this.blocklist.findIndex(
      (b) => String(b.id) === String(item.id) && b.type === item.type,
    );
    const isRemoving = idx > -1;
    if (isRemoving) {
      this.blocklist.splice(idx, 1);
    } else {
      this.blocklist.push(item);
    }
    this.$storeSet("sh_blocklist", this.blocklist);
    this.loadBlockList();
    if (this.$g("block-search-section").style.display === "block") {
      this.triggerBlockSearch();
    }
    if (isRemoving) {
      this.triggerGlobalRefresh();
    } else {
      document
        .querySelectorAll(`.poster-card[data-show-id="${item.id}"]`)
        .forEach((c) => c.remove());
    }
    const title = item.title || item.name || "";
    if (title)
      this.showToast(
        `<span class="toast-title">${title}</span> ${isRemoving ? "removed from" : "added to"} Blocklist`,
      );
  },
  showToast: function (msg) {
    const el = this.$g("toast-notif");
    if (!el) return;
    el.innerHTML = msg;
    el.classList.add("active");
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => {
      el.classList.remove("active");
    }, 2000);
  },
  async resolveHeroItem(it, type) {
    if (!it || !it.id) return null;
    try {
      const details = await this.api(`/${type}/${it.id}`, {
        append_to_response: "images,credits,external_ids",
        include_image_language: "en,null",
      });
      if (details) {
        if (type === "tv" && details.type) {
          this.tvTypeCache[`tv_${it.id}`] = details.type;
          it.type = details.type;
        }
        const c =
          (details.origin_country && details.origin_country[0]) ||
          (details.production_countries &&
            details.production_countries[0] &&
            details.production_countries[0].iso_3166_1);
        if (c) {
          this.countryCache[`${type}_${it.id}`] = c;
          it.country = c;
        }
      }
      const logos = details?.images?.logos || [];
      const l =
        logos.find((x) => x.iso_639_1 === "en") ||
        logos.find((x) => !x.iso_639_1) ||
        logos[0];
      let logoPath = l ? l.file_path : null;
      let fanartUrl = null;
      if (!logoPath) {
        fanartUrl = await this.getFanartLogo(
          type,
          it.id,
          details?.external_ids?.tvdb_id,
        );
      }
      if (!logoPath && !fanartUrl) return null;
      return {
        ...it,
        media_type: type,
        logo_path: logoPath,
        fanart_logo: fanartUrl,
        credits: details?.credits || {
          cast: [],
        },
      };
    } catch (e) {
      return null;
    }
  },
  async fetchShowcaseItems(ep, params = {}, isRand = true, force = false) {
    const rawLimit =
      this.uiPrefs && this.uiPrefs.showcaseLimit
        ? this.uiPrefs.showcaseLimit
        : 20;
    const limit = Math.min(50, Math.max(10, parseInt(rawLimit, 10) || 20));
    let pg1 = 1,
      pg2 = 2;
    if (isRand && ep.startsWith("/discover")) {
      pg1 = Math.floor(Math.random() * 5) + 1;
      pg2 = pg1 + 1;
    }
    const fetches = [
      this.api(
        ep,
        {
          ...params,
          page: pg1,
        },
        null,
        force,
      ),
      this.api(
        ep,
        {
          ...params,
          page: pg2,
        },
        null,
        force,
      ),
    ];
    if (limit > 25) {
      fetches.push(
        this.api(
          ep,
          {
            ...params,
            page: pg2 + 1,
          },
          null,
          force,
        ),
      );
    }
    const pages = await Promise.all(fetches);
    let raw = [];
    pages.forEach((p) => {
      if (p?.results) raw.push(...p.results);
    });
    const seen = new Set();
    let list = raw.filter((i) => {
      if (!i || !i.id || seen.has(i.id)) return false;
      seen.add(i.id);
      return true;
    });
    if (isRand) {
      for (let idx = list.length - 1; idx > 0; idx--) {
        const rIdx = Math.floor(Math.random() * (idx + 1));
        [list[idx], list[rIdx]] = [list[rIdx], list[idx]];
      }
    }
    return list;
  },
  markImgsLoaded: function (imgs, staggerMs = 0) {
    imgs.forEach((img, i) => {
      if (!img) return;
      const mark = () => {
        if (staggerMs > 0)
          setTimeout(() => {
            if (img) {
              img.style.opacity = "";
              img.classList.add("loaded");
            }
          }, i * staggerMs);
        else {
          img.style.opacity = "";
          img.classList.add("loaded");
        }
      };
      if (img.complete && img.naturalWidth > 0) mark();
      else img.addEventListener("load", mark, { once: true });
    });
  },
  applyCompanyLogoBg: function (imgEl) {
    if (!imgEl) return;
    const box = imgEl.closest(".poster-img-container, .explore-collage-item");
    const src = imgEl.currentSrc || imgEl.src || "";
    if (!this._companyBgCache) this._companyBgCache = {};
    if (src && this._companyBgCache[src] !== undefined) {
      const cachedHex = this._companyBgCache[src];
      if (cachedHex && cachedHex !== "FALLBACK" && box) {
        box.style.background =
          "radial-gradient(circle at 50% 45%, " +
          cachedHex +
          "66 0%, " +
          cachedHex +
          "29 100%)";
      }
      imgEl.classList.add("loaded");
      return;
    }
    try {
      const c = document.createElement("canvas");
      c.width = 16;
      c.height = 16;
      const ctx = c.getContext("2d", { willReadFrequently: true });
      if (ctx && imgEl.naturalWidth > 0) {
        ctx.drawImage(imgEl, 0, 0, 16, 16);
        const d = ctx.getImageData(0, 0, 16, 16).data;
        let r = 0,
          g = 0,
          b = 0,
          cnt = 0;
        for (let i = 0; i < d.length; i += 4) {
          if (d[i + 3] >= 30) {
            r += d[i];
            g += d[i + 1];
            b += d[i + 2];
            cnt++;
          }
        }
        if (cnt > 0 && box) {
          const avgR = r / cnt,
            avgG = g / cnt,
            avgB = b / cnt;
          if (!(avgR < 38 && avgG < 38 && avgB < 38)) {
            const toHex = (n) =>
              Math.max(0, Math.min(255, Math.round(n)))
                .toString(16)
                .padStart(2, "0");
            const hex = "#" + toHex(avgR) + toHex(avgG) + toHex(avgB);
            if (src) this._companyBgCache[src] = hex;
            box.style.background =
              "radial-gradient(circle at 50% 45%, " +
              hex +
              "66 0%, " +
              hex +
              "29 100%)";
          } else if (src) {
            this._companyBgCache[src] = "FALLBACK";
          }
        }
      }
    } catch (e) {
      if (src) this._companyBgCache[src] = "FALLBACK";
    }
    imgEl.classList.add("loaded");
  },
  makeInfRow: function (items, type) {
    const seen = new Set();
    const unique = items.filter((i) => {
      if (!i || !i.id || seen.has(i.id) || this.isBlocked(i, type))
        return false;
      seen.add(i.id);
      return true;
    });
    const rawLimit =
      this.uiPrefs && this.uiPrefs.showcaseLimit
        ? this.uiPrefs.showcaseLimit
        : 20;
    const limit = Math.min(50, Math.max(10, parseInt(rawLimit, 10) || 20));
    const html = unique
      .slice(0, limit)
      .map((i) => this.buildCard(i, type))
      .join("");
    return html + html + html;
  },
  getExploreFilterState: function (typeOverride = null) {
    const t = typeOverride || this.exploreType;
    const keys = [
      "genre",
      "year",
      "country",
      "compNet",
      "person",
      "genre2",
      "aniTag",
      "season",
      "aniStudio",
      "aniStaff",
    ];
    const lists = {};
    keys.forEach((k) => {
      lists[`${k}List`] = this.getMultiList(k, t);
    });
    const {
      genreList,
      yearList,
      countryList,
      compNetList,
      personList,
      genre2List,
      aniTagList,
      seasonList,
      aniStudioList,
      aniStaffList,
    } = lists;
    const genreIds = genreList.map((g) => g.id).filter(Boolean);
    const toNumIds = (arr) =>
      arr.map((s) => parseInt(s.id, 10)).filter((n) => !isNaN(n));
    return {
      t,
      ...lists,
      genreIds,
      years: yearList.map((y) => y.id).filter(Boolean),
      countries: countryList
        .map((c) => (c.id === "UK" ? "GB" : c.id))
        .filter(Boolean),
      personIds: personList.map((p) => p.id).filter(Boolean),
      hasAnime: genreIds.includes("anime"),
      normalGenreIds: genreIds.filter((g) => g !== "anime"),
      genre2Ids: genre2List.map((g) => g.id).filter(Boolean),
      aniTagIds: aniTagList.map((t) => t.id).filter(Boolean),
      seasonIds: seasonList.map((s) => s.id.toUpperCase()),
      aniStudioIds: toNumIds(aniStudioList),
      aniStaffIds: toNumIds(aniStaffList),
    };
  },
  buildTmdbDiscoverParams: function (f) {
    const t = f.t || this.exploreType;
    const baseParams = {};
    if (f.hasAnime) {
      const animGenreParts = ["16", ...f.normalGenreIds, ...f.genre2Ids];
      baseParams.with_genres = animGenreParts.join(",");
      if (f.countries.length > 0) {
        const validCtry = f.countries.filter((c) =>
          ["JP", "CN", "KR"].includes(c),
        );
        baseParams.with_origin_country =
          validCtry.length > 0 ? validCtry.join("|") : "JP|CN|KR";
      } else {
        baseParams.with_origin_country = "JP|CN|KR";
      }
    } else {
      if (f.normalGenreIds.length > 0)
        baseParams.with_genres = f.normalGenreIds.join(",");
      if (f.countries.length > 0)
        baseParams.with_origin_country = f.countries.join("|");
    }
    const parseCn = (cnId, pArr, nArr, cArr) => {
      const p = this.parseCompNetRule(cnId);
      if (!p) return;
      if (p.type === "prov") pArr.push(...(p.ids || []));
      else if (p.type === "net") (t === "tv" ? nArr : cArr).push(p.id);
      else cArr.push(p.id);
    };
    const blockComps = [],
      blockNets = [],
      blockProvs = [];
    if (this.catBlocklist && Array.isArray(this.catBlocklist)) {
      this.catBlocklist.forEach((r) => {
        if (!r.type || r.type === "all" || r.type === t) {
          this.toRuleArr(r.compNets, r.compNet).forEach((cn) =>
            parseCn(cn, blockProvs, blockNets, blockComps),
          );
        }
      });
    }
    const dPfx = this.getTmdbDatePrefix(t);
    if (f.years.length === 1) {
      baseParams[`${dPfx}_year`] = f.years[0];
    } else if (f.years.length > 1) {
      const numYears = f.years.map(Number).filter((n) => !isNaN(n));
      const minY = Math.min(...numYears);
      const maxY = Math.max(...numYears);
      baseParams[`${dPfx}.gte`] = `${minY}-01-01`;
      baseParams[`${dPfx}.lte`] = `${maxY}-12-31`;
    }
    if (t === "movie" && f.personIds.length > 0) {
      baseParams.with_people = f.personIds.join(",");
    }
    if (f.compNetList.length > 0) {
      const pIds = [],
        netIds = [],
        compIds = [];
      f.compNetList.forEach((item) => parseCn(item.id, pIds, netIds, compIds));
      if (pIds.length > 0) {
        baseParams.with_watch_providers = pIds.join("|");
        baseParams.watch_region = "US";
        baseParams.with_watch_monetization_types = "flatrate|free|ads";
      }
      if (netIds.length > 0) baseParams.with_networks = netIds.join(",");
      if (compIds.length > 0) baseParams.with_companies = compIds.join(",");
    }
    if (blockComps.length > 0)
      baseParams.without_companies = [...new Set(blockComps)].join(",");
    if (blockNets.length > 0 && t === "tv")
      baseParams.without_networks = [...new Set(blockNets)].join(",");
    if (blockProvs.length > 0) {
      baseParams.without_watch_providers = [...new Set(blockProvs)].join(",");
      if (!baseParams.watch_region) baseParams.watch_region = "US";
    }
    return baseParams;
  },
  buildTmdbTypeParams: function (tType, baseParams, page) {
    const p = { ...baseParams, page };
    const dPfx = this.getTmdbDatePrefix(this.exploreType);
    if (tType === "popular") p.sort_by = "popularity.desc";
    else if (tType === "trending") {
      p.sort_by = "popularity.desc";
      const d = new Date();
      d.setMonth(d.getMonth() - 2);
      p[`${dPfx}.gte`] = d.toISOString().split("T")[0];
    } else if (tType === "top_rated") p.sort_by = "vote_count.desc";
    else if (tType === "newest") {
      p.sort_by = `${dPfx}.desc`;
      p[`${dPfx}.lte`] = new Date().toISOString().split("T")[0];
    } else if (tType === "revenue") p.sort_by = "revenue.desc";
    else if (tType === "airing") {
      const now = new Date();
      p["air_date.gte"] = new Date(now.getTime() - 7 * 86400000)
        .toISOString()
        .split("T")[0];
      p["air_date.lte"] = new Date(now.getTime() + 7 * 86400000)
        .toISOString()
        .split("T")[0];
      p.sort_by = "popularity.desc";
    }
    return p;
  },
  zipInterleave: function (arrays, idFn = (x) => x?.id) {
    const out = [],
      seen = new Set(),
      max = Math.max(...(arrays || []).map((a) => a?.length || 0), 0);
    for (let i = 0; i < max; i++) {
      for (let j = 0; j < (arrays || []).length; j++) {
        const it = arrays[j]?.[i];
        if (!it) continue;
        const k = idFn ? idFn(it) : null;
        if (k) {
          if (!seen.has(k)) {
            seen.add(k);
            out.push(it);
          }
        } else {
          out.push(it);
        }
      }
    }
    return out;
  },
  getEquivalentIds: function (id, item = null) {
    const ids = new Set();
    if (!id && !item) return ids;
    if (id) {
      const sId = String(id);
      ids.add(sId);
      if (sId.startsWith("ani_")) {
        const num = sId.replace("ani_", "");
        ids.add(num);
        ids.add("ani_" + num);
        if (this.animeCache) {
          const c = this.animeCache["ani_" + num] || this.animeCache[num];
          if (c && c.tmdbId) ids.add(String(c.tmdbId));
          if (c && c._showId) ids.add(String(c._showId));
        }
      } else {
        if (this.animeCache) {
          const c = this.animeCache[sId] || this.animeCache[`${sId}_s1`];
          if (c && c.aniId) {
            ids.add("ani_" + c.aniId);
            ids.add(String(c.aniId));
          }
        }
      }
    }
    if (item) {
      if (item.id) ids.add(String(item.id));
      if (item.ani_id) {
        ids.add("ani_" + item.ani_id);
        ids.add(String(item.ani_id));
      }
      if (item.source_id) ids.add(String(item.source_id));
    }
    if (this.currentShow) {
      const curId = String(this.currentShow.id);
      const curAniId = this.currentShow.ani_id
        ? String(this.currentShow.ani_id)
        : null;
      let isMatch = ids.has(curId);
      if (
        !isMatch &&
        curAniId &&
        (ids.has(curAniId) || ids.has("ani_" + curAniId))
      )
        isMatch = true;
      if (isMatch) {
        ids.add(curId);
        if (curAniId) {
          ids.add(curAniId);
          ids.add("ani_" + curAniId);
        }
      }
    }
    const checkLists = [this.myList, this.watchedList];
    if (this.customLists && Array.isArray(this.customLists)) {
      this.customLists.forEach((cl) => {
        if (cl && cl.items) checkLists.push(cl.items);
      });
    }
    for (const list of checkLists) {
      if (!list) continue;
      for (const k in list) {
        const it = list[k];
        if (!it) continue;
        const itId = String(it.id);
        const itAni = it.ani_id
          ? String(it.ani_id)
          : itId.startsWith("ani_")
            ? itId.replace("ani_", "")
            : null;
        if (
          ids.has(itId) ||
          (itAni && (ids.has(itAni) || ids.has("ani_" + itAni)))
        ) {
          ids.add(itId);
          if (itAni) {
            ids.add(itAni);
            ids.add("ani_" + itAni);
          }
        }
      }
    }
    return ids;
  },
  getSavedStatus: function (id, item = null) {
    if (!id && !item) return { inBookmark: false, inCustom: false };
    const eqIds = this.getEquivalentIds(id, item);
    let inBookmark = false;
    if (this.myList) {
      for (const eid of eqIds) {
        if (this.myList[eid]) {
          inBookmark = true;
          break;
        }
      }
    }
    let inCustom = false;
    if (this.customLists && Array.isArray(this.customLists)) {
      for (let i = 0; i < this.customLists.length; i++) {
        const cl = this.customLists[i];
        if (cl && cl.items) {
          for (const eid of eqIds) {
            if (cl.items[eid]) {
              inCustom = true;
              break;
            }
          }
          if (inCustom) break;
        }
      }
    }
    return { inBookmark, inCustom };
  },
  getSavedBtnInfo: function (id, isShowinfo = false, item = null) {
    const { inBookmark, inCustom } = this.getSavedStatus(id, item);
    const sz = isShowinfo ? 15 : 12;
    if (inBookmark && inCustom) {
      return {
        icon: CHECK_SVG(sz, sz),
        color: "#378EF0",
        btnClass: "bookmark-btn saved saved-both",
        inBookmark: true,
        inCustom: true,
      };
    }
    if (inBookmark) {
      return {
        icon: STAR_SVG(sz, sz),
        color: "#378EF0",
        btnClass: "bookmark-btn saved",
        inBookmark: true,
        inCustom: false,
      };
    }
    if (inCustom) {
      return {
        icon: CHECK_SVG(sz, sz),
        color: "#ffffff",
        btnClass: "bookmark-btn in-custom",
        inBookmark: false,
        inCustom: true,
      };
    }
    return {
      icon: PLUS_SVG(sz, sz, 4),
      color: isShowinfo ? "#ffffff" : "",
      btnClass: "bookmark-btn",
      inBookmark: false,
      inCustom: false,
    };
  },
  applySavedBtnState: function (btn, info, isShowinfo = false) {
    if (!btn || !info) return;
    btn.innerHTML = info.icon;
    if (isShowinfo) btn.style.color = info.color || "#ffffff";
    btn.classList.toggle("saved", !!info.inBookmark);
    btn.classList.toggle("in-custom", !!(info.inCustom && !info.inBookmark));
    btn.classList.toggle("saved-both", !!(info.inBookmark && info.inCustom));
  },
  isSavedAnywhere: function (id, item = null) {
    const st = this.getSavedStatus(id, item);
    return st.inBookmark || st.inCustom;
  },
  mutateSavedItem: function (action, listTarget, item) {
    if (!item || !item.id) return;
    const eqIds = this.getEquivalentIds(item.id, item);
    const idStr = String(item.id);
    const summary = this.toCardSummary(item);
    const title = summary.title || summary.name || "Item";
    const isBookmark = listTarget === "bookmark";
    const targetList = isBookmark
      ? null
      : (this.customLists || []).find(
          (l) => String(l.id) === String(listTarget),
        );
    const listName = isBookmark
      ? "Bookmark"
      : targetList
        ? targetList.name
        : "List";

    let isRemoving = false;
    if (isBookmark) {
      if (!this.myList) this.myList = {};
      const existingKey = Array.from(eqIds).find((eid) =>
        Boolean(this.myList[eid]),
      );
      isRemoving = action === "remove" || Boolean(existingKey);
      if (isRemoving) {
        eqIds.forEach((eid) => delete this.myList[eid]);
      } else {
        summary.addedAt = Date.now();
        eqIds.forEach((eid) => delete this.myList[eid]);
        this.myList[idStr] = summary;
        if (summary.poster_path && typeof this.applyCardPosterBg === "function")
          this.applyCardPosterBg(null, summary.poster_path);
      }
      this.$storeSet("mySavedList", this.myList);
    } else if (targetList) {
      if (!targetList.items) targetList.items = {};
      const existingKey = Array.from(eqIds).find((eid) =>
        Boolean(targetList.items[eid]),
      );
      isRemoving = action === "remove" || Boolean(existingKey);
      if (isRemoving) {
        eqIds.forEach((eid) => delete targetList.items[eid]);
      } else {
        summary.addedAt = Date.now();
        eqIds.forEach((eid) => delete targetList.items[eid]);
        targetList.items[idStr] = summary;
      }
      targetList.updatedAt = Date.now();
      this.$storeSet("sh_custom_lists", this.customLists);
    }
    this.syncAllCardStars(idStr, item);
    if (this.currentView === "mylist") {
      if (this.myListSub === "hub") this.renderMyListHub();
      else if (this.myListSub === "bookmark")
        this.openMyListSub("bookmark", null, false);
      else if (this.myListSub === "custom_detail" && !isBookmark)
        this.openMyListSub("custom_detail", listTarget, false);
    }
    this.showToast(
      `<span class="toast-title">${title}</span> ${isRemoving ? "removed from" : "added to"} ${listName}`,
    );
    return !isRemoving;
  },
  syncAllCardStars: function (idStr = null, item = null) {
    const eqIds = idStr ? this.getEquivalentIds(idStr, item) : null;
    const selector =
      eqIds && eqIds.size > 0
        ? Array.from(eqIds)
            .map((id) => `.poster-card[data-show-id="${id}"]`)
            .join(", ")
        : ".poster-card";
    document.querySelectorAll(selector).forEach((card) => {
      const cardId = card.getAttribute("data-show-id");
      if (!cardId) return;
      const btn = card.querySelector(".bookmark-btn");
      if (btn)
        this.applySavedBtnState(
          btn,
          this.getSavedBtnInfo(cardId, false),
          false,
        );
    });
    const siBtn = this.$g("si-bookmark-btn");
    if (
      siBtn &&
      this.currentShow &&
      (!idStr || (eqIds && eqIds.has(String(this.currentShow.id))))
    ) {
      this.applySavedBtnState(
        siBtn,
        this.getSavedBtnInfo(this.currentShow.id, true, this.currentShow),
        true,
      );
    }
  },
  sortMediaByYear: function (list, order, dateField = null) {
    if (!list || !order) return list;
    return list.sort((a, b) => {
      const yA = dateField ? a[dateField] || "" : this.getItemYear(a);
      const yB = dateField ? b[dateField] || "" : this.getItemYear(b);
      if (!yA && !yB) return 0;
      if (!yA) return 1;
      if (!yB) return -1;
      return order === "asc" ? yA.localeCompare(yB) : yB.localeCompare(yA);
    });
  },
  toRuleArr: function (arr, val) {
    return arr && arr.length > 0
      ? arr.filter((x) => x !== "all")
      : val && val !== "all"
        ? [val]
        : [];
  },
  hasCountryOrigin: function (item, code, name, lang) {
    if (!item) return false;
    const oc = item.origin_country || [];
    const pc = item.production_countries || [];
    return (
      oc.includes(code) ||
      pc.some(
        (c) =>
          c.iso_3166_1 === code ||
          (c.name && c.name.toLowerCase() === (name || "").toLowerCase()),
      ) ||
      (lang ? item.original_language === lang : false)
    );
  },
  syncMultiInputUI: function (inp, forceOpen = false) {
    if (!inp) return;
    const box = inp.closest(".filter-multi-box");
    if (!box) return;
    const hasTags = box.querySelectorAll(".filter-tag").length > 0;
    const btn = box.querySelector(".filter-add-btn");
    const isAnimeGenre =
      inp.id === "filter-genre-input" &&
      this.getMultiList("genre").some((item) => item.id === "anime");
    if (isAnimeGenre) {
      inp.style.display = "none";
      inp.style.width = "0px";
      inp.placeholder = "";
      inp.style.minWidth = "0px";
      inp.style.padding = "0";
      if (btn) btn.style.display = "none";
      return;
    }
    if (hasTags) {
      if (forceOpen || inp.value) {
        inp.style.display = "inline-block";
        inp.style.width = inp.value
          ? Math.max(24, Math.round(inp.value.length * 8.5) + 8) + "px"
          : "24px";
        inp.placeholder = "...";
        inp.style.minWidth = "24px";
        inp.style.padding = "0 4px";
        if (btn) btn.style.display = "none";
      } else {
        inp.style.display = "none";
        inp.style.width = "0px";
        inp.placeholder = "";
        inp.style.minWidth = "0px";
        inp.style.padding = "0";
        if (btn) btn.style.display = "inline-flex";
      }
    }
  },
  async handleLogoError(imgEl, type, id, tvdbId, fallbackText) {
    if (!imgEl) return;
    const fanartUrl = await this.getFanartLogo(type, id, tvdbId);
    if (fanartUrl) {
      imgEl.onerror = () => {
        imgEl.outerHTML = fallbackText;
      };
      imgEl.src = fanartUrl;
    } else {
      imgEl.outerHTML = fallbackText;
    }
  },
  fitShowinfoMeta() {
    const el = this.$g("si-meta");
    if (!el || this.currentView !== "showinfo") return;
    el.style.fontSize = "";
    el.style.gap = "";
    el.classList.remove("meta-condensed");
    if (el.scrollWidth > el.clientWidth && el.clientWidth > 0) {
      const ratio = Math.max(
        0.68,
        Math.min(0.98, (el.clientWidth / el.scrollWidth) * 0.98),
      );
      const curSize = parseFloat(window.getComputedStyle(el).fontSize) || 13.6;
      const newSize = Math.max(9, Math.floor(curSize * ratio * 10) / 10);
      el.style.fontSize = `${newSize}px`;
      if (ratio < 0.9) el.style.gap = "3px";
      el.classList.add("meta-condensed");
    }
  },
  createTtFallback(
    fId,
    title,
    overview,
    poster,
    backdrop,
    date,
    vote,
    genres,
    country,
    extra = {},
  ) {
    return {
      id: fId,
      imdb_id: fId,
      title: title,
      name: title,
      overview: overview || "",
      poster_path: poster || null,
      backdrop_path: backdrop || null,
      release_date: date || "",
      first_air_date: date || "",
      vote_average: vote || 0,
      genres: (genres || []).map((g) => ({ id: g, name: g })),
      country: country || "US",
      spoken_languages:
        extra.Language && extra.Language !== "N/A"
          ? extra.Language.split(",").map((l) => ({
              english_name: l.trim(),
              name: l.trim(),
            }))
          : extra.language
            ? [{ english_name: extra.language, name: extra.language }]
            : [],
      is_omdb: true,
      ...extra,
    };
  },
  fetchExternalFallbacks: async function (
    query,
    isImdb = false,
    fullPlot = false,
  ) {
    const qTrim = (query || "").trim();
    const results = [];
    const mapFallback = (
      fId,
      title,
      type,
      poster,
      date,
      plot = "",
      rating = 0,
      genres = [],
      country = "US",
      extra = {},
    ) => ({
      ...this.createTtFallback(
        fId,
        title,
        plot,
        poster,
        null,
        date,
        rating,
        genres,
        country,
        { media_type: type, year: (date || "").substring(0, 4), ...extra },
      ),
      media_type: type,
    });
    if (isImdb) {
      try {
        const omdbRes = await this.fetchOmdb(
          `i=${encodeURIComponent(qTrim)}${fullPlot ? "&plot=full" : ""}`,
        );
        if (
          omdbRes &&
          omdbRes.Response === "True" &&
          (fullPlot || (omdbRes.Poster && omdbRes.Poster !== "N/A"))
        ) {
          const omdbDate =
            omdbRes.Released && omdbRes.Released !== "N/A"
              ? omdbRes.Released
              : omdbRes.Year;
          const omdbGenres =
            omdbRes.Genre && omdbRes.Genre !== "N/A"
              ? omdbRes.Genre.split(", ")
              : [];
          const poster =
            omdbRes.Poster && omdbRes.Poster !== "N/A" ? omdbRes.Poster : null;
          const plot =
            omdbRes.Plot && omdbRes.Plot !== "N/A" ? omdbRes.Plot : "";
          const type = omdbRes.Type === "series" ? "tv" : "movie";
          const country =
            omdbRes.Country && omdbRes.Country !== "N/A"
              ? omdbRes.Country.split(", ")[0]
              : "US";
          results.push(
            mapFallback(
              omdbRes.imdbID,
              omdbRes.Title,
              type,
              poster,
              omdbDate,
              plot,
              parseFloat(omdbRes.imdbRating) || 0,
              omdbGenres,
              country,
              {
                vote_count:
                  parseInt((omdbRes.imdbVotes || "").replace(/,/g, "")) || 0,
                runtime: parseInt(omdbRes.Runtime) || 0,
                Language: omdbRes.Language || "",
              },
            ),
          );
        }
      } catch (e) {}
      if (results.length === 0) {
        try {
          const tvmRes = await fetch(
            `https://api.tvmaze.com/lookup/shows?imdb=${encodeURIComponent(qTrim)}`,
          ).then((r) => r.json());
          if (tvmRes && tvmRes.id && (fullPlot || tvmRes.image?.medium)) {
            const poster =
              tvmRes.image?.medium || tvmRes.image?.original || null;
            const plot = (tvmRes.summary || "").replace(/<[^>]*>/g, "");
            results.push(
              mapFallback(
                qTrim,
                tvmRes.name,
                "tv",
                poster,
                tvmRes.premiered,
                plot,
                tvmRes.rating?.average || 0,
                tvmRes.genres || [],
                tvmRes.network?.country?.code || "US",
                { language: tvmRes.language || "" },
              ),
            );
          }
        } catch (e) {}
      }
    } else {
      try {
        const omdbRes = await this.fetchOmdb(`s=${encodeURIComponent(qTrim)}`);
        if (
          omdbRes &&
          omdbRes.Response === "True" &&
          Array.isArray(omdbRes.Search)
        ) {
          const seenImdb = new Set();
          omdbRes.Search.forEach((o) => {
            if (
              o.Poster &&
              o.Poster !== "N/A" &&
              o.imdbID &&
              !seenImdb.has(o.imdbID)
            ) {
              seenImdb.add(o.imdbID);
              results.push(
                mapFallback(
                  o.imdbID,
                  o.Title,
                  o.Type === "series" ? "tv" : "movie",
                  o.Poster,
                  o.Year,
                ),
              );
            }
          });
        }
      } catch (e) {}
      if (results.length === 0) {
        try {
          const tvmRes = await fetch(
            `https://api.tvmaze.com/search/shows?q=${encodeURIComponent(qTrim)}`,
          ).then((r) => r.json());
          if (Array.isArray(tvmRes)) {
            tvmRes.forEach((t) => {
              if (t.show && t.show.image?.medium) {
                results.push(
                  mapFallback(
                    t.show.externals?.imdb || "tvm_" + t.show.id,
                    t.show.name,
                    "tv",
                    t.show.image.medium,
                    t.show.premiered,
                  ),
                );
              }
            });
          }
        } catch (e) {}
      }
    }
    return results;
  },
  showSiScrollOverlay: function (show) {
    const ov = this.$g("si-scroll-overlay");
    if (!ov) return;
    if (show) {
      ov.style.display = "flex";
      ov.classList.add("active");
      clearTimeout(this._siScrollOverlaySafetyTimer);
      this._siScrollOverlaySafetyTimer = setTimeout(() => {
        this.showSiScrollOverlay(false);
      }, 2500);
    } else {
      clearTimeout(this._siScrollOverlaySafetyTimer);
      ov.classList.remove("active");
      setTimeout(() => {
        if (!ov.classList.contains("active")) ov.style.display = "none";
      }, 220);
    }
  },
  toggleFullscreen: function () {
    const el = this.$g("global-player-container");
    if (!document.fullscreenElement) {
      if (el.requestFullscreen) el.requestFullscreen();
      else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
    } else {
      if (document.exitFullscreen) document.exitFullscreen();
      else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
    }
  },
  setupPlayerListeners: function () {
    window.addEventListener("message", (event) => {
      let data = event.data;
      if (typeof data === "string") {
        try {
          data = JSON.parse(data);
        } catch (e) {}
      }
      if (
        data &&
        (data.event === "onReady" ||
          (data.info && (data.info.playerState === 1 || data.info === 1)))
      ) {
        const tl = this.$g("trailer-loader");
        if (tl) tl.style.display = "none";
        if (this.trailerTimer) {
          clearTimeout(this.trailerTimer);
          this.trailerTimer = null;
        }
      }
      if (
        this.currentView !== "watch" ||
        !this.watchState ||
        !this.watchState.id
      )
        return;
      if (!data) return;
      let triggerNext = false;
      const handleProg = (s, e, prog, dur, evType) => {
        const curId = this.watchState.id;
        const isTv =
          this.watchState.type === "tv" ||
          this.watchState.type === "series" ||
          this.watchState.type === "show";
        const pKey = isTv
          ? `progress_${curId}_s${s}_e${e}`
          : `progress_${curId}`;
        const isEnded = [
          "ended",
          "completed",
          "complete",
          "video_ended",
          "finished",
          "end",
        ].includes(evType);
        if (!isNaN(prog) && prog > 10 && !isEnded) {
          if (!isNaN(dur) && dur > 0 && dur - prog <= 15) {
            this.removeWatchProgress(pKey);
          } else {
            this.saveWatchProgress(
              pKey,
              prog,
              ["pause", "paused"].includes(evType),
              dur,
            );
          }
        }
        const isNearEnd =
          !isNaN(dur) && dur > 0 && !isNaN(prog) && prog > 0 && dur - prog <= 8;
        const isPausedNearEnd =
          ["pause", "paused"].includes(evType) &&
          !isNaN(dur) &&
          dur > 0 &&
          !isNaN(prog) &&
          prog > 0 &&
          dur - prog <= 14;
        if (isEnded || isNearEnd || isPausedNearEnd) {
          this.removeWatchProgress(pKey);
          triggerNext = true;
        }
      };
      if (data.type === "MEDIA_DATA" && data.data) {
        let list = Array.isArray(data.data) ? data.data : [data.data];
        let cur = list.find((m) => String(m.id) === String(this.watchState.id));
        if (cur) {
          let isTv = cur.type
            ? cur.type === "tv" || cur.type === "series" || cur.type === "show"
            : this.watchState.type === "tv" ||
              this.watchState.type === "series" ||
              this.watchState.type === "show";
          let s = this.watchState.season,
            e = this.watchState.episode;
          const sp = (isTv ? cur.show_progress?.[`s${s}e${e}`] : cur)?.progress;
          handleProg(
            s,
            e,
            parseFloat(sp?.watched || cur.progress?.watched || "0"),
            parseFloat(sp?.duration || cur.progress?.duration || "0"),
            "",
          );
        }
      } else if (typeof data === "object" && data !== null) {
        let d =
          data.data !== undefined && data.data !== null
            ? data.data
            : data.event && typeof data.event === "object"
              ? data.event
              : null;
        if (typeof d === "string") {
          try {
            d = JSON.parse(d);
          } catch (e) {}
        }
        if (!d || typeof d !== "object") d = data;
        const pInfo = d.player_info || {};
        const isPlayerEvent =
          String(data.type || "").toUpperCase() === "PLAYER_EVENT";
        const rawEv =
          d.event && d !== data
            ? d.event
            : d.event ||
              d.action ||
              (isPlayerEvent ? "" : data.event || data.type) ||
              data.name ||
              data.action ||
              d.player_status ||
              "";
        const evType = rawEv.toString().toLowerCase();
        let rawProg =
          d.currentTime ??
          d.player_progress ??
          d.time ??
          d.position ??
          d.current ??
          d.progress?.watched ??
          data.currentTime ??
          data.time;
        let rawDur =
          d.duration ??
          d.player_duration ??
          d.totalTime ??
          d.total ??
          d.progress?.duration ??
          data.duration ??
          data.totalTime;
        let prog =
          typeof rawProg === "number" ? rawProg : parseFloat(rawProg || "0");
        let dur =
          typeof rawDur === "number" ? rawDur : parseFloat(rawDur || "0");
        if (dur > 10000 && prog > 10000) {
          prog /= 1000;
          dur /= 1000;
        }
        const s = d.season || pInfo.season || this.watchState.season;
        const e = d.episode || pInfo.episode || this.watchState.episode;
        handleProg(s, e, prog, dur, evType);
      } else if (typeof data === "string") {
        const msg = data.toLowerCase();
        if (
          ["ended", "video_ended", "complete", "oncomplete", "end"].includes(
            msg,
          )
        )
          triggerNext = true;
      }
      const isTvWatch = Boolean(
        this.watchState.type === "tv" ||
        this.watchState.type === "series" ||
        this.watchState.type === "show",
      );
      if (triggerNext && isTvWatch && this.watchState.epCount > 0) {
        const now = Date.now();
        if (now - (this.lastAutoNextTime || 0) < 5000) {
          return;
        }
        this.autoNextTriggered = true;
        this.lastAutoNextTime = now;
        const mainFrame = this.$g("main-iframe");
        if (mainFrame) {
          mainFrame.src = "about:blank";
        }
        this.watchNextPrev(1);
      }
    });
  },
  applyNavPosition: function () {
    const isPort = window.matchMedia("(orientation: portrait)").matches;
    const isRot = this.lastPort !== null && this.lastPort !== isPort;
    this.lastPort = isPort;
    const saved = this.$storeGet(
      isPort ? "sh_nav_pos_portrait" : "sh_nav_pos_landscape",
      null,
    );
    const pos = saved || (isPort ? "top-mid" : "top-right");
    this.setNavPosition(pos, false, isRot ? "fade" : false);
  },
  setupMinNavIdle: function () {
    const trigger = () => this.resetMinNavTimer();
    [
      "touchstart",
      "touchmove",
      "touchend",
      "click",
      "mousemove",
      "mousedown",
      "keydown",
    ].forEach((evt) => {
      window.addEventListener(evt, trigger, { passive: true });
    });
    window.addEventListener("scroll", trigger, { passive: true });
    window.addEventListener("resize", trigger, { passive: true });
    window.addEventListener("orientationchange", trigger, { passive: true });
  },
  collapseSideNav: function () {
    const nav = document.querySelector(".glass-nav");
    if (!nav) return;
    if (
      nav.classList.contains("pos-mid-left") ||
      nav.classList.contains("pos-mid-right")
    ) {
      if (
        !nav.classList.contains("is-minimized") &&
        !nav.classList.contains("nav-collapsing")
      ) {
        nav.classList.add("nav-collapsing");
        setTimeout(() => {
          nav.classList.remove("nav-collapsing");
          nav.classList.add("is-minimized");
          nav.classList.remove("is-idle-hidden");
          const isLeft = nav.classList.contains("pos-mid-left");
          const btn = this.$g("nav-min-btn");
          if (btn) btn.innerHTML = isLeft ? "&#9654;" : "&#9664;";
          this.resetMinNavTimer();
        }, 180);
      }
    }
  },
  setupNavDrag: function () {
    const nav = document.querySelector(".glass-nav");
    if (!nav) return;
    let timer = null,
      startX = 0,
      startY = 0,
      currentX = 0,
      currentY = 0,
      isDragging = false,
      justDragged = false,
      currentNearestZone = null,
      startPos = null;
    let touchPoint = this.$g("nav-touch-point");
    if (!touchPoint) {
      touchPoint = document.createElement("div");
      touchPoint.id = "nav-touch-point";
      touchPoint.className = "nav-touch-point";
      document.body.appendChild(touchPoint);
    }
    nav.addEventListener("contextmenu", (e) => e.preventDefault());
    nav.addEventListener("selectstart", (e) => e.preventDefault());
    nav.addEventListener(
      "click",
      (e) => {
        if (justDragged) {
          e.preventDefault();
          e.stopPropagation();
          return;
        }
        if (nav.classList.contains("is-minimized")) {
          app.restoreNav();
        }
      },
      true,
    );
    const getDropZones = () => {
      const isPort = window.matchMedia("(orientation: portrait)").matches;
      const w = window.innerWidth,
        h = window.innerHeight;
      const base = [
        { id: "top-mid", x: w * 0.5, y: isPort ? 35 : 30 },
        { id: "bottom-mid", x: w * 0.5, y: isPort ? h - 32 : h - 30 },
        { id: "mid-left", x: 25, y: h * 0.5 },
        { id: "mid-right", x: w - 25, y: h * 0.5 },
      ];
      let list = isPort
        ? base
        : [
            { id: "top-left", x: 100, y: 30 },
            base[0],
            { id: "top-right", x: w - 100, y: 30 },
            { id: "bottom-left", x: 100, y: h - 30 },
            base[1],
            { id: "bottom-right", x: w - 100, y: h - 30 },
            base[2],
            base[3],
          ];
      if (nav.classList.contains("pos-mid-left"))
        list = list.filter((z) => z.id !== "mid-left");
      else if (nav.classList.contains("pos-mid-right"))
        list = list.filter((z) => z.id !== "mid-right");
      return list;
    };
    const renderOverlay = () => {
      let overlay = this.$g("nav-drop-overlay");
      if (!overlay) {
        overlay = document.createElement("div");
        overlay.id = "nav-drop-overlay";
        overlay.className = "nav-drop-overlay";
        document.body.appendChild(overlay);
      }
      const zones = getDropZones();
      const zoneStyles = {
        "top-mid":
          "top:10px;left:50%;transform:translateX(-50%);width:200px;height:44px;",
        "top-left": "top:10px;left:15px;width:180px;height:44px;",
        "top-right": "top:10px;right:15px;width:180px;height:44px;",
        "bottom-mid":
          "bottom:10px;left:50%;transform:translateX(-50%);width:200px;height:44px;",
        "bottom-left": "bottom:10px;left:15px;width:180px;height:44px;",
        "bottom-right": "bottom:10px;right:15px;width:180px;height:44px;",
        "mid-left":
          "top:50%;left:0;transform:translateY(-50%);width:34px;height:65px;border-radius:0 12px 12px 0;border-left:none;",
        "mid-right":
          "top:50%;right:0;transform:translateY(-50%);width:34px;height:65px;border-radius:12px 0 0 12px;border-right:none;",
      };
      overlay.innerHTML = zones
        .map((z) => {
          const posStyle = zoneStyles[z.id] || "";
          return `<div class="nav-drop-zone" id="dz-${z.id}" style="${posStyle}"></div>`;
        })
        .join("");
      overlay.classList.add("active");
    };
    const hideOverlay = () => {
      const overlay = this.$g("nav-drop-overlay");
      if (overlay) overlay.classList.remove("active");
    };
    const onStart = (cx, cy) => {
      startX = cx;
      startY = cy;
      clearTimeout(timer);
      timer = setTimeout(() => {
        isDragging = true;
        justDragged = true;
        if (window.getSelection) window.getSelection().removeAllRanges();
        document.body.style.userSelect = "none";
        document.body.style.webkitUserSelect = "none";
        if (navigator.vibrate) navigator.vibrate(40);
        startPos =
          [
            "top-mid",
            "top-left",
            "top-right",
            "bottom-mid",
            "bottom-left",
            "bottom-right",
            "mid-left",
            "mid-right",
          ].find((p) => nav.classList.contains(`pos-${p}`)) || null;
        currentNearestZone = startPos;
        renderOverlay();
        touchPoint.style.left = `${startX}px`;
        touchPoint.style.top = `${startY}px`;
        touchPoint.classList.add("active");
        nav.classList.add("is-dragging");
      }, 280);
    };
    const onMove = (cx, cy, e) => {
      currentX = cx;
      currentY = cy;
      if (!isDragging) {
        if (Math.hypot(currentX - startX, currentY - startY) > 8)
          clearTimeout(timer);
        return;
      }
      if (window.getSelection) window.getSelection().removeAllRanges();
      if (e && e.cancelable) e.preventDefault();
      touchPoint.style.left = `${currentX}px`;
      touchPoint.style.top = `${currentY}px`;
      const zones = getDropZones();
      let closest = null,
        minDist = Infinity;
      zones.forEach((z) => {
        const d = Math.hypot(currentX - z.x, currentY - z.y);
        if (d < minDist) {
          minDist = d;
          closest = z;
        }
      });
      currentNearestZone = closest && minDist < 180 ? closest.id : startPos;
      document
        .querySelectorAll(".nav-drop-zone")
        .forEach((el) => el.classList.remove("active-target"));
      if (currentNearestZone) {
        const el = this.$g(`dz-${currentNearestZone}`);
        if (el) el.classList.add("active-target");
      }
    };
    const onEnd = () => {
      clearTimeout(timer);
      if (!isDragging) return;
      isDragging = false;
      document.body.style.userSelect = "";
      document.body.style.webkitUserSelect = "";
      if (window.getSelection) window.getSelection().removeAllRanges();
      touchPoint.classList.remove("active");
      hideOverlay();
      nav.classList.remove("is-dragging");
      if (currentNearestZone && currentNearestZone !== startPos) {
        app.setNavPosition(currentNearestZone, true, "slide");
        setTimeout(() => {
          justDragged = false;
        }, 200);
      } else {
        justDragged = false;
        if (
          nav.classList.contains("is-minimized") &&
          Math.hypot(currentX - startX, currentY - startY) < 12
        ) {
          app.restoreNav();
        }
      }
    };
    nav.addEventListener(
      "touchstart",
      (e) => {
        if (e.touches.length === 1)
          onStart(e.touches[0].clientX, e.touches[0].clientY);
      },
      {
        passive: true,
      },
    );
    window.addEventListener(
      "touchmove",
      (e) => {
        if (e.touches.length)
          onMove(e.touches[0].clientX, e.touches[0].clientY, e);
      },
      {
        passive: false,
      },
    );
    window.addEventListener("touchend", onEnd, {
      passive: true,
    });
    window.addEventListener("touchcancel", onEnd, {
      passive: true,
    });
    nav.addEventListener("mousedown", (e) => {
      if (e.button === 0) onStart(e.clientX, e.clientY);
    });
    window.addEventListener("mousemove", (e) =>
      onMove(e.clientX, e.clientY, e),
    );
    window.addEventListener("mouseup", onEnd);
  },
};
window.app = app;
